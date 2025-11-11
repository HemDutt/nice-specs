import * as vscode from 'vscode';
import { ChildSummary, LedgerFact, SynthesizedDoc } from '../../types';
import { PersonaClient, safeJsonParse } from '../personaClient';
import { CompositionContext, SectionPlan } from './types';

export class MarkdownComposer {
  constructor(private readonly persona: PersonaClient) {}

  async compose(context: CompositionContext, token: vscode.CancellationToken, constraints?: string): Promise<SynthesizedDoc> {
    const prompt = this.buildPrompt(context.plan, context.childSummaries, context.facts, constraints);
    const response = await this.persona.invoke('DocSynthesizer', prompt, token, 'Compose documentation from section plan');
    const parsed = safeJsonParse<SynthesizedDoc>(response);
    return normalizeDoc(parsed, context.plan, context.childSummaries);
  }

  private buildPrompt(plan: SectionPlan, childSummaries: ChildSummary[], facts: LedgerFact[], constraints?: string) {
    const planJson = JSON.stringify(plan, null, 2);
    const childSection =
      childSummaries
        .map(
          (child) =>
            `- ${child.componentId} (${child.relativeLink})\n  Purpose: ${truncate(child.sections?.Purpose)}\n  Responsibilities: ${truncate(child.sections?.Responsibilities)}`
        )
        .join('\n') || 'None';
    const evidence = facts.map((fact) => `- ${fact.file}:${fact.startLine}-${fact.endLine} (${fact.chunkId}): ${fact.summary}`).join('\n');

    return `You are DocSynthesizer. Use the provided SectionPlan to emit documentation JSON matching:
{
  "summary": string,
  "purpose": string,
  "responsibilities": [string],
  "fileInventory": [{"file": string, "synopsis": string, "symbols": [{"name": string, "kind": string, "description": string, "chunkId": string}]}],
  "codeStructure": [{"file": string, "summary": string}],
  "codeStructureSynopsis": string,
  "dataFlow": string,
  "dependencies": { "internal": [string], "external": [string] },
  "childComponents": [{"name": string, "link": string, "description": string}],
  "operationalNotes": [string],
  "risks": [string],
  "changelog": [{"date": string, "note": string}],
  "tags": [string]
}
Rules:
- Do not invent files or symbols beyond the SectionPlan.
- If information is missing, keep '_Pending_' placeholders.
- Child components must use the provided relative links and stay summarized in one sentence.
- The file inventory must include every file from the plan.
${constraints ? `Additional reviewer notes: ${constraints}` : ''}

SectionPlan:
${planJson}

Child components:
${childSection}

Evidence:
${evidence}`;
  }
}

function normalizeDoc(doc: SynthesizedDoc | undefined, plan: SectionPlan, childSummaries: ChildSummary[]): SynthesizedDoc {
  const fallback = planToDoc(plan, childSummaries);
  if (!doc) {
    return fallback;
  }

  const mergedInventory = mergeInventory(plan.fileInventory, doc.fileInventory);
  const mergedCodeStructure = mergedInventory.map((entry) => ({
    file: entry.file,
    summary: doc.codeStructure?.find((item) => item.file === entry.file)?.summary ?? entry.synopsis
  }));

  return {
    summary: doc.summary ?? plan.summary,
    purpose: doc.purpose ?? plan.purpose,
    responsibilities: doc.responsibilities?.length ? doc.responsibilities : plan.responsibilities,
    fileInventory: mergedInventory,
    codeStructureSynopsis: doc.codeStructureSynopsis ?? plan.codeStructureSynopsis,
    codeStructure: mergedCodeStructure,
    dataFlow: doc.dataFlow ?? plan.dataFlow,
    dependencies: {
      internal: doc.dependencies?.internal?.length ? doc.dependencies.internal : plan.dependencies.internal,
      external: doc.dependencies?.external?.length ? doc.dependencies.external : plan.dependencies.external
    },
    childComponents: doc.childComponents?.length ? doc.childComponents : childSummaries.map((child) => ({
      name: child.componentId,
      link: child.relativeLink,
      description: child.synopsis ?? child.sections?.Purpose ?? ''
    })),
    operationalNotes: doc.operationalNotes ?? plan.operationalNotes,
    risks: doc.risks ?? plan.risks,
    changelog: doc.changelog ?? plan.changelog,
    tags: doc.tags ?? plan.tags
  };
}

function mergeInventory(planInventory: SectionPlan['fileInventory'], docInventory: SynthesizedDoc['fileInventory'] | undefined) {
  const map = new Map(planInventory.map((entry) => [entry.file, entry]));
  if (docInventory) {
    for (const entry of docInventory) {
      map.set(entry.file, {
        file: entry.file,
        synopsis: entry.synopsis || map.get(entry.file)?.synopsis || '_Pending_',
        symbols: entry.symbols ?? map.get(entry.file)?.symbols ?? []
      });
    }
  }
  return Array.from(map.values());
}

function planToDoc(plan: SectionPlan, childSummaries: ChildSummary[]): SynthesizedDoc {
  return {
    summary: plan.summary,
    purpose: plan.purpose,
    responsibilities: plan.responsibilities,
    fileInventory: plan.fileInventory,
    codeStructureSynopsis: plan.codeStructureSynopsis,
    codeStructure: plan.fileInventory.map((entry) => ({ file: entry.file, summary: entry.synopsis })),
    dataFlow: plan.dataFlow,
    dependencies: plan.dependencies,
    childComponents: childSummaries.map((child) => ({
      name: child.componentId,
      link: child.relativeLink,
      description: child.synopsis ?? child.sections?.Purpose ?? ''
    })),
    operationalNotes: plan.operationalNotes,
    risks: plan.risks,
    changelog: plan.changelog,
    tags: plan.tags
  };
}

function truncate(value?: string, length = 160): string {
  if (!value) {
    return '';
  }
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
