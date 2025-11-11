"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = void 0;
const path_1 = require("../utils/path");
const docTemplate_1 = require("../ui/docTemplate");
const personaClient_1 = require("./personaClient");
const docPlanner_1 = require("./doc-generation-pipeline/docPlanner");
const codeAnalysisAgent_1 = require("./doc-generation-pipeline/codeAnalysisAgent");
const docSynthesisAgent_1 = require("./doc-generation-pipeline/docSynthesisAgent");
const qualityReviewerAgent_1 = require("./doc-generation-pipeline/qualityReviewerAgent");
class AgentOrchestrator {
    constructor(model, config) {
        this.config = config;
        this.personaClient = new personaClient_1.PersonaClient(model);
        this.planner = new docPlanner_1.DocPlanner(this.personaClient);
        this.analyst = new codeAnalysisAgent_1.CodeAnalysisAgent(this.personaClient);
        this.synthesizer = new docSynthesisAgent_1.DocSynthesisAgent(this.personaClient);
        this.reviewer = new qualityReviewerAgent_1.QualityReviewerAgent(this.personaClient);
    }
    async prepareLedger(folder, chunks, childSummaries, token, resumeState, progress, progressLabel) {
        if (resumeState && resumeState.facts.length) {
            return {
                componentId: resumeState.componentId,
                folderPath: resumeState.folderPath,
                files: Array.from(new Set(chunks.map((chunk) => (0, path_1.workspaceRelativePath)(chunk.file)))),
                facts: resumeState.facts,
                childSummaries,
                tags: resumeState.tags,
                plan: resumeState.plan
            };
        }
        if (progress && progressLabel) {
            progress.report({ message: `${progressLabel} – Planning documentation` });
        }
        const plan = await this.planner.plan(folder, childSummaries, token);
        if (progress && progressLabel) {
            progress.report({ message: `${progressLabel} – Analyzing code` });
        }
        const facts = await this.analyst.analyze(chunks, token, progress, progressLabel);
        if (progress && progressLabel) {
            progress.report({ message: `${progressLabel} – Finalizing ledger` });
        }
        return {
            componentId: (0, path_1.componentIdFromUri)(folder.uri, this.config.workspaceRoot),
            folderPath: (0, path_1.workspaceRelativePath)(folder.uri),
            files: Array.from(new Set(chunks.map((chunk) => (0, path_1.workspaceRelativePath)(chunk.file)))),
            facts,
            childSummaries,
            tags: Array.from(new Set(facts.flatMap((fact) => fact.tags))),
            plan
        };
    }
    async generateDraft(folder, ledger, token, constraints, progress, progressLabel) {
        if (progress && progressLabel) {
            progress.report({ message: `${progressLabel} – Synthesizing documentation` });
        }
        let synthesis = await this.synthesizer.synthesize(folder, ledger, token, constraints);
        if (this.config.reviewerEnabled) {
            if (progress && progressLabel) {
                progress.report({ message: `${progressLabel} – Reviewing draft` });
            }
            const reviewMarkdown = (0, docTemplate_1.renderDocumentation)(createMetadata(folder, ledger, synthesis.doc), synthesis.doc);
            const review = await this.reviewer.review(reviewMarkdown, ledger, token);
            if (review.status === 'rework') {
                if (progress && progressLabel) {
                    progress.report({ message: `${progressLabel} – Revising draft per reviewer feedback` });
                }
                synthesis = await this.synthesizer.synthesize(folder, ledger, token, review.feedback);
            }
        }
        if (progress && progressLabel) {
            progress.report({ message: `${progressLabel} – Rendering markdown` });
        }
        const metadata = createMetadata(folder, ledger, synthesis.doc);
        const markdown = (0, docTemplate_1.renderDocumentation)(metadata, synthesis.doc);
        return {
            componentId: ledger.componentId,
            docFile: (0, path_1.docFileForFolder)(folder.uri),
            markdown,
            metadata,
            estimatedTokens: Math.round(markdown.length / 3),
            symbolIndex: synthesis.symbolIndex
        };
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
function createMetadata(folder, ledger, doc) {
    const name = folder.name ?? folder.uri.path.split('/').filter(Boolean).pop() ?? 'root';
    const componentId = ledger.componentId;
    const parents = ledger.folderPath.includes('/')
        ? [componentId.split('.').slice(0, -1).join('.')].filter(Boolean)
        : [];
    const children = ledger.childSummaries.map((child) => child.componentId);
    return {
        component: name.toLowerCase(),
        path: ledger.folderPath,
        parents,
        children,
        lastUpdated: new Date().toISOString(),
        tags: Array.from(new Set([...ledger.tags, ...doc.tags]))
    };
}
//# sourceMappingURL=agentOrchestrator.js.map