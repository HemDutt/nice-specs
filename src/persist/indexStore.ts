import * as vscode from 'vscode';
import { ComponentRunState } from '../types';
import { readFileText, writeFileText } from '../utils/fs';

interface ComponentRecord {
  path: string;
  docPath: string;
  children: string[];
  parents: string[];
  lastUpdated: number;
  lastCost: number;
  status: 'pending' | 'complete';
  signature?: string;
}

interface IndexFile {
  lastRunAt: number | null;
  lastCommit?: string;
  components: Record<string, ComponentRecord>;
  inProgress?: {
    componentId: string;
    chunkPointer: number;
  };
}

const INDEX_DIR = '.nicespecs';
const INDEX_FILE = 'index.json';
const STATE_DIR = 'state';

export class IndexStore {
  private readonly indexUri: vscode.Uri;
  private readonly stateDir: vscode.Uri;
  private state: IndexFile | undefined;
  private touched = new Set<string>();

  constructor(private readonly workspaceRoot: vscode.Uri) {
    const dir = vscode.Uri.joinPath(workspaceRoot, INDEX_DIR);
    this.indexUri = vscode.Uri.joinPath(dir, INDEX_FILE);
    this.stateDir = vscode.Uri.joinPath(dir, STATE_DIR);
  }

  async ensureReady(): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.stateDir);
    try {
      await vscode.workspace.fs.readFile(this.indexUri);
    } catch {
      const initial: IndexFile = { lastRunAt: null, components: {} };
      await writeFileText(this.indexUri, JSON.stringify(initial, null, 2));
    }
    this.state = await this.read();
  }

  beginRun(): void {
    this.touched.clear();
  }

  selectComponent(componentId: string): ComponentRecord | undefined {
    return this.state?.components[componentId];
  }

  getLastRunTimestamp(): number | null {
    return this.state?.lastRunAt ?? null;
  }

  getLastCommit(): string | undefined {
    return this.state?.lastCommit;
  }

  async setLastCommit(commit: string): Promise<void> {
    if (!this.state) {
      return;
    }
    this.state.lastCommit = commit;
    await this.write();
  }

  listComponents(): Array<{ id: string; record: ComponentRecord }> {
    if (!this.state) {
      return [];
    }
    return Object.entries(this.state.components).map(([id, record]) => ({ id, record }));
  }

  getInProgressComponent(): string | undefined {
    return this.state?.inProgress?.componentId;
  }

  getComponentSignature(componentId: string): string | undefined {
    return this.state?.components[componentId]?.signature;
  }

  async markComponentComplete(componentId: string, payload: { folderPath: string; docPath: string; estimatedTokens: number; children: string[]; parents: string[]; signature: string }): Promise<void> {
    if (!this.state) {
      return;
    }

    const record: ComponentRecord = {
      path: payload.folderPath,
      docPath: payload.docPath,
      children: payload.children,
      parents: payload.parents,
      lastUpdated: Date.now(),
      lastCost: payload.estimatedTokens,
      status: 'complete',
      signature: payload.signature
    };

    this.state.components[componentId] = record;
    this.touched.add(componentId);
    if (this.state.inProgress?.componentId === componentId) {
      delete this.state.inProgress;
    }
    await this.write();
    await this.clearRunState(componentId);
  }

  async finalizeRun(): Promise<void> {
    if (!this.state) {
      return;
    }
    if (this.touched.size > 0) {
      for (const key of Object.keys(this.state.components)) {
        if (!this.touched.has(key)) {
          delete this.state.components[key];
        }
      }
    }
    this.state.lastRunAt = Date.now();
    delete this.state.inProgress;
    await this.write();
    this.touched.clear();
  }

  async saveRunState(state: ComponentRunState): Promise<void> {
    if (!this.state) {
      return;
    }
    this.state.inProgress = {
      componentId: state.componentId,
      chunkPointer: state.chunkCursor
    };
    await this.write();
    const fileUri = this.stateFile(state.componentId);
    await writeFileText(fileUri, JSON.stringify(state, null, 2));
  }

  async loadRunState(componentId: string): Promise<ComponentRunState | undefined> {
    try {
      const contents = await readFileText(this.stateFile(componentId));
      return JSON.parse(contents) as ComponentRunState;
    } catch {
      return undefined;
    }
  }

  async clearRunState(componentId: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.stateFile(componentId));
    } catch {
      // ignore
    }
  }

  async abandonRunState(componentId?: string): Promise<void> {
    if (!this.state?.inProgress) {
      return;
    }
    const target = componentId ?? this.state.inProgress.componentId;
    await this.clearRunState(target);
    delete this.state.inProgress;
    await this.write();
  }

  private async read(): Promise<IndexFile> {
    const text = await readFileText(this.indexUri);
    return JSON.parse(text) as IndexFile;
  }

  private async write(): Promise<void> {
    if (!this.state) {
      return;
    }
    await writeFileText(this.indexUri, JSON.stringify(this.state, null, 2));
  }

  private stateFile(componentId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.stateDir, `${componentId}.json`);
  }
}
