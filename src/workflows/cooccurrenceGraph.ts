/**
 * Co-occurrence Graph — Drift-Memory System
 * 
 * MCP Swarm v1.3.0
 * 
 * Tracks which files are modified together across tasks and commits,
 * builds weighted relationship graphs, detects architectural drift,
 * and provides proactive file reservation suggestions.
 * 
 * Inspired by drift-memory systems using co-occurrence graphs.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getRepoRoot } from "./repo.js";

// ============ TYPES ============

/** A node in the co-occurrence graph (represents a file) */
export interface CoNode {
    id: string;           // normalized file path
    category: string;     // auto-detected: "api", "ui", "db", etc.
    totalEdits: number;
    lastEditTs: number;
}

/** An edge representing co-occurrence between two files */
export interface CoEdge {
    source: string;       // node id
    target: string;       // node id
    weight: number;       // number of co-occurrences
    firstSeen: number;    // timestamp of first co-occurrence
    lastSeen: number;     // timestamp of last co-occurrence
    agents: string[];     // which agents generated this edge
}

/** A snapshot for drift detection */
interface CoSnapshot {
    ts: number;
    edgeCount: number;
    topEdges: Array<{ source: string; target: string; weight: number }>;
}

/** The full co-occurrence graph */
export interface CoGraph {
    version: string;
    nodes: Record<string, CoNode>;
    edges: CoEdge[];
    snapshots: CoSnapshot[];
    lastUpdate: number;
}

// ============ CONSTANTS ============

const COGRAPH_FILE = "cograph.json";
const COGRAPH_VERSION = "1.0.0";
const MAX_SNAPSHOTS = 50;
const MAX_AGENTS_PER_EDGE = 20;

// ============ HELPERS ============

/** Auto-detect file category based on path */
function categorizeFile(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.includes("auth") || lower.includes("login") || lower.includes("session")) return "authentication";
    if (lower.includes("db") || lower.includes("database") || lower.includes("model") || lower.includes("schema") || lower.includes("migration")) return "database";
    if (lower.includes("api") || lower.includes("route") || lower.includes("controller") || lower.includes("endpoint")) return "api";
    if (lower.includes("component") || lower.includes("page") || lower.includes("view") || lower.includes(".tsx") || lower.includes(".jsx")) return "ui";
    if (lower.includes("test") || lower.includes("spec") || lower.includes(".test.")) return "testing";
    if (lower.includes("config") || lower.includes("setting") || lower.includes(".env")) return "config";
    if (lower.includes("style") || lower.includes(".css") || lower.includes(".scss") || lower.includes(".less")) return "styling";
    if (lower.includes("util") || lower.includes("helper") || lower.includes("lib") || lower.includes("common")) return "utilities";
    if (lower.includes("workflow") || lower.includes("middleware") || lower.includes("hook")) return "middleware";
    if (lower.includes("doc") || lower.includes("readme") || lower.includes("changelog")) return "docs";
    return "other";
}

/** Normalize a file path to a consistent ID */
function normalizePathId(filePath: string): string {
    return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Get the edge key for two nodes (direction-independent) */
function edgeKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ============ STORAGE ============

async function getCographPath(repoPath?: string): Promise<string> {
    const root = await getRepoRoot(repoPath);
    const dir = path.join(root, ".swarm");
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, COGRAPH_FILE);
}

async function loadGraph(repoPath?: string): Promise<CoGraph> {
    const filePath = await getCographPath(repoPath);
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw) as CoGraph;
    } catch {
        return {
            version: COGRAPH_VERSION,
            nodes: {},
            edges: [],
            snapshots: [],
            lastUpdate: Date.now(),
        };
    }
}

async function saveGraph(graph: CoGraph, repoPath?: string): Promise<void> {
    const filePath = await getCographPath(repoPath);
    graph.lastUpdate = Date.now();
    await fs.writeFile(filePath, JSON.stringify(graph, null, 2) + "\n", "utf8");
}

// ============ CORE FUNCTIONS ============

/**
 * Record that a set of files were modified together (co-occurrence).
 * Creates/updates nodes and edges in the graph.
 */
