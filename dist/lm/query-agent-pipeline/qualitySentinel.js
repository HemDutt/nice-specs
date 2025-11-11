"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QualitySentinel = void 0;
const docTemplate_1 = require("../../ui/docTemplate");
const docEvaluator_1 = require("../../analysis/docEvaluator");
const path_1 = require("../../utils/path");
class QualitySentinel {
    constructor(reviewer) {
        this.reviewer = reviewer;
        this.evaluator = new docEvaluator_1.DocEvaluator();
    }
    async review(scope, plan, doc, ledger, token) {
        const missingFile = ensureInventoryCompleteness(plan, doc);
        if (missingFile) {
            return { status: 'rework', feedback: missingFile };
        }
        const metadata = {
            component: scope.folder.name.toLowerCase(),
            path: scope.folderPath,
            parents: scope.parents,
            children: scope.children,
            lastUpdated: new Date().toISOString(),
            tags: scope.tags
        };
        const markdown = (0, docTemplate_1.renderDocumentation)(metadata, doc);
        const review = await this.reviewer.review(markdown, ledger, token);
        if (review.status === 'rework') {
            return review;
        }
        const draft = {
            componentId: scope.componentId,
            docFile: (0, path_1.docFileForFolder)(scope.folder.uri),
            markdown,
            metadata,
            estimatedTokens: Math.round(markdown.length / 3),
            symbolIndex: []
        };
        this.evaluator.validateDraft(draft);
        return { status: 'accept' };
    }
}
exports.QualitySentinel = QualitySentinel;
function ensureInventoryCompleteness(plan, doc) {
    const required = new Set(plan.fileInventory.map((entry) => entry.file));
    for (const entry of doc.fileInventory) {
        required.delete(entry.file);
    }
    if (required.size > 0) {
        return `Missing file inventory entries for: ${Array.from(required).join(', ')}`;
    }
    return undefined;
}
//# sourceMappingURL=qualitySentinel.js.map