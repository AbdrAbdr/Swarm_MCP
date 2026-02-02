import fs from "node:fs/promises";
import path from "node:path";

import { git, normalizeLineEndings } from "./git.js";
import { computeRepoSlug, getNormalizedOrigin, getRepoRoot } from "./repo.js";

export type WorktreeCreateInput = {
  repoPath?: string;
  agentName: string;
  shortDesc: string;
  baseRef: string;
  timestampLocal?: string;
  push: boolean;
};

export type WorktreeCreateOutput = {
  repoRoot: string;
  worktreePath: string;
  branch: string;
  repoSlug: string;
};

function safeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

export async function createWorktree(input: WorktreeCreateInput): Promise<WorktreeCreateOutput> {
  const repoRoot = await getRepoRoot(input.repoPath);

  const origin = await getNormalizedOrigin(repoRoot);
  const repoSlug = computeRepoSlug(repoRoot, origin);

  const repoParent = path.dirname(repoRoot);
  const work3Root = path.join(repoParent, "work3", repoSlug);
  await fs.mkdir(work3Root, { recursive: true });

  const stamp = input.timestampLocal?.trim() || nowStamp();
  const desc = safeSlug(input.shortDesc);
  const agent = safeSlug(input.agentName);

  const folderName = `${stamp}--${desc}--${agent}`;
  const worktreePath = path.join(work3Root, folderName);

  const yyyymmddhhmm = stamp.replace(/[-_]/g, "").slice(0, 12);
  const branch = `agent/${agent}/${yyyymmddhhmm}/${desc}`;

  await git(["fetch", "origin", "--prune"], { cwd: repoRoot });

  await git(["worktree", "add", "-b", branch, worktreePath, input.baseRef], {
    cwd: repoRoot,
  });

  if (input.push) {
    await git(["push", "-u", "origin", branch], { cwd: worktreePath });
  }

  return { repoRoot, worktreePath, branch, repoSlug };
}

export async function listWorktrees({ repoPath }: { repoPath?: string }): Promise<{
  repoRoot: string;
  worktrees: Array<{ path: string; head?: string; branch?: string; bare?: boolean }>;
}> {
  const repoRoot = await getRepoRoot(repoPath);
  const { stdout } = await git(["worktree", "list", "--porcelain"], { cwd: repoRoot });
  const text = normalizeLineEndings(stdout);

  const worktrees: Array<{ path: string; head?: string; branch?: string; bare?: boolean }> = [];
  let current: { path: string; head?: string; branch?: string; bare?: boolean } | null = null;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [k, ...rest] = line.split(" ");
    const v = rest.join(" ");

    if (k === "worktree") {
      if (current) worktrees.push(current);
      current = { path: v };
      continue;
    }

    if (!current) continue;

    if (k === "HEAD") current.head = v;
    else if (k === "branch") current.branch = v.replace(/^refs\/heads\//, "");
    else if (k === "bare") current.bare = true;
  }

  if (current) worktrees.push(current);

  return { repoRoot, worktrees };
}

export async function removeWorktree(input: {
  worktreePath: string;
  force: boolean;
}): Promise<{ removed: boolean; worktreePath: string }> {
  const args = ["worktree", "remove"];
  if (input.force) args.push("--force");
  args.push(input.worktreePath);

  await git(args, { cwd: process.cwd() });
  return { removed: true, worktreePath: input.worktreePath };
}
