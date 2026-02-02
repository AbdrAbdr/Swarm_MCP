/**
 * Systematic Debugging Skill - 4-Phase Root Cause Analysis
 * 
 * Based on superpowers systematic-debugging methodology:
 * - Phase 1: Root Cause Investigation (BEFORE any fix)
 * - Phase 2: Pattern Analysis
 * - Phase 3: Hypothesis and Testing
 * - Phase 4: Implementation
 * 
 * Core principle: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
 * 
 * v0.6.0
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export interface DebugSession {
  [key: string]: unknown;
  id: string;
  agentId: string;
  
  // Problem description
  problem: {
    title: string;
    description: string;
    errorMessage?: string;
    stackTrace?: string;
    reproductionSteps?: string[];
  };
  
  // Current phase
  currentPhase: 1 | 2 | 3 | 4;
  phaseStatus: "in_progress" | "completed";
  
  // Phase 1: Root Cause Investigation
  investigation: {
    errorAnalysis?: string;
    canReproduce: boolean;
    reproductionNotes?: string;
    recentChanges?: string[];
    evidenceGathered?: EvidenceItem[];
    dataFlowTrace?: string[];
  };
  
  // Phase 2: Pattern Analysis
  patterns: {
    workingExamples?: string[];
    referenceImplementations?: string[];
    differences?: string[];
    dependencies?: string[];
  };
  
  // Phase 3: Hypothesis and Testing
  hypotheses: Hypothesis[];
  currentHypothesis?: number;
  
  // Phase 4: Implementation
  fix: {
    testCase?: string;
    fixDescription?: string;
    fixApplied: boolean;
    verified: boolean;
  };
  
  // Tracking
  fixAttempts: number;
  status: "active" | "resolved" | "escalated" | "abandoned";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface EvidenceItem {
  [key: string]: unknown;
  id: string;
  component: string;
  input?: string;
  output?: string;
  expected?: string;
  notes?: string;
  timestamp: string;
}

export interface Hypothesis {
  id: string;
  number: number;
  statement: string;
  reasoning: string;
  testPlan: string;
  result?: "confirmed" | "rejected" | "inconclusive";
  testNotes?: string;
  testedAt?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_FIX_ATTEMPTS = 3;

const RED_FLAGS = [
  "Quick fix for now, investigate later",
  "Just try changing X and see if it works",
  "Add multiple changes, run tests",
  "Skip the test, I'll manually verify",
  "It's probably X, let me fix that",
  "I don't fully understand but this might work",
  "One more fix attempt",
];

const PHASE_DESCRIPTIONS = {
  1: "Root Cause Investigation - Find WHAT and WHY before any fix",
  2: "Pattern Analysis - Find working examples and compare",
  3: "Hypothesis and Testing - Scientific method with minimal changes",
  4: "Implementation - Fix root cause with test, not symptom",
};

// ============================================================================
// Storage
// ============================================================================

function getDebugDir(repoPath?: string): string {
  const root = repoPath || process.cwd();
  return path.join(root, "orchestrator", "debug");
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSessionPath(sessionId: string, repoPath?: string): string {
  return path.join(getDebugDir(repoPath), `${sessionId}.json`);
}

function loadSession(sessionId: string, repoPath?: string): DebugSession | null {
  const sessionPath = getSessionPath(sessionId, repoPath);
  if (!fs.existsSync(sessionPath)) return null;
  return JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
}

function saveSession(session: DebugSession, repoPath?: string): void {
  ensureDir(getDebugDir(repoPath));
  session.updatedAt = new Date().toISOString();
  fs.writeFileSync(getSessionPath(session.id, repoPath), JSON.stringify(session, null, 2));
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Start a debugging session
 */
