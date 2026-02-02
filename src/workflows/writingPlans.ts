/**
 * Writing Plans Skill - Detailed Implementation Plans
 * 
 * Based on superpowers writing-plans methodology:
 * - Bite-sized tasks (2-5 minutes each)
 * - Exact file paths and complete code
 * - TDD approach: write test → verify fail → implement → verify pass → commit
 * - DRY, YAGNI principles
 * 
 * v0.6.0
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export interface ImplementationPlan {
  [key: string]: unknown;
  id: string;
  name: string;
  designDocPath?: string;
  goal: string;
  architecture: string;
  techStack: string[];
  
  status: "draft" | "ready" | "in_progress" | "completed" | "blocked";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  
  tasks: PlanTask[];
  currentTaskIndex: number;
  
  // Execution tracking
  startedAt?: string;
  completedAt?: string;
  executionMode?: "manual" | "subagent" | "parallel";
}

export interface PlanTask {
  [key: string]: unknown;
  id: string;
  taskNumber: number;
  title: string;
  description: string;
  
  // Files involved
  files: TaskFile[];
  
  // Steps (bite-sized, 2-5 min each)
  steps: TaskStep[];
  
  // Dependencies
  dependsOn: string[];  // task IDs
  
  // Status
  status: "pending" | "in_progress" | "completed" | "blocked" | "skipped";
  assignedTo?: string;
  startedAt?: string;
  completedAt?: string;
  
  // For subagent execution
  subagentPrompt?: string;
  reviewResult?: ReviewResult;
}

export interface TaskFile {
  path: string;
  action: "create" | "modify" | "delete";
  lineRange?: string;  // e.g., "123-145"
  isTest?: boolean;
}

export interface TaskStep {
  stepNumber: number;
  type: "write_test" | "run_test" | "implement" | "verify" | "commit" | "refactor";
  description: string;
  code?: string;
  command?: string;
  expectedOutput?: string;
  completed: boolean;
}

export interface ReviewResult {
  specCompliant: boolean;
  specIssues?: string[];
  codeQuality: boolean;
  qualityIssues?: string[];
  approved: boolean;
  reviewedAt: string;
  reviewedBy?: string;
}

// ============================================================================
// Storage
// ============================================================================

function getPlansDir(repoPath?: string): string {
  const root = repoPath || process.cwd();
  return path.join(root, "orchestrator", "plans");
}

function getDocsPlansDir(repoPath?: string): string {
  const root = repoPath || process.cwd();
  return path.join(root, "docs", "plans");
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getPlanPath(planId: string, repoPath?: string): string {
  return path.join(getPlansDir(repoPath), `${planId}.json`);
}

function loadPlan(planId: string, repoPath?: string): ImplementationPlan | null {
  const planPath = getPlanPath(planId, repoPath);
  if (!fs.existsSync(planPath)) return null;
  return JSON.parse(fs.readFileSync(planPath, "utf-8"));
}

function savePlan(plan: ImplementationPlan, repoPath?: string): void {
  ensureDir(getPlansDir(repoPath));
  plan.updatedAt = new Date().toISOString();
  fs.writeFileSync(getPlanPath(plan.id, repoPath), JSON.stringify(plan, null, 2));
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create an implementation plan from a design document or requirements
 */
export function createImplementationPlan(params: {
  name: string;
  goal: string;
  architecture: string;
  techStack: string[];
  designDocPath?: string;
  createdBy: string;
  repoPath?: string;
}): ImplementationPlan {
  const { name, goal, architecture, techStack, designDocPath, createdBy, repoPath } = params;
  
  const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  const plan: ImplementationPlan = {
    id: planId,
    name,
    designDocPath,
    goal,
    architecture,
    techStack,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy,
    tasks: [],
    currentTaskIndex: 0,
  };
  
  savePlan(plan, repoPath);
  return plan;
}

/**
 * Add a task to the plan with TDD steps
 */
