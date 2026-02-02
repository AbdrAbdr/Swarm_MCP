import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type SwarmEvent = {
  id: string;
  ts: number;
  type: string;
  payload: unknown;
};

export type AuctionAnnouncement = {
  taskId: string;
  title: string;
  requiredCapabilities: string[];
  ts: number;
};

export type AuctionBid = {
  taskId: string;
  agent: string;
  capabilities: string[];
  ts: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureSwarmDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function eventsFilePath(repoRoot: string): string {
  return path.join(repoRoot, "swarm", "EVENTS.ndjson");
}

export async function appendEvent(input: {
  repoPath?: string;
  type: string;
  payload: unknown;
  commitMode: "none" | "local" | "push";
}): Promise<{ eventId: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  await ensureSwarmDir(repoRoot);

  const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const event: SwarmEvent = {
    id: eventId,
    ts: Date.now(),
    type: input.type,
    payload: input.payload,
  };

  const line = JSON.stringify(event) + "\n";
  await fs.appendFile(eventsFilePath(repoRoot), line, "utf8");

  const rel = path.posix.join("swarm", "EVENTS.ndjson");
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: event ${input.type}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { eventId };
}

export async function pollSwarmEvents(input: {
  repoPath?: string;
  since?: number;
  types?: string[];
}): Promise<{ events: SwarmEvent[] }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const filePath = eventsFilePath(repoRoot);

  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return { events: [] };
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  const events: SwarmEvent[] = [];

  for (const line of lines) {
    try {
      const ev: SwarmEvent = JSON.parse(line);
      if (input.since && ev.ts <= input.since) continue;
      if (input.types && input.types.length > 0 && !input.types.includes(ev.type)) continue;
      events.push(ev);
    } catch {
      // ignore
    }
  }

  return { events };
}

export async function announceTaskForBidding(input: {
  repoPath?: string;
  taskId: string;
  title: string;
  requiredCapabilities?: string[];
  commitMode: "none" | "local" | "push";
}): Promise<{ eventId: string }> {
  const payload: AuctionAnnouncement = {
    taskId: input.taskId,
    title: input.title,
    requiredCapabilities: input.requiredCapabilities || [],
    ts: Date.now(),
  };

  return appendEvent({
    repoPath: input.repoPath,
    type: "task_announced",
    payload,
    commitMode: input.commitMode,
  });
}

export async function bidForTask(input: {
  repoPath?: string;
  taskId: string;
  agent: string;
  capabilities: string[];
  commitMode: "none" | "local" | "push";
}): Promise<{ eventId: string }> {
  const payload: AuctionBid = {
    taskId: input.taskId,
    agent: input.agent,
    capabilities: input.capabilities,
    ts: Date.now(),
  };

  return appendEvent({
    repoPath: input.repoPath,
    type: "task_bid",
    payload,
    commitMode: input.commitMode,
  });
}
