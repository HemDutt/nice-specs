import * as vscode from 'vscode';

export interface DocGenConfig {
  workspaceRoot: vscode.Uri;
  ignoreGlobs: string[];
  chunkSizeTokens: number;
  chunkOverlapTokens: number;
  tokenBudget: number;
  reviewerEnabled: boolean;
  maxFileSizeBytes: number;
  minChunkLines: number;
  maxChunkLines: number;
  signatureSampleLines: number;
}

export interface FolderNode {
  uri: vscode.Uri;
  name: string;
  depth: number;
  children: FolderNode[];
  files: vscode.Uri[];
  parent?: FolderNode;
  latestFileChange?: number;
}

export interface ChunkInfo {
  id: string;
  file: vscode.Uri;
  languageId: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface ChildSummary {
  componentId: string;
  docPath: vscode.Uri;
  synopsis: string;
  relativeLink: string;
  sections: Record<string, string>;
}

export interface LedgerFact {
  chunkId: string;
  file: string;
  startLine: number;
  endLine: number;
  summary: string;
  responsibilities: string[];
  dependencies: {
    internal: string[];
    external: string[];
  };
  tags: string[];
  analysis?: string[];
}

export interface ComponentLedger {
  componentId: string;
  folderPath: string;
  files: string[];
  facts: LedgerFact[];
  childSummaries: ChildSummary[];
  tags: string[];
  plan?: DocPlan;
}

export interface DocMetadata {
  component: string;
  path: string;
  parents: string[];
  children: string[];
  lastUpdated: string;
  tags: string[];
}

export interface DocDraft {
  componentId: string;
  docFile: vscode.Uri;
  markdown: string;
  metadata: DocMetadata;
  estimatedTokens: number;
  symbolIndex: SymbolIndexRecord[];
}

export interface DocRunOptions {
  model: vscode.LanguageModelChat | undefined;
  token: vscode.CancellationToken;
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
  force?: boolean;
  requireApproval?: boolean;
  resume?: boolean;
}

export interface RunSummary {
  processed: number;
  skipped: number;
  costEstimate: number;
  message: string;
}

export interface ComponentRunState {
  componentId: string;
  folderPath: string;
  chunkCursor: number;
  facts: LedgerFact[];
  childSummaries: Array<Pick<ChildSummary, 'componentId' | 'relativeLink' | 'synopsis' | 'sections'>>;
  tags: string[];
  constraints?: string;
  plan?: DocPlan;
}

export interface SelectedComponent {
  node: FolderNode;
  signature: string;
}

export interface SynthesizedDoc {
  summary: string;
  purpose: string;
  responsibilities: string[];
  fileInventory: FileInventoryEntry[];
  codeStructureSynopsis: string;
  codeStructure: Array<{ file: string; summary: string }>;
  dataFlow: string;
  dependencies: {
    internal: string[];
    external: string[];
  };
  childComponents: Array<{ name: string; link: string; description: string }>;
  operationalNotes: string[];
  risks: string[];
  changelog: Array<{ date: string; note: string }>;
  tags: string[];
}

export interface FileInventoryEntry {
  file: string;
  synopsis: string;
  symbols: SymbolInventoryEntry[];
}

export interface SymbolInventoryEntry {
  name: string;
  kind: string;
  description: string;
  chunkId?: string;
}

export interface SymbolIndexRecord {
  componentId: string;
  file: string;
  symbol: string;
  kind: string;
  description: string;
  chunkId?: string;
}

export type PersonaRole = 'DocOrchestrator' | 'CodeAnalyst' | 'DocSynthesizer' | 'QualityReviewer';

export interface DocPlan {
  objectives: string[];
  steps: string[];
  risks: string[];
}
