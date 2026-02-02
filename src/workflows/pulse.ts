import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { git, gitTry, normalizeLineEndings } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type AgentPulse = {
  agent: string;
  platform: string;
  hostname: string;
  branch: string;
  currentFile?: string;
  currentTask?: string;
  status: "active" | "idle" | "paused" | "offline";
  lastUpdate: number;
};

export type SwarmPulse = {
  agents: AgentPulse[];
  lastUpdate: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureOrchestratorDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "orchestrator");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function getCurrentPlatform(): string {
  const platform = os.platform();
  return platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux";
}

export async function updateSwarmPulse(input: {
  repoPath?: string;
  agent: string;
  currentFile?: string;
  currentTask?: string;
  status: "active" | "idle" | "paused" | "offline";
  commitMode: "none" | "local" | "push";
}): Promise<{ updated: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  await ensureOrchestratorDir(repoRoot);

  const pulsePath = path.join(repoRoot, "orchestrator", "PULSE.json");
  const pulseMarkdownPath = path.join(repoRoot, "orchestrator", "PULSE.md");

  // Get current branch
  const branchRes = await gitTry(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
  const branch = normalizeLineEndings(branchRes.stdout).trim();

  // Load existing pulse
  let pulse: SwarmPulse = { agents: [], lastUpdate: Date.now() };
  try {
    const raw = await fs.readFile(pulsePath, "utf8");
    pulse = JSON.parse(raw);
  } catch {
    // file doesn't exist
  }

  // Find or create agent entry
  const agentPulse: AgentPulse = {
    agent: input.agent,
    platform: getCurrentPlatform(),
    hostname: os.hostname(),
    branch,
    currentFile: input.currentFile,
    currentTask: input.currentTask,
    status: input.status,
    lastUpdate: Date.now(),
  };

  const existingIndex = pulse.agents.findIndex(a => a.agent === input.agent);
  if (existingIndex >= 0) {
    pulse.agents[existingIndex] = agentPulse;
  } else {
    pulse.agents.push(agentPulse);
  }

  // Remove stale agents (no update in 10 minutes)
  const staleThreshold = 10 * 60 * 1000;
  pulse.agents = pulse.agents.filter(a => Date.now() - a.lastUpdate < staleThreshold || a.agent === input.agent);
  pulse.lastUpdate = Date.now();

  // Save JSON
  await fs.writeFile(pulsePath, JSON.stringify(pulse, null, 2) + "\n", "utf8");

  // Generate markdown
  const statusEmoji: Record<string, string> = {
    active: "🟢",
    idle: "🟡",
    paused: "⏸️",
    offline: "⚫",
  };

  const mdContent = `# 🌐 Swarm Pulse

**Last Update:** ${new Date(pulse.lastUpdate).toISOString()}
**Active Agents:** ${pulse.agents.filter(a => a.status === "active").length}/${pulse.agents.length}

## Agent Map

| Status | Agent | Platform | Branch | Current Task | Current File |
|--------|-------|----------|--------|--------------|--------------|
${pulse.agents.map(a => `| ${statusEmoji[a.status]} | **${a.agent}** | ${a.platform} (${a.hostname}) | \`${a.branch}\` | ${a.currentTask || "-"} | ${a.currentFile || "-"} |`).join("\n")}

## Legend
- 🟢 Active - Working on a task
- 🟡 Idle - Waiting for tasks (Ghost Mode)
- ⏸️ Paused - Temporarily paused
- ⚫ Offline - No recent heartbeat
`;

  await fs.writeFile(pulseMarkdownPath, mdContent, "utf8");

  const relJson = path.posix.join("orchestrator", "PULSE.json");
  const relMd = path.posix.join("orchestrator", "PULSE.md");

  if (input.commitMode !== "none") {
    await git(["add", relJson, relMd], { cwd: repoRoot });
    await git(["commit", "-m", `orchestrator: pulse update from ${input.agent}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { updated: true };
}

export async function getSwarmPulse(repoPath?: string): Promise<SwarmPulse> {
  const repoRoot = await getRepoRoot(repoPath);
  const pulsePath = path.join(repoRoot, "orchestrator", "PULSE.json");

  try {
    const raw = await fs.readFile(pulsePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { agents: [], lastUpdate: 0 };
  }
}
