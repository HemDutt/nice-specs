import * as vscode from 'vscode';
import { DocGenConfig, FolderNode } from '../types';
import { hashString } from '../utils/hash';
import { isLikelyBinary } from '../utils/text';
import { logWarn } from '../utils/logger';

const SYMBOL_REGEX = /\b(class|interface|function|const|let|var)\s+([A-Za-z0-9_]+)/g;
const IMPORT_REGEX = /import\s+(?:.+?from\s+)?['"]([^'"]+)['"]/g;

export class SignatureScanner {
  constructor(private readonly config: DocGenConfig) {}

  async computeSignature(folder: FolderNode): Promise<string> {
    const parts: string[] = [];
    for (const file of folder.files) {
      let document: vscode.TextDocument;
      try {
        document = await vscode.workspace.openTextDocument(file);
      } catch (error) {
        logWarn(`SignatureScanner: skipping ${file.fsPath} because it could not be opened.`, error);
        continue;
      }
      const text = document.getText();
      if (isLikelyBinary(text)) {
        logWarn(`SignatureScanner: skipping ${file.fsPath} because it appears to be binary.`);
        continue;
      }
      const lines = text.split(/\r?\n/).slice(0, this.config.signatureSampleLines);
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

    return hashString(parts.join('\n'));
  }
}

function extractSymbols(snippet: string): string {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = SYMBOL_REGEX.exec(snippet))) {
    matches.push(`${match[1]}:${match[2]}`);
  }
  return matches.join('|');
}

function extractImports(snippet: string): string {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = IMPORT_REGEX.exec(snippet))) {
    matches.push(match[1]);
  }
  return matches.join('|');
}
