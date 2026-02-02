import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { git } from "./git.js";
import { getRepoRoot } from "./repo.js";

export type DetectedMcp = {
  name: string;
  source: string;
  path?: string;
};

export type ScanResult = {
  mcps: DetectedMcp[];
  ideClients: string[];
};

const KNOWN_MCP_CONFIG_LOCATIONS: { name: string; paths: string[] }[] = [
  { name: "context7", paths: [] },
  { name: "brave-search", paths: [] },
  { name: "postgres", paths: [] },
  { name: "filesystem", paths: [] },
  { name: "github", paths: [] },
  { name: "puppeteer", paths: [] },
  { name: "memory", paths: [] },
];

function getWindsurfConfigPaths(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    return [
      path.join(home, ".windsurf", "mcp_config.json"),
      path.join(home, "AppData", "Roaming", "Windsurf", "mcp_config.json"),
    ];
  }
  if (process.platform === "darwin") {
    return [
      path.join(home, ".windsurf", "mcp_config.json"),
      path.join(home, "Library", "Application Support", "Windsurf", "mcp_config.json"),
    ];
  }
  return [path.join(home, ".windsurf", "mcp_config.json")];
}

function getCursorConfigPaths(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    return [
      path.join(home, ".cursor", "mcp.json"),
      path.join(home, "AppData", "Roaming", "Cursor", "User", "globalStorage", "mcp.json"),
    ];
  }
  if (process.platform === "darwin") {
    return [
      path.join(home, ".cursor", "mcp.json"),
      path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "mcp.json"),
    ];
  }
  return [path.join(home, ".cursor", "mcp.json")];
}

function getClaudeConfigPaths(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    return [
      path.join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
    ];
  }
  if (process.platform === "darwin") {
    return [
      path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    ];
  }
  return [path.join(home, ".config", "claude", "claude_desktop_config.json")];
}

function getOpenCodeConfigPaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".opencode", "mcp.json"),
    path.join(home, ".config", "opencode", "mcp.json"),
  ];
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(p: string): Promise<any> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractMcpNames(config: any): string[] {
  const names: string[] = [];
  if (config?.mcpServers && typeof config.mcpServers === "object") {
    for (const key of Object.keys(config.mcpServers)) {
      names.push(key);
    }
  }
  if (config?.servers && typeof config.servers === "object") {
    for (const key of Object.keys(config.servers)) {
      names.push(key);
    }
  }
  return names;
}

export async function scanSystemMcps(): Promise<ScanResult> {
  const mcps: DetectedMcp[] = [];
  const ideClients: string[] = [];

  // Windsurf
  for (const p of getWindsurfConfigPaths()) {
    if (await fileExists(p)) {
      ideClients.push("Windsurf");
      const config = await readJsonSafe(p);
      for (const name of extractMcpNames(config)) {
        mcps.push({ name, source: "Windsurf", path: p });
      }
      break;
    }
  }

  // Cursor
  for (const p of getCursorConfigPaths()) {
    if (await fileExists(p)) {
      ideClients.push("Cursor");
      const config = await readJsonSafe(p);
      for (const name of extractMcpNames(config)) {
        mcps.push({ name, source: "Cursor", path: p });
      }
      break;
    }
  }

  // Claude Desktop
  for (const p of getClaudeConfigPaths()) {
    if (await fileExists(p)) {
      ideClients.push("Claude Desktop");
      const config = await readJsonSafe(p);
      for (const name of extractMcpNames(config)) {
        mcps.push({ name, source: "Claude Desktop", path: p });
      }
      break;
    }
  }

  // OpenCode
  for (const p of getOpenCodeConfigPaths()) {
    if (await fileExists(p)) {
      ideClients.push("OpenCode");
      const config = await readJsonSafe(p);
      for (const name of extractMcpNames(config)) {
        mcps.push({ name, source: "OpenCode", path: p });
      }
      break;
    }
  }

  // Dedupe
  const seen = new Set<string>();
  const unique: DetectedMcp[] = [];
  for (const m of mcps) {
    if (!seen.has(m.name)) {
      seen.add(m.name);
      unique.push(m);
    }
  }

  return { mcps: unique, ideClients: [...new Set(ideClients)] };
}

export type PolicyInput = {
  repoPath?: string;
  authorizedMcps: string[];
  commitMode: "none" | "local" | "push";
};

async function safePush(repoRoot: string): Promise<void> {
  try {
    await git(["push"], { cwd: repoRoot });
  } catch {
    await git(["push", "-u", "origin", "HEAD"], { cwd: repoRoot });
  }
}

export async function authorizeMcpsForSwarm(input: PolicyInput): Promise<{ repoRoot: string; policyPath: string }> {
  const repoRoot = await getRepoRoot(input.repoPath);
  const swarmDir = path.join(repoRoot, "swarm");
  await fs.mkdir(swarmDir, { recursive: true });

  const policyPath = path.join(swarmDir, "POLICY.json");
  const policy = {
    authorizedMcps: input.authorizedMcps,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(policyPath, JSON.stringify(policy, null, 2) + "\n", "utf8");

  const rel = path.posix.join("swarm", "POLICY.json");
  if (input.commitMode !== "none") {
    await git(["add", rel], { cwd: repoRoot });
    await git(["commit", "-m", "swarm: update MCP policy"], { cwd: repoRoot });
    if (input.commitMode === "push") await safePush(repoRoot);
  }

  return { repoRoot, policyPath };
}

export async function getPolicy(repoPath?: string): Promise<{ authorizedMcps: string[] }> {
  const repoRoot = await getRepoRoot(repoPath);
  const policyPath = path.join(repoRoot, "swarm", "POLICY.json");
  try {
    const raw = await fs.readFile(policyPath, "utf8");
    const data = JSON.parse(raw);
    return { authorizedMcps: data.authorizedMcps || [] };
  } catch {
    return { authorizedMcps: [] };
  }
}
