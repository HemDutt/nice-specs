import * as path from 'path';
import * as vscode from 'vscode';
import { throwIfCancelled } from '../utils/cancellation';

export class CleanupController {
  async run(token: vscode.CancellationToken, progress?: vscode.Progress<{ message?: string; increment?: number }>): Promise<{ deletedFiles: number }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('Open a workspace folder before running cleanup.');
    }

    const files = await this.findDocs(workspaceFolder.uri, token);
    let deleted = 0;
    for (const file of files) {
      throwIfCancelled(token);
      progress?.report({ message: `Deleting ${path.basename(file.fsPath)}` });
      await vscode.workspace.fs.delete(file, { useTrash: false });
      deleted += 1;
    }

    const nicespecsDir = vscode.Uri.joinPath(workspaceFolder.uri, '.nicespecs');
    try {
      await vscode.workspace.fs.delete(nicespecsDir, { recursive: true, useTrash: false });
    } catch {
      // ignore missing dir
    }

    const rootDoc = vscode.Uri.joinPath(workspaceFolder.uri, 'nicespecs.root.md');
    try {
      await vscode.workspace.fs.delete(rootDoc, { useTrash: false });
      deleted += 1;
    } catch {
      // ignore
    }

    return { deletedFiles: deleted };
  }

  private async findDocs(root: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.Uri[]> {
    const results: vscode.Uri[] = [];
    const entries = await vscode.workspace.fs.readDirectory(root);
    for (const [name, type] of entries) {
      throwIfCancelled(token);
      if (type === vscode.FileType.Directory) {
        if (name === '.git' || name === 'node_modules' || name === '.nicespecs') {
          continue;
        }
        const childResults = await this.findDocs(vscode.Uri.joinPath(root, name), token);
        results.push(...childResults);
      } else if (name.startsWith('nicespecs.') && name.endsWith('.md')) {
        results.push(vscode.Uri.joinPath(root, name));
      }
    }
    return results;
  }
}
