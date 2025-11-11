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
exports.IndexStore = void 0;
const vscode = __importStar(require("vscode"));
const fs_1 = require("../utils/fs");
const INDEX_DIR = '.nicespecs';
const INDEX_FILE = 'index.json';
const STATE_DIR = 'state';
class IndexStore {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.touched = new Set();
        const dir = vscode.Uri.joinPath(workspaceRoot, INDEX_DIR);
        this.indexUri = vscode.Uri.joinPath(dir, INDEX_FILE);
        this.stateDir = vscode.Uri.joinPath(dir, STATE_DIR);
    }
    async ensureReady() {
        await vscode.workspace.fs.createDirectory(this.stateDir);
        try {
            await vscode.workspace.fs.readFile(this.indexUri);
        }
        catch {
            const initial = { lastRunAt: null, components: {} };
            await (0, fs_1.writeFileText)(this.indexUri, JSON.stringify(initial, null, 2));
        }
        this.state = await this.read();
    }
    beginRun() {
        this.touched.clear();
    }
    selectComponent(componentId) {
        return this.state?.components[componentId];
    }
    getLastRunTimestamp() {
        return this.state?.lastRunAt ?? null;
    }
    getLastCommit() {
        return this.state?.lastCommit;
    }
    async setLastCommit(commit) {
        if (!this.state) {
            return;
        }
        this.state.lastCommit = commit;
        await this.write();
    }
    listComponents() {
        if (!this.state) {
            return [];
        }
        return Object.entries(this.state.components).map(([id, record]) => ({ id, record }));
    }
    getInProgressComponent() {
        return this.state?.inProgress?.componentId;
    }
    getComponentSignature(componentId) {
        return this.state?.components[componentId]?.signature;
    }
    async markComponentComplete(componentId, payload) {
        if (!this.state) {
            return;
        }
        const record = {
            path: payload.folderPath,
            docPath: payload.docPath,
            children: payload.children,
            parents: payload.parents,
            lastUpdated: Date.now(),
            lastCost: payload.estimatedTokens,
            status: 'complete',
            signature: payload.signature
        };
        this.state.components[componentId] = record;
        this.touched.add(componentId);
        if (this.state.inProgress?.componentId === componentId) {
            delete this.state.inProgress;
        }
        await this.write();
        await this.clearRunState(componentId);
    }
    async finalizeRun() {
        if (!this.state) {
            return;
        }
        if (this.touched.size > 0) {
            for (const key of Object.keys(this.state.components)) {
                if (!this.touched.has(key)) {
                    delete this.state.components[key];
                }
            }
        }
        this.state.lastRunAt = Date.now();
        delete this.state.inProgress;
        await this.write();
        this.touched.clear();
    }
    async saveRunState(state) {
        if (!this.state) {
            return;
        }
        this.state.inProgress = {
            componentId: state.componentId,
            chunkPointer: state.chunkCursor
        };
        await this.write();
        const fileUri = this.stateFile(state.componentId);
        await (0, fs_1.writeFileText)(fileUri, JSON.stringify(state, null, 2));
    }
    async loadRunState(componentId) {
        try {
            const contents = await (0, fs_1.readFileText)(this.stateFile(componentId));
            return JSON.parse(contents);
        }
        catch {
            return undefined;
        }
    }
    async clearRunState(componentId) {
        try {
            await vscode.workspace.fs.delete(this.stateFile(componentId));
        }
        catch {
            // ignore
        }
    }
    async abandonRunState(componentId) {
        if (!this.state?.inProgress) {
            return;
        }
        const target = componentId ?? this.state.inProgress.componentId;
        await this.clearRunState(target);
        delete this.state.inProgress;
        await this.write();
    }
    async read() {
        const text = await (0, fs_1.readFileText)(this.indexUri);
        return JSON.parse(text);
    }
    async write() {
        if (!this.state) {
            return;
        }
        await (0, fs_1.writeFileText)(this.indexUri, JSON.stringify(this.state, null, 2));
    }
    stateFile(componentId) {
        return vscode.Uri.joinPath(this.stateDir, `${componentId}.json`);
    }
}
exports.IndexStore = IndexStore;
//# sourceMappingURL=indexStore.js.map