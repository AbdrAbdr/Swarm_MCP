import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";
import { createTaskFile } from "./taskFile.js";

export type SubTask = {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  dependencies?: string[];
};

export type DecomposeResult = {
  parentTaskId: string;
  subtasks: SubTask[];
  tasksJsonPath: string;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

export async function decomposeTask(input: {
  repoPath?: string;
  parentTaskId: string;
  parentTitle: string;
  subtasks: Array<{
    title: string;
    description?: string;
    estimatedMinutes?: number;
    dependencies?: string[];
  }>;
  commitMode: "none" | "local" | "push";
}): Promise<DecomposeResult> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const tasksDir = path.join(repoRoot, "swarm", "tasks");
  await fs.mkdir(tasksDir, { recursive: true });

  const subtasks: SubTask[] = [];
  const createdIds: string[] = [];

  for (let i = 0; i < input.subtasks.length; i++) {
    const sub = input.subtasks[i];
    const subId = `${input.parentTaskId}-${String(i + 1).padStart(2, "0")}`;
    
    // Create subtask file
    await createTaskFile({
      repoPath: repoRoot,
      shortDesc: subId,
      title: sub.title,
      questions: [],
      answers: [],
      notes: sub.description || `Subtask of ${input.parentTitle}`,
      commitMode: "none", // batch commit later
    });

    subtasks.push({
      id: subId,
      title: sub.title,
      description: sub.description,
      estimatedMinutes: sub.estimatedMinutes,
      dependencies: sub.dependencies,
    });

    createdIds.push(subId);
  }

  // Write tasks.json with subtask structure
  const tasksJsonPath = path.join(tasksDir, `${input.parentTaskId}.decomposed.json`);
  const decomposed = {
    parentTaskId: input.parentTaskId,
    parentTitle: input.parentTitle,
    subtasks,
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(tasksJsonPath, JSON.stringify(decomposed, null, 2) + "\n", "utf8");

  // Commit all at once
  if (input.commitMode !== "none") {
    const filesToAdd = [
      path.posix.join("swarm", "tasks", `${input.parentTaskId}.decomposed.json`),
      ...createdIds.map(id => path.posix.join("swarm", "tasks", `${id}.md`)),
      ...createdIds.map(id => path.posix.join("swarm", "tasks", `${id}.state.json`)),
    ];

    for (const f of filesToAdd) {
      try {
        await git(["add", f], { cwd: repoRoot });
      } catch {
        // ignore if file doesn't exist
      }
    }

    await git(["commit", "-m", `swarm: decompose ${input.parentTaskId} into ${subtasks.length} subtasks`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return {
    parentTaskId: input.parentTaskId,
    subtasks,
    tasksJsonPath,
  };
}

export async function getDecomposition(input: {
  repoPath?: string;
  parentTaskId: string;
}): Promise<{ found: boolean; subtasks: SubTask[] }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const tasksJsonPath = path.join(repoRoot, "swarm", "tasks", `${input.parentTaskId}.decomposed.json`);

  try {
    const raw = await fs.readFile(tasksJsonPath, "utf8");
    const data = JSON.parse(raw);
    return { found: true, subtasks: data.subtasks || [] };
  } catch {
    return { found: false, subtasks: [] };
  }
}
