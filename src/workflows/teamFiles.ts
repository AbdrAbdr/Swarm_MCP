import fs from "node:fs/promises";
import path from "node:path";

import { git, gitTry } from "./git.js";
import { getRepoRoot } from "./repo.js";

async function safePush(repoRoot: string): Promise<void> {
  const first = await gitTry(["push"], { cwd: repoRoot });
  if (first.ok) return;
  await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
}

async function ensureSwarmDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export type CommitMode = "none" | "local" | "push";

export async function appendTeamChat(input: {
  repoPath?: string;
  message: string;
  commitMode: CommitMode;
}): Promise<{ repoRoot: string; fileRelativePath: string; filePath: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = await ensureSwarmDir(repoRoot);

  const filePath = path.join(dir, "TEAM_CHAT.md");
  const fileRelativePath = path.posix.join("swarm", "TEAM_CHAT.md");

  const line = `- ${new Date().toISOString()} ${input.message.trim()}\n`;
  await fs.appendFile(filePath, line, "utf8");

  if (input.commitMode !== "none") {
    await git(["add", fileRelativePath], { cwd: repoRoot });
    await git(["commit", "-m", "swarm: chat update"], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { repoRoot, fileRelativePath, filePath };
}

export async function appendProjectKnowledge(input: {
  repoPath?: string;
  message: string;
  commitMode: CommitMode;
}): Promise<{ repoRoot: string; fileRelativePath: string; filePath: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = await ensureSwarmDir(repoRoot);

  const filePath = path.join(dir, "PROJECT_KNOWLEDGE.md");
  const fileRelativePath = path.posix.join("swarm", "PROJECT_KNOWLEDGE.md");

  const line = `- ${new Date().toISOString()} ${input.message.trim()}\n`;
  await fs.appendFile(filePath, line, "utf8");

  if (input.commitMode !== "none") {
    await git(["add", fileRelativePath], { cwd: repoRoot });
    await git(["commit", "-m", "swarm: knowledge update"], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { repoRoot, fileRelativePath, filePath };
}

export async function updateTeamStatus(input: {
  repoPath?: string;
  statusLine: string;
  commitMode: CommitMode;
}): Promise<{ repoRoot: string; fileRelativePath: string; filePath: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = await ensureSwarmDir(repoRoot);

  const filePath = path.join(dir, "TEAM_STATUS.md");
  const fileRelativePath = path.posix.join("swarm", "TEAM_STATUS.md");

  const body = [`# TEAM STATUS`, "", `- ${new Date().toISOString()} ${input.statusLine.trim()}`, ""].join("\n");
  await fs.writeFile(filePath, body, "utf8");

  if (input.commitMode !== "none") {
    await git(["add", fileRelativePath], { cwd: repoRoot });
    await git(["commit", "-m", "swarm: team status"], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { repoRoot, fileRelativePath, filePath };
}
