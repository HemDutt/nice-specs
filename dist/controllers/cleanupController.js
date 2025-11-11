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
exports.CleanupController = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const cancellation_1 = require("../utils/cancellation");
class CleanupController {
    async run(token, progress) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('Open a workspace folder before running cleanup.');
        }
        const files = await this.findDocs(workspaceFolder.uri, token);
        let deleted = 0;
        for (const file of files) {
            (0, cancellation_1.throwIfCancelled)(token);
            progress?.report({ message: `Deleting ${path.basename(file.fsPath)}` });
            await vscode.workspace.fs.delete(file, { useTrash: false });
            deleted += 1;
        }
        const nicespecsDir = vscode.Uri.joinPath(workspaceFolder.uri, '.nicespecs');
        try {
            await vscode.workspace.fs.delete(nicespecsDir, { recursive: true, useTrash: false });
        }
        catch {
            // ignore missing dir
        }
        const rootDoc = vscode.Uri.joinPath(workspaceFolder.uri, 'nicespecs.root.md');
        try {
            await vscode.workspace.fs.delete(rootDoc, { useTrash: false });
            deleted += 1;
        }
        catch {
            // ignore
        }
        return { deletedFiles: deleted };
    }
    async findDocs(root, token) {
        const results = [];
        const entries = await vscode.workspace.fs.readDirectory(root);
        for (const [name, type] of entries) {
            (0, cancellation_1.throwIfCancelled)(token);
            if (type === vscode.FileType.Directory) {
                if (name === '.git' || name === 'node_modules' || name === '.nicespecs') {
                    continue;
                }
                const childResults = await this.findDocs(vscode.Uri.joinPath(root, name), token);
                results.push(...childResults);
            }
            else if (name.startsWith('nicespecs.') && name.endsWith('.md')) {
                results.push(vscode.Uri.joinPath(root, name));
            }
        }
        return results;
    }
}
exports.CleanupController = CleanupController;
//# sourceMappingURL=cleanupController.js.map