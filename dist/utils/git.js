"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHeadCommit = getHeadCommit;
exports.getChangedFilesSince = getChangedFilesSince;
const child_process_1 = require("child_process");
async function getHeadCommit(workspaceRoot) {
    try {
        const result = await runGit(workspaceRoot, ['rev-parse', 'HEAD']);
        return result.trim();
    }
    catch {
        return undefined;
    }
}
async function getChangedFilesSince(workspaceRoot, sinceCommit) {
    try {
        const namesRaw = await runGit(workspaceRoot, ['diff', '--name-only', `${sinceCommit}..HEAD`]);
        const files = namesRaw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        const changes = [];
        for (const file of files) {
            try {
                const diff = await runGit(workspaceRoot, ['diff', '--unified=0', `${sinceCommit}..HEAD`, '--', file]);
                changes.push({ file, diff });
            }
            catch {
                // ignore missing files
            }
        }
        return changes;
    }
    catch {
        return [];
    }
}
async function runGit(workspaceRoot, args) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)('git', args, { cwd: workspaceRoot.fsPath }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            resolve(stdout);
        });
    });
}
//# sourceMappingURL=git.js.map