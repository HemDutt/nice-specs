import * as vscode from 'vscode';
import { ComponentLedger } from '../../types';
import { PersonaClient } from '../personaClient';
import { truncate } from './promptUtils';

export type ReviewResult =
  | { status: 'accept' }
  | {
      status: 'rework';
      feedback: string;
    };

export class QualityReviewerAgent {
  constructor(private readonly persona: PersonaClient) {}

  async review(markdown: string, ledger: ComponentLedger, token: vscode.CancellationToken): Promise<ReviewResult> {
    const factOutline = ledger.facts.map((fact) => `- ${fact.chunkId}: ${fact.summary}`).join('\n');
    const childOutline = ledger.childSummaries.map((child) => `- ${child.componentId}: ${truncate(child.sections?.Purpose)}`).join('\n') || 'None';

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
