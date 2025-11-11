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
exports.EmbeddingStore = void 0;
const vscode = __importStar(require("vscode"));
const path_1 = require("../utils/path");
const STORAGE_DIR = '.nicespecs';
const SQLITE_FILE = 'embeddings.sqlite';
class EmbeddingStore {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.dbPath = vscode.Uri.joinPath(workspaceRoot, STORAGE_DIR, SQLITE_FILE);
    }
    async ensureReady() {
        if (this.db) {
            return;
        }
        const sqlite = await loadSqliteModule();
        if (!sqlite) {
            throw new Error('SQLite module unavailable; cannot initialize embedding store.');
        }
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.workspaceRoot, STORAGE_DIR));
        this.db = new sqlite.DatabaseSync(this.dbPath.fsPath);
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        doc_path TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        updated INTEGER NOT NULL
      );
    `);
    }
    async upsert(docUri, text) {
        await this.ensureReady();
        const vector = embedText(text);
        const relative = (0, path_1.workspaceRelativePath)(docUri, this.workspaceRoot);
        const stmt = this.db.prepare(`INSERT INTO embeddings (doc_path, vector, updated)
       VALUES (?, ?, ?)
       ON CONFLICT(doc_path) DO UPDATE SET vector = excluded.vector, updated = excluded.updated`);
        stmt.run(relative, JSON.stringify(vector), Date.now());
    }
    async delete(docUri) {
        await this.ensureReady();
        const relative = (0, path_1.workspaceRelativePath)(docUri, this.workspaceRoot);
        const stmt = this.db.prepare('DELETE FROM embeddings WHERE doc_path = ?');
        stmt.run(relative);
    }
    async query(text, k = 5) {
        await this.ensureReady();
        const queryVector = embedText(text);
        const stmt = this.db.prepare('SELECT doc_path AS docPath, vector, updated FROM embeddings');
        const scored = [];
        for (const row of stmt.iterate()) {
            const entry = {
                docPath: String(row.docPath),
                vector: JSON.parse(String(row.vector)),
                updated: Number(row.updated)
            };
            const score = cosineSimilarity(entry.vector, queryVector);
            insertTopK(scored, { entry, score }, k);
        }
        return scored.map((item) => item.entry);
    }
}
exports.EmbeddingStore = EmbeddingStore;
function insertTopK(list, candidate, k) {
    list.push(candidate);
    list.sort((a, b) => b.score - a.score);
    if (list.length > k) {
        list.length = k;
    }
}
let sqliteModulePromise;
async function loadSqliteModule() {
    if (!sqliteModulePromise) {
        sqliteModulePromise = (async () => {
            try {
                return await Promise.resolve().then(() => __importStar(require('node:sqlite')));
            }
            catch {
                return undefined;
            }
        })();
    }
    return sqliteModulePromise;
}
function embedText(text) {
    const vector = new Array(64).fill(0);
    const tokens = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    for (const token of tokens) {
        const hash = simpleHash(token);
        vector[hash % vector.length] += 1;
    }
    const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / length);
}
function simpleHash(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
function cosineSimilarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
    }
    return dot;
}
//# sourceMappingURL=embeddingStore.js.map