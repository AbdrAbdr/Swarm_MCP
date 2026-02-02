/**
 * Agent Specialization Workflow
 * 
 * Отслеживает экспертизу агентов: какие файлы они правили чаще всего,
 * и рекомендует задачи на основе их специализации.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "./repo.js";

type AgentExpertise = {
  agent: string;
  files: { [filePath: string]: number };       // file -> edit count
  directories: { [dir: string]: number };       // directory -> edit count
  extensions: { [ext: string]: number };        // .ts, .py -> count
  keywords: { [keyword: string]: number };      // auth, api, db -> count
  totalEdits: number;
  lastSeen: string;
};

type ExpertiseDb = {
  agents: { [agentName: string]: AgentExpertise };
  lastUpdated: string;
};

type RecordEditInput = {
  repoPath?: string;
  agent: string;
  files: string[];
  taskKeywords?: string[];
  commitMode: "none" | "local" | "push";
};

type SuggestAgentInput = {
  repoPath?: string;
  files?: string[];
  directories?: string[];
  keywords?: string[];
};

type SuggestAgentOutput = {
  suggestions: Array<{
    agent: string;
    score: number;
    reason: string;
    expertise: string[];
  }>;
};

/**
 * Получает путь к базе экспертизы
 */
function getExpertiseDbPath(repoRoot: string): string {
  return path.join(repoRoot, "swarm", "EXPERTISE.json");
}

/**
 * Загружает базу экспертизы
 */
function loadExpertiseDb(repoRoot: string): ExpertiseDb {
  const dbPath = getExpertiseDbPath(repoRoot);
  if (fs.existsSync(dbPath)) {
    try {
      return JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    } catch {
      return { agents: {}, lastUpdated: new Date().toISOString() };
    }
  }
  return { agents: {}, lastUpdated: new Date().toISOString() };
}

/**
 * Сохраняет базу экспертизы
 */
function saveExpertiseDb(repoRoot: string, db: ExpertiseDb, commitMode: "none" | "local" | "push"): void {
  const swarmDir = path.join(repoRoot, "swarm");
  fs.mkdirSync(swarmDir, { recursive: true });
  
  const dbPath = getExpertiseDbPath(repoRoot);
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf-8");
  
  if (commitMode !== "none") {
    try {
      execSync(`git add "${dbPath}"`, { cwd: repoRoot, stdio: "pipe" });
      execSync(`git commit -m "swarm: update agent expertise"`, { cwd: repoRoot, stdio: "pipe" });
      if (commitMode === "push") {
        execSync(`git push`, { cwd: repoRoot, stdio: "pipe" });
      }
    } catch { /* ignore */ }
  }
}

/**
 * Записывает информацию о редактировании файлов агентом
 */
export async function recordAgentEdit(input: RecordEditInput): Promise<{ recorded: boolean; agent: string; totalEdits: number }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const db = loadExpertiseDb(repoRoot);
  
  if (!db.agents[input.agent]) {
    db.agents[input.agent] = {
      agent: input.agent,
      files: {},
      directories: {},
      extensions: {},
      keywords: {},
      totalEdits: 0,
      lastSeen: new Date().toISOString(),
    };
  }
  
  const expertise = db.agents[input.agent];
  expertise.lastSeen = new Date().toISOString();
  
  for (const file of input.files) {
    // Учитываем файлы
    expertise.files[file] = (expertise.files[file] || 0) + 1;
    
    // Учитываем директории
    const dir = path.dirname(file);
    expertise.directories[dir] = (expertise.directories[dir] || 0) + 1;
    
    // Учитываем расширения
    const ext = path.extname(file) || ".noext";
    expertise.extensions[ext] = (expertise.extensions[ext] || 0) + 1;
    
    expertise.totalEdits++;
  }
  
  // Учитываем ключевые слова задачи
  if (input.taskKeywords) {
    for (const keyword of input.taskKeywords) {
      const kw = keyword.toLowerCase();
      expertise.keywords[kw] = (expertise.keywords[kw] || 0) + 1;
    }
  }
  
  // Извлекаем ключевые слова из путей файлов
  for (const file of input.files) {
    const parts = file.toLowerCase().split(/[\/\\._-]/);
    for (const part of parts) {
      if (part.length > 2 && !["src", "lib", "dist", "node_modules", "index", "main"].includes(part)) {
        expertise.keywords[part] = (expertise.keywords[part] || 0) + 1;
      }
    }
  }
  
  saveExpertiseDb(repoRoot, db, input.commitMode);
  
  return { 
    recorded: true, 
    agent: input.agent, 
    totalEdits: expertise.totalEdits 
  };
}

