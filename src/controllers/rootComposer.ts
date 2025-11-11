import * as vscode from 'vscode';
import { IndexStore } from '../persist/indexStore';
import { writeFileText } from '../utils/fs';

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

    const tree = buildTree(components);
    const lines: string[] = ['# Nice Specs Component Tree', '', '## Overview'];
    lines.push('This file summarizes the documentation generated for each component. Use it as the entry point for discovery.', '');
    lines.push('## Components');
    renderTree(tree, 0, lines);

    lines.push('', '## Index');
    for (const component of components.sort((a, b) => a.id.localeCompare(b.id))) {
      const link = component.record.docPath ? `./${component.record.docPath}` : component.record.path;
      lines.push(`- [${component.id}](${link}) (Last updated: ${new Date(component.record.lastUpdated).toISOString()})`);
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

function renderTree(node: TreeNode, depth: number, lines: string[]): void {
  if (node.id !== 'root') {
    const label = node.docPath ? `[${node.id}](${node.docPath})` : node.id;
    lines.push(`${'  '.repeat(depth)}- ${label}`);
  }
  for (const child of node.children.sort((a, b) => a.id.localeCompare(b.id))) {
    renderTree(child, node.id === 'root' ? depth : depth + 1, lines);
  }
}
