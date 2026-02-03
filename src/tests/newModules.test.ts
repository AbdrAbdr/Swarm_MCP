/**
 * MCP Swarm v0.9.3 - Tests for new modules
 * 
 * Simple tests to verify the new functionality works correctly.
 * Run with: node dist/tests/newModules.test.js
 */

import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Test utilities
let testDir: string;
let testCount = 0;
let passCount = 0;

async function setupTestDir() {
  testDir = path.join(os.tmpdir(), `mcp-swarm-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(path.join(testDir, ".swarm"), { recursive: true });
  console.log(`\nTest directory: ${testDir}\n`);
}

async function cleanupTestDir() {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {}
}

function test(name: string, fn: () => Promise<void>) {
  return async () => {
    testCount++;
    try {
      await fn();
      passCount++;
      console.log(`  ✅ ${name}`);
    } catch (error: any) {
      console.log(`  ❌ ${name}`);
      console.log(`     Error: ${error.message}`);
    }
  };
}

// ============ Smart Routing Tests ============

async function testSmartRouting() {
  console.log("\n📍 Smart Routing Tests");
  
  const { recordFileEdit, findBestAgent, getExpertiseMap } = await import("../workflows/smartRouting.js");
  
  await test("recordFileEdit should track edits", async () => {
    const result = await recordFileEdit({
      repoPath: testDir,
      agentName: "TestAgent",
      filePath: "src/index.ts",
    });
    assert(result.success, "Should succeed");
  })();
  
  await test("recordFileEdit should increment counters", async () => {
    await recordFileEdit({
      repoPath: testDir,
      agentName: "TestAgent",
      filePath: "src/index.ts",
    });
    const map = await getExpertiseMap({ repoPath: testDir });
    const agent = (map.agents as Record<string, any>)["TestAgent"];
    assert(agent, "Agent should exist");
    assert(agent.fileEdits["src/index.ts"] >= 2, "Should have 2+ edits");
  })();
  
  await test("findBestAgent should return recommendations", async () => {
    const result = await findBestAgent({
      repoPath: testDir,
      affectedPaths: ["src/index.ts"],
    });
    assert(result.recommendedAgent === "TestAgent", "Should recommend TestAgent");
    assert(result.score > 0, "Should have positive score");
  })();
}

// ============ Context Pool Tests ============

async function testContextPool() {
  console.log("\n📝 Context Pool Tests");
  
  const { addContextNote, getContextNotes, searchContext, getContextStats } = await import("../workflows/contextPool.js");
  
  await test("addContextNote should create note", async () => {
    const result = await addContextNote({
      repoPath: testDir,
      targetPath: "src/utils.ts",
      content: "This file contains utility functions",
      summary: "Utility functions",
      tags: ["utils", "helpers"],
      author: "TestAgent",
    });
    assert(result.success, "Should succeed");
    assert(result.noteId, "Should have noteId");
  })();
  
  await test("getContextNotes should retrieve notes", async () => {
    const result = await getContextNotes({
      repoPath: testDir,
      targetPath: "src/utils.ts",
    });
    assert(result.notes.length > 0, "Should have notes");
    assert(result.notes[0].summary === "Utility functions", "Should match summary");
  })();
  
  await test("searchContext should find notes", async () => {
    const result = await searchContext({
      repoPath: testDir,
      query: "utility",
    });
    assert(result.notes.length > 0, "Should find notes");
  })();
  
  await test("getContextStats should return statistics", async () => {
    const result = await getContextStats({ repoPath: testDir });
    assert(result.totalNotes >= 1, "Should have at least 1 note");
  })();
}

// ============ Auto Review Tests ============

async function testAutoReview() {
  console.log("\n📋 Auto Review Tests");
  
  const { createReviewRequest, assignReviewer, getReviewStats } = await import("../workflows/autoReview.js");
  
  // First create an agent with expertise for reviewer assignment
  const { recordFileEdit } = await import("../workflows/smartRouting.js");
  await recordFileEdit({
    repoPath: testDir,
    agentName: "ReviewerAgent",
    filePath: "src/feature.ts",
  });
  
  let reviewId: string;
  
  await test("createReviewRequest should create review", async () => {
    const result = await createReviewRequest({
      repoPath: testDir,
      taskId: "task-001",
      taskTitle: "Add new feature",
      codeAuthor: "AuthorAgent",
      changedFiles: ["src/feature.ts"],
      changesSummary: "Added new feature",
    });
    assert(result.success, "Should succeed");
    assert(result.reviewId, "Should have reviewId");
    reviewId = result.reviewId;
  })();
  
  await test("assignReviewer should assign reviewer manually", async () => {
    const result = await assignReviewer({
      repoPath: testDir,
      reviewId,
      reviewer: "ManualReviewer",
    });
    assert(result.success, "Should succeed");
  })();
  
  await test("getReviewStats should return statistics", async () => {
    const result = await getReviewStats({ repoPath: testDir });
    assert(result.total >= 1, "Should have at least 1 review");
  })();
}

// ============ Cost Optimization Tests ============

async function testCostOptimization() {
  console.log("\n💰 Cost Optimization Tests");
  
  const { 
    analyzeTaskComplexity, 
    getAvailableModels, 
    recommendModel,
    logUsage,
    checkBudget,
  } = await import("../workflows/costOptimization.js");
  
  await test("analyzeTaskComplexity should classify simple tasks", async () => {
    const result = analyzeTaskComplexity(
      "Fix typo in README",
      "Update documentation with correct spelling",
      ["README.md"]
    );
    assert(result.level === "simple", "Should be simple");
    assert(result.recommendedTier === "cheap", "Should recommend cheap tier");
  })();
  
  await test("analyzeTaskComplexity should classify complex tasks", async () => {
    const result = analyzeTaskComplexity(
      "Refactor authentication architecture",
      "Redesign the entire auth system with security improvements",
      Array(15).fill("src/auth/module.ts")
    );
    assert(result.level === "complex", "Should be complex");
    assert(result.recommendedTier === "premium", "Should recommend premium tier");
  })();
  
  await test("getAvailableModels should return models", async () => {
    const models = await getAvailableModels(testDir);
    assert(models.length > 0, "Should have models");
    assert(models.some(m => m.tier === "cheap"), "Should have cheap tier");
    assert(models.some(m => m.tier === "premium"), "Should have premium tier");
  })();
  
  await test("recommendModel should provide recommendation", async () => {
    const result = await recommendModel(
      testDir,
      "Add simple logging",
      "Add console.log statements",
      ["src/app.ts"]
    );
    assert(result.model, "Should have model recommendation");
    assert(result.estimatedCost.min < result.estimatedCost.max, "Should have cost range");
  })();
  
  await test("logUsage should track API usage", async () => {
    const result = await logUsage(testDir, {
      agentId: "TestAgent",
      model: "gpt-3.5-turbo",
      tier: "cheap",
      inputTokens: 1000,
      outputTokens: 500,
    });
    assert(result.id, "Should have usage ID");
    assert(result.cost > 0, "Should calculate cost");
  })();
  
  await test("checkBudget should return budget status", async () => {
    const result = await checkBudget(testDir);
    assert(result.daily, "Should have daily stats");
    assert(result.weekly, "Should have weekly stats");
    assert(result.monthly, "Should have monthly stats");
  })();
}

// ============ External Sync Tests ============

async function testExternalSync() {
  console.log("\n🔄 External Sync Tests");
  
  const { enableGitHubSync, getSyncStatus } = await import("../workflows/externalSync.js");
  
  await test("enableGitHubSync should configure sync", async () => {
    await enableGitHubSync(testDir, "testowner", "testrepo", {
      autoImport: true,
      autoClose: true,
    });
    const status = await getSyncStatus(testDir);
    assert(status.config.github?.enabled, "GitHub should be enabled");
    assert(status.config.github?.owner === "testowner", "Owner should match");
  })();
  
  await test("getSyncStatus should return status", async () => {
    const result = await getSyncStatus(testDir);
    assert(result.config, "Should have config");
    assert(result.cachedIssues !== undefined, "Should have cached issues info");
  })();
}

// ============ Run All Tests ============

async function runAllTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("          MCP Swarm v0.9.3 - New Modules Tests              ");
  console.log("═══════════════════════════════════════════════════════════");
  
  await setupTestDir();
  
  try {
    await testSmartRouting();
    await testContextPool();
    await testAutoReview();
    await testCostOptimization();
    await testExternalSync();
    
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  Results: ${passCount}/${testCount} tests passed`);
    console.log("═══════════════════════════════════════════════════════════\n");
    
    if (passCount === testCount) {
      console.log("  🎉 All tests passed!\n");
      process.exit(0);
    } else {
      console.log(`  ⚠️  ${testCount - passCount} tests failed\n`);
      process.exit(1);
    }
  } finally {
    await cleanupTestDir();
  }
}

runAllTests().catch(console.error);