/**
 * Предлагает лучшего агента для задачи на основе экспертизы
 */
export async function suggestAgentForTask(input: SuggestAgentInput): Promise<SuggestAgentOutput> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const db = loadExpertiseDb(repoRoot);
  
  const scores: Map<string, { score: number; reasons: string[]; expertise: string[] }> = new Map();
  
  for (const [agentName, expertise] of Object.entries(db.agents)) {
    let score = 0;
    const reasons: string[] = [];
    const expertiseAreas: string[] = [];
    
    // Проверяем совпадение файлов
    if (input.files) {
      for (const file of input.files) {
        if (expertise.files[file]) {
          score += expertise.files[file] * 10;
          reasons.push(`edited ${file} ${expertise.files[file]}x`);
        }
      }
    }
    
    // Проверяем совпадение директорий
    if (input.directories) {
      for (const dir of input.directories) {
        if (expertise.directories[dir]) {
          score += expertise.directories[dir] * 5;
          reasons.push(`worked in ${dir} ${expertise.directories[dir]}x`);
          expertiseAreas.push(dir);
        }
      }
    }
    
    // Проверяем совпадение ключевых слов
    if (input.keywords) {
      for (const keyword of input.keywords) {
        const kw = keyword.toLowerCase();
        if (expertise.keywords[kw]) {
          score += expertise.keywords[kw] * 3;
          reasons.push(`knows "${kw}" (${expertise.keywords[kw]}x)`);
          expertiseAreas.push(kw);
        }
      }
    }
    
    // Базовый скор от общего опыта
    score += Math.min(expertise.totalEdits * 0.1, 10);
    
    if (score > 0) {
      scores.set(agentName, { score, reasons, expertise: expertiseAreas });
    }
  }
  
  // Сортируем по score
  const suggestions = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5)
    .map(([agent, data]) => ({
      agent,
      score: Math.round(data.score),
      reason: data.reasons.slice(0, 3).join("; "),
      expertise: [...new Set(data.expertise)].slice(0, 5),
    }));
  
  return { suggestions };
}

/**
 * Получает полную экспертизу агента
 */
export async function getAgentExpertise(input: { repoPath?: string; agent: string }): Promise<{ found: boolean; expertise: AgentExpertise | null }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const db = loadExpertiseDb(repoRoot);
  
  const expertise = db.agents[input.agent];
  if (!expertise) {
    return { found: false, expertise: null };
  }
  
  return { found: true, expertise };
}

/**
 * Получает топ-экспертов по области (файлу, директории или ключевому слову)
 */
export async function getTopExperts(input: { repoPath?: string; area: string; limit?: number }): Promise<{ experts: Array<{ agent: string; edits: number }> }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const db = loadExpertiseDb(repoRoot);
  const limit = input.limit || 5;
  const area = input.area.toLowerCase();
  
  const agentScores: Array<{ agent: string; edits: number }> = [];
  
  for (const [agentName, expertise] of Object.entries(db.agents)) {
    let edits = 0;
    
    // Проверяем файлы
    if (expertise.files[input.area]) {
      edits += expertise.files[input.area];
    }
    
    // Проверяем директории
    if (expertise.directories[input.area]) {
      edits += expertise.directories[input.area];
    }
    
    // Проверяем ключевые слова
    if (expertise.keywords[area]) {
      edits += expertise.keywords[area];
    }
    
    if (edits > 0) {
      agentScores.push({ agent: agentName, edits });
    }
  }
  
  agentScores.sort((a, b) => b.edits - a.edits);
  
  return { experts: agentScores.slice(0, limit) };
}

/**
 * Получает список всех агентов с их общей статистикой
 */
export async function listAllAgentExpertise(repoPath?: string): Promise<{ agents: Array<{ agent: string; totalEdits: number; topAreas: string[]; lastSeen: string }> }> {
  const repoRoot = await getRepoRoot(repoPath);
  const db = loadExpertiseDb(repoRoot);
  
  const agents = Object.values(db.agents).map(e => {
    // Определяем топ области
    const allAreas = [
      ...Object.entries(e.directories).map(([dir, count]) => ({ area: dir, count })),
      ...Object.entries(e.keywords).map(([kw, count]) => ({ area: kw, count })),
    ];
    allAreas.sort((a, b) => b.count - a.count);
    const topAreas = allAreas.slice(0, 5).map(a => a.area);
    
    return {
      agent: e.agent,
      totalEdits: e.totalEdits,
      topAreas,
      lastSeen: e.lastSeen,
    };
  });
  
  agents.sort((a, b) => b.totalEdits - a.totalEdits);
  
  return { agents };
}
