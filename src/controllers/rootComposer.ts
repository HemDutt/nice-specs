import * as vscode from 'vscode';
import { IndexStore } from '../persist/indexStore';
import { readFileText, writeFileText } from '../utils/fs';

interface TreeNode {
  id: string;
  path: string;
  docPath?: string;
  children: TreeNode[];
}

export class RootComposer {
  constructor(private readonly workspaceRoot: vscode.Uri, private readonly indexStore: IndexStore) {}

  async compose(): Promise<void> {
    const components = this.indexStore.listComponents();
    if (components.length === 0) {
      return;
    }

    const summaries = await loadComponentSummaries(components, this.workspaceRoot);
    const tree = buildTree(components);
    const lines: string[] = ['# Nice Specs Component Tree', '', '## Overview'];
    lines.push('This file summarizes the documentation generated for each component. Use it as the entry point for discovery.', '');
    lines.push('## Components');
    renderTree(tree, 0, lines, summaries);

    lines.push('', '## Index');
    for (const component of components.sort((a, b) => a.id.localeCompare(b.id))) {
      const link = component.record.docPath ? `./${component.record.docPath}` : component.record.path;
      const snippet = summaries.get(component.id);
      const summaryText = snippet ? ` — ${snippet}` : '';
      lines.push(`- [${component.id}](${link})${summaryText} (Last updated: ${new Date(component.record.lastUpdated).toISOString()})`);
    }

    const rootDoc = vscode.Uri.joinPath(this.workspaceRoot, 'nicespecs.root.md');
    await writeFileText(rootDoc, lines.join('\n'));
  }
}

function buildTree(components: ReturnType<IndexStore['listComponents']>): TreeNode {
  const nodes = new Map<string, TreeNode>();
  const root: TreeNode = { id: 'root', path: '', children: [] };

  const getNode = (id: string, pathValue = '', docPath?: string): TreeNode => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, path: pathValue, docPath, children: [] });
    }
    return nodes.get(id)!;
  };

  for (const component of components) {
    const node = getNode(component.id, component.record.path, component.record.docPath);
    node.path = component.record.path;
    node.docPath = component.record.docPath;
  }

  for (const component of components) {
    const node = getNode(component.id);
    const parentId = component.record.parents?.[0];
    if (component.record.path === '') {
      // Workspace root: show its children at the top level instead of itself
      node.children.forEach((child) => {
        if (!root.children.includes(child)) {
          root.children.push(child);
        }
      });
      continue;
    }
    if (parentId && nodes.has(parentId)) {
      const parent = nodes.get(parentId)!;
      if (!parent.children.includes(node)) {
        parent.children.push(node);
      }
    } else {
      if (!root.children.includes(node)) {
        root.children.push(node);
      }
    }
  }

  return root;
}

function renderTree(node: TreeNode, depth: number, lines: string[], summaries: Map<string, string>): void {
  if (node.id !== 'root') {
    const label = node.docPath ? `[${node.id}](${node.docPath})` : node.id;
    const summary = summaries.get(node.id);
    const suffix = summary ? ` — ${summary}` : '';
    lines.push(`${'  '.repeat(depth)}- ${label}${suffix}`);
  }
  for (const child of node.children.sort((a, b) => a.id.localeCompare(b.id))) {
    renderTree(child, node.id === 'root' ? depth : depth + 1, lines, summaries);
  }
}

async function loadComponentSummaries(components: ReturnType<IndexStore['listComponents']>, workspaceRoot: vscode.Uri): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();
  for (const component of components) {
    if (!component.record.docPath) {
      continue;
    }
    try {
      const docUri = vscode.Uri.joinPath(workspaceRoot, component.record.docPath);
      const text = await readFileText(docUri);
      const snippet = summarizeDoc(text);
      if (snippet) {
        summaries.set(component.id, snippet);
      }
    } catch {
      // ignore missing docs
    }
  }
  return summaries;
}

function summarizeDoc(markdown: string): string | undefined {
  const purpose = extractSection(markdown, '## Purpose') ?? extractSection(markdown, '## Overview');
  if (!purpose) {
    return undefined;
  }
  const cleaned = purpose
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  if (!cleaned) {
    return undefined;
  }
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
}

function extractSection(markdown: string, header: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === header.toLowerCase());
  if (start === -1) {
    return undefined;
  }
  const end = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const slice = end === -1 ? lines.slice(start + 1) : lines.slice(start + 1, start + 1 + end);
  const filtered = slice.map((line) => line.trim()).filter(Boolean);
  return filtered.length ? filtered.join('\n') : undefined;
}