export function startDebugSession(params: {
  agentId: string;
  title: string;
  description: string;
  errorMessage?: string;
  stackTrace?: string;
  reproductionSteps?: string[];
  repoPath?: string;
}): {
  session: DebugSession;
  guidance: string;
  nextActions: string[];
} {
  const { agentId, title, description, errorMessage, stackTrace, reproductionSteps, repoPath } = params;
  
  const sessionId = `debug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  const session: DebugSession = {
    id: sessionId,
    agentId,
    problem: {
      title,
      description,
      errorMessage,
      stackTrace,
      reproductionSteps,
    },
    currentPhase: 1,
    phaseStatus: "in_progress",
    investigation: {
      canReproduce: false,
    },
    patterns: {},
    hypotheses: [],
    fix: {
      fixApplied: false,
      verified: false,
    },
    fixAttempts: 0,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  saveSession(session, repoPath);
  
  const guidance = `
# Starting Systematic Debugging

**THE IRON LAW: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST**

## Current Phase: 1 - ${PHASE_DESCRIPTIONS[1]}

Before attempting ANY fix, you MUST complete Phase 1.

## Red Flags - If you think any of these, STOP:
${RED_FLAGS.map(rf => `- "${rf}"`).join("\n")}

If you catch yourself thinking these, return to Phase 1.
`;

  const nextActions = [
    "Read error messages carefully (don't skip!)",
    "Try to reproduce consistently",
    "Check recent changes (git diff, recent commits)",
    "Gather evidence at each component boundary",
    "Trace data flow from symptom to source",
  ];
  
  return { session, guidance, nextActions };
}

/**
 * Log investigation findings (Phase 1)
 */
export function logInvestigation(params: {
  sessionId: string;
  errorAnalysis?: string;
  canReproduce?: boolean;
  reproductionNotes?: string;
  recentChanges?: string[];
  repoPath?: string;
}): {
  session: DebugSession;
  readyForPhase2: boolean;
  missingItems: string[];
} {
  const { sessionId, errorAnalysis, canReproduce, reproductionNotes, recentChanges, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  if (errorAnalysis) session.investigation.errorAnalysis = errorAnalysis;
  if (canReproduce !== undefined) session.investigation.canReproduce = canReproduce;
  if (reproductionNotes) session.investigation.reproductionNotes = reproductionNotes;
  if (recentChanges) session.investigation.recentChanges = recentChanges;
  
  saveSession(session, repoPath);
  
  // Check if ready for Phase 2
  const missingItems: string[] = [];
  if (!session.investigation.errorAnalysis) missingItems.push("Error analysis");
  if (!session.investigation.canReproduce) missingItems.push("Reproduction confirmation");
  
  const readyForPhase2 = missingItems.length === 0;
  
  return { session, readyForPhase2, missingItems };
}

/**
 * Add evidence item (Phase 1)
 */
export function addEvidence(params: {
  sessionId: string;
  component: string;
  input?: string;
  output?: string;
  expected?: string;
  notes?: string;
  repoPath?: string;
}): EvidenceItem {
  const { sessionId, component, input, output, expected, notes, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  if (!session.investigation.evidenceGathered) {
    session.investigation.evidenceGathered = [];
  }
  
  const evidence: EvidenceItem = {
    id: `evidence-${session.investigation.evidenceGathered.length + 1}`,
    component,
    input,
    output,
    expected,
    notes,
    timestamp: new Date().toISOString(),
  };
  
  session.investigation.evidenceGathered.push(evidence);
  saveSession(session, repoPath);
  
  return evidence;
}

/**
 * Complete Phase 1 and move to Phase 2
 */
export function completePhase1(params: {
  sessionId: string;
  repoPath?: string;
}): {
  success: boolean;
  error?: string;
  guidance: string;
} {
  const { sessionId, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  // Validate Phase 1 completion
  if (!session.investigation.errorAnalysis) {
    return {
      success: false,
      error: "Cannot proceed: Error analysis not completed",
      guidance: "Read error messages carefully and document your analysis",
    };
  }
  
  if (!session.investigation.canReproduce) {
    return {
      success: false,
      error: "Cannot proceed: Issue not reproduced",
      guidance: "If not reproducible, gather more data before proceeding",
    };
  }
  
  session.currentPhase = 2;
  session.phaseStatus = "in_progress";
  saveSession(session, repoPath);
  
  return {
    success: true,
    guidance: `
# Phase 2: Pattern Analysis

Now find the pattern before fixing:

1. **Find Working Examples** - Locate similar working code in the codebase
2. **Compare Against References** - If implementing a pattern, read the reference COMPLETELY
3. **Identify Differences** - List every difference between working and broken
4. **Understand Dependencies** - What other components does this need?

DO NOT skip to fixing. Pattern analysis reveals the real issue.
`,
  };
}

/**
 * Log pattern analysis (Phase 2)
 */
export function logPatterns(params: {
  sessionId: string;
  workingExamples?: string[];
  referenceImplementations?: string[];
  differences?: string[];
  dependencies?: string[];
  repoPath?: string;
}): {
  session: DebugSession;
  readyForPhase3: boolean;
} {
  const { sessionId, workingExamples, referenceImplementations, differences, dependencies, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  if (workingExamples) session.patterns.workingExamples = workingExamples;
  if (referenceImplementations) session.patterns.referenceImplementations = referenceImplementations;
  if (differences) session.patterns.differences = differences;
  if (dependencies) session.patterns.dependencies = dependencies;
  
  saveSession(session, repoPath);
  
  const readyForPhase3 = !!(
    session.patterns.workingExamples?.length || 
    session.patterns.differences?.length
  );
  
  return { session, readyForPhase3 };
}

/**
 * Complete Phase 2 and move to Phase 3
 */
export function completePhase2(params: {
  sessionId: string;
  repoPath?: string;
}): {
  success: boolean;
  guidance: string;
} {
  const { sessionId, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  session.currentPhase = 3;
  session.phaseStatus = "in_progress";
  saveSession(session, repoPath);
  
  return {
    success: true,
    guidance: `
# Phase 3: Hypothesis and Testing

Use the scientific method:

1. **Form Single Hypothesis** - State clearly: "I think X is the root cause because Y"
2. **Test Minimally** - Make the SMALLEST possible change to test
3. **One Variable at a Time** - Don't fix multiple things at once
4. **Verify Before Continuing** - Did it work? If not, form NEW hypothesis

When you don't know: Say "I don't understand X" and research more.
`,
  };
}

/**
 * Form a hypothesis (Phase 3)
 */
export function formHypothesis(params: {
  sessionId: string;
  statement: string;
  reasoning: string;
  testPlan: string;
  repoPath?: string;
}): {
  hypothesis: Hypothesis;
  warning?: string;
} {
  const { sessionId, statement, reasoning, testPlan, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  const hypothesisId = `hyp-${session.hypotheses.length + 1}`;
  
  const hypothesis: Hypothesis = {
    id: hypothesisId,
    number: session.hypotheses.length + 1,
    statement,
    reasoning,
    testPlan,
  };
  
  session.hypotheses.push(hypothesis);
  session.currentHypothesis = session.hypotheses.length - 1;
  saveSession(session, repoPath);
  
  let warning: string | undefined;
  if (session.hypotheses.length >= MAX_FIX_ATTEMPTS) {
    warning = `⚠️ WARNING: ${session.hypotheses.length} hypotheses tested. Consider questioning the architecture instead of continuing to fix symptoms.`;
  }
  
  return { hypothesis, warning };
}

/**
 * Record hypothesis test result (Phase 3)
 */
export function testHypothesis(params: {
  sessionId: string;
  hypothesisId: string;
  result: "confirmed" | "rejected" | "inconclusive";
  testNotes?: string;
  repoPath?: string;
}): {
  hypothesis: Hypothesis;
  nextStep: string;
  shouldEscalate: boolean;
} {
  const { sessionId, hypothesisId, result, testNotes, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  const hypothesis = session.hypotheses.find(h => h.id === hypothesisId);
  if (!hypothesis) throw new Error(`Hypothesis not found: ${hypothesisId}`);
  
  hypothesis.result = result;
  hypothesis.testNotes = testNotes;
  hypothesis.testedAt = new Date().toISOString();
  
  session.fixAttempts++;
  saveSession(session, repoPath);
  
  let nextStep: string;
  let shouldEscalate = false;
  
  if (result === "confirmed") {
    nextStep = "Hypothesis confirmed! Proceed to Phase 4 to implement the fix with a test.";
    session.currentPhase = 4;
    session.phaseStatus = "in_progress";
    saveSession(session, repoPath);
  } else if (session.fixAttempts >= MAX_FIX_ATTEMPTS) {
    shouldEscalate = true;
    nextStep = `
⚠️ ${MAX_FIX_ATTEMPTS}+ hypotheses tested without success.

**STOP and question the architecture:**
- Is this pattern fundamentally sound?
- Are we "sticking with it through sheer inertia"?
- Should we refactor architecture vs. continue fixing symptoms?

**Discuss with your human partner before attempting more fixes.**
`;
    session.status = "escalated";
    saveSession(session, repoPath);
  } else {
    nextStep = "Hypothesis rejected. Form a NEW hypothesis based on what you learned.";
  }
  
  return { hypothesis, nextStep, shouldEscalate };
}

/**
 * Record fix implementation (Phase 4)
 */
export function implementFix(params: {
  sessionId: string;
  testCase: string;
  fixDescription: string;
  repoPath?: string;
}): {
  session: DebugSession;
  guidance: string;
} {
  const { sessionId, testCase, fixDescription, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  session.fix.testCase = testCase;
  session.fix.fixDescription = fixDescription;
  saveSession(session, repoPath);
  
  return {
    session,
    guidance: `
# Phase 4: Implementation

1. ✓ Test case documented: Write this test FIRST
2. Run the test to verify it FAILS (proves the test catches the bug)
3. Implement the fix (single, minimal change)
4. Run the test to verify it PASSES
5. Run ALL tests to check for regressions
6. Use verify_fix to complete the session
`,
  };
}

/**
 * Verify fix and complete session
 */
export function verifyFix(params: {
  sessionId: string;
  testPassed: boolean;
  noRegressions: boolean;
  notes?: string;
  repoPath?: string;
}): {
  session: DebugSession;
  resolved: boolean;
  summary: string;
} {
  const { sessionId, testPassed, noRegressions, notes, repoPath } = params;
  
  const session = loadSession(sessionId, repoPath);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  
  session.fix.fixApplied = true;
  session.fix.verified = testPassed && noRegressions;
  
  if (session.fix.verified) {
    session.status = "resolved";
    session.resolvedAt = new Date().toISOString();
  }
  
  saveSession(session, repoPath);
  
  const summary = session.fix.verified
    ? `✅ Bug fixed and verified!\n\n**Problem:** ${session.problem.title}\n**Root Cause:** ${session.hypotheses.find(h => h.result === "confirmed")?.statement || "Unknown"}\n**Fix:** ${session.fix.fixDescription}\n**Attempts:** ${session.fixAttempts}`
    : `❌ Fix not verified.\n\nTest passed: ${testPassed}\nNo regressions: ${noRegressions}\n\n${notes || ""}`;
  
  return {
    session,
    resolved: session.fix.verified,
    summary,
  };
}

/**
 * Get session status
 */
export function getDebugSession(params: {
  sessionId: string;
  repoPath?: string;
}): DebugSession | null {
  return loadSession(params.sessionId, params.repoPath);
}

/**
 * List debug sessions
 */
export function listDebugSessions(params: {
  status?: DebugSession["status"];
  repoPath?: string;
}): DebugSession[] {
  const { status, repoPath } = params;
  
  const dir = getDebugDir(repoPath);
  if (!fs.existsSync(dir)) return [];
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const sessions: DebugSession[] = [];
  
  for (const file of files) {
    try {
      const session = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as DebugSession;
      if (!status || session.status === status) {
        sessions.push(session);
      }
    } catch {
      // Skip invalid files
    }
  }
  
  return sessions.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Check for red flag thinking
 */
export function checkRedFlags(params: {
  thought: string;
}): {
  hasRedFlag: boolean;
  matchedFlags: string[];
  guidance: string;
} {
  const { thought } = params;
  const lowerThought = thought.toLowerCase();
  
  const matchedFlags = RED_FLAGS.filter(flag => 
    lowerThought.includes(flag.toLowerCase())
  );
  
  const hasRedFlag = matchedFlags.length > 0;
  
  const guidance = hasRedFlag
    ? `🚨 RED FLAG DETECTED! You're thinking: "${matchedFlags[0]}"\n\nSTOP. Return to Phase 1 investigation. Random fixes waste time and create new bugs.`
    : "✓ No red flags detected. Continue with systematic approach.";
  
  return { hasRedFlag, matchedFlags, guidance };
}
