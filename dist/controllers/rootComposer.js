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
        const tree = buildTree(components);
        const lines = ['# Nice Specs Component Tree', '', '## Overview'];
        lines.push('This file summarizes the documentation generated for each component. Use it as the entry point for discovery.', '');
        lines.push('## Components');
        renderTree(tree, 0, lines);
        lines.push('', '## Index');
        for (const component of components.sort((a, b) => a.id.localeCompare(b.id))) {
            const link = component.record.docPath ? `./${component.record.docPath}` : component.record.path;
            lines.push(`- [${component.id}](${link}) (Last updated: ${new Date(component.record.lastUpdated).toISOString()})`);
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
function renderTree(node, depth, lines) {
    if (node.id !== 'root') {
        const label = node.docPath ? `[${node.id}](${node.docPath})` : node.id;
        lines.push(`${'  '.repeat(depth)}- ${label}`);
    }
    for (const child of node.children.sort((a, b) => a.id.localeCompare(b.id))) {
        renderTree(child, node.id === 'root' ? depth : depth + 1, lines);
    }
}
//# sourceMappingURL=rootComposer.js.map