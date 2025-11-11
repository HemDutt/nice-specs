"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocSynthesisAgent = void 0;
const path_1 = require("../../utils/path");
const personaClient_1 = require("../personaClient");
const promptUtils_1 = require("./promptUtils");
class DocSynthesisAgent {
    constructor(persona) {
        this.persona = persona;
    }
    async synthesize(folder, ledger, token, constraints) {
        const prompt = this.buildPrompt(folder, ledger, constraints);
        const response = await this.persona.invoke('DocSynthesizer', prompt, token, 'Produce documentation sections');
        const parsed = (0, personaClient_1.safeJsonParse)(response);
        const doc = normalizeSynthDoc(parsed, ledger);
        return {
            doc,
            symbolIndex: buildSymbolIndex(ledger.componentId, doc.fileInventory)
        };
    }
    buildPrompt(folder, ledger, constraints) {
        const factSection = ledger.facts
            .map((fact) => `Chunk ${fact.chunkId} (${fact.file} ${fact.startLine}-${fact.endLine}): ${fact.summary}. Responsibilities: ${fact.responsibilities.join(', ')}.`)
            .join('\n');
        const childSection = formatChildSummaries(ledger.childSummaries);
        const planSection = ledger.plan
            ? `Objectives: ${ledger.plan.objectives.join('; ')}\nSteps: ${ledger.plan.steps.join('; ')}\nRisks: ${ledger.plan.risks.join('; ')}`
            : 'Plan unavailable.';
        const fileList = ledger.files.length ? ledger.files.map((file) => `- ${file}`).join('\n') : '- (none)';
        return `You are DocSynthesizer. Maintain two mental buffers: LocalDetail (only this folder's files) and ChildRelationships (one sentence per child with hyperlink). Produce JSON matching:
{
  "summary": string,
  "purpose": string,
  "responsibilities": [string],
  "fileInventory": [{
    "file": string,
    "synopsis": string,
    "symbols": [{"name": string, "kind": "class|struct|interface|enum|type|function", "description": string, "chunkId": string}]
  }],
  "codeStructureSynopsis": string,
  "codeStructure": [{"file": string, "summary": string}],
  "dataFlow": string,
  "dependencies": { "internal": [string], "external": [string] },
  "childComponents": [{"name": string, "link": string, "description": string}],
  "operationalNotes": [string],
  "risks": [string],
  "changelog": [{"date": string, "note": string}],
  "tags": [string]
}
Constraints: describe ONLY code inside ${(0, path_1.workspaceRelativePath)(folder.uri)}. Use relative child links exactly as provided. Do not restate child internals. Start with a crisp 2–3 sentence summary covering component scope, owners, and integration boundaries. In fileInventory, include EVERY local file listed below—even when it exposes no notable symbols (use an empty symbols array in that case). For each symbol, cite chunkIds from the evidence whenever possible so the SQLite key mapper can answer “where is X defined?”. Use codeStructureSynopsis to narrate how the files collaborate before the per-file subsections.
${constraints ? `Additional reviewer notes: ${constraints}` : ''}

Documentation plan:
${planSection}

Files in component:
${fileList}

Evidence:
${factSection}

Child components:
${childSection}

Remember: describe child components only in ChildRelationships using provided links; never restate their internal details.

Return JSON only.`;
    }
}
exports.DocSynthesisAgent = DocSynthesisAgent;
function formatChildSummaries(children) {
    if (children.length === 0) {
        return 'None';
    }
    return children
        .map((child) => `- ${child.componentId} (${child.relativeLink})\n  Purpose: ${(0, promptUtils_1.truncate)(child.sections?.Purpose)}\n  Responsibilities: ${(0, promptUtils_1.truncate)(child.sections?.Responsibilities)}`)
        .join('\n');
}
function createEmptySynthDoc(ledger) {
    return {
        summary: '_Pending_',
        purpose: '_Pending_',
        responsibilities: [],
        fileInventory: ledger.files.map((file) => ({ file, synopsis: '_Pending_', symbols: [] })),
        codeStructureSynopsis: '_Pending_',
        codeStructure: ledger.files.map((file) => ({ file, summary: '_Pending_' })),
        dataFlow: '_Pending_',
        dependencies: { internal: [], external: [] },
        childComponents: ledger.childSummaries.map((child) => ({ name: child.componentId, link: child.relativeLink, description: child.synopsis })),
        operationalNotes: [],
        risks: [],
        changelog: [{ date: new Date().toISOString(), note: 'Initial documentation' }],
        tags: ledger.tags
    };
}
function normalizeSynthDoc(candidate, ledger) {
    const fallback = createEmptySynthDoc(ledger);
    if (!candidate) {
        return fallback;
    }
    const inventorySource = candidate.fileInventory ?? [];
    const normalizedInventory = inventorySource.map((entry) => ({
        file: entry.file ?? '(unspecified)',
        synopsis: entry.synopsis ?? '_Pending_',
        symbols: (entry.symbols ?? []).map((symbol) => ({
            name: symbol.name ?? '(anonymous)',
            kind: symbol.kind ?? 'unknown',
            description: symbol.description ?? '_Pending_',
            chunkId: symbol.chunkId
        }))
    }));
    const seenInventory = new Set(normalizedInventory.map((entry) => entry.file));
    for (const fallbackEntry of fallback.fileInventory) {
        if (!seenInventory.has(fallbackEntry.file)) {
            normalizedInventory.push(fallbackEntry);
        }
    }
    const codeStructureSource = candidate.codeStructure ?? [];
    const normalizedCodeStructure = codeStructureSource.map((entry) => ({
        file: entry.file ?? '(unspecified)',
        summary: entry.summary ?? '_Pending_'
    }));
    const seenStructure = new Set(normalizedCodeStructure.map((entry) => entry.file));
    for (const fallbackEntry of fallback.codeStructure) {
        if (!seenStructure.has(fallbackEntry.file)) {
            normalizedCodeStructure.push(fallbackEntry);
        }
    }
    return {
        summary: candidate.summary ?? fallback.summary,
        purpose: candidate.purpose ?? fallback.purpose,
        responsibilities: candidate.responsibilities ?? fallback.responsibilities,
        fileInventory: normalizedInventory.length ? normalizedInventory : fallback.fileInventory,
        codeStructureSynopsis: candidate.codeStructureSynopsis ?? fallback.codeStructureSynopsis,
        codeStructure: normalizedCodeStructure.length ? normalizedCodeStructure : fallback.codeStructure,
        dataFlow: candidate.dataFlow ?? fallback.dataFlow,
        dependencies: {
            internal: candidate.dependencies?.internal ?? fallback.dependencies.internal,
            external: candidate.dependencies?.external ?? fallback.dependencies.external
        },
        childComponents: candidate.childComponents ?? fallback.childComponents,
        operationalNotes: candidate.operationalNotes ?? fallback.operationalNotes,
        risks: candidate.risks ?? fallback.risks,
        changelog: candidate.changelog ?? fallback.changelog,
        tags: candidate.tags ?? fallback.tags
    };
}
function buildSymbolIndex(componentId, inventory) {
    const records = [];
    for (const entry of inventory) {
        for (const symbol of entry.symbols) {
            records.push({
                componentId,
                file: entry.file,
                symbol: symbol.name,
                kind: symbol.kind,
                description: symbol.description,
                chunkId: symbol.chunkId
            });
        }
    }
    return records;
}
//# sourceMappingURL=docSynthesisAgent.js.map