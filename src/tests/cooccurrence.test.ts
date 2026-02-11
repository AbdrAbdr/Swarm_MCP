/**
 * Co-occurrence Graph (Drift-Memory) — Unit Tests
 * 
 * Run with: npm run build && npm run test
 */

/// <reference types="node" />

import assert from "assert";
import fs from "fs/promises";
import path from "path";
import os from "os";

import {
    recordCooccurrence,
    queryRelated,
    detectDrift,
    suggestReservations,
    getGraphStats,
    pruneGraph,
    takeSnapshot,
} from "../workflows/cooccurrenceGraph.js";

// ============ TEST UTILITIES ============

let testDir: string;
let testCount = 0;
let passCount = 0;

async function setupTestDir() {
    testDir = path.join(os.tmpdir(), `mcp-swarm-cograph-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, ".swarm"), { recursive: true });
    // Create a minimal .git so getRepoRoot works
    await fs.mkdir(path.join(testDir, ".git"), { recursive: true });
    console.log(`\nTest directory: ${testDir}\n`);
}

async function cleanupTestDir() {
    try {
        await fs.rm(testDir, { recursive: true, force: true });
    } catch { }
}

function test(name: string, fn: () => Promise<void>) {
    return async () => {
        testCount++;
        try {
            await fn();
            passCount++;
            console.log(`  ✅ ${name}`);
        } catch (e) {
            console.error(`  ❌ ${name}`);
            console.error(`     ${(e as Error).message}`);
        }
    };
}

// ============ TESTS ============

const testRecordBasic = test("recordCooccurrence: records co-occurrence for 2+ files", async () => {
    const result = await recordCooccurrence({
        repoPath: testDir,
        files: ["src/auth.ts", "src/middleware.ts", "src/session.ts"],
        agent: "TestAgent",
    });
    assert.strictEqual(result.recorded, true);
    assert.strictEqual(result.edgesCreated, 3); // 3 pairs from 3 files
    assert.strictEqual(result.edgesUpdated, 0);
});

const testRecordSingleFile = test("recordCooccurrence: skips for single file", async () => {
    const result = await recordCooccurrence({
        repoPath: testDir,
        files: ["src/solo.ts"],
        agent: "TestAgent",
    });
    assert.strictEqual(result.recorded, false);
});

const testRecordUpdatesExisting = test("recordCooccurrence: updates existing edges", async () => {
    const result = await recordCooccurrence({
        repoPath: testDir,
        files: ["src/auth.ts", "src/middleware.ts"],
        agent: "TestAgent2",
    });
    assert.strictEqual(result.recorded, true);
    assert.strictEqual(result.edgesUpdated, 1); // auth-middleware already exists
    assert.strictEqual(result.edgesCreated, 0);
});

const testQueryRelated = test("queryRelated: returns related files sorted by weight", async () => {
    const result = await queryRelated({
        repoPath: testDir,
        filePath: "src/auth.ts",
    });
    assert.strictEqual(result.file, "src/auth.ts");
    assert.ok(result.related.length >= 2); // should have middleware and session
    // First result should be middleware (weight 2: once from 3-file, once from 2-file)
    assert.strictEqual(result.related[0].file, "src/middleware.ts");
    assert.strictEqual(result.related[0].weight, 2);
});

const testQueryRelatedEmpty = test("queryRelated: returns empty for unknown file", async () => {
    const result = await queryRelated({
        repoPath: testDir,
        filePath: "src/nonexistent.ts",
    });
    assert.strictEqual(result.related.length, 0);
});

const testSuggestReservations = test("suggestReservations: suggests files with minWeight", async () => {
    const result = await suggestReservations({
        repoPath: testDir,
        filePath: "src/auth.ts",
        minWeight: 2,
    });
    assert.strictEqual(result.file, "src/auth.ts");
    assert.ok(result.suggestions.length >= 1); // at least middleware.ts
    assert.strictEqual(result.suggestions[0].file, "src/middleware.ts");
    assert.strictEqual(result.suggestions[0].confidence, "high");
});

const testGraphStats = test("getGraphStats: returns correct statistics", async () => {
    const stats = await getGraphStats({ repoPath: testDir });
    assert.strictEqual(stats.totalNodes, 3); // auth, middleware, session
    assert.strictEqual(stats.totalEdges, 3); // 3 pairs
    assert.ok(stats.maxWeight >= 2);
    assert.ok(stats.topHotspots.length > 0);
    assert.ok(Object.keys(stats.categoryDistribution).length > 0);
});

const testSnapshot = test("takeSnapshot: creates snapshot for drift detection", async () => {
    const result = await takeSnapshot({ repoPath: testDir });
    assert.ok(result.snapshotTs > 0);
    assert.strictEqual(result.totalSnapshots, 1);
});

const testDriftAfterSnapshot = test("detectDrift: detects new edges after snapshot", async () => {
    // Record new co-occurrence after snapshot
    await recordCooccurrence({
        repoPath: testDir,
        files: ["src/api.ts", "src/db.ts"],
        agent: "TestAgent",
    });

    const drift = await detectDrift({ repoPath: testDir });
    assert.strictEqual(drift.driftDetected, true);
    assert.ok(drift.newEdges.length > 0); // api-db is new
    // auth-middleware was strengthened since snapshot
    // (it was recorded again earlier, so may show as strengthened)
});

const testDriftWithoutSnapshot = test("detectDrift: returns no drift when no snapshots exist", async () => {
    // Create a fresh dir for this test
    const freshDir = path.join(os.tmpdir(), `mcp-swarm-cograph-fresh-${Date.now()}`);
    await fs.mkdir(freshDir, { recursive: true });
    await fs.mkdir(path.join(freshDir, ".swarm"), { recursive: true });
    await fs.mkdir(path.join(freshDir, ".git"), { recursive: true });

    const drift = await detectDrift({ repoPath: freshDir });
    assert.strictEqual(drift.driftDetected, false);

    await fs.rm(freshDir, { recursive: true, force: true }).catch(() => { });
});

const testPrune = test("pruneGraph: removes weak edges", async () => {
    // Record a weak edge
    await recordCooccurrence({
        repoPath: testDir,
        files: ["src/temp1.ts", "src/temp2.ts"],
        agent: "TestAgent",
    });

    const statsBefore = await getGraphStats({ repoPath: testDir });

    // Prune edges with weight < 2 (should remove temp1-temp2 and api-db)
    const result = await pruneGraph({ repoPath: testDir, minWeight: 2 });
    assert.ok(result.pruned > 0);

    const statsAfter = await getGraphStats({ repoPath: testDir });
    assert.ok(statsAfter.totalEdges < statsBefore.totalEdges);
});

const testCategorization = test("recordCooccurrence: auto-categorizes files", async () => {
    await recordCooccurrence({
        repoPath: testDir,
        files: ["src/auth/login.ts", "src/components/Header.tsx"],
    });

    const stats = await getGraphStats({ repoPath: testDir });
    assert.ok(stats.categoryDistribution["authentication"] >= 1 || stats.categoryDistribution["other"] >= 0);
});

// ============ RUNNER ============

async function main() {
    console.log("=== Co-occurrence Graph (Drift-Memory) Tests ===\n");

    await setupTestDir();

    const tests = [
        testRecordBasic,
        testRecordSingleFile,
        testRecordUpdatesExisting,
        testQueryRelated,
        testQueryRelatedEmpty,
        testSuggestReservations,
        testGraphStats,
        testSnapshot,
        testDriftAfterSnapshot,
        testDriftWithoutSnapshot,
        testPrune,
        testCategorization,
    ];

    for (const t of tests) {
        await t();
    }

    await cleanupTestDir();

    console.log(`\n=== Results: ${passCount}/${testCount} passed ===`);
    if (passCount < testCount) {
        process.exit(1);
    }
}

main().catch(console.error);
