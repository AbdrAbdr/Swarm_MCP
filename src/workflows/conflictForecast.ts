import fs from "node:fs/promises";
import path from "node:path";

import { git, gitTry, normalizeLineEndings } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type FileForecast = {
  agent: string;
  taskId?: string;
  files: string[];
  estimatedTouchTime: number; // timestamp when files will be modified
  confidence: "low" | "medium" | "high";
  ts: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureForecastDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "forecasts");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function forecastFileTouches(input: {
  repoPath?: string;
  agent: string;
  taskId?: string;
  files: string[];
  estimatedMinutesFromNow?: number;
  confidence?: "low" | "medium" | "high";
  commitMode: "none" | "local" | "push";
}): Promise<{ forecastId: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const forecastDir = await ensureForecastDir(repoRoot);

  const forecastId = `forecast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const estimatedMinutes = input.estimatedMinutesFromNow || 30;

  const forecast: FileForecast = {
    agent: input.agent,
    taskId: input.taskId,
    files: input.files,
    estimatedTouchTime: Date.now() + estimatedMinutes * 60 * 1000,
    confidence: input.confidence || "medium",
    ts: Date.now(),
  };

  const forecastPath = path.join(forecastDir, `${forecastId}.json`);
  await fs.writeFile(forecastPath, JSON.stringify(forecast, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "forecasts", `${forecastId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: file forecast from ${input.agent}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { forecastId };
}

export async function getActiveForecasts(repoPath?: string): Promise<FileForecast[]> {
  const repoRoot = await getRepoRoot(repoPath);
  const forecastDir = path.join(repoRoot, "swarm", "forecasts");
  const forecasts: FileForecast[] = [];
  const now = Date.now();

  try {
    const entries = await fs.readdir(forecastDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(forecastDir, ent.name), "utf8");
        const forecast: FileForecast = JSON.parse(raw);
        // Only include forecasts that haven't expired (within 2 hours of estimated time)
        if (forecast.estimatedTouchTime > now - 2 * 60 * 60 * 1000) {
          forecasts.push(forecast);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // dir doesn't exist
  }

  forecasts.sort((a, b) => a.estimatedTouchTime - b.estimatedTouchTime);
  return forecasts;
}

export async function checkFileConflicts(input: {
  repoPath?: string;
  files: string[];
  excludeAgent?: string;
}): Promise<{ conflicts: Array<{ file: string; forecastedBy: string; estimatedTime: number }> }> {
  const forecasts = await getActiveForecasts(input.repoPath);
  const conflicts: Array<{ file: string; forecastedBy: string; estimatedTime: number }> = [];

  for (const forecast of forecasts) {
    if (input.excludeAgent && forecast.agent === input.excludeAgent) continue;

    for (const file of input.files) {
      if (forecast.files.includes(file)) {
        conflicts.push({
          file,
          forecastedBy: forecast.agent,
          estimatedTime: forecast.estimatedTouchTime,
        });
      }
    }
  }

  return { conflicts };
}

export async function analyzTaskForFiles(input: {
  repoPath?: string;
  taskTitle: string;
  taskDescription?: string;
}): Promise<{ predictedFiles: string[] }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const predictedFiles: string[] = [];
  const text = `${input.taskTitle} ${input.taskDescription || ""}`.toLowerCase();

  // Simple keyword-to-file mapping
  const keywords: Record<string, string[]> = {
    login: ["auth.ts", "auth.tsx", "login.ts", "login.tsx", "session.ts"],
    auth: ["auth.ts", "auth.tsx", "middleware.ts"],
    database: ["db.ts", "database.ts", "schema.ts", "models/"],
    api: ["api/", "routes/", "controllers/"],
    ui: ["components/", "pages/", "views/"],
    test: ["__tests__/", "*.test.ts", "*.spec.ts"],
    config: ["config.ts", ".env", "settings.ts"],
    style: ["*.css", "*.scss", "styles/"],
  };

  for (const [keyword, files] of Object.entries(keywords)) {
    if (text.includes(keyword)) {
      predictedFiles.push(...files);
    }
  }

  // Also check for file mentions in description
  const fileMatches = text.match(/[\w\-]+\.(ts|tsx|js|jsx|css|scss|json|md)/gi);
  if (fileMatches) {
    predictedFiles.push(...fileMatches);
  }

  // Dedupe
  return { predictedFiles: [...new Set(predictedFiles)] };
}
