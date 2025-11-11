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
exports.CodeChunker = void 0;
const vscode = __importStar(require("vscode"));
const cancellation_1 = require("../utils/cancellation");
const BLOCK_BOUNDARY_REGEX = /(class|interface|function|const|async|module)\b/i;
const BRACE_OPEN = /{\s*$/;
const BRACE_CLOSE = /^\s*}/;
class CodeChunker {
    constructor(config) {
        this.config = config;
    }
    async createChunks(folder, token) {
        const chunks = [];
        for (const file of folder.files) {
            (0, cancellation_1.throwIfCancelled)(token);
            const document = await vscode.workspace.openTextDocument(file);
            const text = document.getText();
            if (Buffer.byteLength(text, 'utf8') > this.config.maxFileSizeBytes) {
                console.warn(`Skipping ${file.fsPath} because it exceeds size limit.`);
                continue;
            }
            const fileChunks = this.chunkDocument(document, text);
            chunks.push(...fileChunks);
        }
        return chunks;
    }
    chunkDocument(document, text) {
        const lines = text.split(/\r?\n/);
        const result = [];
        let start = 0;
        let chunkIndex = 0;
        let braceDepth = 0;
        for (let line = 0; line < lines.length; line += 1) {
            const trimmed = lines[line].trim();
            if (BRACE_OPEN.test(trimmed)) {
                braceDepth += 1;
            }
            else if (BRACE_CLOSE.test(trimmed)) {
                braceDepth = Math.max(0, braceDepth - 1);
            }
            const lineCount = line - start + 1;
            const reachedMax = lineCount >= this.config.maxChunkLines;
            const meaningfulBoundary = lineCount >= this.config.minChunkLines && braceDepth === 0 && BLOCK_BOUNDARY_REGEX.test(trimmed);
            if (reachedMax || meaningfulBoundary || line === lines.length - 1) {
                const end = line + 1;
                const textSlice = lines.slice(start, end).join('\n');
                result.push({
                    id: `${document.uri.path}#chunk-${chunkIndex}`,
                    file: document.uri,
                    languageId: document.languageId,
                    startLine: start,
                    endLine: end,
                    text: textSlice
                });
                start = Math.max(end - 5, end);
                line = Math.max(start - 1, -1);
                chunkIndex += 1;
            }
        }
        return result;
    }
}
exports.CodeChunker = CodeChunker;
//# sourceMappingURL=codeChunker.js.map