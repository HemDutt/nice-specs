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
exports.SignatureScanner = void 0;
const vscode = __importStar(require("vscode"));
const hash_1 = require("../utils/hash");
const SYMBOL_REGEX = /\b(class|interface|function|const|let|var)\s+([A-Za-z0-9_]+)/g;
const IMPORT_REGEX = /import\s+(?:.+?from\s+)?['"]([^'"]+)['"]/g;
class SignatureScanner {
    constructor(config) {
        this.config = config;
    }
    async computeSignature(folder) {
        const parts = [];
        for (const file of folder.files) {
            const document = await vscode.workspace.openTextDocument(file);
            const lines = document.getText().split(/\r?\n/).slice(0, this.config.signatureSampleLines);
            const snippet = lines.join('\n');
            parts.push(`${file.path}:${extractSymbols(snippet)}`);
            parts.push(`${file.path}:imports:${extractImports(snippet)}`);
        }
        for (const child of folder.children) {
            parts.push(`child:${child.name}`);
        }
        if (parts.length === 0) {
            parts.push(folder.name);
        }
        return (0, hash_1.hashString)(parts.join('\n'));
    }
}
exports.SignatureScanner = SignatureScanner;
function extractSymbols(snippet) {
    const matches = [];
    let match;
    while ((match = SYMBOL_REGEX.exec(snippet))) {
        matches.push(`${match[1]}:${match[2]}`);
    }
    return matches.join('|');
}
function extractImports(snippet) {
    const matches = [];
    let match;
    while ((match = IMPORT_REGEX.exec(snippet))) {
        matches.push(match[1]);
    }
    return matches.join('|');
}
//# sourceMappingURL=signatureScanner.js.map