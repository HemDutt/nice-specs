import { DocGenConfig, SelectedComponent } from '../types';

const BASE_FOLDER_TOKENS = 400;

export class CostEstimator {
  constructor(private readonly config: DocGenConfig) {}

  estimateCost(components: SelectedComponent[]): number {
    const perFile = Math.max(200, this.config.chunkSizeTokens * 0.8);
    const total = components.reduce((sum, component) => {
      const fileTokens = component.node.files.length * perFile;
      const childTokens = component.node.children.length * 150;
      return sum + BASE_FOLDER_TOKENS + fileTokens + childTokens;
    }, 0);

    return Math.min(this.config.tokenBudget, Math.round(total));
  }
}
