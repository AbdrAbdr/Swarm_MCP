import fs from "node:fs/promises";
import path from "node:path";

import { git, gitTry, normalizeLineEndings } from "./git.js";
import { getRepoRoot } from "./repo.js";
import { appendEvent } from "./auction.js";

export type Snapshot = {
  id: string;
  agent: string;
  taskId?: string;
  files: Array<{
    path: string;
    content: string;
  }>;
  commitHash: string;
  createdAt: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureSnapshotsDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "orchestrator", "snapshots");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function createSnapshot(input: {
  repoPath?: string;
  agent: string;
  taskId?: string;
  files: string[];
  commitMode: "none" | "local" | "push";
}): Promise<{ snapshotId: string; snapshotPath: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const snapshotsDir = await ensureSnapshotsDir(repoRoot);

  // Get current commit hash
  const hashRes = await gitTry(["rev-parse", "HEAD"], { cwd: repoRoot });
  const commitHash = normalizeLineEndings(hashRes.stdout).trim();

  // Read file contents
  const fileContents: Array<{ path: string; content: string }> = [];
  for (const filePath of input.files) {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
      const content = await fs.readFile(fullPath, "utf8");
      fileContents.push({ path: filePath, content });
    } catch {
      // file doesn't exist, skip
    }
  }

  const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const snapshot: Snapshot = {
    id: snapshotId,
    agent: input.agent,
    taskId: input.taskId,
    files: fileContents,
    commitHash,
    createdAt: Date.now(),
  };

  const snapshotPath = path.join(snapshotsDir, `${snapshotId}.json`);
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

  const rel = path.posix.join("orchestrator", "snapshots", `${snapshotId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `orchestrator: snapshot ${snapshotId} by ${input.agent}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { snapshotId, snapshotPath };
}

export async function triggerRollback(input: {
  repoPath?: string;
  snapshotId: string;
  agent: string;
  reason: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ rolledBack: boolean; filesRestored: string[] }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const snapshotPath = path.join(repoRoot, "orchestrator", "snapshots", `${input.snapshotId}.json`);

  let snapshot: Snapshot;
  try {
    const raw = await fs.readFile(snapshotPath, "utf8");
    snapshot = JSON.parse(raw);
  } catch {
    return { rolledBack: false, filesRestored: [] };
  }

  // Restore files
  const filesRestored: string[] = [];
  for (const file of snapshot.files) {
    try {
      const fullPath = path.isAbsolute(file.path) ? file.path : path.join(repoRoot, file.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, "utf8");
      filesRestored.push(file.path);
    } catch {
      // ignore
    }
  }

  // Broadcast rollback event
  await appendEvent({
    repoPath: repoRoot,
    type: "rollback",
    payload: {
      snapshotId: input.snapshotId,
      agent: input.agent,
      reason: input.reason,
      filesRestored,
    },
    commitMode: "none",
  });

  if (input.commitMode !== "none" && filesRestored.length > 0) {
    for (const f of filesRestored) {
      await git(["add", f], { cwd: repoRoot });
    }
    await git(["add", path.posix.join("swarm", "EVENTS.ndjson")], { cwd: repoRoot });
    await git(["commit", "-m", `🔄 ROLLBACK: ${input.reason} (by ${input.agent})`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { rolledBack: true, filesRestored };
}

export async function listSnapshots(input: {
  repoPath?: string;
  taskId?: string;
  agent?: string;
}): Promise<{ snapshots: Array<{ id: string; agent: string; taskId?: string; fileCount: number; createdAt: number }> }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const snapshotsDir = path.join(repoRoot, "orchestrator", "snapshots");
  const snapshots: Array<{ id: string; agent: string; taskId?: string; fileCount: number; createdAt: number }> = [];

  try {
    const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(snapshotsDir, ent.name), "utf8");
        const snapshot: Snapshot = JSON.parse(raw);

        if (input.taskId && snapshot.taskId !== input.taskId) continue;
        if (input.agent && snapshot.agent !== input.agent) continue;

        snapshots.push({
          id: snapshot.id,
          agent: snapshot.agent,
          taskId: snapshot.taskId,
          fileCount: snapshot.files.length,
          createdAt: snapshot.createdAt,
        });
      } catch {
        // ignore
      }
    }
  } catch {
    // dir doesn't exist
  }

  snapshots.sort((a, b) => b.createdAt - a.createdAt);
  return { snapshots };
}