export function addPlanTask(params: {
  planId: string;
  title: string;
  description: string;
  files: TaskFile[];
  testCode?: string;
  implementationCode?: string;
  testCommand?: string;
  commitMessage?: string;
  dependsOn?: string[];
  repoPath?: string;
}): PlanTask {
  const { 
    planId, title, description, files, 
    testCode, implementationCode, testCommand, commitMessage,
    dependsOn = [], repoPath 
  } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  const taskId = `task-${plan.tasks.length + 1}`;
  const taskNumber = plan.tasks.length + 1;
  
  // Build TDD steps
  const steps: TaskStep[] = [];
  let stepNum = 1;
  
  // Step 1: Write the failing test
  const testFile = files.find(f => f.isTest);
  if (testCode && testFile) {
    steps.push({
      stepNumber: stepNum++,
      type: "write_test",
      description: `Write failing test in ${testFile.path}`,
      code: testCode,
      completed: false,
    });
  }
  
  // Step 2: Run test to verify it fails
  if (testCommand) {
    steps.push({
      stepNumber: stepNum++,
      type: "run_test",
      description: "Run test to verify it fails",
      command: testCommand,
      expectedOutput: "FAIL",
      completed: false,
    });
  }
  
  // Step 3: Write minimal implementation
  const implFile = files.find(f => !f.isTest && f.action !== "delete");
  if (implementationCode && implFile) {
    steps.push({
      stepNumber: stepNum++,
      type: "implement",
      description: `Implement minimal code in ${implFile.path}`,
      code: implementationCode,
      completed: false,
    });
  }
  
  // Step 4: Run test to verify it passes
  if (testCommand) {
    steps.push({
      stepNumber: stepNum++,
      type: "verify",
      description: "Run test to verify it passes",
      command: testCommand,
      expectedOutput: "PASS",
      completed: false,
    });
  }
  
  // Step 5: Commit
  if (commitMessage) {
    const filePaths = files.map(f => f.path).join(" ");
    steps.push({
      stepNumber: stepNum++,
      type: "commit",
      description: "Commit changes",
      command: `git add ${filePaths} && git commit -m "${commitMessage}"`,
      completed: false,
    });
  }
  
  const task: PlanTask = {
    id: taskId,
    taskNumber,
    title,
    description,
    files,
    steps,
    dependsOn,
    status: "pending",
  };
  
  plan.tasks.push(task);
  savePlan(plan, repoPath);
  
  return task;
}

/**
 * Get the next task to work on (respects dependencies)
 */
export function getNextTask(params: {
  planId: string;
  repoPath?: string;
}): {
  task: PlanTask | null;
  blockedBy: string[];
  allCompleted: boolean;
} {
  const { planId, repoPath } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  const completedTaskIds = new Set(
    plan.tasks.filter(t => t.status === "completed").map(t => t.id)
  );
  
  // Find first pending task with all dependencies completed
  for (const task of plan.tasks) {
    if (task.status !== "pending") continue;
    
    const blockedBy = task.dependsOn.filter(depId => !completedTaskIds.has(depId));
    if (blockedBy.length === 0) {
      return { task, blockedBy: [], allCompleted: false };
    }
  }
  
  // Check if all completed
  const allCompleted = plan.tasks.every(t => 
    t.status === "completed" || t.status === "skipped"
  );
  
  // Find blocked tasks
  const pendingTasks = plan.tasks.filter(t => t.status === "pending");
  if (pendingTasks.length > 0) {
    const blockedBy = pendingTasks[0].dependsOn.filter(depId => !completedTaskIds.has(depId));
    return { task: null, blockedBy, allCompleted: false };
  }
  
  return { task: null, blockedBy: [], allCompleted };
}

/**
 * Start working on a task
 */
export function startTask(params: {
  planId: string;
  taskId: string;
  assignedTo: string;
  repoPath?: string;
}): PlanTask {
  const { planId, taskId, assignedTo, repoPath } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  const task = plan.tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  
  task.status = "in_progress";
  task.assignedTo = assignedTo;
  task.startedAt = new Date().toISOString();
  
  if (plan.status === "ready") {
    plan.status = "in_progress";
    plan.startedAt = new Date().toISOString();
  }
  
  plan.currentTaskIndex = plan.tasks.findIndex(t => t.id === taskId);
  savePlan(plan, repoPath);
  
  return task;
}

/**
 * Complete a step within a task
 */
