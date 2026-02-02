import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import { getRepoRoot } from "./repo.js";

const execAsync = promisify(exec);

interface Baseline {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  testsTotal: number;
  testsPassed: number;
  lintErrors: number;
  typeCheckPassed: boolean;
  metrics: Record<string, number>;
  branch: string;
  commitHash: string;
}

interface Regression {
  id: string;
  baselineId: string;
  detectedAt: number;
  detectedBy: string;
  type: "test_failure" | "lint_increase" | "type_error" | "metric_regression";
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  resolved: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
}

async function ensureBaselinesDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "baselines");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function getCommitHash(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execAsync("git rev-parse HEAD", { cwd: repoRoot });
    return stdout.trim().slice(0, 8);
  } catch {
    return "unknown";
  }
}

async function getCurrentBranch(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

async function loadRegressions(repoRoot: string): Promise<Regression[]> {
  const regPath = path.join(repoRoot, "swarm", "regressions.json");
  try {
    const raw = await fs.readFile(regPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveRegressions(repoRoot: string, regressions: Regression[]): Promise<void> {
  const regPath = path.join(repoRoot, "swarm", "regressions.json");
  await fs.mkdir(path.dirname(regPath), { recursive: true });
  await fs.writeFile(regPath, JSON.stringify(regressions, null, 2), "utf8");
}

/**
 * Сохраняет эталонное состояние (baseline) для сравнения
 */
export async function saveBaseline(input: {
  repoPath?: string;
  name: string;
  agent: string;
  metrics?: Record<string, number>;
  commitMode?: "none" | "local" | "push";
}): Promise<{
  baselineId: string;
  baselinePath: string;
  baseline: Baseline;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = await ensureBaselinesDir(repoRoot);
  const branch = await getCurrentBranch(repoRoot);
  const commitHash = await getCommitHash(repoRoot);

  // Собираем текущие метрики
  let testsTotal = 0;
  let testsPassed = 0;
  let lintErrors = 0;
  let typeCheckPassed = true;

  // Запускаем тесты
  try {
    const { stdout } = await execAsync("npm test 2>&1 || true", {
      cwd: repoRoot,
      timeout: 300000,
    });
    const passedMatch = stdout.match(/(\d+)\s+passed/);
    const failedMatch = stdout.match(/(\d+)\s+failed/);
    testsPassed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
    testsTotal = testsPassed + failed;
  } catch {
    // Тесты не запустились
  }

  // Lint
  try {
    const { stdout } = await execAsync("npm run lint 2>&1 || true", {
      cwd: repoRoot,
      timeout: 120000,
    });
    const errorMatch = stdout.match(/(\d+)\s+error/);
    lintErrors = errorMatch ? parseInt(errorMatch[1], 10) : 0;
  } catch {
    lintErrors = 999;
  }

  // Type check
  try {
    const { stdout } = await execAsync("npx tsc --noEmit 2>&1 || true", {
      cwd: repoRoot,
      timeout: 120000,
    });
    typeCheckPassed = !stdout.includes("error TS");
  } catch {
    typeCheckPassed = false;
  }

  const baselineId = `baseline-${Date.now()}`;
  const baseline: Baseline = {
    id: baselineId,
    name: input.name,
    createdAt: Date.now(),
    createdBy: input.agent,
    testsTotal,
    testsPassed,
    lintErrors,
    typeCheckPassed,
    metrics: input.metrics || {},
    branch,
    commitHash,
  };

  const baselinePath = path.join(dir, `${input.name}.json`);
  await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2), "utf8");

  return { baselineId, baselinePath, baseline };
}

/**
 * Сравнивает текущее состояние с эталоном
 */
export async function checkRegression(input: {
  repoPath?: string;
  baselineName: string;
  agent: string;
  commitMode?: "none" | "local" | "push";
}): Promise<{
  hasRegression: boolean;
  regressions: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
  comparison: {
    testsTotal: { baseline: number; current: number };
    testsPassed: { baseline: number; current: number };
    lintErrors: { baseline: number; current: number };
    typeCheckPassed: { baseline: boolean; current: boolean };
  };
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = await ensureBaselinesDir(repoRoot);
  const baselinePath = path.join(dir, `${input.baselineName}.json`);

  // Загружаем baseline
  let baseline: Baseline;
  try {
    const raw = await fs.readFile(baselinePath, "utf8");
    baseline = JSON.parse(raw);
  } catch {
    return {
      hasRegression: false,
      regressions: [{ type: "error", description: `Baseline "${input.baselineName}" not found`, severity: "low" }],
      comparison: {
        testsTotal: { baseline: 0, current: 0 },
        testsPassed: { baseline: 0, current: 0 },
        lintErrors: { baseline: 0, current: 0 },
        typeCheckPassed: { baseline: true, current: true },
      },
    };
  }

  // Собираем текущие метрики
  let testsTotal = 0;
  let testsPassed = 0;
  let lintErrors = 0;
  let typeCheckPassed = true;

  try {
    const { stdout } = await execAsync("npm test 2>&1 || true", {
      cwd: repoRoot,
      timeout: 300000,
    });
    const passedMatch = stdout.match(/(\d+)\s+passed/);
    const failedMatch = stdout.match(/(\d+)\s+failed/);
    testsPassed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
    testsTotal = testsPassed + failed;
  } catch {
    // Тесты не запустились
  }

  try {
    const { stdout } = await execAsync("npm run lint 2>&1 || true", {
      cwd: repoRoot,
      timeout: 120000,
    });
    const errorMatch = stdout.match(/(\d+)\s+error/);
    lintErrors = errorMatch ? parseInt(errorMatch[1], 10) : 0;
  } catch {
    lintErrors = 999;
  }

  try {
    const { stdout } = await execAsync("npx tsc --noEmit 2>&1 || true", {
      cwd: repoRoot,
      timeout: 120000,
    });
    typeCheckPassed = !stdout.includes("error TS");
  } catch {
    typeCheckPassed = false;
  }

  const detectedRegressions: Array<{
    type: string;
    description: string;
    severity: string;
  }> = [];

  // Проверяем регрессии
  if (testsPassed < baseline.testsPassed) {
    const diff = baseline.testsPassed - testsPassed;
    detectedRegressions.push({
      type: "test_failure",
      description: `${diff} tests that were passing now fail`,
      severity: diff > 5 ? "critical" : diff > 2 ? "high" : "medium",
    });
  }

  if (lintErrors > baseline.lintErrors) {
    const diff = lintErrors - baseline.lintErrors;
    detectedRegressions.push({
      type: "lint_increase",
      description: `Lint errors increased by ${diff}`,
      severity: diff > 10 ? "high" : diff > 5 ? "medium" : "low",
    });
  }

  if (baseline.typeCheckPassed && !typeCheckPassed) {
    detectedRegressions.push({
      type: "type_error",
      description: "TypeScript type check now fails",
      severity: "high",
    });
  }

  // Сохраняем регрессии
  if (detectedRegressions.length > 0) {
    const allRegressions = await loadRegressions(repoRoot);
    
    for (const reg of detectedRegressions) {
      allRegressions.push({
        id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        baselineId: baseline.id,
        detectedAt: Date.now(),
        detectedBy: input.agent,
        type: reg.type as Regression["type"],
        description: reg.description,
        severity: reg.severity as Regression["severity"],
        resolved: false,
      });
    }
    
    await saveRegressions(repoRoot, allRegressions);
  }

  return {
    hasRegression: detectedRegressions.length > 0,
    regressions: detectedRegressions,
    comparison: {
      testsTotal: { baseline: baseline.testsTotal, current: testsTotal },
      testsPassed: { baseline: baseline.testsPassed, current: testsPassed },
      lintErrors: { baseline: baseline.lintErrors, current: lintErrors },
      typeCheckPassed: { baseline: baseline.typeCheckPassed, current: typeCheckPassed },
    },
  };
}

/**
 * Получает список найденных регрессий
 */
export async function listRegressions(input: {
  repoPath?: string;
  includeResolved?: boolean;
}): Promise<{
  regressions: Regression[];
  unresolvedCount: number;
  totalCount: number;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const all = await loadRegressions(repoRoot);

  const filtered = input.includeResolved ? all : all.filter((r) => !r.resolved);

  return {
    regressions: filtered,
    unresolvedCount: all.filter((r) => !r.resolved).length,
    totalCount: all.length,
  };
}

/**
 * Отмечает регрессию как исправленную
 */
export async function resolveRegression(input: {
  repoPath?: string;
  regressionId: string;
  agent: string;
  commitMode?: "none" | "local" | "push";
}): Promise<{
  resolved: boolean;
  regression: Regression | null;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const all = await loadRegressions(repoRoot);

  const idx = all.findIndex((r) => r.id === input.regressionId);
  if (idx === -1) {
    return { resolved: false, regression: null };
  }

  all[idx].resolved = true;
  all[idx].resolvedAt = Date.now();
  all[idx].resolvedBy = input.agent;

  await saveRegressions(repoRoot, all);

  return { resolved: true, regression: all[idx] };
}

/**
 * Получает список всех baseline'ов
 */
export async function listBaselines(input: {
  repoPath?: string;
}): Promise<{
  baselines: Array<{
    name: string;
    createdAt: string;
    createdBy: string;
    branch: string;
    testsPassed: number;
  }>;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = path.join(repoRoot, "swarm", "baselines");

  const baselines: Array<{
    name: string;
    createdAt: string;
    createdBy: string;
    branch: string;
    testsPassed: number;
  }> = [];

  try {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf8");
        const baseline: Baseline = JSON.parse(raw);
        baselines.push({
          name: baseline.name,
          createdAt: new Date(baseline.createdAt).toISOString(),
          createdBy: baseline.createdBy,
          branch: baseline.branch,
          testsPassed: baseline.testsPassed,
        });
      } catch {
        // Пропускаем битые файлы
      }
    }
  } catch {
    // Директория не существует
  }

  return { baselines };
}
