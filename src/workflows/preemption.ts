import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";
import { appendEvent } from "./auction.js";

export type UrgentTask = {
  id: string;
  taskId: string;
  title: string;
  reason: string;
  initiator: string;
  affectedFiles: string[];
  preemptedAgents: string[];
  status: "active" | "resolved";
  createdAt: number;
  resolvedAt?: number;
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

export async function triggerUrgentPreemption(input: {
  repoPath?: string;
  taskId: string;
  title: string;
  reason: string;
  initiator: string;
  affectedFiles: string[];
  commitMode: "none" | "local" | "push";
}): Promise<{ urgentId: string; preemptedAgents: string[] }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  await ensureOrchestratorDir(repoRoot);

  // Load current pulse to find who's working on affected files
  const pulsePath = path.join(repoRoot, "orchestrator", "PULSE.json");
  let preemptedAgents: string[] = [];

  try {
    const raw = await fs.readFile(pulsePath, "utf8");
    const pulse = JSON.parse(raw);

    for (const agent of pulse.agents || []) {
      if (agent.status === "active" && agent.currentFile) {
        if (input.affectedFiles.some(f => agent.currentFile.includes(f))) {
          preemptedAgents.push(agent.agent);
        }
      }
    }
  } catch {
    // no pulse file
  }

  const urgentId = `urgent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const urgent: UrgentTask = {
    id: urgentId,
    taskId: input.taskId,
    title: input.title,
    reason: input.reason,
    initiator: input.initiator,
    affectedFiles: input.affectedFiles,
    preemptedAgents,
    status: "active",
    createdAt: Date.now(),
  };

  const urgentPath = path.join(repoRoot, "orchestrator", "URGENT.json");
  await fs.writeFile(urgentPath, JSON.stringify(urgent, null, 2) + "\n", "utf8");

  // Broadcast urgent event
  await appendEvent({
    repoPath: repoRoot,
    type: "urgent_preemption",
    payload: {
      urgentId,
      taskId: input.taskId,
      title: input.title,
      reason: input.reason,
      affectedFiles: input.affectedFiles,
      preemptedAgents,
    },
    commitMode: "none",
  });

  const rel = path.posix.join("orchestrator", "URGENT.json");
  if (input.commitMode !== "none") {
    await git(["add", rel, path.posix.join("swarm", "EVENTS.ndjson")], { cwd: repoRoot });
    await git(["commit", "-m", `🚨 URGENT: ${input.title}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { urgentId, preemptedAgents };
}

export async function resolveUrgent(input: {
  repoPath?: string;
  urgentId: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ ok: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const urgentPath = path.join(repoRoot, "orchestrator", "URGENT.json");

  try {
    const raw = await fs.readFile(urgentPath, "utf8");
    const urgent: UrgentTask = JSON.parse(raw);

    if (urgent.id !== input.urgentId) {
      return { ok: false };
    }

    urgent.status = "resolved";
    urgent.resolvedAt = Date.now();

    await fs.writeFile(urgentPath, JSON.stringify(urgent, null, 2) + "\n", "utf8");

    // Broadcast resolution
    await appendEvent({
      repoPath: repoRoot,
      type: "urgent_resolved",
      payload: { urgentId: input.urgentId },
      commitMode: "none",
    });

    const rel = path.posix.join("orchestrator", "URGENT.json");
    if (input.commitMode !== "none") {
      await git(["add", rel, path.posix.join("swarm", "EVENTS.ndjson")], { cwd: repoRoot });
      await git(["commit", "-m", `✅ URGENT resolved: ${input.urgentId}`], { cwd: repoRoot });
      if (input.commitMode === "push") await safePush(repoRoot);
    }

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function getActiveUrgent(repoPath?: string): Promise<UrgentTask | null> {
  const repoRoot = await getRepoRoot(repoPath);
  const urgentPath = path.join(repoRoot, "orchestrator", "URGENT.json");

  try {
    const raw = await fs.readFile(urgentPath, "utf8");
    const urgent: UrgentTask = JSON.parse(raw);
    return urgent.status === "active" ? urgent : null;
  } catch {
    return null;
  }
}
