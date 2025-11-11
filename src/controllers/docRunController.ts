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
import { componentIdFromUri, docFileForFolder } from '../utils/path';
import { RootComposer } from './rootComposer';
import { getHeadCommit } from '../utils/git';
import { KeyMapper } from '../persist/keyMapper';
import { logDebug, logInfo } from '../utils/logger';

export class DocRunController {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async run(options: DocRunOptions): Promise<RunSummary> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('Open a workspace folder before running documentation.');
    }

    logInfo('Doc run: loading configuration and stores');
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

    logInfo('Doc run: building traversal plan');
    const traversalPlanner = new TraversalPlanner(config);
    const folderGraph = await traversalPlanner.build(workspaceFolder.uri, options.token);

    const signatureScanner = new SignatureScanner(config);
    const changeDetector = new ChangeDetector(indexStore, config.workspaceRoot, signatureScanner);
    const candidateFolders: SelectedComponent[] = await changeDetector.selectTargets(folderGraph, options.token, options.force);
    candidateFolders.sort((a, b) => b.node.depth - a.node.depth);

    if (candidateFolders.length === 0) {
        return {
          processed: 0,
          skipped: folderGraph.length,
          costEstimate: 0,
          message: 'Documentation already up to date.'
        } satisfies RunSummary;
    }

    logInfo(`Doc run: ${candidateFolders.length} candidate components identified`);
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

    const totalTargets = candidateFolders.length;
    const progressIncrement = totalTargets > 0 ? 100 / totalTargets : 0;
    let processed = 0;
    let actualTokens = 0;
    const runStart = Date.now();
    logInfo(`Doc run: starting processing of ${totalTargets} components`);
    for (const target of candidateFolders) {
      const folder = target.node;
      throwIfCancelled(options.token);
      const componentLabel = `Documenting ${folder.name} (${processed + 1}/${totalTargets})`;
      logInfo(`${componentLabel}: starting (files=${folder.files.length}, depth=${folder.depth})`);
      options.progress?.report({
        message: `${componentLabel} – Starting`,
        increment: progressIncrement
      });
      const componentId = componentIdFromUri(folder.uri, config.workspaceRoot);
      const existingState = await indexStore.loadRunState(componentId);

      options.progress?.report({ message: `${componentLabel} – Chunking source files` });
      const chunkStart = Date.now();
      const chunks = await chunker.createChunks(folder, options.token, options.progress, componentLabel);
      logDebug(`${componentLabel}: chunked ${folder.files.length} files into ${chunks.length} chunks in ${Date.now() - chunkStart}ms`);
      options.progress?.report({ message: `${componentLabel} – Gathering child summaries` });
      const childStart = Date.now();
      const childSummaries = await docChunker.loadChildSummaries(folder);
      logDebug(`${componentLabel}: loaded ${childSummaries.length} child summaries in ${Date.now() - childStart}ms`);
      options.progress?.report({ message: `${componentLabel} – Preparing ledger` });
      const ledgerStart = Date.now();
      const ledger = await agent.prepareLedger(folder, chunks, childSummaries, options.token, existingState, options.progress, componentLabel);
      logDebug(`${componentLabel}: prepared ledger with ${ledger.facts.length} facts in ${Date.now() - ledgerStart}ms`);

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

      options.progress?.report({ message: `${componentLabel} – Generating draft` });
      const draftStart = Date.now();
      const draft = await agent.generateDraft(folder, ledger, options.token, existingState?.constraints, options.progress, componentLabel);
      logDebug(`${componentLabel}: draft generated (~${draft.estimatedTokens} tokens) in ${Date.now() - draftStart}ms`);
      evaluator.validateDraft(draft);
      options.progress?.report({ message: `${componentLabel} – Writing documentation` });
      await docWriter.write(folder, draft, target.signature);
      logInfo(`${componentLabel}: documentation written to ${docFileForFolder(folder.uri).fsPath}`);
      actualTokens += draft.estimatedTokens;
      processed += 1;
    }

    options.progress?.report({ message: 'Finalizing documentation run' });
    const rootComposer = new RootComposer(workspaceFolder.uri, indexStore);
    await rootComposer.compose();
    await indexStore.finalizeRun();
    const latestCommit = await getHeadCommit(workspaceFolder.uri);
    if (latestCommit) {
      await indexStore.setLastCommit(latestCommit);
    }

    logInfo(`Doc run: completed ${processed}/${totalTargets} components in ${Date.now() - runStart}ms`);
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
