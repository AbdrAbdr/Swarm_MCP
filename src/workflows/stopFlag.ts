import fs from "node:fs/promises";
import path from "node:path";

import { git, gitTry } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type StopState = {
  stopped: boolean;
  reason?: string;
  by?: string;
  tsIso: string;
};

export type StopSetInput = {
  repoPath?: string;
  stopped: boolean;
  reason?: string;
  by?: string;
  commitMode: "none" | "local" | "push";
};

export type StopSetOutput = {
  repoRoot: string;
  stopFilePath: string;
  stopFileRelativePath: string;
  state: StopState;
};

function stopFilePath(repoRoot: string): string {
  return path.join(repoRoot, "swarm", "STOP.json");
}

function stopFileRelativePath(): string {
  return path.posix.join("swarm", "STOP.json");
}

async function safePush(repoRoot: string): Promise<void> {
  const first = await gitTry(["push"], { cwd: repoRoot });
  if (first.ok) return;
  await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
}

export async function getStopState(repoPath?: string): Promise<{ repoRoot: string; state: StopState }>{
  const repoRoot = await getRepoRoot(repoPath);
  const p = stopFilePath(repoRoot);

  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as StopState;
    if (typeof parsed?.stopped === "boolean" && typeof parsed?.tsIso === "string") {
      return { repoRoot, state: parsed };
    }
  } catch {
    // ignore
  }

  return { repoRoot, state: { stopped: false, tsIso: new Date().toISOString() } };
}

export async function setStopState(input: StopSetInput): Promise<StopSetOutput> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const swarmDir = path.join(repoRoot, "swarm");
  await fs.mkdir(swarmDir, { recursive: true });

  const p = stopFilePath(repoRoot);
  const state: StopState = {
    stopped: input.stopped,
    reason: input.reason,
    by: input.by,
    tsIso: new Date().toISOString(),
  };

  await fs.writeFile(p, JSON.stringify(state, null, 2) + "\n", "utf8");

  const rel = stopFileRelativePath();

  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(
      [
        "commit",
        "-m",
        input.stopped ? `swarm: STOP (${input.reason ?? ""})` : "swarm: RESUME",
      ],
      { cwd: repoRoot }
    );

    if (input.commitMode === "push") {
      await safePush(repoRoot);
    }
  }

  return { repoRoot, stopFilePath: p, stopFileRelativePath: rel, state };
}
