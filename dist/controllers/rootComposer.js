"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RootComposer = void 0;
const vscode = __importStar(require("vscode"));
const fs_1 = require("../utils/fs");
class RootComposer {
    constructor(workspaceRoot, indexStore) {
        this.workspaceRoot = workspaceRoot;
        this.indexStore = indexStore;
    }
    async compose() {
        const components = this.indexStore.listComponents();
        if (components.length === 0) {
            return;
        }
        const summaries = await loadComponentSummaries(components, this.workspaceRoot);
        const tree = buildTree(components);
        const lines = ['# Nice Specs Component Tree', '', '## Overview'];
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
        await (0, fs_1.writeFileText)(rootDoc, lines.join('\n'));
    }
}
exports.RootComposer = RootComposer;
function buildTree(components) {
    const nodes = new Map();
    const root = { id: 'root', path: '', children: [] };
    const getNode = (id, pathValue = '', docPath) => {
        if (!nodes.has(id)) {
            nodes.set(id, { id, path: pathValue, docPath, children: [] });
        }
        return nodes.get(id);
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
            const parent = nodes.get(parentId);
            if (!parent.children.includes(node)) {
                parent.children.push(node);
            }
        }
        else {
            if (!root.children.includes(node)) {
                root.children.push(node);
            }
        }
    }
    return root;
}
function renderTree(node, depth, lines, summaries) {
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
async function loadComponentSummaries(components, workspaceRoot) {
    const summaries = new Map();
    for (const component of components) {
        if (!component.record.docPath) {
            continue;
        }
        try {
            const docUri = vscode.Uri.joinPath(workspaceRoot, component.record.docPath);
            const text = await (0, fs_1.readFileText)(docUri);
            const snippet = summarizeDoc(text);
            if (snippet) {
                summaries.set(component.id, snippet);
            }
        }
        catch {
            // ignore missing docs
        }
    }
    return summaries;
}
function summarizeDoc(markdown) {
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
function extractSection(markdown, header) {
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
//# sourceMappingURL=rootComposer.js.map