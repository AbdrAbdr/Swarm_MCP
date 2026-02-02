import fs from "node:fs/promises";
import path from "node:path";

import { getRepoRoot } from "./repo.js";

interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  tokensEstimated: number;
  savedTokens: number;
}

/**
 * Оценивает размер текста в токенах (простая формула: chars/4)
 */
export async function estimateContextSize(input: {
  text: string;
  model?: string;
}): Promise<{
  characters: number;
  words: number;
  lines: number;
  tokensEstimated: number;
  model: string;
}> {
  const text = input.text;
  const model = input.model || "gpt-4";

  const characters = text.length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const lines = text.split("\n").length;

  // Простая эвристика: ~4 символа = 1 токен для английского
  // Для кода обычно ~3.5 символа = 1 токен
  const tokensEstimated = Math.ceil(characters / 3.8);

  return {
    characters,
    words,
    lines,
    tokensEstimated,
    model,
  };
}

/**
 * Сжимает briefing: удаляет повторы, сокращает, убирает лишнее
 */
export async function compressBriefing(input: {
  repoPath?: string;
  briefing: string;
  maxTokens?: number;
  preserveCode?: boolean;
}): Promise<{
  compressed: string;
  stats: CompressionStats;
}> {
  const maxTokens = input.maxTokens || 4000;
  const preserveCode = input.preserveCode !== false;

  let text = input.briefing;
  const originalSize = text.length;

  // 1. Удаляем повторяющиеся пустые строки
  text = text.replace(/\n{3,}/g, "\n\n");

  // 2. Удаляем trailing whitespace
  text = text.split("\n").map((l) => l.trimEnd()).join("\n");

  // 3. Сокращаем длинные разделители
  text = text.replace(/[-=]{10,}/g, "---");

  // 4. Удаляем повторяющиеся слова/фразы
  const lines = text.split("\n");
  const seen = new Set<string>();
  const uniqueLines: string[] = [];

  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    // Пропускаем только полностью идентичные строки (не код)
    if (normalized.length > 0 && !preserveCode) {
      if (seen.has(normalized) && !normalized.startsWith("```") && !normalized.match(/^\s/)) {
        continue;
      }
    }
    seen.add(normalized);
    uniqueLines.push(line);
  }
  text = uniqueLines.join("\n");

  // 5. Если всё ещё слишком длинный, обрезаем
  const estimatedTokens = Math.ceil(text.length / 3.8);
  if (estimatedTokens > maxTokens) {
    const targetChars = maxTokens * 3.8;
    
    // Пытаемся обрезать умно - по абзацам
    const paragraphs = text.split("\n\n");
    let result = "";
    
    for (const para of paragraphs) {
      if (result.length + para.length + 2 <= targetChars) {
        result += (result ? "\n\n" : "") + para;
      } else {
        break;
      }
    }
    
    text = result + "\n\n[...truncated...]";
  }

  const compressedSize = text.length;
  const tokensEstimated = Math.ceil(compressedSize / 3.8);
  const originalTokens = Math.ceil(originalSize / 3.8);

  return {
    compressed: text,
    stats: {
      originalSize,
      compressedSize,
      compressionRatio: Math.round((compressedSize / originalSize) * 100) / 100,
      tokensEstimated,
      savedTokens: originalTokens - tokensEstimated,
    },
  };
}

/**
 * Сжимает несколько briefing'ов в один компактный summary
 */
export async function compressMultipleBriefings(input: {
  repoPath?: string;
  briefings: string[];
  maxTokens?: number;
}): Promise<{
  merged: string;
  stats: CompressionStats;
  briefingsCount: number;
}> {
  const maxTokens = input.maxTokens || 8000;
  const tokensPerBriefing = Math.floor(maxTokens / input.briefings.length);

  const compressedParts: string[] = [];
  let totalOriginal = 0;
  let totalCompressed = 0;

  for (let i = 0; i < input.briefings.length; i++) {
    const { compressed, stats } = await compressBriefing({
      repoPath: input.repoPath,
      briefing: input.briefings[i],
      maxTokens: tokensPerBriefing,
    });
    
    compressedParts.push(`--- Briefing ${i + 1} ---\n${compressed}`);
    totalOriginal += stats.originalSize;
    totalCompressed += stats.compressedSize;
  }

  const merged = compressedParts.join("\n\n");

  return {
    merged,
    stats: {
      originalSize: totalOriginal,
      compressedSize: totalCompressed,
      compressionRatio: Math.round((totalCompressed / totalOriginal) * 100) / 100,
      tokensEstimated: Math.ceil(totalCompressed / 3.8),
      savedTokens: Math.ceil(totalOriginal / 3.8) - Math.ceil(totalCompressed / 3.8),
    },
    briefingsCount: input.briefings.length,
  };
}

/**
 * Получает статистику сжатия для всех briefing'ов в проекте
 */
export async function getCompressionStats(input: {
  repoPath?: string;
}): Promise<{
  totalBriefings: number;
  totalOriginalTokens: number;
  totalCompressedTokens: number;
  averageCompressionRatio: number;
  potentialSavings: number;
}> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const briefingsDir = path.join(repoRoot, "orchestrator", "briefings");

  let totalBriefings = 0;
  let totalOriginal = 0;
  let totalCompressed = 0;

  try {
    const files = await fs.readdir(briefingsDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(briefingsDir, file), "utf8");
        const briefing = JSON.parse(content);
        
        // Собираем текстовые поля
        const textContent = [
          briefing.currentState || "",
          (briefing.nextSteps || []).join("\n"),
          (briefing.blockers || []).join("\n"),
          briefing.notes || "",
        ].join("\n");

        const { stats } = await compressBriefing({
          briefing: textContent,
        });

        totalBriefings++;
        totalOriginal += stats.originalSize;
        totalCompressed += stats.compressedSize;
      } catch {
        // Пропускаем битые файлы
      }
    }
  } catch {
    // Директория не существует
  }

  const totalOriginalTokens = Math.ceil(totalOriginal / 3.8);
  const totalCompressedTokens = Math.ceil(totalCompressed / 3.8);
  const averageCompressionRatio =
    totalOriginal > 0 ? Math.round((totalCompressed / totalOriginal) * 100) / 100 : 1;

  return {
    totalBriefings,
    totalOriginalTokens,
    totalCompressedTokens,
    averageCompressionRatio,
    potentialSavings: totalOriginalTokens - totalCompressedTokens,
  };
}
