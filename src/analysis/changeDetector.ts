import * as path from 'path';
import * as vscode from 'vscode';
import { FolderNode, SelectedComponent } from '../types';
import { IndexStore } from '../persist/indexStore';
import { SignatureScanner } from './signatureScanner';
import { componentIdFromUri, workspaceRelativePath } from '../utils/path';
import { throwIfCancelled } from '../utils/cancellation';
import { getChangedFilesSince } from '../utils/git';

const SEMANTIC_KEYWORDS = ['if', 'else', 'switch', 'return', 'class', 'function', 'async', 'await', 'throw', 'implements', 'extends', 'export', 'import', 'public', 'private'];
const CONTRACT_KEYWORDS = ['export', 'implements', 'extends', 'interface', 'type'];

export class ChangeDetector {
  constructor(private readonly indexStore: IndexStore, private readonly workspaceRoot: vscode.Uri, private readonly signatureScanner: SignatureScanner) {}

  async selectTargets(nodes: FolderNode[], token: vscode.CancellationToken, force?: boolean): Promise<SelectedComponent[]> {
    const targets: SelectedComponent[] = [];
    const resumeComponent = this.indexStore.getInProgressComponent();
    const lastCommit = this.indexStore.getLastCommit();
    const folderMap = new Map<string, FolderNode>();
    nodes.forEach((node) => folderMap.set(workspaceRelativePath(node.uri, this.workspaceRoot), node));
    const gitCandidates = lastCommit ? await this.collectGitCandidates(folderMap, lastCommit) : new Set<string>();

    for (const node of nodes) {
      throwIfCancelled(token);
      const componentId = componentIdFromUri(node.uri, this.workspaceRoot);
      if (resumeComponent && componentId !== resumeComponent) {
        continue;
      }

      const signature = await this.signatureScanner.computeSignature(node);
      if (force || gitCandidates.has(componentId) || this.signatureChanged(componentId, signature)) {
        targets.push({ node, signature });
      }
    }

    return targets;
  }

  private signatureChanged(componentId: string, signature: string): boolean {
    const record = this.indexStore.selectComponent(componentId);
    if (!record) {
      return true;
    }
    return record.signature !== signature;
  }

  private async collectGitCandidates(folderMap: Map<string, FolderNode>, lastCommit: string): Promise<Set<string>> {
    const candidates = new Set<string>();
    const changes = await getChangedFilesSince(this.workspaceRoot, lastCommit);
    for (const change of changes) {
      const folder = this.locateFolderForFile(change.file, folderMap);
      if (!folder) {
        continue;
      }
      const componentId = componentIdFromUri(folder.uri, this.workspaceRoot);
      if (isSemanticChange(change.diff)) {
        candidates.add(componentId);
        if (touchesContract(change.diff)) {
          const parentId = parentComponent(componentId);
          if (parentId) {
            candidates.add(parentId);
          }
        }
      }
    }
    return candidates;
  }

  private locateFolderForFile(file: string, folderMap: Map<string, FolderNode>): FolderNode | undefined {
    const normalized = file.replace(/\\/g, '/');
    let current = normalized;
    while (current.length > 0) {
      if (folderMap.has(current)) {
        return folderMap.get(current);
      }
      const idx = current.lastIndexOf('/');
      if (idx < 0) {
        break;
      }
      current = current.slice(0, idx);
    }
    return folderMap.get('');
  }
}

function isSemanticChange(diff: string): boolean {
  const lines = diff.split(/\r?\n/);
  return lines.some((line) => {
    if (!line.startsWith('+') && !line.startsWith('-')) {
      return false;
    }
    const trimmed = line.slice(1).trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      return false;
    }
    return SEMANTIC_KEYWORDS.some((keyword) => trimmed.includes(keyword));
  });
}

function touchesContract(diff: string): boolean {
  return diff.split(/\r?\n/).some((line) => CONTRACT_KEYWORDS.some((keyword) => line.includes(keyword)));
}

function parentComponent(componentId: string): string | undefined {
  const parts = componentId.split('.');
  if (parts.length <= 1) {
    return undefined;
  }
  return parts.slice(0, -1).join('.');
}
