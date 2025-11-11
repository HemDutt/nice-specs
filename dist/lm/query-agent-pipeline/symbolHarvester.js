"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymbolHarvester = void 0;
const path_1 = require("../../utils/path");
const codeAnalysisAgent_1 = require("../doc-generation-pipeline/codeAnalysisAgent");
class SymbolHarvester {
    constructor(persona) {
        this.analyst = new codeAnalysisAgent_1.CodeAnalysisAgent(persona);
    }
    async harvest(componentId, chunks, token) {
        const facts = await this.analyst.analyze(chunks, token);
        const symbolsByFile = {};
        const symbolIndex = [];
        const chunkSummary = new Map(facts.map((fact) => [fact.chunkId, fact.summary]));
        for (const chunk of chunks) {
            const symbols = extractSymbols(chunk.text);
            if (!symbols.length) {
                continue;
            }
            const filePath = (0, path_1.workspaceRelativePath)(chunk.file);
            const factSummary = chunkSummary.get(chunk.id);
            const entries = symbols.map((symbol) => ({
                name: symbol.name,
                kind: symbol.kind,
                description: factSummary ?? symbol.description,
                chunkId: chunk.id
            }));
            if (!symbolsByFile[filePath]) {
                symbolsByFile[filePath] = [];
            }
            symbolsByFile[filePath].push(...entries);
            for (const entry of entries) {
                symbolIndex.push({
                    componentId,
                    file: filePath,
                    symbol: entry.name,
                    kind: entry.kind,
                    description: entry.description,
                    chunkId: entry.chunkId
                });
            }
        }
        return {
            facts,
            symbolsByFile,
            symbolIndex
        };
    }
}
exports.SymbolHarvester = SymbolHarvester;
const CLASS_REGEX = /\bclass\s+([A-Z][\w\d_]*)/g;
const INTERFACE_REGEX = /\binterface\s+([A-Z][\w\d_]*)/g;
const ENUM_REGEX = /\benum\s+([A-Z][\w\d_]*)/g;
const TYPE_REGEX = /\btype\s+([A-Z][\w\d_]*)/g;
const FUNCTION_REGEX = /\bfunction\s+([a-zA-Z_][\w\d_]*)/g;
function extractSymbols(text) {
    const results = [];
    collect(results, text, CLASS_REGEX, 'class');
    collect(results, text, INTERFACE_REGEX, 'interface');
    collect(results, text, ENUM_REGEX, 'enum');
    collect(results, text, TYPE_REGEX, 'type');
    collect(results, text, FUNCTION_REGEX, 'function');
    return results;
}
function collect(target, text, regex, kind) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text))) {
        target.push({ name: match[1], kind, description: `${kind} ${match[1]}` });
    }
}
//# sourceMappingURL=symbolHarvester.js.map