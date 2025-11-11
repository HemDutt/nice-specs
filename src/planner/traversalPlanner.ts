import * as vscode from 'vscode';
import { DocGenConfig, FolderNode } from '../types';
import { isIgnored } from '../utils/path';
import { throwIfCancelled } from '../utils/cancellation';

const MAX_DEPTH = 50;

export class TraversalPlanner {
  constructor(private readonly config: DocGenConfig) {}

  async build(root: vscode.Uri, token: vscode.CancellationToken): Promise<FolderNode[]> {
    const queue: FolderNode[] = [
      { uri: root, name: 'root', depth: 0, children: [], files: [] }
    ];
    const result: FolderNode[] = [];

    while (queue.length > 0) {
      throwIfCancelled(token);
      const node = queue.shift()!;
      result.push(node);

      if (node.depth > MAX_DEPTH) {
        continue;
      }

      const entries = await vscode.workspace.fs.readDirectory(node.uri);
      for (const [name, type] of entries) {
        const childUri = vscode.Uri.joinPath(node.uri, name);
        if (isIgnored(childUri, this.config.workspaceRoot, this.config.ignoreGlobs)) {
          continue;
        }

        if (type === vscode.FileType.Directory) {
          const childNode: FolderNode = {
            uri: childUri,
            name,
            depth: node.depth + 1,
            children: [],
            files: [],
            parent: node
          };
          node.children.push(childNode);
          queue.push(childNode);
        } else if (type === vscode.FileType.File) {
          node.files.push(childUri);
          node.latestFileChange = await this.getLatestChange(node.latestFileChange, childUri);
        }
      }
    }

    return result;
  }

  private async getLatestChange(current: number | undefined, file: vscode.Uri): Promise<number> {
    try {
      const stat = await vscode.workspace.fs.stat(file);
      const latest = stat.mtime;
      return Math.max(current ?? 0, latest);
    } catch (error) {
      console.warn('Failed to stat file for traversal planner', error);
      return current ?? Date.now();
    }
  }
}
