"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostEstimator = void 0;
const BASE_FOLDER_TOKENS = 400;
class CostEstimator {
    constructor(config) {
        this.config = config;
    }
    estimateCost(components) {
        const perFile = Math.max(200, this.config.chunkSizeTokens * 0.8);
        const total = components.reduce((sum, component) => {
            const fileTokens = component.node.files.length * perFile;
            const childTokens = component.node.children.length * 150;
            return sum + BASE_FOLDER_TOKENS + fileTokens + childTokens;
        }, 0);
        return Math.min(this.config.tokenBudget, Math.round(total));
    }
}
exports.CostEstimator = CostEstimator;
//# sourceMappingURL=costEstimator.js.map