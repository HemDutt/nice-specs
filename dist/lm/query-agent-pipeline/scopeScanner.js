"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScopeScanner = void 0;
const path_1 = require("../../utils/path");
const personaClient_1 = require("../personaClient");
class ScopeScanner {
    constructor(persona, workspaceRoot) {
        this.persona = persona;
        this.workspaceRoot = workspaceRoot;
    }
    async scan(folder, childSummaries, token) {
        const componentId = (0, path_1.componentIdFromUri)(folder.uri, this.workspaceRoot);
        const folderPath = (0, path_1.workspaceRelativePath)(folder.uri, this.workspaceRoot);
        const parents = folderPath.includes('/') ? [componentId.split('.').slice(0, -1).join('.')].filter(Boolean) : [];
        const children = childSummaries.map((child) => child.componentId);
        const childContext = childSummaries
            .map((child) => `- ${child.componentId}\n  Purpose: ${truncate(child.sections?.Purpose)}\n  Responsibilities: ${truncate(child.sections?.Responsibilities)}`)
            .join('\n') || 'None';
        const fileCount = folder.files.length;
        const prompt = `You are DocOrchestrator. Summarize the component located at ${folderPath || '(workspace root)'}.
Provide 2-3 sentences that capture:
1. What this folder owns.
2. How it interacts with adjacent systems or child components.
Return STRICT JSON: { "summary": string, "tags": [string] }

Child context:
${childContext}

Number of files: ${fileCount}`;
        const response = await this.persona.invoke('DocOrchestrator', prompt, token, 'Summarize component scope');
        const parsed = (0, personaClient_1.safeJsonParse)(response);
        const summary = parsed?.summary?.trim() ||
            `The ${folder.name} component (${folderPath || 'root'}) encapsulates ${fileCount} files and coordinates with ${children.length} child components.`;
        return {
            componentId,
            folderPath,
            parents,
            children,
            summary,
            tags: parsed?.tags ?? [],
            folder
        };
    }
}
exports.ScopeScanner = ScopeScanner;
function truncate(value, length = 120) {
    if (!value) {
        return '';
    }
    return value.length > length ? `${value.slice(0, length)}…` : value;
}
//# sourceMappingURL=scopeScanner.js.map