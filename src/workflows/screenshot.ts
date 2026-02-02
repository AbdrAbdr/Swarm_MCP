import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type ScreenshotMeta = {
  id: string;
  agent: string;
  filename: string;
  description?: string;
  ts: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureScreenshotsDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "screenshots");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function shareScreenshot(input: {
  repoPath?: string;
  agent: string;
  imageBase64: string;
  description?: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ id: string; filePath: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const screenshotsDir = await ensureScreenshotsDir(repoRoot);

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${id}.png`;
  const filePath = path.join(screenshotsDir, filename);

  const buffer = Buffer.from(input.imageBase64, "base64");
  await fs.writeFile(filePath, buffer);

  const meta: ScreenshotMeta = {
    id,
    agent: input.agent,
    filename,
    description: input.description,
    ts: Date.now(),
  };

  const metaPath = path.join(screenshotsDir, `${id}.json`);
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");

  const relImg = path.posix.join("swarm", "screenshots", filename);
  const relMeta = path.posix.join("swarm", "screenshots", `${id}.json`);

  if (input.commitMode !== "none") {
    await git(["add", relImg, relMeta], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: screenshot ${id}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { id, filePath };
}

export async function listScreenshots(repoPath?: string): Promise<ScreenshotMeta[]> {
  const repoRoot = await getRepoRoot(repoPath);
  const screenshotsDir = path.join(repoRoot, "swarm", "screenshots");
  const screenshots: ScreenshotMeta[] = [];

  try {
    const entries = await fs.readdir(screenshotsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(screenshotsDir, ent.name), "utf8");
        const meta: ScreenshotMeta = JSON.parse(raw);
        screenshots.push(meta);
      } catch {
        // ignore
      }
    }
  } catch {
    // dir doesn't exist
  }

  screenshots.sort((a, b) => b.ts - a.ts);
  return screenshots;
}
