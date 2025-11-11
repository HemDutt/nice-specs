"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QualityReviewerAgent = void 0;
const promptUtils_1 = require("./promptUtils");
class QualityReviewerAgent {
    constructor(persona) {
        this.persona = persona;
    }
    async review(markdown, ledger, token) {
        const factOutline = ledger.facts.map((fact) => `- ${fact.chunkId}: ${fact.summary}`).join('\n');
        const childOutline = ledger.childSummaries.map((child) => `- ${child.componentId}: ${(0, promptUtils_1.truncate)(child.sections?.Purpose)}`).join('\n') || 'None';
        const prompt = `You are QualityReviewer. Cross-check the documentation for ${ledger.componentId} against the evidence below.
Checklist:
1. Every major responsibility is grounded in the code facts.
2. Child components are referenced only via summary sentences + hyperlinks.
3. Documentation follows the required section order and tone.
Respond with either:
ACCEPT - <justification>
REVISE: <specific fixes>

Evidence from CodeAnalyst:
${factOutline}

Child buffer:
${childOutline}

Documentation under review:
${markdown}`;
        const response = await this.persona.invoke('QualityReviewer', prompt, token, 'Review generated documentation for accuracy');
        if (response.trim().toUpperCase().startsWith('ACCEPT')) {
            return { status: 'accept' };
        }
        return { status: 'rework', feedback: response.replace(/^REVISE:?/i, '').trim() };
    }
}
exports.QualityReviewerAgent = QualityReviewerAgent;
//# sourceMappingURL=qualityReviewerAgent.js.map