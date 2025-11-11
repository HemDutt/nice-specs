"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModularDocPipeline = void 0;
const path_1 = require("../../utils/path");
const docTemplate_1 = require("../../ui/docTemplate");
const personaClient_1 = require("../personaClient");
const qualityReviewerAgent_1 = require("../pipeline/qualityReviewerAgent");
const scopeScanner_1 = require("./scopeScanner");
const fileCartographer_1 = require("./fileCartographer");
const symbolHarvester_1 = require("./symbolHarvester");
const outlinePlanner_1 = require("./outlinePlanner");
const markdownComposer_1 = require("./markdownComposer");
const qualitySentinel_1 = require("./qualitySentinel");
class ModularDocPipeline {
    constructor(model, config) {
        this.config = config;
        this.personaClient = new personaClient_1.PersonaClient(model);
        this.scopeScanner = new scopeScanner_1.ScopeScanner(this.personaClient, config.workspaceRoot);
        this.fileCartographer = new fileCartographer_1.FileCartographer();
        this.symbolHarvester = new symbolHarvester_1.SymbolHarvester(this.personaClient);
        this.outlinePlanner = new outlinePlanner_1.OutlinePlanner();
        this.composer = new markdownComposer_1.MarkdownComposer(this.personaClient);
        this.quality = new qualitySentinel_1.QualitySentinel(new qualityReviewerAgent_1.QualityReviewerAgent(this.personaClient));
    }
    async generateDraft(folder, chunks, childSummaries, token) {
        const scope = await this.scopeScanner.scan(folder, childSummaries, token);
        const inventory = await this.fileCartographer.build(folder, chunks);
        const harvest = await this.symbolHarvester.harvest(scope.componentId, inventory.chunks, token);
        const plan = this.outlinePlanner.plan(scope, inventory, harvest, childSummaries);
        const compositionContext = {
            plan,
            scope,
            childSummaries,
            facts: harvest.facts
        };
        let doc = await this.composer.compose(compositionContext, token);
        const ledger = this.buildLedger(scope, inventory.files.map((file) => file.path), harvest.facts, childSummaries, plan);
        const review = await this.quality.review(scope, plan, doc, ledger, token);
        if (review.status === 'rework' && review.feedback) {
            doc = await this.composer.compose(compositionContext, token, review.feedback);
        }
        const metadata = {
            component: folder.name.toLowerCase(),
            path: scope.folderPath,
            parents: scope.parents,
            children: scope.children,
            lastUpdated: new Date().toISOString(),
            tags: Array.from(new Set([...scope.tags, ...plan.tags]))
        };
        const markdown = (0, docTemplate_1.renderDocumentation)(metadata, doc);
        return {
            componentId: scope.componentId,
            docFile: (0, path_1.docFileForFolder)(folder.uri),
            markdown,
            metadata,
            estimatedTokens: Math.round(markdown.length / 3),
            symbolIndex: harvest.symbolIndex
        };
    }
    buildLedger(scope, files, facts, childSummaries, plan) {
        return {
            componentId: scope.componentId,
            folderPath: scope.folderPath,
            files,
            facts,
            childSummaries,
            tags: plan.tags,
            plan: {
                objectives: ['Follow documentation-strategy outline'],
                steps: ['Assemble file inventory', 'Describe responsibilities', 'Link children'],
                risks: plan.risks
            }
        };
    }
}
exports.ModularDocPipeline = ModularDocPipeline;
//# sourceMappingURL=modularDocPipeline.js.map