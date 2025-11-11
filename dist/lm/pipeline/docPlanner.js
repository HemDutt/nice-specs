"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocPlanner = void 0;
const path_1 = require("../../utils/path");
const personaClient_1 = require("../personaClient");
const promptUtils_1 = require("./promptUtils");
class DocPlanner {
    constructor(persona) {
        this.persona = persona;
    }
    async plan(folder, childSummaries, token) {
        const fileList = folder.files.map((file) => `- ${(0, path_1.workspaceRelativePath)(file)}`).join('\n') || '- (none)';
        const childList = childSummaries
            .map((child) => `- ${child.componentId} (${child.relativeLink})\n  Purpose: ${(0, promptUtils_1.truncate)(child.sections['Purpose'])}\n  Responsibilities: ${(0, promptUtils_1.truncate)(child.sections['Responsibilities'])}`)
            .join('\n') || 'None';
        const prompt = `You are DocOrchestrator. Break the documentation work for ${(0, path_1.workspaceRelativePath)(folder.uri)} into ordered steps.
First think about objectives, then list steps referencing file names, then list risks/open questions. Return STRICT JSON:
{
  "objectives": [string],
  "steps": [string],
  "risks": [string]
}
Files in scope:
${fileList}
Child documentation buffers:
${childList}`;
        const response = await this.persona.invoke('DocOrchestrator', prompt, token, 'Plan documentation steps');
        return (0, personaClient_1.safeJsonParse)(response) ?? { objectives: ['Describe component'], steps: ['Summarize code', 'Reference children'], risks: [] };
    }
}
exports.DocPlanner = DocPlanner;
//# sourceMappingURL=docPlanner.js.map