export function completeStep(params: {
  planId: string;
  taskId: string;
  stepNumber: number;
  repoPath?: string;
}): {
  step: TaskStep;
  allStepsCompleted: boolean;
  nextStep: TaskStep | null;
} {
  const { planId, taskId, stepNumber, repoPath } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  const task = plan.tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  
  const step = task.steps.find(s => s.stepNumber === stepNumber);
  if (!step) throw new Error(`Step not found: ${stepNumber}`);
  
  step.completed = true;
  savePlan(plan, repoPath);
  
  const allStepsCompleted = task.steps.every(s => s.completed);
  const nextStep = task.steps.find(s => !s.completed) || null;
  
  return { step, allStepsCompleted, nextStep };
}

/**
 * Complete a task and record review result
 */
export function completeTask(params: {
  planId: string;
  taskId: string;
  reviewResult?: ReviewResult;
  repoPath?: string;
}): {
  task: PlanTask;
  planCompleted: boolean;
  nextTask: PlanTask | null;
} {
  const { planId, taskId, reviewResult, repoPath } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  const task = plan.tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  
  task.status = "completed";
  task.completedAt = new Date().toISOString();
  if (reviewResult) {
    task.reviewResult = reviewResult;
  }
  
  // Mark all steps as completed
  task.steps.forEach(s => s.completed = true);
  
  savePlan(plan, repoPath);
  
  // Check if plan is completed
  const planCompleted = plan.tasks.every(t => 
    t.status === "completed" || t.status === "skipped"
  );
  
  if (planCompleted) {
    plan.status = "completed";
    plan.completedAt = new Date().toISOString();
    savePlan(plan, repoPath);
  }
  
  // Get next task
  const { task: nextTask } = getNextTask({ planId, repoPath });
  
  return { task, planCompleted, nextTask };
}

/**
 * Generate a subagent prompt for a task
 */
export function generateSubagentPrompt(params: {
  planId: string;
  taskId: string;
  contextFiles?: string[];
  repoPath?: string;
}): string {
  const { planId, taskId, contextFiles = [], repoPath } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  const task = plan.tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  
  let prompt = `# Task ${task.taskNumber}: ${task.title}\n\n`;
  prompt += `## Context\n\n`;
  prompt += `You are implementing part of: **${plan.name}**\n\n`;
  prompt += `**Goal:** ${plan.goal}\n\n`;
  prompt += `**Architecture:** ${plan.architecture}\n\n`;
  
  prompt += `## Your Task\n\n`;
  prompt += `${task.description}\n\n`;
  
  prompt += `## Files to Touch\n\n`;
  task.files.forEach(f => {
    const action = f.action === "create" ? "Create" : f.action === "modify" ? "Modify" : "Delete";
    const range = f.lineRange ? `:${f.lineRange}` : "";
    const test = f.isTest ? " (test)" : "";
    prompt += `- ${action}: \`${f.path}${range}\`${test}\n`;
  });
  
  prompt += `\n## Steps (Follow TDD)\n\n`;
  task.steps.forEach(step => {
    prompt += `### Step ${step.stepNumber}: ${step.description}\n\n`;
    if (step.code) {
      prompt += "```\n" + step.code + "\n```\n\n";
    }
    if (step.command) {
      prompt += `Run: \`${step.command}\`\n`;
      if (step.expectedOutput) {
        prompt += `Expected: ${step.expectedOutput}\n`;
      }
      prompt += "\n";
    }
  });
  
  prompt += `## Rules\n\n`;
  prompt += `- Follow TDD: write failing test FIRST, then implement\n`;
  prompt += `- Keep code minimal (YAGNI)\n`;
  prompt += `- Don't repeat yourself (DRY)\n`;
  prompt += `- Commit after each passing test\n`;
  prompt += `- If you have questions, ASK before implementing\n`;
  
  // Store prompt on task
  task.subagentPrompt = prompt;
  savePlan(plan, repoPath);
  
  return prompt;
}

/**
 * Export plan as markdown document
 */
