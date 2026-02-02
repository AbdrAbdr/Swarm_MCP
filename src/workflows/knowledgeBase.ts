import fs from "node:fs/promises";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type KnowledgeEntry = {
  id: string;
  agent: string;
  category: "bug" | "workaround" | "optimization" | "library" | "config" | "other";
  title: string;
  description: string;
  solution?: string;
  relatedFiles?: string[];
  tags: string[];
  createdAt: number;
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

async function ensureOrchestratorDir(repoRoot: string): Promise<string> {
  const dir = path.join(repoRoot, "orchestrator");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function archiveFinding(input: {
  repoPath?: string;
  agent: string;
  category: "bug" | "workaround" | "optimization" | "library" | "config" | "other";
  title: string;
  description: string;
  solution?: string;
  relatedFiles?: string[];
  tags?: string[];
  commitMode: "none" | "local" | "push";
}): Promise<{ entryId: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  await ensureOrchestratorDir(repoRoot);

  const kbJsonPath = path.join(repoRoot, "orchestrator", "KNOWLEDGE_BASE.json");
  const kbMdPath = path.join(repoRoot, "orchestrator", "KNOWLEDGE_BASE.md");

  // Load existing knowledge base
  let entries: KnowledgeEntry[] = [];
  try {
    const raw = await fs.readFile(kbJsonPath, "utf8");
    entries = JSON.parse(raw);
  } catch {
    // file doesn't exist
  }

  const entryId = `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: KnowledgeEntry = {
    id: entryId,
    agent: input.agent,
    category: input.category,
    title: input.title,
    description: input.description,
    solution: input.solution,
    relatedFiles: input.relatedFiles,
    tags: input.tags || [],
    createdAt: Date.now(),
  };

  entries.push(entry);

  // Save JSON
  await fs.writeFile(kbJsonPath, JSON.stringify(entries, null, 2) + "\n", "utf8");

  // Generate markdown
  const categoryEmoji: Record<string, string> = {
    bug: "🐛",
    workaround: "🔧",
    optimization: "⚡",
    library: "📚",
    config: "⚙️",
    other: "📝",
  };

  const mdContent = `# 🧠 Swarm Knowledge Base

**Total Entries:** ${entries.length}
**Last Update:** ${new Date().toISOString()}

---

${entries.map(e => `
## ${categoryEmoji[e.category]} ${e.title}

**ID:** \`${e.id}\`
**Added by:** ${e.agent}
**Category:** ${e.category}
**Date:** ${new Date(e.createdAt).toISOString()}
${e.tags.length > 0 ? `**Tags:** ${e.tags.map(t => `\`${t}\``).join(", ")}` : ""}

### Description
${e.description}

${e.solution ? `### Solution\n${e.solution}` : ""}

${e.relatedFiles && e.relatedFiles.length > 0 ? `### Related Files\n${e.relatedFiles.map(f => `- \`${f}\``).join("\n")}` : ""}

---
`).join("\n")}
`;

  await fs.writeFile(kbMdPath, mdContent, "utf8");

  const relJson = path.posix.join("orchestrator", "KNOWLEDGE_BASE.json");
  const relMd = path.posix.join("orchestrator", "KNOWLEDGE_BASE.md");

  if (input.commitMode !== "none") {
    await git(["add", relJson, relMd], { cwd: repoRoot });
    await git(["commit", "-m", `orchestrator: knowledge from ${input.agent} - ${input.title}`], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { entryId };
}

export async function searchKnowledge(input: {
  repoPath?: string;
  query?: string;
  category?: string;
  tags?: string[];
}): Promise<{ entries: KnowledgeEntry[] }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const kbJsonPath = path.join(repoRoot, "orchestrator", "KNOWLEDGE_BASE.json");

  let entries: KnowledgeEntry[] = [];
  try {
    const raw = await fs.readFile(kbJsonPath, "utf8");
    entries = JSON.parse(raw);
  } catch {
    return { entries: [] };
  }

  // Filter by category
  if (input.category) {
    entries = entries.filter(e => e.category === input.category);
  }

  // Filter by tags
  if (input.tags && input.tags.length > 0) {
    entries = entries.filter(e => input.tags!.some(t => e.tags.includes(t)));
  }

  // Filter by query (search in title, description, solution)
  if (input.query) {
    const q = input.query.toLowerCase();
    entries = entries.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.solution && e.solution.toLowerCase().includes(q))
    );
  }

  // Sort by creation time descending
  entries.sort((a, b) => b.createdAt - a.createdAt);

  return { entries };
}
