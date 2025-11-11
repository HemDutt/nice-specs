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
exports.loadConfig = loadConfig;
const vscode = __importStar(require("vscode"));
const DEFAULT_IGNORE = ['node_modules', '.git', '.github', '.idea', '.vscode', 'dist', 'out', 'build', '.next', '.nicespecs'];
async function loadConfig(workspaceRoot) {
    const config = vscode.workspace.getConfiguration('nicespecs');
    const ignoreGlobs = config.get('ignoreGlobs') ?? DEFAULT_IGNORE;
    const chunkSizeTokens = config.get('chunkSizeTokens') ?? 700;
    const chunkOverlapTokens = config.get('chunkOverlapTokens') ?? 80;
    const tokenBudget = config.get('tokenBudget') ?? 200_000;
    const reviewerEnabled = config.get('reviewerEnabled') ?? true;
    const maxFileSizeBytes = config.get('maxFileSizeBytes') ?? 2 * 1024 * 1024;
    const minChunkLines = config.get('minChunkLines') ?? 12;
    const maxChunkLines = config.get('maxChunkLines') ?? 120;
    const signatureSampleLines = config.get('signatureSampleLines') ?? 120;
    const gitignorePatterns = await loadGitignorePatterns(workspaceRoot);
    return {
        workspaceRoot,
        ignoreGlobs,
        gitignorePatterns,
        chunkSizeTokens,
        chunkOverlapTokens,
        tokenBudget,
        reviewerEnabled,
        maxFileSizeBytes,
        minChunkLines,
        maxChunkLines,
        signatureSampleLines
    };
}
async function loadGitignorePatterns(root) {
    const gitignoreUri = vscode.Uri.joinPath(root, '.gitignore');
    try {
        const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
        const text = Buffer.from(bytes).toString('utf8');
        return text.split(/\r?\n/);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=config.js.map