import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";
import { appendEvent } from "./auction.js";

export type AdviceRequest = {
  id: string;
  agent: string;
  taskId?: string;
  problem: string;
  context: string;
  codeSnippet?: string;
  filesInvolved: string[];
  attemptedSolutions: string[];
  responses: AdviceResponse[];
  status: "open" | "resolved";
  createdAt: number;
  resolvedAt?: number;
};

export type AdviceResponse = {
  agent: string;
  suggestion: string;
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

async function ensureAdviceDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "orchestrator", "advice");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function requestCollectiveAdvice(input: {
  repoPath?: string;
  agent: string;
  taskId?: string;
  problem: string;
  context: string;
  codeSnippet?: string;
  filesInvolved: string[];
  attemptedSolutions: string[];
  commitMode: "none" | "local" | "push";
}): Promise<{ requestId: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const adviceDir = await ensureAdviceDir(repoRoot);

  const requestId = `advice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const request: AdviceRequest = {
    id: requestId,
    agent: input.agent,
    taskId: input.taskId,
    problem: input.problem,
    context: input.context,
    codeSnippet: input.codeSnippet,
    filesInvolved: input.filesInvolved,
    attemptedSolutions: input.attemptedSolutions,
    responses: [],
    status: "open",
    createdAt: Date.now(),
  };

  const requestPath = path.join(adviceDir, `${requestId}.json`);
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2) + "\n", "utf8");

  // Broadcast advice request
  await appendEvent({
    repoPath: repoRoot,
    type: "advice_requested",
    payload: {
      requestId,
      agent: input.agent,
      problem: input.problem,
      filesInvolved: input.filesInvolved,
    },
    commitMode: "none",
  });

  const rel = path.posix.join("orchestrator", "advice", `${requestId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel, path.posix.join("swarm", "EVENTS.ndjson")], { cwd: repoRoot });
    await git(["commit", "-m", `🆘 Advice requested by ${input.agent}: ${input.problem.slice(0, 50)}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { requestId };
}

export async function provideAdvice(input: {
  repoPath?: string;
  requestId: string;
  agent: string;
  suggestion: string;
  confidence: "low" | "medium" | "high";
  commitMode: "none" | "local" | "push";
}): Promise<{ ok: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const requestPath = path.join(repoRoot, "orchestrator", "advice", `${input.requestId}.json`);

  let request: AdviceRequest;
  try {
    const raw = await fs.readFile(requestPath, "utf8");
    request = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  if (request.status !== "open") {
    return { ok: false };
  }

  // Don't allow self-advice
  if (request.agent === input.agent) {
    return { ok: false };
  }

  request.responses.push({
    agent: input.agent,
    suggestion: input.suggestion,
    confidence: input.confidence,
    ts: Date.now(),
  });

  await fs.writeFile(requestPath, JSON.stringify(request, null, 2) + "\n", "utf8");

  const rel = path.posix.join("orchestrator", "advice", `${input.requestId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `💡 Advice from ${input.agent} on ${input.requestId}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { ok: true };
}

export async function resolveAdviceRequest(input: {
  repoPath?: string;
  requestId: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ ok: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const requestPath = path.join(repoRoot, "orchestrator", "advice", `${input.requestId}.json`);

  let request: AdviceRequest;
  try {
    const raw = await fs.readFile(requestPath, "utf8");
    request = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  request.status = "resolved";
  request.resolvedAt = Date.now();

  await fs.writeFile(requestPath, JSON.stringify(request, null, 2) + "\n", "utf8");

  const rel = path.posix.join("orchestrator", "advice", `${input.requestId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `✅ Advice resolved: ${input.requestId}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { ok: true };
}

export async function getOpenAdviceRequests(repoPath?: string): Promise<AdviceRequest[]> {
  const repoRoot = await getRepoRoot(repoPath);
  const adviceDir = path.join(repoRoot, "orchestrator", "advice");
  const requests: AdviceRequest[] = [];

  try {
    const entries = await fs.readdir(adviceDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(adviceDir, ent.name), "utf8");
        const request: AdviceRequest = JSON.parse(raw);
        if (request.status === "open") {
          requests.push(request);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // dir doesn't exist
  }

  requests.sort((a, b) => b.createdAt - a.createdAt);
  return requests;
}
