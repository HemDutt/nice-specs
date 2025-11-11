"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocRunController = void 0;
const vscode = __importStar(require("vscode"));
const config_1 = require("../config");
const agentOrchestrator_1 = require("../lm/agentOrchestrator");
const traversalPlanner_1 = require("../planner/traversalPlanner");
const codeChunker_1 = require("../chunker/codeChunker");
const docChunker_1 = require("../chunker/docChunker");
const indexStore_1 = require("../persist/indexStore");
const docWriter_1 = require("../persist/docWriter");
const embeddingStore_1 = require("../persist/embeddingStore");
const docEvaluator_1 = require("../analysis/docEvaluator");
const changeDetector_1 = require("../analysis/changeDetector");
const costEstimator_1 = require("../ui/costEstimator");
const cancellation_1 = require("../utils/cancellation");
const signatureScanner_1 = require("../analysis/signatureScanner");
const path_1 = require("../utils/path");
const rootComposer_1 = require("./rootComposer");
const git_1 = require("../utils/git");
const keyMapper_1 = require("../persist/keyMapper");
class DocRunController {
    constructor(context) {
        this.context = context;
    }
    async run(options) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('Open a workspace folder before running documentation.');
        }
        const config = await (0, config_1.loadConfig)(workspaceFolder.uri);
        const indexStore = new indexStore_1.IndexStore(workspaceFolder.uri);
        await indexStore.ensureReady();
        indexStore.beginRun();
        const embeddingStore = new embeddingStore_1.EmbeddingStore(workspaceFolder.uri);
        await embeddingStore.ensureReady();
        const keyMapper = new keyMapper_1.KeyMapper(workspaceFolder.uri);
        await keyMapper.ensureReady();
        const existingInProgress = indexStore.getInProgressComponent();
        if (existingInProgress && !options.force) {
            if (!options.resume) {
                const choice = await vscode.window.showInformationMessage(`@nicespecs previously stopped while documenting ${existingInProgress}. Resume?`, { modal: true }, 'Resume', 'Restart', 'Cancel');
                if (choice === 'Restart') {
                    await indexStore.abandonRunState(existingInProgress);
                }
                else if (choice === 'Cancel' || !choice) {
                    return {
                        processed: 0,
                        skipped: 0,
                        costEstimate: 0,
                        message: 'Resume cancelled by user.'
                    };
                }
            }
        }
        const traversalPlanner = new traversalPlanner_1.TraversalPlanner(config);
        const folderGraph = await traversalPlanner.build(workspaceFolder.uri, options.token);
        const signatureScanner = new signatureScanner_1.SignatureScanner(config);
        const changeDetector = new changeDetector_1.ChangeDetector(indexStore, config.workspaceRoot, signatureScanner);
        const candidateFolders = await changeDetector.selectTargets(folderGraph, options.token, options.force);
        candidateFolders.sort((a, b) => a.node.depth - b.node.depth);
        if (candidateFolders.length === 0) {
            return {
                processed: 0,
                skipped: folderGraph.length,
                costEstimate: 0,
                message: 'Documentation already up to date.'
            };
        }
        const costEstimator = new costEstimator_1.CostEstimator(config);
        const estimatedTokens = costEstimator.estimateCost(candidateFolders);
        if (options.requireApproval) {
            const approval = await vscode.window.showInformationMessage(`@nicespecs needs approximately ${estimatedTokens.toLocaleString()} tokens to document ${candidateFolders.length} components. Continue?`, { modal: true }, 'Yes', 'No');
            if (approval !== 'Yes') {
                return {
                    processed: 0,
                    skipped: folderGraph.length,
                    costEstimate: estimatedTokens,
                    message: 'User aborted documentation run.'
                };
            }
        }
        const model = options.model ?? (await pickDefaultModel());
        if (!model) {
            throw new Error('No chat-capable models available.');
        }
        const agent = new agentOrchestrator_1.AgentOrchestrator(model, config);
        const chunker = new codeChunker_1.CodeChunker(config);
        const docChunker = new docChunker_1.DocChunker();
        const docWriter = new docWriter_1.DocWriter(indexStore, embeddingStore, keyMapper);
        const evaluator = new docEvaluator_1.DocEvaluator();
        let processed = 0;
        let actualTokens = 0;
        for (const target of candidateFolders) {
            const folder = target.node;
            (0, cancellation_1.throwIfCancelled)(options.token);
            options.progress?.report({ message: `Documenting ${folder.name}` });
            const componentId = (0, path_1.componentIdFromUri)(folder.uri, config.workspaceRoot);
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
        const rootComposer = new rootComposer_1.RootComposer(workspaceFolder.uri, indexStore);
        await rootComposer.compose();
        await indexStore.finalizeRun();
        const latestCommit = await (0, git_1.getHeadCommit)(workspaceFolder.uri);
        if (latestCommit) {
            await indexStore.setLastCommit(latestCommit);
        }
        return {
            processed,
            skipped: folderGraph.length - processed,
            costEstimate: actualTokens,
            message: `Generated documentation for ${processed} components (~${actualTokens.toLocaleString()} tokens, est ${estimatedTokens.toLocaleString()}).`
        };
    }
}
exports.DocRunController = DocRunController;
async function pickDefaultModel() {
    const [model] = await vscode.lm.selectChatModels();
    return model;
}
//# sourceMappingURL=docRunController.js.map