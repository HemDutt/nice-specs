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
exports.QueryController = void 0;
const vscode = __importStar(require("vscode"));
const embeddingStore_1 = require("../persist/embeddingStore");
const fs_1 = require("../utils/fs");
class QueryController {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.embeddingStore = new embeddingStore_1.EmbeddingStore(workspaceRoot);
    }
    async answer(prompt, response, token) {
        await this.embeddingStore.ensureReady();
        const matches = await this.embeddingStore.query(prompt, 3);
        if (matches.length === 0) {
            response.markdown('I could not find existing documentation for that topic yet. Try running `/docgen` to generate docs first.');
            return;
        }
        response.progress('Looking up relevant documentation…');
        const snippets = [];
        for (const match of matches) {
            if (token.isCancellationRequested) {
                return;
            }
            const docUri = vscode.Uri.joinPath(this.workspaceRoot, match.docPath);
            let text;
            try {
                text = await (0, fs_1.readFileText)(docUri);
            }
            catch {
                continue;
            }
            const summary = extractSummary(text);
            snippets.push(`### ${match.docPath}\n${summary}\n_Last updated ${new Date(match.updated).toLocaleString()}_`);
        }
        if (!snippets.length) {
            response.markdown('Documentation files were found but could not be read. Please ensure they exist locally.');
            return;
        }
        response.markdown(`Here is what I found:\n\n${snippets.join('\n\n')}`);
    }
}
exports.QueryController = QueryController;
function extractSummary(text) {
    const sections = ['## Purpose', '## Responsibilities', '## Code Structure'];
    const lines = text.split(/\r?\n/);
    const summaries = [];
    for (const section of sections) {
        const snippet = extractSection(lines, section);
        if (snippet) {
            summaries.push(`_${section.replace('## ', '')}_\n${snippet}`);
        }
    }
    if (!summaries.length) {
        return text.slice(0, 280) + (text.length > 280 ? '…' : '');
    }
    return summaries.join('\n\n');
}
function extractSection(lines, header) {
    const start = lines.findIndex((line) => line.trim() === header);
    if (start === -1) {
        return undefined;
    }
    const end = lines.slice(start + 1).findIndex((line) => line.startsWith('## '));
    const slice = end === -1 ? lines.slice(start + 1) : lines.slice(start + 1, start + 1 + end);
    const filtered = slice.map((line) => line.trim()).filter(Boolean);
    if (!filtered.length) {
        return undefined;
    }
    return filtered.slice(0, 5).join('\n');
}
//# sourceMappingURL=queryController.js.map