import * as path from 'path';
import * as vscode from 'vscode';
import { DocGenConfig, FolderNode, ChunkInfo } from '../types';
import { throwIfCancelled } from '../utils/cancellation';
import { isLikelyBinary } from '../utils/text';
import { logDebug, logWarn } from '../utils/logger';

const BLOCK_BOUNDARY_REGEX = /(class|interface|function|const|async|module)\b/i;
const BRACE_OPEN = /{\s*$/;
const BRACE_CLOSE = /^\s*}/;

export class CodeChunker {
  constructor(private readonly config: DocGenConfig) {}

  async createChunks(
    folder: FolderNode,
    token: vscode.CancellationToken,
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
    progressLabel?: string
  ): Promise<ChunkInfo[]> {
    logDebug(`Chunker: starting on ${folder.files.length} files for ${folder.name}`);
    const chunks: ChunkInfo[] = [];
    const totalFiles = folder.files.length || 1;

    for (let index = 0; index < folder.files.length; index += 1) {
      const file = folder.files[index];
      throwIfCancelled(token);
      if (progress && progressLabel) {
        const fileName = path.basename(file.fsPath);
        progress.report({ message: `${progressLabel} – Chunking ${fileName} (${index + 1}/${totalFiles})` });
      }
      let document: vscode.TextDocument;
      try {
        document = await vscode.workspace.openTextDocument(file);
      } catch (error) {
        logWarn(`Chunker: skipping ${file.fsPath} because it could not be opened.`, error);
        continue;
      }
      const text = document.getText();
      if (isLikelyBinary(text)) {
        logWarn(`Chunker: skipping ${file.fsPath} because it appears to be binary.`);
        continue;
      }
      if (Buffer.byteLength(text, 'utf8') > this.config.maxFileSizeBytes) {
        logWarn(`Chunker: skipping ${file.fsPath} because it exceeds size limit of ${this.config.maxFileSizeBytes} bytes.`);
        continue;
      }

      const fileChunks = this.chunkDocument(document, text);
      chunks.push(...fileChunks);
    }

    logDebug(`Chunker: produced ${chunks.length} chunks for ${folder.name}`);
    return chunks;
  }

  private chunkDocument(document: vscode.TextDocument, text: string): ChunkInfo[] {
    const lines = text.split(/\r?\n/);
    const result: ChunkInfo[] = [];
    let start = 0;
    let chunkIndex = 0;
    let braceDepth = 0;

    for (let line = 0; line < lines.length; line += 1) {
      const trimmed = lines[line].trim();
      if (BRACE_OPEN.test(trimmed)) {
        braceDepth += 1;
      } else if (BRACE_CLOSE.test(trimmed)) {
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
