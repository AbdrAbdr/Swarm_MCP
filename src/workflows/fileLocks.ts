import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type FileLock = {
  path: string;
  agent: string;
  exclusive: boolean;
  exp: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureLocksDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "locks");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function lockFileName(filePath: string): string {
  return filePath.replace(/[\/\\:]/g, "_") + ".lock.json";
}

export async function fileReserve(input: {
  repoPath?: string;
  filePath: string;
  agent: string;
  exclusive: boolean;
  ttlMs?: number;
  commitMode: "none" | "local" | "push";
}): Promise<{ ok: boolean; lockedBy?: string; lockPath: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const locksDir = await ensureLocksDir(repoRoot);
  const lockFile = path.join(locksDir, lockFileName(input.filePath));
  const now = Date.now();
  const ttl = input.ttlMs || 60000;

  try {
    const raw = await fs.readFile(lockFile, "utf8");
    const existing: FileLock = JSON.parse(raw);

    if (existing.exp > now) {
      if (existing.exclusive && existing.agent !== input.agent) {
        return { ok: false, lockedBy: existing.agent, lockPath: lockFile };
      }
      if (input.exclusive && existing.agent !== input.agent) {
        return { ok: false, lockedBy: existing.agent, lockPath: lockFile };
      }
    }
  } catch {
    // no lock file
  }

  const lock: FileLock = {
    path: input.filePath,
    agent: input.agent,
    exclusive: input.exclusive,
    exp: now + ttl,
  };

  await fs.writeFile(lockFile, JSON.stringify(lock, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "locks", lockFileName(input.filePath));
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: lock ${input.filePath}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { ok: true, lockPath: lockFile };
}

export async function fileRelease(input: {
  repoPath?: string;
  filePath: string;
  agent: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ ok: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const locksDir = await ensureLocksDir(repoRoot);
  const lockFile = path.join(locksDir, lockFileName(input.filePath));

  try {
    const raw = await fs.readFile(lockFile, "utf8");
    const existing: FileLock = JSON.parse(raw);
    if (existing.agent !== input.agent) {
      return { ok: false };
    }
  } catch {
    return { ok: true };
  }

  await fs.unlink(lockFile);

  const rel = path.posix.join("swarm", "locks", lockFileName(input.filePath));
  if (input.commitMode !== "none") {
    try {
      await git(["add", rel], { cwd: repoRoot });
      await git(["commit", "-m", `swarm: unlock ${input.filePath}`], { cwd: repoRoot });
      if (input.commitMode === "push") await safePush(repoRoot);
    } catch {
      // ignore if nothing to commit
    }
  }

  return { ok: true };
}

export async function listFileLocks(repoPath?: string): Promise<FileLock[]> {
  const repoRoot = await getRepoRoot(repoPath);
  const locksDir = path.join(repoRoot, "swarm", "locks");
  const locks: FileLock[] = [];

  try {
    const entries = await fs.readdir(locksDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith(".lock.json")) continue;
      try {
        const raw = await fs.readFile(path.join(locksDir, ent.name), "utf8");
        const lock: FileLock = JSON.parse(raw);
        if (lock.exp > Date.now()) {
          locks.push(lock);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // dir doesn't exist
  }

  return locks;
}
