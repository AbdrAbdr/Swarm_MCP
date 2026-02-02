import fs from "node:fs/promises";
import path from "node:path";

import { getRepoRoot } from "./repo.js";
import { updateTask } from "./taskState.js";

const DEAD_THRESHOLD_MINUTES = 30;

interface PulseAgent {
  agent: string;
  status: string;
  lastUpdate: number;
  currentFile?: string;
  currentTask?: string;
  platform?: string;
  branch?: string;
}

interface PulseData {
  agents: PulseAgent[];
  lastUpdate: number;
}

async function loadPulse(repoRoot: string): Promise<PulseData> {
  const pulsePath = path.join(repoRoot, "orchestrator", "PULSE.json");
  try {
    const raw = await fs.readFile(pulsePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { agents: [], lastUpdate: 0 };
  }
}

/**
 * Проверяет, жив ли агент (последний пинг > 30 минут = dead)
 */
export async function checkAgentHealth(input: {
  repoPath?: string;
  agent: string;
  thresholdMinutes?: number;
}): Promise<{
  alive: boolean;
  lastSeen: string;
  minutesAgo: number;
  status: string;
  currentTask: string | null;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const threshold = input.thresholdMinutes || DEAD_THRESHOLD_MINUTES;
  const pulse = await loadPulse(repoRoot);

  const agentData = pulse.agents.find((a) => a.agent === input.agent);

  if (!agentData) {
    return {
      alive: false,
      lastSeen: "never",
      minutesAgo: -1,
      status: "unknown",
      currentTask: null,
    };
  }

  const now = Date.now();
  const minutesAgo = Math.floor((now - agentData.lastUpdate) / 60000);
  const alive = minutesAgo < threshold && agentData.status !== "offline";

  return {
    alive,
    lastSeen: new Date(agentData.lastUpdate).toISOString(),
    minutesAgo,
    status: agentData.status,
    currentTask: agentData.currentTask || null,
  };
}

/**
 * Получает список "мертвых" агентов (неактивных более N минут)
 */
export async function getDeadAgents(input: {
  repoPath?: string;
  thresholdMinutes?: number;
}): Promise<{
  deadAgents: Array<{
    agent: string;
    lastSeen: string;
    minutesAgo: number;
    lastTask: string | null;
  }>;
  aliveCount: number;
  deadCount: number;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const threshold = input.thresholdMinutes || DEAD_THRESHOLD_MINUTES;
  const pulse = await loadPulse(repoRoot);

  const now = Date.now();
  const deadAgents: Array<{
    agent: string;
    lastSeen: string;
    minutesAgo: number;
    lastTask: string | null;
  }> = [];

  let aliveCount = 0;

  for (const agentData of pulse.agents) {
    const minutesAgo = Math.floor((now - agentData.lastUpdate) / 60000);
    const alive = minutesAgo < threshold && agentData.status !== "offline";

    if (alive) {
      aliveCount++;
    } else {
      deadAgents.push({
        agent: agentData.agent,
        lastSeen: new Date(agentData.lastUpdate).toISOString(),
        minutesAgo,
        lastTask: agentData.currentTask || null,
      });
    }
  }

  return {
    deadAgents,
    aliveCount,
    deadCount: deadAgents.length,
  };
}

/**
 * Принудительно переназначает задачу мертвого агента другому
 */
export async function forceReassignTask(input: {
  repoPath?: string;
  taskId: string;
  fromAgent: string;
  toAgent?: string;
  reason?: string;
  commitMode?: "none" | "local" | "push";
}): Promise<{
  reassigned: boolean;
  taskId: string;
  fromAgent: string;
  toAgent: string | null;
  reason: string;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const commitMode = input.commitMode || "push";

  // Проверяем, что исходный агент действительно мертв
  const health = await checkAgentHealth({
    repoPath: input.repoPath,
    agent: input.fromAgent,
  });

  if (health.alive) {
    return {
      reassigned: false,
      taskId: input.taskId,
      fromAgent: input.fromAgent,
      toAgent: null,
      reason: `Agent ${input.fromAgent} is still alive (last seen ${health.minutesAgo} minutes ago)`,
    };
  }

  // Если указан новый агент, переназначаем
  if (input.toAgent) {
    await updateTask({
      repoPath: input.repoPath,
      taskId: input.taskId,
      assignee: input.toAgent,
      commitMode,
    });

    return {
      reassigned: true,
      taskId: input.taskId,
      fromAgent: input.fromAgent,
      toAgent: input.toAgent,
      reason: input.reason || `Reassigned from dead agent ${input.fromAgent}`,
    };
  }

  // Если новый агент не указан, просто снимаем назначение
  await updateTask({
    repoPath: input.repoPath,
    taskId: input.taskId,
    status: "open",
    commitMode,
  });

  return {
    reassigned: true,
    taskId: input.taskId,
    fromAgent: input.fromAgent,
    toAgent: null,
    reason: input.reason || `Unassigned from dead agent ${input.fromAgent}, task now open`,
  };
}

/**
 * Получает полную статистику здоровья свармa
 */
export async function getSwarmHealthSummary(input: {
  repoPath?: string;
  thresholdMinutes?: number;
}): Promise<{
  totalAgents: number;
  aliveAgents: number;
  deadAgents: number;
  idleAgents: number;
  activeAgents: number;
  healthPercentage: number;
  lastUpdate: string;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const threshold = input.thresholdMinutes || DEAD_THRESHOLD_MINUTES;
  const pulse = await loadPulse(repoRoot);

  const now = Date.now();
  let aliveCount = 0;
  let deadCount = 0;
  let idleCount = 0;
  let activeCount = 0;

  for (const agentData of pulse.agents) {
    const minutesAgo = Math.floor((now - agentData.lastUpdate) / 60000);
    const alive = minutesAgo < threshold && agentData.status !== "offline";

    if (alive) {
      aliveCount++;
      if (agentData.status === "idle" || agentData.status === "paused") {
        idleCount++;
      } else {
        activeCount++;
      }
    } else {
      deadCount++;
    }
  }

  const total = pulse.agents.length;
  const healthPercentage = total > 0 ? Math.round((aliveCount / total) * 100) : 100;

  return {
    totalAgents: total,
    aliveAgents: aliveCount,
    deadAgents: deadCount,
    idleAgents: idleCount,
    activeAgents: activeCount,
    healthPercentage,
    lastUpdate: new Date(pulse.lastUpdate).toISOString(),
  };
}