export function exportPlanAsMarkdown(params: {
  planId: string;
  repoPath?: string;
}): {
  path: string;
  content: string;
} {
  const { planId, repoPath } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  ensureDir(getDocsPlansDir(repoPath));
  
  const date = new Date().toISOString().split("T")[0];
  const slug = plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const filename = `${date}-${slug}.md`;
  const docPath = path.join(getDocsPlansDir(repoPath), filename);
  
  let content = `# ${plan.name} Implementation Plan\n\n`;
  content += `> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.\n\n`;
  content += `**Goal:** ${plan.goal}\n\n`;
  content += `**Architecture:** ${plan.architecture}\n\n`;
  content += `**Tech Stack:** ${plan.techStack.join(", ")}\n\n`;
  content += `---\n\n`;
  
  plan.tasks.forEach(task => {
    const status = task.status === "completed" ? "✅" : task.status === "in_progress" ? "🔄" : "⏳";
    content += `## ${status} Task ${task.taskNumber}: ${task.title}\n\n`;
    content += `${task.description}\n\n`;
    
    content += `**Files:**\n`;
    task.files.forEach(f => {
      const action = f.action === "create" ? "Create" : f.action === "modify" ? "Modify" : "Delete";
      content += `- ${action}: \`${f.path}\`\n`;
    });
    content += "\n";
    
    task.steps.forEach(step => {
      const done = step.completed ? "✓" : "○";
      content += `**Step ${step.stepNumber} ${done}:** ${step.description}\n\n`;
      if (step.code) {
        content += "```\n" + step.code + "\n```\n\n";
      }
      if (step.command) {
        content += `Run: \`${step.command}\`\n`;
        if (step.expectedOutput) {
          content += `Expected: ${step.expectedOutput}\n`;
        }
        content += "\n";
      }
    });
    
    content += `---\n\n`;
  });
  
  fs.writeFileSync(docPath, content);
  
  return { path: docPath, content };
}

/**
 * Get plan status summary
 */
export function getPlanStatus(params: {
  planId: string;
  repoPath?: string;
}): {
  plan: ImplementationPlan;
  tasksCompleted: number;
  tasksTotal: number;
  stepsCompleted: number;
  stepsTotal: number;
  percentComplete: number;
  estimatedRemainingTasks: number;
} {
  const { planId, repoPath } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  const tasksCompleted = plan.tasks.filter(t => t.status === "completed").length;
  const tasksTotal = plan.tasks.length;
  
  let stepsCompleted = 0;
  let stepsTotal = 0;
  plan.tasks.forEach(task => {
    stepsTotal += task.steps.length;
    stepsCompleted += task.steps.filter(s => s.completed).length;
  });
  
  const percentComplete = tasksTotal > 0 
    ? Math.round((tasksCompleted / tasksTotal) * 100) 
    : 0;
  
  const estimatedRemainingTasks = tasksTotal - tasksCompleted;
  
  return {
    plan,
    tasksCompleted,
    tasksTotal,
    stepsCompleted,
    stepsTotal,
    percentComplete,
    estimatedRemainingTasks,
  };
}

/**
 * List all plans
 */
export function listPlans(params: {
  status?: ImplementationPlan["status"];
  repoPath?: string;
}): ImplementationPlan[] {
  const { status, repoPath } = params;
  
  const dir = getPlansDir(repoPath);
  if (!fs.existsSync(dir)) return [];
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const plans: ImplementationPlan[] = [];
  
  for (const file of files) {
    try {
      const plan = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as ImplementationPlan;
      if (!status || plan.status === status) {
        plans.push(plan);
      }
    } catch {
      // Skip invalid files
    }
  }
  
  return plans.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Mark plan as ready for execution
 */
export function markPlanReady(params: {
  planId: string;
  executionMode?: "manual" | "subagent" | "parallel";
  repoPath?: string;
}): ImplementationPlan {
  const { planId, executionMode = "manual", repoPath } = params;
  
  const plan = loadPlan(planId, repoPath);
  if (!plan) throw new Error(`Plan not found: ${planId}`);
  
  if (plan.tasks.length === 0) {
    throw new Error("Cannot mark plan as ready: no tasks defined");
  }
  
  plan.status = "ready";
  plan.executionMode = executionMode;
  savePlan(plan, repoPath);
  
  return plan;
}