export async function recordCooccurrence(input: {
    repoPath?: string;
    files: string[];
    agent?: string;
}): Promise<{ recorded: boolean; edgesUpdated: number; edgesCreated: number }> {
    if (!input.files || input.files.length < 2) {
        return { recorded: false, edgesUpdated: 0, edgesCreated: 0 };
    }

    const graph = await loadGraph(input.repoPath);
    const now = Date.now();
    let edgesCreated = 0;
    let edgesUpdated = 0;

    // Normalize file paths
    const normalizedFiles = input.files.map(normalizePathId);

    // Ensure all nodes exist
    for (const file of normalizedFiles) {
        if (!graph.nodes[file]) {
            graph.nodes[file] = {
                id: file,
                category: categorizeFile(file),
                totalEdits: 0,
                lastEditTs: now,
            };
        }
        graph.nodes[file].totalEdits++;
        graph.nodes[file].lastEditTs = now;
    }

    // Build edge index for fast lookup
    const edgeIndex = new Map<string, number>();
    for (let i = 0; i < graph.edges.length; i++) {
        const e = graph.edges[i];
        edgeIndex.set(edgeKey(e.source, e.target), i);
    }

    // Create/update edges for all pairs of files
    for (let i = 0; i < normalizedFiles.length; i++) {
        for (let j = i + 1; j < normalizedFiles.length; j++) {
            const a = normalizedFiles[i];
            const b = normalizedFiles[j];
            const key = edgeKey(a, b);

            const existingIdx = edgeIndex.get(key);
            if (existingIdx !== undefined) {
                // Update existing edge
                const edge = graph.edges[existingIdx];
                edge.weight++;
                edge.lastSeen = now;
                if (input.agent && !edge.agents.includes(input.agent)) {
                    if (edge.agents.length < MAX_AGENTS_PER_EDGE) {
                        edge.agents.push(input.agent);
                    }
                }
                edgesUpdated++;
            } else {
                // Create new edge
                graph.edges.push({
                    source: a < b ? a : b,
                    target: a < b ? b : a,
                    weight: 1,
                    firstSeen: now,
                    lastSeen: now,
                    agents: input.agent ? [input.agent] : [],
                });
                edgesCreated++;
            }
        }
    }

    await saveGraph(graph, input.repoPath);
    return { recorded: true, edgesUpdated, edgesCreated };
}

/**
 * Query files most related to a given file based on co-occurrence.
 */
export async function queryRelated(input: {
    repoPath?: string;
    filePath: string;
    topK?: number;
}): Promise<{
    file: string;
    related: Array<{ file: string; weight: number; category: string; lastSeen: number }>;
}> {
    const graph = await loadGraph(input.repoPath);
    const normalized = normalizePathId(input.filePath);
    const topK = input.topK || 10;

    // Find all edges involving this file
    const relatedEdges = graph.edges
        .filter(e => e.source === normalized || e.target === normalized)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, topK);

    const related = relatedEdges.map(e => {
        const other = e.source === normalized ? e.target : e.source;
        const node = graph.nodes[other];
        return {
            file: other,
            weight: e.weight,
            category: node?.category || "unknown",
            lastSeen: e.lastSeen,
        };
    });

    return { file: normalized, related };
}

/**
 * Detect drift: compare current graph state with a previous snapshot.
 * Returns new, lost, and strengthened connections.
 */
