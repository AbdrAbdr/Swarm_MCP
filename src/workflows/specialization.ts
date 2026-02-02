import fs from "node:fs/promises";
import path from "node:path";

import { git, gitTry, normalizeLineEndings } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type AgentExpertise = {
  agent: string;
  files: Record<string, number>; // file path -> edit count
  categories: Record<string, number>; // category -> edit count
  totalEdits: number;
  lastUpdate: number;
};

export type ExpertiseDb = {
  agents: AgentExpertise[];
  lastUpdate: number;
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

function categorizeFile(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes("auth") || lower.includes("login") || lower.includes("session")) return "authentication";
  if (lower.includes("db") || lower.includes("database") || lower.includes("model") || lower.includes("schema")) return "database";
  if (lower.includes("api") || lower.includes("route") || lower.includes("controller")) return "api";
  if (lower.includes("component") || lower.includes("page") || lower.includes("view") || lower.includes(".tsx") || lower.includes(".jsx")) return "ui";
  if (lower.includes("test") || lower.includes("spec")) return "testing";
  if (lower.includes("config") || lower.includes("setting")) return "config";
  if (lower.includes("style") || lower.includes(".css") || lower.includes(".scss")) return "styling";
  if (lower.includes("util") || lower.includes("helper") || lower.includes("lib")) return "utilities";
  return "other";
}

export async function trackExpertise(input: {
  repoPath?: string;
  agent: string;
  filesEdited: string[];
  commitMode: "none" | "local" | "push";
}): Promise<{ updated: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  await ensureOrchestratorDir(repoRoot);

  const dbPath = path.join(repoRoot, "orchestrator", "EXPERTISE.json");

  let db: ExpertiseDb = { agents: [], lastUpdate: Date.now() };
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    db = JSON.parse(raw);
  } catch {
    // file doesn't exist
  }

  // Find or create agent expertise
  let expertise = db.agents.find(a => a.agent === input.agent);
  if (!expertise) {
    expertise = {
      agent: input.agent,
      files: {},
      categories: {},
      totalEdits: 0,
      lastUpdate: Date.now(),
    };
    db.agents.push(expertise);
  }

  // Update file counts
  for (const file of input.filesEdited) {
    expertise.files[file] = (expertise.files[file] || 0) + 1;
    const category = categorizeFile(file);
    expertise.categories[category] = (expertise.categories[category] || 0) + 1;
    expertise.totalEdits++;
  }
  expertise.lastUpdate = Date.now();
  db.lastUpdate = Date.now();

  await fs.writeFile(dbPath, JSON.stringify(db, null, 2) + "\n", "utf8");

  const rel = path.posix.join("orchestrator", "EXPERTISE.json");
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `orchestrator: expertise update for ${input.agent}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { updated: true };
}

export async function suggestAgentForTask(input: {
  repoPath?: string;
  taskDescription: string;
  filesLikelyInvolved?: string[];
}): Promise<{ suggestedAgents: Array<{ agent: string; score: number; reason: string }> }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dbPath = path.join(repoRoot, "orchestrator", "EXPERTISE.json");

  let db: ExpertiseDb;
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    db = JSON.parse(raw);
  } catch {
    return { suggestedAgents: [] };
  }

  // Determine categories from task description
  const taskLower = input.taskDescription.toLowerCase();
  const relevantCategories: string[] = [];
  if (taskLower.includes("auth") || taskLower.includes("login")) relevantCategories.push("authentication");
  if (taskLower.includes("database") || taskLower.includes("db") || taskLower.includes("model")) relevantCategories.push("database");
  if (taskLower.includes("api") || taskLower.includes("endpoint") || taskLower.includes("route")) relevantCategories.push("api");
  if (taskLower.includes("ui") || taskLower.includes("button") || taskLower.includes("component") || taskLower.includes("page")) relevantCategories.push("ui");
  if (taskLower.includes("test")) relevantCategories.push("testing");
  if (taskLower.includes("config") || taskLower.includes("setting")) relevantCategories.push("config");
  if (taskLower.includes("style") || taskLower.includes("css")) relevantCategories.push("styling");

  const scores: Array<{ agent: string; score: number; reason: string }> = [];

  for (const expertise of db.agents) {
    let score = 0;
    const reasons: string[] = [];

    // Score by category expertise
    for (const cat of relevantCategories) {
      const catScore = expertise.categories[cat] || 0;
      if (catScore > 0) {
        score += catScore * 2;
        reasons.push(`${catScore} edits in ${cat}`);
      }
    }

    // Score by specific file expertise
    if (input.filesLikelyInvolved) {
      for (const file of input.filesLikelyInvolved) {
        const fileScore = expertise.files[file] || 0;
        if (fileScore > 0) {
          score += fileScore * 5;
          reasons.push(`${fileScore} edits in ${file}`);
        }
      }
    }

    if (score > 0) {
      scores.push({
        agent: expertise.agent,
        score,
        reason: reasons.join(", "),
      });
    }
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return { suggestedAgents: scores.slice(0, 5) };
}

export async function getAgentExpertise(input: {
  repoPath?: string;
  agent: string;
}): Promise<AgentExpertise | null> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dbPath = path.join(repoRoot, "orchestrator", "EXPERTISE.json");

  try {
    const raw = await fs.readFile(dbPath, "utf8");
    const db: ExpertiseDb = JSON.parse(raw);
    return db.agents.find(a => a.agent === input.agent) || null;
  } catch {
    return null;
  }
}
