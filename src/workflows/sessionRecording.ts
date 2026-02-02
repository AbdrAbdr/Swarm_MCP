import fs from "node:fs/promises";
import path from "node:path";

import { getRepoRoot } from "./repo.js";

interface SessionAction {
  ts: number;
  type: "tool_call" | "file_edit" | "file_read" | "git_op" | "chat" | "error" | "custom";
  tool?: string;
  file?: string;
  input?: Record<string, unknown>;
  output?: string;
  duration?: number;
  error?: string;
}

interface SessionMeta {
  sessionId: string;
  agent: string;
  startedAt: number;
  endedAt?: number;
  taskId?: string;
  actionsCount: number;
}

function generateSessionId(agent: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${agent}-${ts}`;
}

async function ensureRecordingsDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "swarm", "recordings");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Начинает запись сессии агента
 */
export async function startSessionRecording(input: {
  repoPath?: string;
  agent: string;
  taskId?: string;
}): Promise<{
  sessionId: string;
  recordingPath: string;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = await ensureRecordingsDir(repoRoot);
  
  const sessionId = generateSessionId(input.agent);
  const recordingPath = path.join(dir, `${sessionId}.ndjson`);
  
  // Записываем метаданные сессии как первую строку
  const meta: SessionMeta = {
    sessionId,
    agent: input.agent,
    startedAt: Date.now(),
    taskId: input.taskId,
    actionsCount: 0,
  };
  
  await fs.writeFile(recordingPath, JSON.stringify({ type: "session_start", meta }) + "\n", "utf8");
  
  return { sessionId, recordingPath };
}

/**
 * Записывает действие в текущую сессию
 */
export async function logSessionAction(input: {
  repoPath?: string;
  sessionId: string;
  actionType: "tool_call" | "file_edit" | "file_read" | "git_op" | "chat" | "error" | "custom";
  tool?: string;
  file?: string;
  inputData?: Record<string, unknown>;
  outputData?: string;
  duration?: number;
  error?: string;
}): Promise<{
  logged: boolean;
  actionIndex: number;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = path.join(repoRoot, "swarm", "recordings");
  const recordingPath = path.join(dir, `${input.sessionId}.ndjson`);
  
  try {
    // Читаем текущий файл, чтобы посчитать индекс
    const content = await fs.readFile(recordingPath, "utf8");
    const lines = content.trim().split("\n");
    const actionIndex = lines.length; // следующий индекс
    
    const action: SessionAction = {
      ts: Date.now(),
      type: input.actionType,
      tool: input.tool,
      file: input.file,
      input: input.inputData,
      output: input.outputData,
      duration: input.duration,
      error: input.error,
    };
    
    await fs.appendFile(recordingPath, JSON.stringify({ type: "action", index: actionIndex, action }) + "\n", "utf8");
    
    return { logged: true, actionIndex };
  } catch {
    return { logged: false, actionIndex: -1 };
  }
}

/**
 * Завершает запись сессии
 */
export async function stopSessionRecording(input: {
  repoPath?: string;
  sessionId: string;
  summary?: string;
}): Promise<{
  stopped: boolean;
  duration: number;
  actionsCount: number;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = path.join(repoRoot, "swarm", "recordings");
  const recordingPath = path.join(dir, `${input.sessionId}.ndjson`);
  
  try {
    const content = await fs.readFile(recordingPath, "utf8");
    const lines = content.trim().split("\n");
    
    // Парсим первую строку для получения startedAt
    const firstLine = JSON.parse(lines[0]);
    const startedAt = firstLine.meta?.startedAt || Date.now();
    const endedAt = Date.now();
    const duration = endedAt - startedAt;
    const actionsCount = lines.length - 1; // минус session_start
    
    // Записываем завершение сессии
    await fs.appendFile(recordingPath, JSON.stringify({
      type: "session_end",
      endedAt,
      duration,
      actionsCount,
      summary: input.summary,
    }) + "\n", "utf8");
    
    return { stopped: true, duration, actionsCount };
  } catch {
    return { stopped: false, duration: 0, actionsCount: 0 };
  }
}

/**
 * Получает список всех записанных сессий
 */
export async function listSessionRecordings(input: {
  repoPath?: string;
  agent?: string;
  limit?: number;
}): Promise<{
  sessions: Array<{
    sessionId: string;
    agent: string;
    startedAt: string;
    endedAt: string | null;
    duration: number | null;
    actionsCount: number;
    taskId: string | null;
  }>;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = path.join(repoRoot, "swarm", "recordings");
  const limit = input.limit || 50;
  
  const sessions: Array<{
    sessionId: string;
    agent: string;
    startedAt: string;
    endedAt: string | null;
    duration: number | null;
    actionsCount: number;
    taskId: string | null;
  }> = [];
  
  try {
    const files = await fs.readdir(dir);
    const ndjsonFiles = files.filter((f) => f.endsWith(".ndjson")).sort().reverse();
    
    for (const file of ndjsonFiles.slice(0, limit)) {
      try {
        const content = await fs.readFile(path.join(dir, file), "utf8");
        const lines = content.trim().split("\n");
        
        if (lines.length === 0) continue;
        
        const firstLine = JSON.parse(lines[0]);
        const meta = firstLine.meta;
        
        if (!meta) continue;
        
        // Фильтр по агенту
        if (input.agent && meta.agent !== input.agent) continue;
        
        // Ищем session_end
        let endedAt: string | null = null;
        let duration: number | null = null;
        
        const lastLine = JSON.parse(lines[lines.length - 1]);
        if (lastLine.type === "session_end") {
          endedAt = new Date(lastLine.endedAt).toISOString();
          duration = lastLine.duration;
        }
        
        sessions.push({
          sessionId: meta.sessionId,
          agent: meta.agent,
          startedAt: new Date(meta.startedAt).toISOString(),
          endedAt,
          duration,
          actionsCount: lines.length - 1,
          taskId: meta.taskId || null,
        });
      } catch {
        // Пропускаем битые файлы
      }
    }
  } catch {
    // Директория не существует
  }
  
  return { sessions };
}

/**
 * Воспроизводит (читает) содержимое записи сессии для обучения или анализа
 */
export async function replaySession(input: {
  repoPath?: string;
  sessionId: string;
  fromIndex?: number;
  toIndex?: number;
}): Promise<{
  found: boolean;
  meta: SessionMeta | null;
  actions: SessionAction[];
  totalActions: number;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const dir = path.join(repoRoot, "swarm", "recordings");
  const recordingPath = path.join(dir, `${input.sessionId}.ndjson`);
  
  try {
    const content = await fs.readFile(recordingPath, "utf8");
    const lines = content.trim().split("\n");
    
    if (lines.length === 0) {
      return { found: false, meta: null, actions: [], totalActions: 0 };
    }
    
    const firstLine = JSON.parse(lines[0]);
    const meta = firstLine.meta as SessionMeta;
    
    const actions: SessionAction[] = [];
    const fromIdx = input.fromIndex || 1;
    const toIdx = input.toIndex || lines.length;
    
    for (let i = fromIdx; i < Math.min(toIdx, lines.length); i++) {
      try {
        const line = JSON.parse(lines[i]);
        if (line.type === "action" && line.action) {
          actions.push(line.action);
        }
      } catch {
        // Пропускаем битые строки
      }
    }
    
    return {
      found: true,
      meta,
      actions,
      totalActions: lines.length - 1,
    };
  } catch {
    return { found: false, meta: null, actions: [], totalActions: 0 };
  }
}