export async function detectDrift(input: {
    repoPath?: string;
    sinceTs?: number;
}): Promise<{
    driftDetected: boolean;
    newEdges: Array<{ source: string; target: string; weight: number }>;
    lostEdges: Array<{ source: string; target: string; previousWeight: number }>;
    strengthened: Array<{ source: string; target: string; weightDelta: number; currentWeight: number }>;
    weakened: Array<{ source: string; target: string; weightDelta: number; currentWeight: number }>;
    snapshotAge?: number;
}> {
    const graph = await loadGraph(input.repoPath);

    // Find the best snapshot to compare against
    let snapshot: CoSnapshot | undefined;
    if (input.sinceTs) {
        // Find closest snapshot to the requested timestamp
        snapshot = graph.snapshots
            .filter(s => s.ts <= input.sinceTs!)
            .sort((a, b) => b.ts - a.ts)[0];
    } else {
        // Use the most recent snapshot
        snapshot = graph.snapshots[graph.snapshots.length - 1];
    }

    if (!snapshot) {
        return {
            driftDetected: false,
            newEdges: [],
            lostEdges: [],
            strengthened: [],
            weakened: [],
        };
    }

    // Build lookup from snapshot
    const snapshotEdgeMap = new Map<string, number>();
    for (const e of snapshot.topEdges) {
        snapshotEdgeMap.set(edgeKey(e.source, e.target), e.weight);
    }

    // Build lookup from current
    const currentEdgeMap = new Map<string, number>();
    for (const e of graph.edges) {
        currentEdgeMap.set(edgeKey(e.source, e.target), e.weight);
    }

    const newEdges: Array<{ source: string; target: string; weight: number }> = [];
    const strengthened: Array<{ source: string; target: string; weightDelta: number; currentWeight: number }> = [];
    const weakened: Array<{ source: string; target: string; weightDelta: number; currentWeight: number }> = [];
    const lostEdges: Array<{ source: string; target: string; previousWeight: number }> = [];

    // Check current edges vs snapshot
    for (const e of graph.edges) {
        const key = edgeKey(e.source, e.target);
        const prevWeight = snapshotEdgeMap.get(key);
        if (prevWeight === undefined) {
            newEdges.push({ source: e.source, target: e.target, weight: e.weight });
        } else {
            const delta = e.weight - prevWeight;
            if (delta > 0) {
                strengthened.push({ source: e.source, target: e.target, weightDelta: delta, currentWeight: e.weight });
            } else if (delta < 0) {
                weakened.push({ source: e.source, target: e.target, weightDelta: delta, currentWeight: e.weight });
            }
        }
    }

    // Check for edges that were in snapshot but are now gone (unlikely with append-only, but possible after pruning)
    for (const [key, prevWeight] of snapshotEdgeMap) {
        if (!currentEdgeMap.has(key)) {
            const [source, target] = key.split("|");
            lostEdges.push({ source, target, previousWeight: prevWeight });
        }
    }

    return {
        driftDetected: newEdges.length > 0 || lostEdges.length > 0 || strengthened.length > 0 || weakened.length > 0,
        newEdges: newEdges.slice(0, 20),
        lostEdges: lostEdges.slice(0, 20),
        strengthened: strengthened.sort((a, b) => b.weightDelta - a.weightDelta).slice(0, 20),
        weakened: weakened.sort((a, b) => a.weightDelta - b.weightDelta).slice(0, 20),
        snapshotAge: Date.now() - snapshot.ts,
    };
}

/**
 * Suggest files to also reserve/lock when working on a given file.
 * "You're editing auth.ts → you'll likely need middleware.ts, session.ts"
 */
export async function suggestReservations(input: {
    repoPath?: string;
    filePath: string;
    minWeight?: number;
    maxSuggestions?: number;
}): Promise<{
    file: string;
    suggestions: Array<{ file: string; weight: number; confidence: "high" | "medium" | "low"; reason: string }>;
}> {
    const graph = await loadGraph(input.repoPath);
    const normalized = normalizePathId(input.filePath);
    const minWeight = input.minWeight || 2;
    const maxSuggestions = input.maxSuggestions || 5;

    // Find related files with sufficient weight
    const relatedEdges = graph.edges
        .filter(e => (e.source === normalized || e.target === normalized) && e.weight >= minWeight)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, maxSuggestions);

    // Calculate max weight for normalization
    const maxWeight = relatedEdges.length > 0 ? relatedEdges[0].weight : 1;

    const suggestions = relatedEdges.map(e => {
        const other = e.source === normalized ? e.target : e.source;
        const ratio = e.weight / maxWeight;
        const confidence: "high" | "medium" | "low" =
            ratio >= 0.7 ? "high" :
                ratio >= 0.3 ? "medium" : "low";

        return {
            file: other,
            weight: e.weight,
            confidence,
            reason: `Changed together ${e.weight} times (by ${e.agents.join(", ") || "unknown"})`,
        };
    });

    return { file: normalized, suggestions };
}

/**
 * Get graph statistics.
 */
