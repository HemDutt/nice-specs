import * as vscode from 'vscode';
import { ComponentLedger, DocDraft, SynthesizedDoc } from '../../types';
import { renderDocumentation } from '../../ui/docTemplate';
import { DocEvaluator } from '../../analysis/docEvaluator';
import { QualityReviewerAgent } from '../doc-generation-pipeline/qualityReviewerAgent';
import { ReviewGateResult, ScopeProfile, SectionPlan } from './types';
import { docFileForFolder } from '../../utils/path';

export class QualitySentinel {
  private readonly evaluator = new DocEvaluator();

  constructor(private readonly reviewer: QualityReviewerAgent) {}

  async review(scope: ScopeProfile, plan: SectionPlan, doc: SynthesizedDoc, ledger: ComponentLedger, token: vscode.CancellationToken): Promise<ReviewGateResult> {
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

    const markdown = renderDocumentation(metadata, doc);
    const review = await this.reviewer.review(markdown, ledger, token);
    if (review.status === 'rework') {
      return review;
    }

    const draft: DocDraft = {
      componentId: scope.componentId,
      docFile: docFileForFolder(scope.folder.uri),
      markdown,
      metadata,
      estimatedTokens: Math.round(markdown.length / 3),
      symbolIndex: []
    };
    this.evaluator.validateDraft(draft);

    return { status: 'accept' };
  }
}

function ensureInventoryCompleteness(plan: SectionPlan, doc: SynthesizedDoc): string | undefined {
  const required = new Set(plan.fileInventory.map((entry) => entry.file));
  for (const entry of doc.fileInventory) {
    required.delete(entry.file);
  }
  if (required.size > 0) {
    return `Missing file inventory entries for: ${Array.from(required).join(', ')}`;
  }
  return undefined;
}
