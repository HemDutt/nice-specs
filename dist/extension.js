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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const docRunController_1 = require("./controllers/docRunController");
const cleanupController_1 = require("./controllers/cleanupController");
const queryController_1 = require("./controllers/queryController");
function activate(context) {
    const controller = new docRunController_1.DocRunController(context);
    const cleanupController = new cleanupController_1.CleanupController();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const queryController = workspaceFolder ? new queryController_1.QueryController(workspaceFolder.uri) : undefined;
    const participant = vscode.chat.createChatParticipant('nicespecs', async (request, _chatContext, response, token) => {
        if (await isCleanupPrompt(request.prompt)) {
            const confirmed = await confirmCleanup();
            if (!confirmed) {
                response.markdown('Cleanup cancelled.');
                return;
            }
            await handleCleanup(cleanupController, response, token);
            return;
        }
        const intent = classifyPrompt(request.prompt);
        if (intent === 'query') {
            if (!queryController) {
                response.markdown('Open a workspace folder so I can scan its documentation before answering code questions.');
                return;
            }
            await queryController.answer(request.prompt, response, token);
            return;
        }
        if (intent !== 'doc') {
            response.markdown('`@nicespecs` focuses on documentation. Ask for docs via `/docgen` or a code question (e.g., “Explain the History component”).');
            return;
        }
        const options = {
            model: request.model,
            token,
            progress: {
                report: ({ message }) => {
                    if (message) {
                        response.progress(message);
                    }
                }
            },
            requireApproval: true
        };
        try {
            response.progress('Analyzing workspace for documentation changes…');
            const summary = await controller.run(options);
            response.markdown(`✅ ${summary.message}`);
        }
        catch (error) {
            const message = asErrorMessage(error);
            response.markdown(`@nicespecs encountered an error: ${message}`);
        }
    });
    const commandDisposable = vscode.commands.registerCommand('nicespecs.runDocGeneration', async () => {
        const tokenSource = new vscode.CancellationTokenSource();
        try {
            const model = await pickAnyModel();
            if (!model) {
                vscode.window.showWarningMessage('No chat models available to run @nicespecs.');
                return;
            }
            const summary = await controller.run({
                model,
                token: tokenSource.token,
                requireApproval: true
            });
            vscode.window.showInformationMessage(summary.message);
        }
        catch (error) {
            vscode.window.showErrorMessage(asErrorMessage(error));
        }
        finally {
            tokenSource.dispose();
        }
    });
    const resumeDisposable = vscode.commands.registerCommand('nicespecs.resumeDocGeneration', async () => {
        const tokenSource = new vscode.CancellationTokenSource();
        try {
            const model = await pickAnyModel();
            if (!model) {
                vscode.window.showWarningMessage('No chat models available to run @nicespecs.');
                return;
            }
            const summary = await controller.run({
                model,
                token: tokenSource.token,
                requireApproval: true,
                resume: true
            });
            vscode.window.showInformationMessage(summary.message);
        }
        catch (error) {
            vscode.window.showErrorMessage(asErrorMessage(error));
        }
        finally {
            tokenSource.dispose();
        }
    });
    const cleanupDisposable = vscode.commands.registerCommand('nicespecs.cleanDocumentation', async () => {
        const tokenSource = new vscode.CancellationTokenSource();
        try {
            const confirmed = await confirmCleanup();
            if (!confirmed) {
                return;
            }
            const summary = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Nice Specs: Cleaning documentation' }, (progress, token) => cleanupController.run(token, progress));
            vscode.window.showInformationMessage(`Deleted ${summary.deletedFiles} documentation files and index artifacts.`);
        }
        catch (error) {
            vscode.window.showErrorMessage(asErrorMessage(error));
        }
        finally {
            tokenSource.dispose();
        }
    });
    context.subscriptions.push(participant, commandDisposable, resumeDisposable, cleanupDisposable);
}
function deactivate() { }
function classifyPrompt(prompt) {
    const lower = prompt.toLowerCase();
    if (isDocumentationPrompt(lower)) {
        return 'doc';
    }
    if (isCodeInformationPrompt(lower)) {
        return 'query';
    }
    return 'other';
}
function isDocumentationPrompt(lower) {
    const allowList = ['documentation', 'document', 'docs', '/docgen', 'describe component', 'spec', 'generate doc'];
    return allowList.some((keyword) => lower.includes(keyword));
}
function isCodeInformationPrompt(lower) {
    const keywords = ['explain', 'architecture', 'design', 'how does', 'what does', 'code structure', 'flow', 'responsibilities', 'dependency'];
    const questionWords = ['how', 'what', 'why'];
    if (keywords.some((keyword) => lower.includes(keyword))) {
        return true;
    }
    if (questionWords.some((word) => lower.startsWith(word))) {
        return true;
    }
    return lower.includes('component') && lower.includes('?');
}
async function isCleanupPrompt(prompt) {
    const lower = prompt.toLowerCase();
    const patterns = [/delete\s+.*doc/, /remove\s+.*doc/, /clean\s+.*doc/, /cleanup/, /\/docclean/];
    return patterns.some((pattern) => pattern.test(lower));
}
function asErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
async function pickAnyModel() {
    const models = await vscode.lm.selectChatModels();
    return models[0];
}
async function confirmCleanup() {
    const choice = await vscode.window.showInformationMessage('Delete all Nice Specs generated documentation files?', { modal: true }, 'Delete', 'Cancel');
    return choice === 'Delete';
}
async function handleCleanup(controller, response, token) {
    try {
        response.progress('Deleting generated documentation…');
        const summary = await controller.run(token, {
            report: ({ message }) => {
                if (message) {
                    response.progress(message);
                }
            }
        });
        response.markdown(`🧹 Removed ${summary.deletedFiles} documentation artifacts. You can run @nicespecs again to regenerate fresh docs.`);
    }
    catch (error) {
        response.markdown(`@nicespecs cleanup failed: ${asErrorMessage(error)}`);
    }
}
//# sourceMappingURL=extension.js.map