export async function getGraphStats(input: {
    repoPath?: string;
}): Promise<{
    totalNodes: number;
    totalEdges: number;
    avgWeight: number;
    maxWeight: number;
    totalSnapshots: number;
    topHotspots: Array<{ file: string; category: string; edgeCount: number; totalWeight: number }>;
    categoryDistribution: Record<string, number>;
    lastUpdate: number;
}> {
    const graph = await loadGraph(input.repoPath);

    // Calculate edge stats per node
    const nodeEdgeCounts = new Map<string, { edgeCount: number; totalWeight: number }>();
    let maxWeight = 0;
    let totalWeight = 0;

    for (const e of graph.edges) {
        totalWeight += e.weight;
        if (e.weight > maxWeight) maxWeight = e.weight;

        for (const nodeId of [e.source, e.target]) {
            const existing = nodeEdgeCounts.get(nodeId) || { edgeCount: 0, totalWeight: 0 };
            existing.edgeCount++;
            existing.totalWeight += e.weight;
            nodeEdgeCounts.set(nodeId, existing);
        }
    }

    // Top hotspots: nodes with most edges
    const hotspots = Array.from(nodeEdgeCounts.entries())
        .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
        .slice(0, 10)
        .map(([nodeId, stats]) => ({
            file: nodeId,
            category: graph.nodes[nodeId]?.category || "unknown",
            edgeCount: stats.edgeCount,
            totalWeight: stats.totalWeight,
        }));

    // Category distribution
    const categoryDistribution: Record<string, number> = {};
    for (const node of Object.values(graph.nodes)) {
        categoryDistribution[node.category] = (categoryDistribution[node.category] || 0) + 1;
    }

    return {
        totalNodes: Object.keys(graph.nodes).length,
        totalEdges: graph.edges.length,
        avgWeight: graph.edges.length > 0 ? Math.round((totalWeight / graph.edges.length) * 100) / 100 : 0,
        maxWeight,
        totalSnapshots: graph.snapshots.length,
        topHotspots: hotspots,
        categoryDistribution,
        lastUpdate: graph.lastUpdate,
    };
}

/**
 * Prune weak or old edges from the graph.
 */
export async function pruneGraph(input: {
    repoPath?: string;
    minWeight?: number;
    maxAgeDays?: number;
}): Promise<{ pruned: number; remaining: number }> {
    const graph = await loadGraph(input.repoPath);
    const minWeight = input.minWeight || 1;
    const maxAgeMs = (input.maxAgeDays || 90) * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const originalCount = graph.edges.length;

    graph.edges = graph.edges.filter(e => {
        if (e.weight < minWeight) return false;
        if (now - e.lastSeen > maxAgeMs) return false;
        return true;
    });

    // Clean up orphan nodes (nodes with no edges)
    const connectedNodes = new Set<string>();
    for (const e of graph.edges) {
        connectedNodes.add(e.source);
        connectedNodes.add(e.target);
    }
    for (const nodeId of Object.keys(graph.nodes)) {
        if (!connectedNodes.has(nodeId)) {
            delete graph.nodes[nodeId];
        }
    }

    await saveGraph(graph, input.repoPath);
    return {
        pruned: originalCount - graph.edges.length,
        remaining: graph.edges.length,
    };
}

/**
 * Take a snapshot of the current graph state for future drift detection.
 */
export async function takeSnapshot(input: {
    repoPath?: string;
}): Promise<{ snapshotTs: number; totalSnapshots: number }> {
    const graph = await loadGraph(input.repoPath);

    // Get top edges for the snapshot (top 100 by weight)
    const topEdges = [...graph.edges]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 100)
        .map(e => ({ source: e.source, target: e.target, weight: e.weight }));

    const snapshot: CoSnapshot = {
        ts: Date.now(),
        edgeCount: graph.edges.length,
        topEdges,
    };

    graph.snapshots.push(snapshot);

    // Limit snapshots
    if (graph.snapshots.length > MAX_SNAPSHOTS) {
        graph.snapshots = graph.snapshots.slice(-MAX_SNAPSHOTS);
    }

    await saveGraph(graph, input.repoPath);
    return {
        snapshotTs: snapshot.ts,
        totalSnapshots: graph.snapshots.length,
    };
}
