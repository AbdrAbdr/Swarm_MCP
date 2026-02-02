import fs from "node:fs/promises";
import path from "node:path";

import { git, gitTry } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type TaskCreateInput = {
  repoPath?: string;
  shortDesc: string;
  title: string;
  questions: string[];
  answers: string[];
  notes?: string;
  createdAtLocal?: string;
  commitMode: "none" | "local" | "push";
};

export type TaskCreateOutput = {
  taskId: string;
  filePath: string;
  relativePath: string;
  statePath: string;
  stateRelativePath: string;
  indexPath: string;
  indexRelativePath: string;
};

function nowLocalStamp(): { fileStamp: string; pretty: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return {
    fileStamp: `${yyyy}-${mm}-${dd}_${hh}-${min}`,
    pretty: `${dd}.${mm}.${yyyy} ${hh}:${min}`,
  };
}

function slugifyShortDesc(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type TaskStatus = "open" | "in_progress" | "needs_review" | "done" | "canceled";

export type TaskState = {
  taskId: string;
  title: string;
  shortDesc: string;
  createdAtIso: string;
  createdAtLocal: string;
  status: TaskStatus;
  assignee?: string;
  branch?: string;
  links?: string[];
};

function statusCheckbox(status: TaskStatus): " " | "x" {
  if (status === "done") return "x";
  return " ";
}

function formatIndexLine(task: TaskState): string {
  const checkbox = statusCheckbox(task.status);
  const assignee = task.assignee ? ` (@${task.assignee})` : "";
  const links = task.links && task.links.length > 0 ? ` [links: ${task.links.join(", ")}]` : "";
  const core = `${task.taskId} — ${task.title}${assignee}${links}`;
  if (task.status === "canceled") {
    return `- [${checkbox}] ~~${core}~~`;
  }
  return `- [${checkbox}] ${core}`;
}

export async function rebuildTasksIndex(tasksDir: string): Promise<void> {
  const entries = await fs.readdir(tasksDir, { withFileTypes: true });
  const states: TaskState[] = [];

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith(".json")) continue;
    if (ent.name.toUpperCase() === "INDEX.JSON") continue;
    const p = path.join(tasksDir, ent.name);
    try {
      const raw = await fs.readFile(p, "utf8");
      const parsed = JSON.parse(raw) as TaskState;
      if (parsed?.taskId && parsed?.title) states.push(parsed);
    } catch {
      // ignore unreadable state
    }
  }

  states.sort((a, b) => a.taskId.localeCompare(b.taskId));

  const body = [
    "# Tasks",
    "",
    "(Этот файл генерируется автоматически из swarm/tasks/*.json)",
    "",
    ...states.map(formatIndexLine),
    "",
  ].join("\n");

  await fs.writeFile(path.join(tasksDir, "INDEX.md"), body, "utf8");
}

async function safePush(repoRoot: string): Promise<void> {
  const first = await gitTry(["push"], { cwd: repoRoot });
  if (first.ok) return;
  await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
}

export async function createTaskFile(input: TaskCreateInput): Promise<TaskCreateOutput> {
  const repoRoot = await getRepoRoot(input.repoPath);

  const stamp = nowLocalStamp();
  const shortDesc = slugifyShortDesc(input.shortDesc);
  const taskId = `${stamp.fileStamp}--${shortDesc}`;

  const tasksDir = path.join(repoRoot, "swarm", "tasks");
  await fs.mkdir(tasksDir, { recursive: true });

  const mdName = `${taskId}.md`;
  const filePath = path.join(tasksDir, mdName);
  const relativePath = path.posix.join("swarm", "tasks", mdName);

  const stateName = `${taskId}.json`;
  const statePath = path.join(tasksDir, stateName);
  const stateRelativePath = path.posix.join("swarm", "tasks", stateName);

  const indexPath = path.join(tasksDir, "INDEX.md");
  const indexRelativePath = path.posix.join("swarm", "tasks", "INDEX.md");

  const createdPretty = input.createdAtLocal?.trim() || stamp.pretty;

  const qas = input.questions.map((q, i) => {
    const a = input.answers[i] ?? "";
    return `- Q${i + 1}: ${q}\n  - A${i + 1}: ${a}`;
  });

  const body = [
    `# ${createdPretty} — ${input.title}`,
    "",
    `**Task ID**: ${taskId}`,
    "",
    "## Уточняющие вопросы и ответы",
    qas.length ? qas.join("\n") : "- (нет)",
    "",
    "## Заметки",
    input.notes?.trim() ? input.notes.trim() : "- (нет)",
    "",
  ].join("\n");

  await fs.writeFile(filePath, body, "utf8");

  const state: TaskState = {
    taskId,
    title: input.title,
    shortDesc,
    createdAtIso: new Date().toISOString(),
    createdAtLocal: createdPretty,
    status: "open",
  };
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");

  await rebuildTasksIndex(tasksDir);

  if (input.commitMode !== "none") {
    await git(["add", relativePath, stateRelativePath, indexRelativePath], {
      cwd: repoRoot,
    });
    await git(["commit", "-m", `swarm: add task ${taskId}`], { cwd: repoRoot });

    if (input.commitMode === "push") {
      await safePush(repoRoot);
    }
  }

  return {
    taskId,
    filePath,
    relativePath,
    statePath,
    stateRelativePath,
    indexPath,
    indexRelativePath,
  };
}
