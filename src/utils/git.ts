import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

export async function getHeadCommit(workspaceRoot: vscode.Uri): Promise<string | undefined> {
  try {
    const result = await runGit(workspaceRoot, ['rev-parse', 'HEAD']);
    return result.trim();
  } catch {
    return undefined;
  }
}

export interface GitChange {
  file: string;
  diff: string;
}

export async function getChangedFilesSince(workspaceRoot: vscode.Uri, sinceCommit: string): Promise<GitChange[]> {
  try {
    const namesRaw = await runGit(workspaceRoot, ['diff', '--name-only', `${sinceCommit}..HEAD`]);
    const files = namesRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const changes: GitChange[] = [];
    for (const file of files) {
      try {
        const diff = await runGit(workspaceRoot, ['diff', '--unified=0', `${sinceCommit}..HEAD`, '--', file]);
        changes.push({ file, diff });
      } catch {
        // ignore missing files
      }
    }
    return changes;
  } catch {
    return [];
  }
}

async function runGit(workspaceRoot: vscode.Uri, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: workspaceRoot.fsPath }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}
