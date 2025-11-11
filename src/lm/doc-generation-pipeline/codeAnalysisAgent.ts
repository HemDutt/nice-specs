import * as vscode from 'vscode';
import { ChunkInfo, LedgerFact } from '../../types';
import { workspaceRelativePath } from '../../utils/path';
import { PersonaClient, safeJsonParse } from '../personaClient';

const DEFAULT_ANALYST_BATCH_SIZE = 4;
const MAX_CHUNK_CHARS = 1600;

export class CodeAnalysisAgent {
  constructor(private readonly persona: PersonaClient, private readonly batchSize = DEFAULT_ANALYST_BATCH_SIZE) {}

  async analyze(chunks: ChunkInfo[], token: vscode.CancellationToken): Promise<LedgerFact[]> {
    const facts: LedgerFact[] = [];

    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, i + this.batchSize);
      const prompt = this.buildPrompt(batch);
      const response = await this.persona.invoke('CodeAnalyst', prompt, token, 'Analyze code chunks for documentation');
      const json = safeJsonParse<Record<string, AnalystChunkSummary>>(response);
      if (!json) {
        continue;
      }

      for (const chunk of batch) {
        const summary = json[chunk.id];
        if (!summary) {
          continue;
        }
        facts.push({
          chunkId: chunk.id,
          file: workspaceRelativePath(chunk.file),
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          summary: summary.summary,
          responsibilities: summary.responsibilities,
          dependencies: summary.dependencies,
          tags: summary.tags,
          analysis: summary.analysis
        });
      }
    }

    return facts;
  }

  private buildPrompt(chunks: ChunkInfo[]): string {
    const chunkText = chunks
      .map((chunk) => {
        const snippet = chunk.text.slice(0, MAX_CHUNK_CHARS);
        return `Chunk ${chunk.id} (${workspaceRelativePath(chunk.file)} lines ${chunk.startLine}-${chunk.endLine}):\n"""\n${snippet}\n"""`;
      })
      .join('\n\n');

    return `You are CodeAnalyst. For each chunk, think through these hypotheses: API surface, data flow, dependencies, failure handling. After reasoning, output STRICT JSON with this shape:
{
  "<chunkId>": {
    "analysis": [string], // bullet thoughts describing hypotheses you considered
    "summary": string,
    "responsibilities": [string],
    "dependencies": { "internal": [string], "external": [string] },
    "tags": [string]
  }
}
Only return JSON. Provide at least two analysis bullets per chunk.

${chunkText}`;
  }
}

interface AnalystChunkSummary {
  analysis: string[];
  summary: string;
  responsibilities: string[];
  dependencies: {
    internal: string[];
    external: string[];
  };
  tags: string[];
}
