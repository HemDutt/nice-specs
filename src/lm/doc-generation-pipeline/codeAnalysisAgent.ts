import * as vscode from 'vscode';
import { ChunkInfo, LedgerFact } from '../../types';
import { workspaceRelativePath } from '../../utils/path';
import { logDebug, logWarn } from '../../utils/logger';
import { PersonaClient, safeJsonParse } from '../personaClient';

const DEFAULT_ANALYST_BATCH_SIZE = 4;
const MAX_CHUNK_CHARS = 1600;

export class CodeAnalysisAgent {
  constructor(private readonly persona: PersonaClient, private readonly batchSize = DEFAULT_ANALYST_BATCH_SIZE) {}

  async analyze(
    chunks: ChunkInfo[],
    token: vscode.CancellationToken,
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
    progressLabel?: string
  ): Promise<LedgerFact[]> {
    const facts: LedgerFact[] = [];
    if (!chunks.length) {
      return facts;
    }
    const totalBatches = Math.ceil(chunks.length / this.batchSize);

    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batchIndex = i / this.batchSize;
      const batch = chunks.slice(i, i + this.batchSize);
      if (progress && progressLabel) {
        const fileList = batch
          .map((chunk) => workspaceRelativePath(chunk.file))
          .filter(Boolean)
          .slice(0, 2)
          .join(', ');
        const fileHint = fileList ? ` – ${fileList}${batch.length > 2 ? ', …' : ''}` : '';
        progress.report({ message: `${progressLabel} – Analyzing code (${batchIndex + 1}/${totalBatches})${fileHint}` });
      }
      const batchStart = Date.now();
      logDebug(`CodeAnalysis: starting batch ${batchIndex + 1}/${totalBatches} (${batch.length} chunks)`); 
      const prompt = this.buildPrompt(batch);
      const response = await this.persona.invoke('CodeAnalyst', prompt, token, 'Analyze code chunks for documentation');
      const json = safeJsonParse<Record<string, AnalystChunkSummary>>(response);
      if (!json) {
        logWarn(`CodeAnalysis: received invalid JSON for batch ${batchIndex + 1}/${totalBatches}`);
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

      logDebug(`CodeAnalysis: finished batch ${batchIndex + 1}/${totalBatches} in ${Date.now() - batchStart}ms (facts so far: ${facts.length})`);
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
