import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";
import { rebuildTasksIndex, type TaskState, type TaskStatus } from "./taskFile.js";

export type TaskListOutput = {
  repoRoot: string;
  tasks: TaskState[];
};

function tasksDir(repoRoot: string): string {
  return path.join(repoRoot, "swarm", "tasks");
}

function stateFilePath(repoRoot: string, taskId: string): string {
  return path.join(tasksDir(repoRoot), `${taskId}.json`);
}

async function readTaskStateFile(p: string): Promise<TaskState> {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw) as TaskState;
}

export async function listTasks(repoPath?: string): Promise<TaskListOutput> {
  const repoRoot = await getRepoRoot(repoPath);
  const dir = tasksDir(repoRoot);
  await fs.mkdir(dir, { recursive: true });

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const tasks: TaskState[] = [];

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".json")) continue;
    if (ent.name.toUpperCase() === "INDEX.JSON") continue;

    const p = path.join(dir, ent.name);
    try {
      const st = await readTaskStateFile(p);
      if (st?.taskId && st?.title) tasks.push(st);
    } catch {
      // ignore
    }
  }

  tasks.sort((a, b) => a.taskId.localeCompare(b.taskId));
  return { repoRoot, tasks };
}

export type TaskUpdateInput = {
  repoPath?: string;
  taskId: string;
  status?: TaskStatus;
  assignee?: string | null;
  branch?: string | null;
  links?: string[] | null;
  commitMode: "none" | "local" | "push";
};

export type TaskUpdateOutput = {
  repoRoot: string;
  task: TaskState;
  statePath: string;
  stateRelativePath: string;
  indexRelativePath: string;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

export async function updateTask(input: TaskUpdateInput): Promise<TaskUpdateOutput> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = tasksDir(repoRoot);
  await fs.mkdir(dir, { recursive: true });

  const p = stateFilePath(repoRoot, input.taskId);
  const current = await readTaskStateFile(p);

  const next: TaskState = {
    ...current,
    status: input.status ?? current.status,
    assignee:
      input.assignee === undefined
        ? current.assignee
        : input.assignee === null
          ? undefined
          : input.assignee,
    branch:
      input.branch === undefined
        ? current.branch
        : input.branch === null
          ? undefined
          : input.branch,
    links:
      input.links === undefined
        ? current.links
        : input.links === null
          ? undefined
          : input.links,
  };

  await fs.writeFile(p, JSON.stringify(next, null, 2) + "\n", "utf8");
  await rebuildTasksIndex(dir);

  const stateRelativePath = path.posix.join("swarm", "tasks", `${input.taskId}.json`);
  const indexRelativePath = path.posix.join("swarm", "tasks", "INDEX.md");

  if (input.commitMode !== "none") {
    await git(["add", stateRelativePath, indexRelativePath], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: update task ${input.taskId}`], { cwd: repoRoot });

    if (input.commitMode === "push") {
      await safePush(repoRoot);
    }
  }

  return {
    repoRoot,
    task: next,
    statePath: p,
    stateRelativePath,
    indexRelativePath,
  };
}
