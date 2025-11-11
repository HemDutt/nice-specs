import * as vscode from 'vscode';
import { DocGenConfig } from './types';

const DEFAULT_IGNORE = ['node_modules', '.git', '.github', '.idea', '.vscode', 'dist', 'out', 'build', '.next', '.nicespecs'];

export async function loadConfig(workspaceRoot: vscode.Uri): Promise<DocGenConfig> {
  const config = vscode.workspace.getConfiguration('nicespecs');
  const ignoreGlobs = config.get<string[]>('ignoreGlobs') ?? DEFAULT_IGNORE;
  const chunkSizeTokens = config.get<number>('chunkSizeTokens') ?? 700;
  const chunkOverlapTokens = config.get<number>('chunkOverlapTokens') ?? 80;
  const tokenBudget = config.get<number>('tokenBudget') ?? 200_000;
  const reviewerEnabled = config.get<boolean>('reviewerEnabled') ?? true;
  const maxFileSizeBytes = config.get<number>('maxFileSizeBytes') ?? 2 * 1024 * 1024;
  const minChunkLines = config.get<number>('minChunkLines') ?? 12;
  const maxChunkLines = config.get<number>('maxChunkLines') ?? 120;
  const signatureSampleLines = config.get<number>('signatureSampleLines') ?? 120;

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
  } satisfies DocGenConfig;
}

async function loadGitignorePatterns(root: vscode.Uri): Promise<string[]> {
  const gitignoreUri = vscode.Uri.joinPath(root, '.gitignore');
  try {
    const bytes = await vscode.workspace.fs.readFile(gitignoreUri);
    const text = Buffer.from(bytes).toString('utf8');
    return text.split(/\r?\n/);
  } catch {
    return [];
  }
}
