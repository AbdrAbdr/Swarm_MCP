import fs from "node:fs/promises";
import path from "node:path";

import { getRepoRoot } from "./repo.js";

interface UsageEntry {
  ts: number;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  taskId?: string;
  tool?: string;
}

interface Budget {
  dailyLimit: number;
  monthlyLimit: number;
  perAgentLimit: number;
  alertThreshold: number; // 0-1, например 0.8 = 80%
  currency: string;
}

const DEFAULT_BUDGET: Budget = {
  dailyLimit: 100,
  monthlyLimit: 2000,
  perAgentLimit: 50,
  alertThreshold: 0.8,
  currency: "USD",
};

// Примерные цены за 1M токенов (можно обновлять)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4": { input: 30, output: 60 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4o": { input: 5, output: 15 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-opus-4": { input: 15, output: 75 },
  default: { input: 5, output: 15 },
};

async function ensureCostsDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "costs");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["default"];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 10000) / 10000; // 4 знака после запятой
}

async function loadBudget(repoRoot: string): Promise<Budget> {
  const dir = await ensureCostsDir(repoRoot);
  const budgetPath = path.join(dir, "budget.json");
  try {
    const raw = await fs.readFile(budgetPath, "utf8");
    return { ...DEFAULT_BUDGET, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BUDGET;
  }
}

/**
 * Логирует использование API (токены и стоимость)
 */
export async function logApiUsage(input: {
  repoPath?: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  taskId?: string;
  tool?: string;
}): Promise<{
  logged: boolean;
  cost: number;
  totalTokens: number;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = await ensureCostsDir(repoRoot);
  const usagePath = path.join(dir, "usage.ndjson");

  const totalTokens = input.inputTokens + input.outputTokens;
  const cost = calculateCost(input.model, input.inputTokens, input.outputTokens);

  const entry: UsageEntry = {
    ts: Date.now(),
    agent: input.agent,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens,
    cost,
    taskId: input.taskId,
    tool: input.tool,
  };

  await fs.appendFile(usagePath, JSON.stringify(entry) + "\n", "utf8");

  return { logged: true, cost, totalTokens };
}

/**
 * Получает расходы агента за период
 */
export async function getAgentCosts(input: {
  repoPath?: string;
  agent: string;
  periodDays?: number;
}): Promise<{
  agent: string;
  periodDays: number;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  breakdown: Array<{ model: string; cost: number; tokens: number; count: number }>;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = path.join(repoRoot, "swarm", "costs");
  const usagePath = path.join(dir, "usage.ndjson");
  const periodDays = input.periodDays || 30;
  const since = Date.now() - periodDays * 24 * 60 * 60 * 1000;

  let totalCost = 0;
  let totalTokens = 0;
  let requestCount = 0;
  const byModel: Record<string, { cost: number; tokens: number; count: number }> = {};

  try {
    const content = await fs.readFile(usagePath, "utf8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      if (!line) continue;
      try {
        const entry: UsageEntry = JSON.parse(line);
        if (entry.agent !== input.agent || entry.ts < since) continue;

        totalCost += entry.cost;
        totalTokens += entry.totalTokens;
        requestCount++;

        if (!byModel[entry.model]) {
          byModel[entry.model] = { cost: 0, tokens: 0, count: 0 };
        }
        byModel[entry.model].cost += entry.cost;
        byModel[entry.model].tokens += entry.totalTokens;
        byModel[entry.model].count++;
      } catch {
        // Пропускаем битые строки
      }
    }
  } catch {
    // Файл не существует
  }

  const breakdown = Object.entries(byModel).map(([model, data]) => ({
    model,
    ...data,
  }));

  return {
    agent: input.agent,
    periodDays,
    totalCost: Math.round(totalCost * 100) / 100,
    totalTokens,
    requestCount,
    breakdown,
  };
}

/**
 * Получает общие расходы проекта
 */
export async function getProjectCosts(input: {
  repoPath?: string;
  periodDays?: number;
}): Promise<{
  periodDays: number;
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  byAgent: Array<{ agent: string; cost: number; tokens: number; count: number }>;
  byDay: Array<{ date: string; cost: number; tokens: number }>;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = path.join(repoRoot, "swarm", "costs");
  const usagePath = path.join(dir, "usage.ndjson");
  const periodDays = input.periodDays || 30;
  const since = Date.now() - periodDays * 24 * 60 * 60 * 1000;

  let totalCost = 0;
  let totalTokens = 0;
  let requestCount = 0;
  const byAgent: Record<string, { cost: number; tokens: number; count: number }> = {};
  const byDay: Record<string, { cost: number; tokens: number }> = {};

  try {
    const content = await fs.readFile(usagePath, "utf8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      if (!line) continue;
      try {
        const entry: UsageEntry = JSON.parse(line);
        if (entry.ts < since) continue;

        totalCost += entry.cost;
        totalTokens += entry.totalTokens;
        requestCount++;

        // По агенту
        if (!byAgent[entry.agent]) {
          byAgent[entry.agent] = { cost: 0, tokens: 0, count: 0 };
        }
        byAgent[entry.agent].cost += entry.cost;
        byAgent[entry.agent].tokens += entry.totalTokens;
        byAgent[entry.agent].count++;

        // По дню
        const date = new Date(entry.ts).toISOString().split("T")[0];
        if (!byDay[date]) {
          byDay[date] = { cost: 0, tokens: 0 };
        }
        byDay[date].cost += entry.cost;
        byDay[date].tokens += entry.totalTokens;
      } catch {
        // Пропускаем битые строки
      }
    }
  } catch {
    // Файл не существует
  }

  return {
    periodDays,
    totalCost: Math.round(totalCost * 100) / 100,
    totalTokens,
    requestCount,
    byAgent: Object.entries(byAgent)
      .map(([agent, data]) => ({ agent, ...data }))
      .sort((a, b) => b.cost - a.cost),
    byDay: Object.entries(byDay)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Устанавливает лимит бюджета
 */
export async function setBudgetLimit(input: {
  repoPath?: string;
  dailyLimit?: number;
  monthlyLimit?: number;
  perAgentLimit?: number;
  alertThreshold?: number;
  commitMode?: "none" | "local" | "push";
}): Promise<{
  updated: boolean;
  budget: Budget;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = await ensureCostsDir(repoRoot);
  const budgetPath = path.join(dir, "budget.json");

  const current = await loadBudget(repoRoot);
  const updated: Budget = {
    dailyLimit: input.dailyLimit ?? current.dailyLimit,
    monthlyLimit: input.monthlyLimit ?? current.monthlyLimit,
    perAgentLimit: input.perAgentLimit ?? current.perAgentLimit,
    alertThreshold: input.alertThreshold ?? current.alertThreshold,
    currency: current.currency,
  };

  await fs.writeFile(budgetPath, JSON.stringify(updated, null, 2), "utf8");

  return { updated: true, budget: updated };
}

/**
 * Проверяет, сколько бюджета осталось
 */
export async function checkBudgetRemaining(input: {
  repoPath?: string;
  agent?: string;
}): Promise<{
  dailyRemaining: number;
  monthlyRemaining: number;
  agentRemaining: number | null;
  dailyUsed: number;
  monthlyUsed: number;
  agentUsed: number | null;
  alerts: string[];
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const budget = await loadBudget(repoRoot);

  // Получаем расходы за день и месяц
  const dailyCosts = await getProjectCosts({ repoPath: input.repoPath, periodDays: 1 });
  const monthlyCosts = await getProjectCosts({ repoPath: input.repoPath, periodDays: 30 });

  const dailyUsed = dailyCosts.totalCost;
  const monthlyUsed = monthlyCosts.totalCost;

  let agentUsed: number | null = null;
  let agentRemaining: number | null = null;

  if (input.agent) {
    const agentCosts = await getAgentCosts({
      repoPath: input.repoPath,
      agent: input.agent,
      periodDays: 30,
    });
    agentUsed = agentCosts.totalCost;
    agentRemaining = Math.max(0, budget.perAgentLimit - agentUsed);
  }

  const dailyRemaining = Math.max(0, budget.dailyLimit - dailyUsed);
  const monthlyRemaining = Math.max(0, budget.monthlyLimit - monthlyUsed);

  const alerts: string[] = [];

  // Проверяем пороги алертов
  if (dailyUsed / budget.dailyLimit >= budget.alertThreshold) {
    alerts.push(`Daily budget at ${Math.round((dailyUsed / budget.dailyLimit) * 100)}%`);
  }
  if (monthlyUsed / budget.monthlyLimit >= budget.alertThreshold) {
    alerts.push(`Monthly budget at ${Math.round((monthlyUsed / budget.monthlyLimit) * 100)}%`);
  }
  if (agentUsed !== null && agentUsed / budget.perAgentLimit >= budget.alertThreshold) {
    alerts.push(`Agent ${input.agent} budget at ${Math.round((agentUsed / budget.perAgentLimit) * 100)}%`);
  }

  return {
    dailyRemaining: Math.round(dailyRemaining * 100) / 100,
    monthlyRemaining: Math.round(monthlyRemaining * 100) / 100,
    agentRemaining: agentRemaining !== null ? Math.round(agentRemaining * 100) / 100 : null,
    dailyUsed: Math.round(dailyUsed * 100) / 100,
    monthlyUsed: Math.round(monthlyUsed * 100) / 100,
    agentUsed: agentUsed !== null ? Math.round(agentUsed * 100) / 100 : null,
    alerts,
  };
}
