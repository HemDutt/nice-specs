import * as vscode from 'vscode';
import { loadConfig } from '../config';
import { AgentOrchestrator } from '../lm/agentOrchestrator';
import { TraversalPlanner } from '../planner/traversalPlanner';
import { CodeChunker } from '../chunker/codeChunker';
import { DocChunker } from '../chunker/docChunker';
import { IndexStore } from '../persist/indexStore';
import { DocWriter } from '../persist/docWriter';
import { EmbeddingStore } from '../persist/embeddingStore';
import { DocEvaluator } from '../analysis/docEvaluator';
import { ChangeDetector } from '../analysis/changeDetector';
import { CostEstimator } from '../ui/costEstimator';
import { DocRunOptions, RunSummary, SelectedComponent } from '../types';
import { throwIfCancelled } from '../utils/cancellation';
import { SignatureScanner } from '../analysis/signatureScanner';
import { componentIdFromUri, workspaceRelativePath } from '../utils/path';
import { RootComposer } from './rootComposer';
import { getHeadCommit } from '../utils/git';
import { KeyMapper } from '../persist/keyMapper';

export class DocRunController {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async run(options: DocRunOptions): Promise<RunSummary> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('Open a workspace folder before running documentation.');
    }

    const config = await loadConfig(workspaceFolder.uri);
    const indexStore = new IndexStore(workspaceFolder.uri);
    await indexStore.ensureReady();
    indexStore.beginRun();
    const embeddingStore = new EmbeddingStore(workspaceFolder.uri);
    await embeddingStore.ensureReady();
    const keyMapper = new KeyMapper(workspaceFolder.uri);
    await keyMapper.ensureReady();

    const existingInProgress = indexStore.getInProgressComponent();
    if (existingInProgress && !options.force) {
      if (!options.resume) {
        const choice = await vscode.window.showInformationMessage(
          `@nicespecs previously stopped while documenting ${existingInProgress}. Resume?`,
          { modal: true },
          'Resume',
          'Restart',
          'Cancel'
        );
        if (choice === 'Restart') {
          await indexStore.abandonRunState(existingInProgress);
        } else if (choice === 'Cancel' || !choice) {
          return {
            processed: 0,
            skipped: 0,
            costEstimate: 0,
            message: 'Resume cancelled by user.'
          };
        }
      }
    }

    const traversalPlanner = new TraversalPlanner(config);
    const folderGraph = await traversalPlanner.build(workspaceFolder.uri, options.token);

    const signatureScanner = new SignatureScanner(config);
    const changeDetector = new ChangeDetector(indexStore, config.workspaceRoot, signatureScanner);
    const candidateFolders: SelectedComponent[] = await changeDetector.selectTargets(folderGraph, options.token, options.force);
    candidateFolders.sort((a, b) => a.node.depth - b.node.depth);

    if (candidateFolders.length === 0) {
        return {
          processed: 0,
          skipped: folderGraph.length,
          costEstimate: 0,
          message: 'Documentation already up to date.'
        } satisfies RunSummary;
    }

    const costEstimator = new CostEstimator(config);
    const estimatedTokens = costEstimator.estimateCost(candidateFolders);

    if (options.requireApproval) {
      const approval = await vscode.window.showInformationMessage(
        `@nicespecs needs approximately ${estimatedTokens.toLocaleString()} tokens to document ${candidateFolders.length} components. Continue?`,
        { modal: true },
        'Yes',
        'No'
      );

      if (approval !== 'Yes') {
        return {
          processed: 0,
          skipped: folderGraph.length,
          costEstimate: estimatedTokens,
          message: 'User aborted documentation run.'
        } satisfies RunSummary;
      }
    }

    const model = options.model ?? (await pickDefaultModel());
    if (!model) {
      throw new Error('No chat-capable models available.');
    }

    const agent = new AgentOrchestrator(model, config);
    const chunker = new CodeChunker(config);
    const docChunker = new DocChunker();
    const docWriter = new DocWriter(indexStore, embeddingStore, keyMapper);
    const evaluator = new DocEvaluator();

    let processed = 0;
    let actualTokens = 0;
    for (const target of candidateFolders) {
      const folder = target.node;
      throwIfCancelled(options.token);
      options.progress?.report({ message: `Documenting ${folder.name}` });
      const componentId = componentIdFromUri(folder.uri, config.workspaceRoot);
      const existingState = await indexStore.loadRunState(componentId);

      const chunks = await chunker.createChunks(folder, options.token);
      const childSummaries = await docChunker.loadChildSummaries(folder);
      const ledger = await agent.prepareLedger(folder, chunks, childSummaries, options.token, existingState);

      await indexStore.saveRunState({
        componentId,
        folderPath: ledger.folderPath,
        chunkCursor: chunks.length,
        facts: ledger.facts,
        childSummaries: ledger.childSummaries.map(({ componentId: childId, relativeLink, synopsis, sections }) => ({
          componentId: childId,
          relativeLink,
          synopsis,
          sections
        })),
        tags: ledger.tags,
        constraints: existingState?.constraints,
        plan: ledger.plan
      });

      const draft = await agent.generateDraft(folder, ledger, options.token, existingState?.constraints);
      evaluator.validateDraft(draft);
      await docWriter.write(folder, draft, target.signature);
      actualTokens += draft.estimatedTokens;
      processed += 1;
    }

    const rootComposer = new RootComposer(workspaceFolder.uri, indexStore);
    await rootComposer.compose();
    await indexStore.finalizeRun();
    const latestCommit = await getHeadCommit(workspaceFolder.uri);
    if (latestCommit) {
      await indexStore.setLastCommit(latestCommit);
    }

    return {
      processed,
      skipped: folderGraph.length - processed,
      costEstimate: actualTokens,
      message: `Generated documentation for ${processed} components (~${actualTokens.toLocaleString()} tokens, est ${estimatedTokens.toLocaleString()}).`
    } satisfies RunSummary;
  }
}

async function pickDefaultModel(): Promise<vscode.LanguageModelChat | undefined> {
  const [model] = await vscode.lm.selectChatModels();
  return model;
}
