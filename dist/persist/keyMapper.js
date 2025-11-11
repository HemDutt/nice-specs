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
exports.KeyMapper = void 0;
const vscode = __importStar(require("vscode"));
const fs_1 = require("../utils/fs");
const logger_1 = require("../utils/logger");
const STORAGE_DIR = '.nicespecs';
const SQLITE_FILE = 'keymap.sqlite';
const FALLBACK_FILE = 'keymap.json';
class KeyMapper {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.dir = vscode.Uri.joinPath(workspaceRoot, STORAGE_DIR);
        this.sqliteUri = vscode.Uri.joinPath(this.dir, SQLITE_FILE);
        this.fallbackUri = vscode.Uri.joinPath(this.dir, FALLBACK_FILE);
    }
    async ensureReady() {
        if (!this.ready) {
            this.ready = this.initialize();
        }
        await this.ready;
    }
    async replaceComponent(componentId, entries) {
        await this.ensureReady();
        if (this.db) {
            const deleteStmt = this.db.prepare('DELETE FROM symbol_map WHERE component_id = ?');
            deleteStmt.run(componentId);
            if (entries.length) {
                const insertStmt = this.db.prepare('INSERT INTO symbol_map (component_id, file_path, symbol_name, symbol_kind, description, chunk_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
                const timestamp = Date.now();
                for (const entry of entries) {
                    insertStmt.run(componentId, entry.file, entry.symbol, entry.kind, entry.description, entry.chunkId ?? null, timestamp);
                }
            }
            return;
        }
        const payload = await this.loadFallback();
        const remaining = payload.entries.filter((entry) => entry.componentId !== componentId);
        payload.entries = [...remaining, ...entries];
        await this.writeFallback(payload);
    }
    async listByComponent(componentId) {
        await this.ensureReady();
        if (this.db) {
            const stmt = this.db.prepare('SELECT component_id AS componentId, file_path AS file, symbol_name AS symbol, symbol_kind AS kind, description, chunk_id AS chunkId FROM symbol_map WHERE component_id = ? ORDER BY file_path, symbol_name');
            const rows = stmt.all(componentId);
            return rows.map((row) => ({
                componentId: String(row.componentId ?? ''),
                file: String(row.file ?? ''),
                symbol: String(row.symbol ?? ''),
                kind: String(row.kind ?? ''),
                description: String(row.description ?? ''),
                chunkId: row.chunkId === null || row.chunkId === undefined ? undefined : String(row.chunkId)
            }));
        }
        const payload = await this.loadFallback();
        return payload.entries.filter((entry) => entry.componentId === componentId);
    }
    async initialize() {
        await vscode.workspace.fs.createDirectory(this.dir);
        const sqlite = await loadSqliteModule();
        if (sqlite) {
            try {
                this.db = new sqlite.DatabaseSync(this.sqliteUri.fsPath);
                this.db.exec(`
          CREATE TABLE IF NOT EXISTS symbol_map (
            component_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            symbol_name TEXT NOT NULL,
            symbol_kind TEXT NOT NULL,
            description TEXT NOT NULL,
            chunk_id TEXT,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_symbol_component ON symbol_map(component_id);
          CREATE INDEX IF NOT EXISTS idx_symbol_symbol ON symbol_map(symbol_name);
        `);
                return;
            }
            catch (error) {
                (0, logger_1.logWarn)('[nicespecs] Failed to initialize SQLite key mapper. Falling back to JSON store.', error);
                this.db = undefined;
            }
        }
        await this.ensureFallbackFile();
    }
    async ensureFallbackFile() {
        try {
            await vscode.workspace.fs.readFile(this.fallbackUri);
        }
        catch {
            await (0, fs_1.writeFileText)(this.fallbackUri, JSON.stringify({ entries: [] }, null, 2));
        }
    }
    async loadFallback() {
        if (this.fallbackCache) {
            return this.fallbackCache;
        }
        await this.ensureFallbackFile();
        const text = await (0, fs_1.readFileText)(this.fallbackUri);
        this.fallbackCache = JSON.parse(text);
        return this.fallbackCache;
    }
    async writeFallback(payload) {
        this.fallbackCache = payload;
        await (0, fs_1.writeFileText)(this.fallbackUri, JSON.stringify(payload, null, 2));
    }
}
exports.KeyMapper = KeyMapper;
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
//# sourceMappingURL=keyMapper.js.map