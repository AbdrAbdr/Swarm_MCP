import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type PlatformCheckRequest = {
  id: string;
  fromAgent: string;
  fromPlatform: string;
  targetPlatforms: string[];
  component: string;
  description?: string;
  screenshotBase64?: string;
  status: "pending" | "verified" | "failed";
  responses: PlatformCheckResponse[];
  ts: number;
};

export type PlatformCheckResponse = {
  agent: string;
  platform: string;
  result: "ok" | "issue";
  issueDescription?: string;
  screenshotBase64?: string;
  ts: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensurePlatformDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "platform-checks");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function getCurrentPlatform(): string {
  const platform = os.platform();
  const arch = os.arch();
  switch (platform) {
    case "win32": return `Windows-${arch}`;
    case "darwin": return `macOS-${arch}`;
    case "linux": return `Linux-${arch}`;
    default: return `${platform}-${arch}`;
  }
}

export async function requestPlatformCheck(input: {
  repoPath?: string;
  fromAgent: string;
  targetPlatforms?: string[];
  component: string;
  description?: string;
  screenshotBase64?: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ checkId: string; request: PlatformCheckRequest }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const platformDir = await ensurePlatformDir(repoRoot);

  const checkId = `platform-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fromPlatform = getCurrentPlatform();

  // Default target platforms: all except current
  const allPlatforms = ["Windows-x64", "macOS-arm64", "macOS-x64", "Linux-x64"];
  const targetPlatforms = input.targetPlatforms || allPlatforms.filter(p => p !== fromPlatform);

  const request: PlatformCheckRequest = {
    id: checkId,
    fromAgent: input.fromAgent,
    fromPlatform,
    targetPlatforms,
    component: input.component,
    description: input.description,
    screenshotBase64: input.screenshotBase64,
    status: "pending",
    responses: [],
    ts: Date.now(),
  };

  const checkPath = path.join(platformDir, `${checkId}.json`);
  await fs.writeFile(checkPath, JSON.stringify(request, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "platform-checks", `${checkId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: platform check request from ${input.fromAgent}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { checkId, request };
}

export async function respondToPlatformCheck(input: {
  repoPath?: string;
  checkId: string;
  agent: string;
  result: "ok" | "issue";
  issueDescription?: string;
  screenshotBase64?: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ ok: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const checkPath = path.join(repoRoot, "swarm", "platform-checks", `${input.checkId}.json`);

  let request: PlatformCheckRequest;
  try {
    const raw = await fs.readFile(checkPath, "utf8");
    request = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  const platform = getCurrentPlatform();

  // Check if already responded from this platform
  if (request.responses.some(r => r.platform === platform)) {
    return { ok: false };
  }

  request.responses.push({
    agent: input.agent,
    platform,
    result: input.result,
    issueDescription: input.issueDescription,
    screenshotBase64: input.screenshotBase64,
    ts: Date.now(),
  });

  // Check if all platforms responded
  const respondedPlatforms = new Set(request.responses.map(r => r.platform));
  const allResponded = request.targetPlatforms.every(p => respondedPlatforms.has(p));
  const hasIssues = request.responses.some(r => r.result === "issue");

  if (allResponded) {
    request.status = hasIssues ? "failed" : "verified";
  }

  await fs.writeFile(checkPath, JSON.stringify(request, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "platform-checks", `${input.checkId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: platform check response from ${input.agent} (${platform})`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { ok: true };
}

export async function getPendingPlatformChecks(repoPath?: string): Promise<PlatformCheckRequest[]> {
  const repoRoot = await getRepoRoot(repoPath);
  const platformDir = path.join(repoRoot, "swarm", "platform-checks");
  const pending: PlatformCheckRequest[] = [];
  const currentPlatform = getCurrentPlatform();

  try {
    const entries = await fs.readdir(platformDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(platformDir, ent.name), "utf8");
        const request: PlatformCheckRequest = JSON.parse(raw);

        // Check if current platform needs to respond
        if (
          request.status === "pending" &&
          request.targetPlatforms.includes(currentPlatform) &&
          !request.responses.some(r => r.platform === currentPlatform)
        ) {
          pending.push(request);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // dir doesn't exist
  }

  pending.sort((a, b) => a.ts - b.ts);
  return pending;
}
