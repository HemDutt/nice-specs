import * as vscode from 'vscode';
import { ChunkInfo, LedgerFact, SymbolIndexRecord } from '../../types';
import { workspaceRelativePath } from '../../utils/path';
import { CodeAnalysisAgent } from '../doc-generation-pipeline/codeAnalysisAgent';
import { PersonaClient } from '../personaClient';
import { HarvesterResult } from './types';

export class SymbolHarvester {
  private readonly analyst: CodeAnalysisAgent;

  constructor(persona: PersonaClient) {
    this.analyst = new CodeAnalysisAgent(persona);
  }

  async harvest(componentId: string, chunks: ChunkInfo[], token: vscode.CancellationToken): Promise<HarvesterResult> {
    const facts: LedgerFact[] = await this.analyst.analyze(chunks, token);
    const symbolsByFile: HarvesterResult['symbolsByFile'] = {};
    const symbolIndex: SymbolIndexRecord[] = [];
    const chunkSummary = new Map(facts.map((fact) => [fact.chunkId, fact.summary]));

    for (const chunk of chunks) {
      const symbols = extractSymbols(chunk.text);
      if (!symbols.length) {
        continue;
      }
      const filePath = workspaceRelativePath(chunk.file);
      const factSummary = chunkSummary.get(chunk.id);
      const entries = symbols.map((symbol) => ({
        name: symbol.name,
        kind: symbol.kind,
        description: factSummary ?? symbol.description,
        chunkId: chunk.id
      }));
      if (!symbolsByFile[filePath]) {
        symbolsByFile[filePath] = [];
      }
      symbolsByFile[filePath].push(...entries);
      for (const entry of entries) {
        symbolIndex.push({
          componentId,
          file: filePath,
          symbol: entry.name,
          kind: entry.kind,
          description: entry.description,
          chunkId: entry.chunkId
        });
      }
    }

    return {
      facts,
      symbolsByFile,
      symbolIndex
    };
  }
}

const CLASS_REGEX = /\bclass\s+([A-Z][\w\d_]*)/g;
const INTERFACE_REGEX = /\binterface\s+([A-Z][\w\d_]*)/g;
const ENUM_REGEX = /\benum\s+([A-Z][\w\d_]*)/g;
const TYPE_REGEX = /\btype\s+([A-Z][\w\d_]*)/g;
const FUNCTION_REGEX = /\bfunction\s+([a-zA-Z_][\w\d_]*)/g;

function extractSymbols(text: string) {
  const results: Array<{ name: string; kind: string; description: string }> = [];
  collect(results, text, CLASS_REGEX, 'class');
  collect(results, text, INTERFACE_REGEX, 'interface');
  collect(results, text, ENUM_REGEX, 'enum');
  collect(results, text, TYPE_REGEX, 'type');
  collect(results, text, FUNCTION_REGEX, 'function');
  return results;
}

function collect(target: Array<{ name: string; kind: string; description: string }>, text: string, regex: RegExp, kind: string) {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    target.push({ name: match[1], kind, description: `${kind} ${match[1]}` });
  }
}
