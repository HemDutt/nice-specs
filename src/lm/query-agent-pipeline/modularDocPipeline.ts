import * as vscode from 'vscode';
import { ChildSummary, ChunkInfo, ComponentLedger, DocDraft, DocGenConfig, FolderNode, LedgerFact } from '../../types';
import { docFileForFolder } from '../../utils/path';
import { renderDocumentation } from '../../ui/docTemplate';
import { PersonaClient } from '../personaClient';
import { QualityReviewerAgent } from '../doc-generation-pipeline/qualityReviewerAgent';
import { ScopeScanner } from './scopeScanner';
import { FileCartographer } from './fileCartographer';
import { SymbolHarvester } from './symbolHarvester';
import { OutlinePlanner } from './outlinePlanner';
import { MarkdownComposer } from './markdownComposer';
import { QualitySentinel } from './qualitySentinel';
import { CompositionContext, ScopeProfile, SectionPlan } from './types';

export class ModularDocPipeline {
  private readonly personaClient: PersonaClient;
  private readonly scopeScanner: ScopeScanner;
  private readonly fileCartographer: FileCartographer;
  private readonly symbolHarvester: SymbolHarvester;
  private readonly outlinePlanner: OutlinePlanner;
  private readonly composer: MarkdownComposer;
  private readonly quality: QualitySentinel;

  constructor(model: vscode.LanguageModelChat, private readonly config: DocGenConfig) {
    this.personaClient = new PersonaClient(model);
    this.scopeScanner = new ScopeScanner(this.personaClient, config.workspaceRoot);
    this.fileCartographer = new FileCartographer();
    this.symbolHarvester = new SymbolHarvester(this.personaClient);
    this.outlinePlanner = new OutlinePlanner();
    this.composer = new MarkdownComposer(this.personaClient);
    this.quality = new QualitySentinel(new QualityReviewerAgent(this.personaClient));
  }

  async generateDraft(folder: FolderNode, chunks: ChunkInfo[], childSummaries: ChildSummary[], token: vscode.CancellationToken): Promise<DocDraft> {
    const scope = await this.scopeScanner.scan(folder, childSummaries, token);
    const inventory = await this.fileCartographer.build(folder, chunks);
    const harvest = await this.symbolHarvester.harvest(scope.componentId, inventory.chunks, token);
    const plan = this.outlinePlanner.plan(scope, inventory, harvest, childSummaries);

    const compositionContext: CompositionContext = {
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

    const markdown = renderDocumentation(metadata, doc);
    return {
      componentId: scope.componentId,
      docFile: docFileForFolder(folder.uri),
      markdown,
      metadata,
      estimatedTokens: Math.round(markdown.length / 3),
      symbolIndex: harvest.symbolIndex
    };
  }

  private buildLedger(scope: ScopeProfile, files: string[], facts: LedgerFact[], childSummaries: ChildSummary[], plan: SectionPlan): ComponentLedger {
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
