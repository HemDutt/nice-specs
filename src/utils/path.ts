import * as path from 'path';
import * as vscode from 'vscode';

const ALWAYS_IGNORED_SEGMENTS = new Set([
  'node_modules',
  'bower_components',
  '.git',
  '.github',
  '.idea',
  '.vscode',
  '.nicespecs',
  'dist',
  'out',
  'build',
  '.next',
  '.turbo',
  'vendor',
  'third_party',
  'third-party',
  'external',
  '__pycache__',
  '.venv'
]);

export function isIgnored(uri: vscode.Uri, root: vscode.Uri, ignoreGlobs: string[]): boolean {
  const relative = workspaceRelativePath(uri, root);
  if (!relative) {
    return false;
  }
  const segments = relative.split(/[\\/]/).filter(Boolean);
  return segments.some((segment) => ALWAYS_IGNORED_SEGMENTS.has(segment)) || ignoreGlobs.some((glob) => segments.includes(glob));
}

export function componentIdFromUri(uri: vscode.Uri, root: vscode.Uri): string {
  const relative = workspaceRelativePath(uri, root) || '';
  if (!relative) {
    return rootComponentId();
  }
  return relative
    .split(/[\\/]/)
    .filter(Boolean)
    .map((segment) => segment.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_-]/g, '-'))
    .join('.');
}

export function docFileForFolder(folder: vscode.Uri): vscode.Uri {
  const name = folder.path.split('/').filter(Boolean).pop() ?? rootComponentId();
  const normalized = name.toLowerCase();
  return vscode.Uri.joinPath(folder, `nicespecs.${normalized}.md`);
}

export function relativeLink(from: vscode.Uri, to: vscode.Uri): string {
  const relative = path.relative(path.dirname(from.fsPath), to.fsPath);
  if (!relative || relative.startsWith('..')) {
    return path.basename(to.fsPath);
  }
  return relative.replace(/\\/g, '/');
}

export function workspaceRelativePath(uri: vscode.Uri, root?: vscode.Uri): string {
  const baseUri = root ?? vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!baseUri) {
    return uri.fsPath;
  }
  let relative = path.relative(baseUri.fsPath, uri.fsPath);
  if (!relative || relative === '.') {
    return '';
  }
  return relative.replace(/\\/g, '/');
}

function rootComponentId(): string {
  const workspaceName = vscode.workspace.name;
  return workspaceName ? workspaceName.replace(/\s+/g, '-').toLowerCase() : 'root';
}
