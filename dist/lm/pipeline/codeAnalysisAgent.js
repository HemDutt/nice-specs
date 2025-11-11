"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeAnalysisAgent = void 0;
const path_1 = require("../../utils/path");
const personaClient_1 = require("../personaClient");
const DEFAULT_ANALYST_BATCH_SIZE = 4;
const MAX_CHUNK_CHARS = 1600;
class CodeAnalysisAgent {
    constructor(persona, batchSize = DEFAULT_ANALYST_BATCH_SIZE) {
        this.persona = persona;
        this.batchSize = batchSize;
    }
    async analyze(chunks, token) {
        const facts = [];
        for (let i = 0; i < chunks.length; i += this.batchSize) {
            const batch = chunks.slice(i, i + this.batchSize);
            const prompt = this.buildPrompt(batch);
            const response = await this.persona.invoke('CodeAnalyst', prompt, token, 'Analyze code chunks for documentation');
            const json = (0, personaClient_1.safeJsonParse)(response);
            if (!json) {
                continue;
            }
            for (const chunk of batch) {
                const summary = json[chunk.id];
                if (!summary) {
                    continue;
                }
                facts.push({
                    chunkId: chunk.id,
                    file: (0, path_1.workspaceRelativePath)(chunk.file),
                    startLine: chunk.startLine,
                    endLine: chunk.endLine,
                    summary: summary.summary,
                    responsibilities: summary.responsibilities,
                    dependencies: summary.dependencies,
                    tags: summary.tags,
                    analysis: summary.analysis
                });
            }
        }
        return facts;
    }
    buildPrompt(chunks) {
        const chunkText = chunks
            .map((chunk) => {
            const snippet = chunk.text.slice(0, MAX_CHUNK_CHARS);
            return `Chunk ${chunk.id} (${(0, path_1.workspaceRelativePath)(chunk.file)} lines ${chunk.startLine}-${chunk.endLine}):\n"""\n${snippet}\n"""`;
        })
            .join('\n\n');
        return `You are CodeAnalyst. For each chunk, think through these hypotheses: API surface, data flow, dependencies, failure handling. After reasoning, output STRICT JSON with this shape:
{
  "<chunkId>": {
    "analysis": [string], // bullet thoughts describing hypotheses you considered
    "summary": string,
    "responsibilities": [string],
    "dependencies": { "internal": [string], "external": [string] },
    "tags": [string]
  }
}
Only return JSON. Provide at least two analysis bullets per chunk.

${chunkText}`;
    }
}
exports.CodeAnalysisAgent = CodeAnalysisAgent;
//# sourceMappingURL=codeAnalysisAgent.js.map