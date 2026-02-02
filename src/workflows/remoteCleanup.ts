import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { git, gitTry, normalizeLineEndings } from "./git.js";
import { getRepoRoot } from "./repo.js";

const execFileAsync = promisify(execFile);

export async function autoDeleteMergedBranch(input: {
  repoPath?: string;
  branch: string;
  deleteLocal?: boolean;
  deleteRemote?: boolean;
}): Promise<{ deletedLocal: boolean; deletedRemote: boolean; error?: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const branch = input.branch;
  const deleteLocal = input.deleteLocal !== false;
  const deleteRemote = input.deleteRemote !== false;

  let deletedLocal = false;
  let deletedRemote = false;

  // Don't delete protected branches
  const protectedBranches = ["main", "master", "develop", "dev"];
  if (protectedBranches.includes(branch)) {
    return { deletedLocal: false, deletedRemote: false, error: "Cannot delete protected branch" };
  }

  // Check current branch
  const currentRes = await gitTry(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
  const currentBranch = normalizeLineEndings(currentRes.stdout).trim();
  if (currentBranch === branch) {
    // Switch to main first
    await gitTry(["checkout", "main"], { cwd: repoRoot });
  }

  // Delete local branch
  if (deleteLocal) {
    const localRes = await gitTry(["branch", "-d", branch], { cwd: repoRoot });
    if (localRes.ok) {
      deletedLocal = true;
    } else {
      // Try force delete if already merged
      const forceRes = await gitTry(["branch", "-D", branch], { cwd: repoRoot });
      deletedLocal = forceRes.ok;
    }
  }

  // Delete remote branch
  if (deleteRemote) {
    const remoteRes = await gitTry(["push", "origin", "--delete", branch], { cwd: repoRoot });
    deletedRemote = remoteRes.ok;
  }

  return { deletedLocal, deletedRemote };
}

export async function listMergedBranches(repoPath?: string): Promise<string[]> {
  const repoRoot = await getRepoRoot(repoPath);

  // Fetch latest
  await gitTry(["fetch", "--prune"], { cwd: repoRoot });

  // Get merged branches
  const res = await gitTry(["branch", "--merged", "main"], { cwd: repoRoot });
  if (!res.ok) return [];

  const branches = normalizeLineEndings(res.stdout)
    .split("\n")
    .map(b => b.trim().replace(/^\*\s*/, ""))
    .filter(b => b && b !== "main" && b !== "master" && b !== "develop");

  return branches;
}

export async function cleanupAllMergedBranches(input: {
  repoPath?: string;
  deleteLocal?: boolean;
  deleteRemote?: boolean;
}): Promise<{ cleaned: string[]; errors: string[] }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const merged = await listMergedBranches(repoRoot);
  const cleaned: string[] = [];
  const errors: string[] = [];

  for (const branch of merged) {
    const result = await autoDeleteMergedBranch({
      repoPath: repoRoot,
      branch,
      deleteLocal: input.deleteLocal,
      deleteRemote: input.deleteRemote,
    });

    if (result.deletedLocal || result.deletedRemote) {
      cleaned.push(branch);
    }
    if (result.error) {
      errors.push(`${branch}: ${result.error}`);
    }
  }

  return { cleaned, errors };
}
