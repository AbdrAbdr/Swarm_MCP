/**
 * MCP Swarm — E2E Test Suite
 *
 * Tests the full cycle: Hub → Agent → Task → Claim → Complete
 * Uses fetch-based approach for Hub API testing
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const HUB_URL = process.env.SWARM_HUB_URL || "http://localhost:8787";

// Skip entire suite if Hub is not available
const hubAvailable = async (): Promise<boolean> => {
    try {
        const r = await fetch(HUB_URL, { signal: AbortSignal.timeout(2000) });
        return r.ok;
    } catch {
        return false;
    }
};

describe("MCP Swarm E2E", () => {
    let isAvailable = false;

    beforeAll(async () => {
        isAvailable = await hubAvailable();
        if (!isAvailable) {
            console.warn("⚠️  Hub not available at " + HUB_URL + " — skipping E2E tests");
        }
    });

    it("Hub responds to root", async () => {
        if (!isAvailable) return;
        const r = await fetch(HUB_URL);
        expect(r.status).toBe(200);
        const text = await r.text();
        expect(text).toContain("MCP Swarm Hub");
    });

    it("GET /api/state — returns leader info", async () => {
        if (!isAvailable) return;
        const r = await fetch(`${HUB_URL}/api/state?project=e2e-test`);
        expect(r.status).toBe(200);
        const data = await r.json();
        expect(data).toHaveProperty("leader");
        expect(data).toHaveProperty("authorizedMcps");
    });

    it("POST /api/create_task — creates a task", async () => {
        if (!isAvailable) return;
        const r = await fetch(`${HUB_URL}/api/create_task?project=e2e-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "E2E Test Task", creator: "e2e-runner", priority: "high" }),
        });
        expect(r.status).toBe(200);
        const data = await r.json();
        expect(data.ok).toBe(true);
        expect(data.task).toBeDefined();
        expect(data.task.title).toBe("E2E Test Task");
        expect(data.task.id).toBeTruthy();
    });

    it("GET /api/tasks — lists tasks", async () => {
        if (!isAvailable) return;
        const r = await fetch(`${HUB_URL}/api/tasks?project=e2e-test`);
        expect(r.status).toBe(200);
        const data = await r.json();
        expect(Array.isArray(data.tasks)).toBe(true);
    });

    it("POST /api/claim_task + release_task — claim lifecycle", async () => {
        if (!isAvailable) return;

        // Create task
        const createR = await fetch(`${HUB_URL}/api/create_task?project=e2e-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Claim Test", creator: "e2e" }),
        });
        const { task } = await createR.json();

        // Claim
        const claimR = await fetch(`${HUB_URL}/api/claim_task?project=e2e-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: task.id, agent: "TestAgent" }),
        });
        const claimData = await claimR.json();
        expect(claimData.ok).toBe(true);

        // Try claiming same task by another agent — should fail
        const claim2R = await fetch(`${HUB_URL}/api/claim_task?project=e2e-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: task.id, agent: "OtherAgent" }),
        });
        const claim2Data = await claim2R.json();
        expect(claim2Data.ok).toBe(false);
        expect(claim2Data.claimedBy).toBe("TestAgent");

        // Release
        const releaseR = await fetch(`${HUB_URL}/api/release_task?project=e2e-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: task.id, agent: "TestAgent" }),
        });
        const releaseData = await releaseR.json();
        expect(releaseData.ok).toBe(true);
    });

    it("POST /api/lock_file + unlock_file — file lock lifecycle", async () => {
        if (!isAvailable) return;

        // Lock
        const lockR = await fetch(`${HUB_URL}/api/lock_file?project=e2e-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "src/test.ts", agent: "Agent1", exclusive: true }),
        });
        const lockData = await lockR.json();
        expect(lockData.ok).toBe(true);

        // Try locking same file by another agent — should fail
        const lock2R = await fetch(`${HUB_URL}/api/lock_file?project=e2e-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "src/test.ts", agent: "Agent2", exclusive: true }),
        });
        const lock2Data = await lock2R.json();
        expect(lock2Data.ok).toBe(false);

        // Unlock
        const unlockR = await fetch(`${HUB_URL}/api/unlock_file?project=e2e-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "src/test.ts", agent: "Agent1" }),
        });
        const unlockData = await unlockR.json();
        expect(unlockData.ok).toBe(true);
    });

    it("GET /api/stats — returns swarm statistics", async () => {
        if (!isAvailable) return;
        const r = await fetch(`${HUB_URL}/api/stats?project=e2e-test`);
        expect(r.status).toBe(200);
        const data = await r.json();
        expect(data).toHaveProperty("agentCount");
        expect(data).toHaveProperty("taskCount");
        expect(data).toHaveProperty("stopped");
    });

    it("POST /api/stop + /api/resume — swarm control", async () => {
        if (!isAvailable) return;

        // Stop
        const stopR = await fetch(`${HUB_URL}/api/stop?project=e2e-test`, { method: "POST" });
        const stopData = await stopR.json();
        expect(stopData.ok).toBe(true);
        expect(stopData.stopped).toBe(true);

        // Resume
        const resumeR = await fetch(`${HUB_URL}/api/resume?project=e2e-test`, { method: "POST" });
        const resumeData = await resumeR.json();
        expect(resumeData.ok).toBe(true);
        expect(resumeData.stopped).toBe(false);
    });

    it("Rate limiting — returns 429 after 100 requests", async () => {
        if (!isAvailable) return;

        // This test is slow — only run if explicitly enabled
        if (!process.env.TEST_RATE_LIMIT) {
            console.log("⏭  Skipping rate limit test (set TEST_RATE_LIMIT=1 to enable)");
            return;
        }

        const promises = Array.from({ length: 110 }, () =>
            fetch(`${HUB_URL}/api/state?project=e2e-test`)
        );
        const results = await Promise.all(promises);
        const rateLimited = results.some(r => r.status === 429);
        expect(rateLimited).toBe(true);
    });
});
