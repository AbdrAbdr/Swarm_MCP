import fs from "node:fs/promises";
import path from "node:path";

import { getRepoRoot } from "./repo.js";

export type TimelineEntry = {
  ts: number;
  type: "task_created" | "task_completed" | "file_edit" | "briefing" | "pulse" | "knowledge" | "urgent" | "rollback" | "advice";
  agent: string;
  description: string;
  metadata?: Record<string, any>;
};

export async function generateTimeline(input: {
  repoPath?: string;
  since?: number;
  limit?: number;
}): Promise<{ timeline: TimelineEntry[]; generated: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const since = input.since || Date.now() - 24 * 60 * 60 * 1000; // last 24h default
  const limit = input.limit || 100;
  const timeline: TimelineEntry[] = [];

  // Collect from PULSE.json
  try {
    const pulsePath = path.join(repoRoot, "orchestrator", "PULSE.json");
    const raw = await fs.readFile(pulsePath, "utf8");
    const pulse = JSON.parse(raw);
    for (const agent of pulse.agents || []) {
      if (agent.lastUpdate > since) {
        timeline.push({
          ts: agent.lastUpdate,
          type: "pulse",
          agent: agent.agent,
          description: `${agent.status} on ${agent.branch}`,
          metadata: { platform: agent.platform, currentFile: agent.currentFile },
        });
      }
    }
  } catch { /* ignore */ }

  // Collect from briefings
  try {
    const briefingsDir = path.join(repoRoot, "orchestrator", "briefings");
    const entries = await fs.readdir(briefingsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(briefingsDir, ent.name), "utf8");
      const briefing = JSON.parse(raw);
      if (briefing.createdAt > since) {
        timeline.push({
          ts: briefing.createdAt,
          type: "briefing",
          agent: briefing.agent,
          description: briefing.currentState.slice(0, 100),
          metadata: { taskId: briefing.taskId, filesWorkedOn: briefing.filesWorkedOn },
        });
      }
    }
  } catch { /* ignore */ }

  // Collect from snapshots
  try {
    const snapshotsDir = path.join(repoRoot, "orchestrator", "snapshots");
    const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(snapshotsDir, ent.name), "utf8");
      const snapshot = JSON.parse(raw);
      if (snapshot.createdAt > since) {
        timeline.push({
          ts: snapshot.createdAt,
          type: "rollback",
          agent: snapshot.agent,
          description: `Snapshot: ${snapshot.files.length} files`,
          metadata: { snapshotId: snapshot.id },
        });
      }
    }
  } catch { /* ignore */ }

  // Collect from knowledge base
  try {
    const kbPath = path.join(repoRoot, "orchestrator", "KNOWLEDGE_BASE.json");
    const raw = await fs.readFile(kbPath, "utf8");
    const entries = JSON.parse(raw);
    for (const entry of entries) {
      if (entry.createdAt > since) {
        timeline.push({
          ts: entry.createdAt,
          type: "knowledge",
          agent: entry.agent,
          description: entry.title,
          metadata: { category: entry.category },
        });
      }
    }
  } catch { /* ignore */ }

  // Collect from tasks
  try {
    const tasksDir = path.join(repoRoot, "swarm", "tasks");
    const entries = await fs.readdir(tasksDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
      const stat = await fs.stat(path.join(tasksDir, ent.name));
      if (stat.mtimeMs > since) {
        timeline.push({
          ts: stat.mtimeMs,
          type: "task_created",
          agent: "system",
          description: ent.name.replace(".md", ""),
        });
      }
    }
  } catch { /* ignore */ }

  // Sort by timestamp descending
  timeline.sort((a, b) => b.ts - a.ts);
  const result = timeline.slice(0, limit);

  // Generate markdown visualization
  const mdPath = path.join(repoRoot, "orchestrator", "TIMELINE.md");
  const mdContent = generateTimelineMarkdown(result);
  await fs.mkdir(path.dirname(mdPath), { recursive: true });
  await fs.writeFile(mdPath, mdContent, "utf8");

  return { timeline: result, generated: mdPath };
}

function generateTimelineMarkdown(timeline: TimelineEntry[]): string {
  const typeEmoji: Record<string, string> = {
    task_created: "📋",
    task_completed: "✅",
    file_edit: "📝",
    briefing: "💭",
    pulse: "💓",
    knowledge: "🧠",
    urgent: "🚨",
    rollback: "🔄",
    advice: "💡",
  };

  let md = `# 📊 Swarm Timeline

**Generated:** ${new Date().toISOString()}
**Entries:** ${timeline.length}

---

`;

  // Group by date
  const byDate = new Map<string, TimelineEntry[]>();
  for (const entry of timeline) {
    const date = new Date(entry.ts).toISOString().split("T")[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(entry);
  }

  for (const [date, entries] of byDate) {
    md += `## ${date}\n\n`;
    for (const entry of entries) {
      const time = new Date(entry.ts).toISOString().split("T")[1].slice(0, 8);
      const emoji = typeEmoji[entry.type] || "📌";
      md += `| ${time} | ${emoji} | **${entry.agent}** | ${entry.description} |\n`;
    }
    md += "\n";
  }

  return md;
}

export async function getTimelineVisualization(repoPath?: string): Promise<string> {
  const repoRoot = await getRepoRoot(repoPath);
  const mdPath = path.join(repoRoot, "orchestrator", "TIMELINE.md");
  try {
    return await fs.readFile(mdPath, "utf8");
  } catch {
    return "# Timeline\n\nNo timeline generated yet. Run `generate_timeline` first.";
  }
}
