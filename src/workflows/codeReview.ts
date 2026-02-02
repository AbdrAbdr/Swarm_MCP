import fs from "node:fs/promises";
import path from "node:path";

import { git, gitTry, normalizeLineEndings } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type ReviewRequest = {
  id: string;
  fromAgent: string;
  toAgent?: string;
  branch: string;
  files: string[];
  ts: number;
  status: "pending" | "approved" | "rejected";
  comment?: string;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureReviewsDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "reviews");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function requestCrossAgentReview(input: {
  repoPath?: string;
  fromAgent: string;
  toAgent?: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ reviewId: string; reviewPath: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const reviewsDir = await ensureReviewsDir(repoRoot);

  const headRes = await gitTry(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
  const branch = normalizeLineEndings(headRes.stdout).trim();

  const diffRes = await gitTry(["diff", "--name-only", "HEAD~1"], { cwd: repoRoot });
  const files = normalizeLineEndings(diffRes.stdout).trim().split("\n").filter(Boolean);

  const reviewId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const review: ReviewRequest = {
    id: reviewId,
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    branch,
    files,
    ts: Date.now(),
    status: "pending",
  };

  const reviewPath = path.join(reviewsDir, `${reviewId}.json`);
  await fs.writeFile(reviewPath, JSON.stringify(review, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "reviews", `${reviewId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: review request ${reviewId}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { reviewId, reviewPath };
}

export async function respondToReview(input: {
  repoPath?: string;
  reviewId: string;
  status: "approved" | "rejected";
  comment?: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ ok: boolean }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const reviewsDir = await ensureReviewsDir(repoRoot);
  const reviewPath = path.join(reviewsDir, `${input.reviewId}.json`);

  let review: ReviewRequest;
  try {
    const raw = await fs.readFile(reviewPath, "utf8");
    review = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  review.status = input.status;
  review.comment = input.comment;

  await fs.writeFile(reviewPath, JSON.stringify(review, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "reviews", `${input.reviewId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: review ${input.status} ${input.reviewId}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { ok: true };
}

export async function listPendingReviews(repoPath?: string): Promise<ReviewRequest[]> {
  const repoRoot = await getRepoRoot(repoPath);
  const reviewsDir = path.join(repoRoot, "swarm", "reviews");
  const pending: ReviewRequest[] = [];

  try {
    const entries = await fs.readdir(reviewsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(reviewsDir, ent.name), "utf8");
        const review: ReviewRequest = JSON.parse(raw);
        if (review.status === "pending") pending.push(review);
      } catch {
        // ignore
      }
    }
  } catch {
    // dir doesn't exist
  }

  return pending;
}
