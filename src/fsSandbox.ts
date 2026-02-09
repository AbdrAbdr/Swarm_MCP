/**
 * MCP Swarm — Filesystem Sandbox
 * 
 * Wraps fs operations to prevent agents from accessing files
 * outside the allowed project directory.
 * 
 * Usage:
 *   const sandbox = createSandbox('/home/user/my-project');
 *   sandbox.readFile('src/index.ts');      // OK
 *   sandbox.readFile('../../etc/passwd');   // THROWS
 */

import fs from "node:fs";
import path from "node:path";

export class FsSandboxError extends Error {
    constructor(
        public readonly attemptedPath: string,
        public readonly resolvedPath: string,
        public readonly allowedRoot: string
    ) {
        super(`🛡️ Sandbox violation: "${attemptedPath}" resolves to "${resolvedPath}" which is outside allowed root "${allowedRoot}"`);
        this.name = "FsSandboxError";
    }
}

export interface FsSandbox {
    /** Resolve and validate a path within the sandbox */
    resolve(filePath: string): string;

    /** Check if a path is within the sandbox (no throw) */
    isAllowed(filePath: string): boolean;

    /** Read a file within the sandbox */
    readFile(filePath: string, encoding?: BufferEncoding): string;

    /** Write a file within the sandbox */
    writeFile(filePath: string, content: string): void;

    /** Check if a file exists within the sandbox */
    exists(filePath: string): boolean;

    /** Read a directory within the sandbox */
    readDir(dirPath: string): string[];

    /** Get file stats within the sandbox */
    stat(filePath: string): fs.Stats;

    /** The allowed root directory */
    readonly root: string;
}

/**
 * Creates a filesystem sandbox restricted to the given root directory.
 * Any attempt to access files outside this directory will throw FsSandboxError.
 */
export function createSandbox(rootDir: string): FsSandbox {
    const normalizedRoot = path.resolve(rootDir);

    function validatePath(filePath: string): string {
        const resolved = path.resolve(normalizedRoot, filePath);
        const relative = path.relative(normalizedRoot, resolved);

        // If relative path starts with ".." or is absolute, it's outside the sandbox
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new FsSandboxError(filePath, resolved, normalizedRoot);
        }

        return resolved;
    }

    return {
        root: normalizedRoot,

        resolve(filePath: string): string {
            return validatePath(filePath);
        },

        isAllowed(filePath: string): boolean {
            try {
                validatePath(filePath);
                return true;
            } catch {
                return false;
            }
        },

        readFile(filePath: string, encoding: BufferEncoding = "utf-8"): string {
            const safePath = validatePath(filePath);
            return fs.readFileSync(safePath, encoding);
        },

        writeFile(filePath: string, content: string): void {
            const safePath = validatePath(filePath);
            const dir = path.dirname(safePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(safePath, content, "utf-8");
        },

        exists(filePath: string): boolean {
            const safePath = validatePath(filePath);
            return fs.existsSync(safePath);
        },

        readDir(dirPath: string): string[] {
            const safePath = validatePath(dirPath);
            return fs.readdirSync(safePath);
        },

        stat(filePath: string): fs.Stats {
            const safePath = validatePath(filePath);
            return fs.statSync(safePath);
        },
    };
}
