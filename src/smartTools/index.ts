/**
 * MCP Swarm v1.1.0 - Smart Tools Index
 * 26 Consolidated Smart Tools (was 54)
 *
 * Consolidation rationale: IDE tool slot optimization.
 * Each tool now uses an `action` parameter to expose multiple operations.
 */

// Core (2)
import { swarmAgentTool, swarmControlTool } from "./core.js";
// Tasks (2)
import { swarmTaskTool, swarmPlanTool } from "./tasks.js";
// Files (2)
import { swarmFileTool, swarmWorktreeTool } from "./files.js";
// Git (1)
import { swarmGitTool } from "./git.js";
// Collaboration (4)
import { swarmChatTool, swarmVotingTool, swarmOrchestratorTool, swarmMessageTool } from "./collaboration.js";
// Security (1)
import { swarmDefenceTool } from "./security.js";
// Analytics (3)
import { swarmBudgetTool, swarmMoETool, swarmQualityTool } from "./analytics.js";
// Intelligence (4)
import { swarmVectorTool, swarmBoosterTool, swarmBrainTool, swarmContextTool } from "./intelligence.js";
// Infra (7)
import { swarmHealthTool, swarmExternalTool, swarmExpertiseTool, swarmKnowledgeTool, swarmSessionTool, swarmClustersTool, swarmTelegramTool } from "./infra.js";

export {
  // Core (2)
  swarmAgentTool,       // swarm_agent + swarm_companion
  swarmControlTool,     // swarm_control + swarm_pulse
  // Tasks (2)
  swarmTaskTool,        // swarm_task + swarm_briefing
  swarmPlanTool,        // swarm_plan + swarm_spec
  // Files (2)
  swarmFileTool,        // swarm_file + swarm_snapshot
  swarmWorktreeTool,    // swarm_worktree + swarm_hooks
  // Git (1)
  swarmGitTool,         // swarm_git + swarm_dependency
  // Collaboration (4)
  swarmChatTool,        // swarm_chat + swarm_review
  swarmVotingTool,      // swarm_voting + swarm_auction
  swarmOrchestratorTool,// swarm_orchestrator (unchanged)
  swarmMessageTool,     // swarm_message + swarm_mcp
  // Security (1)
  swarmDefenceTool,     // swarm_defence + swarm_immune + swarm_consensus
  // Analytics (3)
  swarmBudgetTool,      // swarm_cost + swarm_budget
  swarmMoETool,         // swarm_moe + swarm_sona
  swarmQualityTool,     // swarm_quality + swarm_regression
  // Intelligence (4)
  swarmVectorTool,      // HNSW vector search (unchanged)
  swarmBoosterTool,     // Agent booster (unchanged)
  swarmBrainTool,       // swarm_brainstorm + swarm_debug
  swarmContextTool,     // swarm_context + swarm_context_pool + swarm_batch
  // Infra (7)
  swarmHealthTool,      // swarm_health + swarm_preemption
  swarmExternalTool,    // swarm_external + swarm_platform
  swarmExpertiseTool,   // swarm_expertise + swarm_routing
  swarmKnowledgeTool,   // swarm_knowledge + swarm_docs + swarm_advice
  swarmSessionTool,     // swarm_session + swarm_timeline + swarm_screenshot
  swarmClustersTool,    // swarm_clusters + swarm_conflict
  swarmTelegramTool,    // swarm_telegram + swarm_qa
};

/**
 * All 26 consolidated Smart Tools as an array.
 * Total: 2 + 2 + 2 + 1 + 4 + 1 + 3 + 4 + 7 = 26
 */
export const allSmartTools = [
  // Core (2)
  swarmAgentTool,
  swarmControlTool,
  // Tasks (2)
  swarmTaskTool,
  swarmPlanTool,
  // Files (2)
  swarmFileTool,
  swarmWorktreeTool,
  // Git (1)
  swarmGitTool,
  // Collaboration (4)
  swarmChatTool,
  swarmVotingTool,
  swarmOrchestratorTool,
  swarmMessageTool,
  // Security (1)
  swarmDefenceTool,
  // Analytics (3)
  swarmBudgetTool,
  swarmMoETool,
  swarmQualityTool,
  // Intelligence (4)
  swarmVectorTool,
  swarmBoosterTool,
  swarmBrainTool,
  swarmContextTool,
  // Infra (7)
  swarmHealthTool,
  swarmExternalTool,
  swarmExpertiseTool,
  swarmKnowledgeTool,
  swarmSessionTool,
  swarmClustersTool,
  swarmTelegramTool,
];
