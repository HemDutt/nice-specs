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
exports.TraversalPlanner = void 0;
const vscode = __importStar(require("vscode"));
const path_1 = require("../utils/path");
const cancellation_1 = require("../utils/cancellation");
const MAX_DEPTH = 50;
class TraversalPlanner {
    constructor(config) {
        this.config = config;
    }
    async build(root, token) {
        const queue = [
            { uri: root, name: 'root', depth: 0, children: [], files: [] }
        ];
        const result = [];
        while (queue.length > 0) {
            (0, cancellation_1.throwIfCancelled)(token);
            const node = queue.shift();
            result.push(node);
            if (node.depth > MAX_DEPTH) {
                continue;
            }
            const entries = await vscode.workspace.fs.readDirectory(node.uri);
            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(node.uri, name);
                if ((0, path_1.isIgnored)(childUri, this.config.workspaceRoot, this.config.ignoreGlobs)) {
                    continue;
                }
                if (type === vscode.FileType.Directory) {
                    const childNode = {
                        uri: childUri,
                        name,
                        depth: node.depth + 1,
                        children: [],
                        files: [],
                        parent: node
                    };
                    node.children.push(childNode);
                    queue.push(childNode);
                }
                else if (type === vscode.FileType.File) {
                    node.files.push(childUri);
                    node.latestFileChange = await this.getLatestChange(node.latestFileChange, childUri);
                }
            }
        }
        return result;
    }
    async getLatestChange(current, file) {
        try {
            const stat = await vscode.workspace.fs.stat(file);
            const latest = stat.mtime;
            return Math.max(current ?? 0, latest);
        }
        catch (error) {
            console.warn('Failed to stat file for traversal planner', error);
            return current ?? Date.now();
        }
    }
}
exports.TraversalPlanner = TraversalPlanner;
//# sourceMappingURL=traversalPlanner.js.map