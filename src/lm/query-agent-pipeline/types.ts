import * as vscode from 'vscode';
import { ChunkInfo, ChildSummary, LedgerFact, SymbolIndexRecord, SymbolInventoryEntry, FolderNode } from '../../types';

export interface ScopeProfile {
  componentId: string;
  folderPath: string;
  parents: string[];
  children: string[];
  summary: string;
  tags: string[];
  folder: FolderNode;
}

export interface FileDescriptor {
  path: string;
  size: number;
  isCode: boolean;
}

export interface FileInventoryDraft {
  files: FileDescriptor[];
  chunks: ChunkInfo[];
}

export interface HarvesterResult {
  facts: LedgerFact[];
  symbolsByFile: Record<string, SymbolInventoryEntry[]>;
  symbolIndex: SymbolIndexRecord[];
}

export interface SectionPlan {
  summary: string;
  purpose: string;
  responsibilities: string[];
  fileInventory: Array<{
    file: string;
    synopsis: string;
    symbols: SymbolInventoryEntry[];
  }>;
  codeStructureSynopsis: string;
  dataFlow: string;
  dependencies: {
    internal: string[];
    external: string[];
  };
  operationalNotes: string[];
  risks: string[];
  changelog: Array<{ date: string; note: string }>;
  tags: string[];
}

export interface CompositionContext {
  plan: SectionPlan;
  scope: ScopeProfile;
  childSummaries: ChildSummary[];
  facts: LedgerFact[];
}

export interface ReviewGateResult {
  status: 'accept' | 'rework';
  feedback?: string;
}

export interface ModularDraftResult {
  scope: ScopeProfile;
  plan: SectionPlan;
  facts: LedgerFact[];
  childSummaries: ChildSummary[];
  symbolIndex: SymbolIndexRecord[];
}
