import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

import { gitTry } from "./workflows/git.js";
import { getRepoRoot } from "./workflows/repo.js";
import { getStopState } from "./workflows/stopFlag.js";
import { whoami } from "./workflows/agentRegistry.js";
import { pollSwarmEvents } from "./workflows/auction.js";

type CompanionConfig = {
  repoPath?: string;
  project?: string;
  hubUrl?: string;
  pollSeconds?: number;
  controlPort?: number;
  controlToken?: string;
  hybridMode?: boolean; // WS primary, Git fallback
};

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WS = require("ws") as any;

function getEnvConfig(): CompanionConfig {
  const pollSeconds = Number(process.env.SWARM_POLL_SECONDS ?? "10");
  const controlPort = Number(process.env.SWARM_CONTROL_PORT ?? "37373");
  const hybridMode = process.env.SWARM_HYBRID_MODE !== "false"; // default true
  return {
    repoPath: process.env.SWARM_REPO_PATH,
    project: process.env.SWARM_PROJECT ?? "default",
    hubUrl: process.env.SWARM_HUB_URL,
    pollSeconds: Number.isFinite(pollSeconds) ? pollSeconds : 10,
    controlPort: Number.isFinite(controlPort) ? controlPort : 37373,
    controlToken: process.env.SWARM_CONTROL_TOKEN,
    hybridMode,
  };
}

async function pullIfPossible(repoRoot: string) {
  await gitTry(["pull", "--ff-only"], { cwd: repoRoot });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const cfg = getEnvConfig();
  const repoRoot = await getRepoRoot(cfg.repoPath);

  const me = await whoami(repoRoot);
  const agentName = me.agent?.agentName ?? "UnknownAgent";

  const hubUrl = cfg.hubUrl;
  const pollMs = Math.max(2, cfg.pollSeconds ?? 10) * 1000;
  const controlPort = cfg.controlPort ?? 37373;
  const controlToken = cfg.controlToken;

  let ws: any | null = null;
  let stop = false;
  let paused = false;

  function checkToken(req: http.IncomingMessage): boolean {
    if (!controlToken) return true;
    const header = req.headers["x-swarm-token"];
    if (typeof header === "string" && header === controlToken) return true;
    return false;
  }

  const controlServer = http.createServer((req, res) => {
    if (!req.url || !req.method) {
      res.statusCode = 400;
      res.end("bad request");
      return;
    }

    if (!checkToken(req)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }

    if (req.method === "POST" && req.url === "/stop") {
      stop = true;
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, stop: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/pause") {
      paused = true;
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, paused: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/resume") {
      paused = false;
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, paused: false }));
      return;
    }

    if (req.method === "GET" && req.url === "/status") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, stop, paused, agentName }));
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    controlServer.once("error", reject);
    controlServer.listen(controlPort, "127.0.0.1", () => resolve());
  });

  // stdin control: type "stop" / "pause" / "resume"
  if (process.stdin.isTTY) {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      const cmd = chunk.trim().toLowerCase();
      if (cmd === "stop" || cmd === "exit" || cmd === "quit") stop = true;
      if (cmd === "pause") paused = true;
      if (cmd === "resume" || cmd === "start") paused = false;
    });
  }

  async function connectWs() {
    if (!hubUrl) return;

    const url = new URL(hubUrl);
    url.searchParams.set("project", cfg.project || "default");
    url.searchParams.set("agent", agentName);

    ws = new WS(url.toString());

    ws.on("open", () => {
      ws?.send(JSON.stringify({ kind: "hello", agent: agentName, ts: Date.now() }));
    });

    ws.on("close", () => {
      ws = null;
    });

    ws.on("message", (data: unknown) => {
      const text = typeof data === "string" ? data : Buffer.from(data as any).toString();
      try {
        const msg = JSON.parse(text);
        if (msg?.kind === "stop") {
          stop = true;
        }
      } catch {
        // ignore
      }
    });
  }

  await connectWs();

  // Hybrid Transport: track last event timestamp for Git fallback
  let lastEventTs = Date.now();
  let wsConnected = false;
  let wsFailCount = 0;
  const maxWsFailCount = 3;

  // endless loop until STOP.json or external message
  while (true) {
    if (stop) break;

    if (paused) {
      await sleep(pollMs);
      continue;
    }

    // Always pull Git (for STOP.json and other files)
    await pullIfPossible(repoRoot);
    const stopState = await getStopState(repoRoot);
    if (stopState.state.stopped) {
      break;
    }

    // Hybrid Transport Logic
    wsConnected = ws && ws.readyState === 1;

    if (wsConnected) {
      // WS is primary - just heartbeat
      ws.send(JSON.stringify({ kind: "ping", agent: agentName, ts: Date.now() }));
      wsFailCount = 0;
    } else if (hubUrl) {
      // Try to reconnect WS
      wsFailCount++;
      if (wsFailCount <= maxWsFailCount) {
        await connectWs();
      }
    }

    // Git fallback: if WS not available or hybridMode enabled, poll EVENTS.ndjson
    if (cfg.hybridMode && (!wsConnected || wsFailCount > maxWsFailCount)) {
      try {
        const { events } = await pollSwarmEvents({ repoPath: repoRoot, since: lastEventTs });
        for (const ev of events) {
          // Process events from Git
          if (ev.type === "emergency_stop" || ev.type === "agent_frozen") {
            const payload = ev.payload as any;
            if (!payload?.agent || payload.agent === agentName) {
              stop = true;
              break;
            }
          }
          if (ev.type === "task_announced") {
            // Could auto-bid here in future
          }
          lastEventTs = Math.max(lastEventTs, ev.ts);
        }
      } catch {
        // ignore poll errors
      }
    }

    await sleep(pollMs);
  }

  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }

  try {
    controlServer.close();
  } catch {
    // ignore
  }

  // eslint-disable-next-line no-console
  console.log(`Companion stopped for agent ${agentName}`);
}

run().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
