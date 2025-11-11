import * as vscode from 'vscode';
import { EmbeddingStore } from '../persist/embeddingStore';
import { readFileText } from '../utils/fs';

export class QueryController {
  private readonly embeddingStore: EmbeddingStore;

  constructor(private readonly workspaceRoot: vscode.Uri) {
    this.embeddingStore = new EmbeddingStore(workspaceRoot);
  }

  async answer(prompt: string, response: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<void> {
    await this.embeddingStore.ensureReady();
    const matches = await this.embeddingStore.query(prompt, 3);
    if (matches.length === 0) {
      response.markdown('I could not find existing documentation for that topic yet. Try running `/docgen` to generate docs first.');
      return;
    }

    response.progress('Looking up relevant documentation…');
    const snippets: string[] = [];
    for (const match of matches) {
      if (token.isCancellationRequested) {
        return;
      }
      const docUri = vscode.Uri.joinPath(this.workspaceRoot, match.docPath);
      let text: string;
      try {
        text = await readFileText(docUri);
      } catch {
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

function extractSummary(text: string): string {
  const sections = ['## Purpose', '## Responsibilities', '## Code Structure'];
  const lines = text.split(/\r?\n/);
  const summaries: string[] = [];
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

function extractSection(lines: string[], header: string): string | undefined {
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
