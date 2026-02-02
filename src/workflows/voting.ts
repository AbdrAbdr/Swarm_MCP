import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type Vote = {
  agent: string;
  decision: "approve" | "reject";
  reason?: string;
  ts: number;
};

export type VotingSession = {
  id: string;
  initiator: string;
  action: string;
  description: string;
  dangerLevel: "low" | "medium" | "high" | "critical";
  votes: Vote[];
  status: "open" | "approved" | "rejected" | "expired";
  createdAt: number;
  expiresAt: number;
  requiredApprovals: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureVotingDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "voting");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function getRequiredApprovals(dangerLevel: string): number {
  switch (dangerLevel) {
    case "critical": return 3;
    case "high": return 2;
    case "medium": return 1;
    default: return 1;
  }
}

export async function startVoting(input: {
  repoPath?: string;
  initiator: string;
  action: string;
  description: string;
  dangerLevel?: "low" | "medium" | "high" | "critical";
  ttlMinutes?: number;
  commitMode: "none" | "local" | "push";
}): Promise<{ votingId: string; session: VotingSession }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const votingDir = await ensureVotingDir(repoRoot);

  const votingId = `vote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dangerLevel = input.dangerLevel || "medium";
  const ttlMs = (input.ttlMinutes || 10) * 60 * 1000;

  const session: VotingSession = {
    id: votingId,
    initiator: input.initiator,
    action: input.action,
    description: input.description,
    dangerLevel,
    votes: [],
    status: "open",
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    requiredApprovals: getRequiredApprovals(dangerLevel),
  };

  const sessionPath = path.join(votingDir, `${votingId}.json`);
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "voting", `${votingId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: voting started ${votingId}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { votingId, session };
}

export async function castVote(input: {
  repoPath?: string;
  votingId: string;
  agent: string;
  decision: "approve" | "reject";
  reason?: string;
  commitMode: "none" | "local" | "push";
}): Promise<{ success: boolean; session: VotingSession | null }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const sessionPath = path.join(repoRoot, "swarm", "voting", `${input.votingId}.json`);

  let session: VotingSession;
  try {
    const raw = await fs.readFile(sessionPath, "utf8");
    session = JSON.parse(raw);
  } catch {
    return { success: false, session: null };
  }

  // Check if expired
  if (Date.now() > session.expiresAt) {
    session.status = "expired";
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2) + "\n", "utf8");
    return { success: false, session };
  }

  // Check if already voted
  if (session.votes.some(v => v.agent === input.agent)) {
    return { success: false, session };
  }

  // Check if already closed
  if (session.status !== "open") {
    return { success: false, session };
  }

  // Add vote
  session.votes.push({
    agent: input.agent,
    decision: input.decision,
    reason: input.reason,
    ts: Date.now(),
  });

  // Check if resolved
  const approvals = session.votes.filter(v => v.decision === "approve").length;
  const rejections = session.votes.filter(v => v.decision === "reject").length;

  if (rejections > 0) {
    session.status = "rejected"; // any rejection blocks
  } else if (approvals >= session.requiredApprovals) {
    session.status = "approved";
  }

  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "voting", `${input.votingId}.json`);
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", `swarm: vote cast on ${input.votingId} by ${input.agent}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { success: true, session };
}

export async function getVotingSession(input: {
  repoPath?: string;
  votingId: string;
}): Promise<VotingSession | null> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const sessionPath = path.join(repoRoot, "swarm", "voting", `${input.votingId}.json`);

  try {
    const raw = await fs.readFile(sessionPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listOpenVotings(repoPath?: string): Promise<VotingSession[]> {
  const repoRoot = await getRepoRoot(repoPath);
  const votingDir = path.join(repoRoot, "swarm", "voting");
  const open: VotingSession[] = [];

  try {
    const entries = await fs.readdir(votingDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(votingDir, ent.name), "utf8");
        const session: VotingSession = JSON.parse(raw);
        if (session.status === "open" && Date.now() < session.expiresAt) {
          open.push(session);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // dir doesn't exist
  }

  return open;
}
