import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type SwarmThought = {
  agent: string;
  taskId?: string;
  thought: string;
  context?: string;
  ts: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

export async function logSwarmThought(input: {
  repoPath?: string;
  agent: string;
  taskId?: string;
  thought: string;
  context?: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ ok: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const swarmDir = path.join(repoRoot, "swarm");
  await fs.mkdir(swarmDir, { recursive: true });

  const thoughtsPath = path.join(swarmDir, "SWARM_THOUGHTS.md");
  const date = new Date().toISOString();
  const taskRef = input.taskId ? ` [Task: ${input.taskId}]` : "";

  const entry = `
## ${date} - ${input.agent}${taskRef}

${input.thought}

${input.context ? `**Context:** ${input.context}` : ""}

---
`;

  await fs.appendFile(thoughtsPath, entry, "utf8");

  const rel = path.posix.join("swarm", "SWARM_THOUGHTS.md");
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: thought from ${input.agent}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { ok: true };
}

export async function getRecentThoughts(input: {
  repoPath?: string;
  limit?: number;
}): Promise<SwarmThought[]> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const thoughtsPath = path.join(repoRoot, "swarm", "SWARM_THOUGHTS.md");

  let content = "";
  try {
    content = await fs.readFile(thoughtsPath, "utf8");
  } catch {
    return [];
  }

  // Parse markdown entries
  const entries = content.split(/^## /m).filter(Boolean);
  const thoughts: SwarmThought[] = [];

  for (const entry of entries) {
    const lines = entry.trim().split("\n");
    if (lines.length === 0) continue;

    // Parse header: "2024-01-01T12:00:00Z - AgentName [Task: task-id]"
    const header = lines[0];
    const headerMatch = header.match(/^([\d\-T:.Z]+)\s*-\s*(\w+)(?:\s*\[Task:\s*([^\]]+)\])?/);
    if (!headerMatch) continue;

    const [, tsStr, agent, taskId] = headerMatch;
    const ts = new Date(tsStr).getTime();

    // Rest is thought content
    const thoughtLines = lines.slice(1).join("\n").trim();
    const contextMatch = thoughtLines.match(/\*\*Context:\*\*\s*(.+)/);
    const context = contextMatch ? contextMatch[1] : undefined;
    const thought = thoughtLines.replace(/\*\*Context:\*\*.*/, "").replace(/---$/, "").trim();

    thoughts.push({ agent, taskId, thought, context, ts });
  }

  // Sort by timestamp descending
  thoughts.sort((a, b) => b.ts - a.ts);

  const limit = input.limit || 50;
  return thoughts.slice(0, limit);
}
