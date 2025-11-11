import * as vscode from 'vscode';
import { ChildSummary, ChunkInfo, ComponentLedger, ComponentRunState, DocDraft, DocGenConfig, FolderNode, SynthesizedDoc } from '../types';
import { componentIdFromUri, docFileForFolder, workspaceRelativePath } from '../utils/path';
import { renderDocumentation } from '../ui/docTemplate';
import { PersonaClient } from './personaClient';
import { DocPlanner } from './doc-generation-pipeline/docPlanner';
import { CodeAnalysisAgent } from './doc-generation-pipeline/codeAnalysisAgent';
import { DocSynthesisAgent } from './doc-generation-pipeline/docSynthesisAgent';
import { QualityReviewerAgent } from './doc-generation-pipeline/qualityReviewerAgent';

export class AgentOrchestrator {
  private readonly personaClient: PersonaClient;
  private readonly planner: DocPlanner;
  private readonly analyst: CodeAnalysisAgent;
  private readonly synthesizer: DocSynthesisAgent;
  private readonly reviewer: QualityReviewerAgent;

  constructor(model: vscode.LanguageModelChat, private readonly config: DocGenConfig) {
    this.personaClient = new PersonaClient(model);
    this.planner = new DocPlanner(this.personaClient);
    this.analyst = new CodeAnalysisAgent(this.personaClient);
    this.synthesizer = new DocSynthesisAgent(this.personaClient);
    this.reviewer = new QualityReviewerAgent(this.personaClient);
  }

  async prepareLedger(
    folder: FolderNode,
    chunks: ChunkInfo[],
    childSummaries: ChildSummary[],
    token: vscode.CancellationToken,
    resumeState?: ComponentRunState
  ): Promise<ComponentLedger> {
    if (resumeState && resumeState.facts.length) {
      return {
        componentId: resumeState.componentId,
        folderPath: resumeState.folderPath,
        files: Array.from(new Set(chunks.map((chunk) => workspaceRelativePath(chunk.file)))),
        facts: resumeState.facts,
        childSummaries,
        tags: resumeState.tags,
        plan: resumeState.plan
      } satisfies ComponentLedger;
    }

    const plan = await this.planner.plan(folder, childSummaries, token);
    const facts = await this.analyst.analyze(chunks, token);

    return {
      componentId: componentIdFromUri(folder.uri, this.config.workspaceRoot),
      folderPath: workspaceRelativePath(folder.uri),
      files: Array.from(new Set(chunks.map((chunk) => workspaceRelativePath(chunk.file)))),
      facts,
      childSummaries,
      tags: Array.from(new Set(facts.flatMap((fact) => fact.tags))),
      plan
    } satisfies ComponentLedger;
  }

  async generateDraft(
    folder: FolderNode,
    ledger: ComponentLedger,
    token: vscode.CancellationToken,
    constraints?: string
  ): Promise<DocDraft> {
    let synthesis = await this.synthesizer.synthesize(folder, ledger, token, constraints);

    if (this.config.reviewerEnabled) {
      const reviewMarkdown = renderDocumentation(createMetadata(folder, ledger, synthesis.doc), synthesis.doc);
      const review = await this.reviewer.review(reviewMarkdown, ledger, token);
      if (review.status === 'rework') {
        synthesis = await this.synthesizer.synthesize(folder, ledger, token, review.feedback);
      }
    }

    const metadata = createMetadata(folder, ledger, synthesis.doc);
    const markdown = renderDocumentation(metadata, synthesis.doc);

    return {
      componentId: ledger.componentId,
      docFile: docFileForFolder(folder.uri),
      markdown,
      metadata,
      estimatedTokens: Math.round(markdown.length / 3),
      symbolIndex: synthesis.symbolIndex
    } satisfies DocDraft;
  }
}

function createMetadata(folder: FolderNode, ledger: ComponentLedger, doc: SynthesizedDoc) {
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
