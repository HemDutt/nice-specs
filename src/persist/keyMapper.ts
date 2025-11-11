import * as vscode from 'vscode';
import { SymbolIndexRecord } from '../types';
import { readFileText, writeFileText } from '../utils/fs';
import { logWarn } from '../utils/logger';

type SqliteModule = typeof import('node:sqlite');
type SqliteDatabase = import('node:sqlite').DatabaseSync;

const STORAGE_DIR = '.nicespecs';
const SQLITE_FILE = 'keymap.sqlite';
const FALLBACK_FILE = 'keymap.json';

export class KeyMapper {
  private db: SqliteDatabase | undefined;
  private readonly dir: vscode.Uri;
  private readonly sqliteUri: vscode.Uri;
  private readonly fallbackUri: vscode.Uri;
  private ready: Promise<void> | undefined;
  private fallbackCache: KeyMapFile | undefined;

  constructor(private readonly workspaceRoot: vscode.Uri) {
    this.dir = vscode.Uri.joinPath(workspaceRoot, STORAGE_DIR);
    this.sqliteUri = vscode.Uri.joinPath(this.dir, SQLITE_FILE);
    this.fallbackUri = vscode.Uri.joinPath(this.dir, FALLBACK_FILE);
  }

  async ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.initialize();
    }
    await this.ready;
  }

  async replaceComponent(componentId: string, entries: SymbolIndexRecord[]): Promise<void> {
    await this.ensureReady();
    if (this.db) {
      const deleteStmt = this.db.prepare('DELETE FROM symbol_map WHERE component_id = ?');
      deleteStmt.run(componentId);
      if (entries.length) {
        const insertStmt = this.db.prepare(
          'INSERT INTO symbol_map (component_id, file_path, symbol_name, symbol_kind, description, chunk_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
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

  async listByComponent(componentId: string): Promise<SymbolIndexRecord[]> {
    await this.ensureReady();
    if (this.db) {
      const stmt = this.db.prepare(
        'SELECT component_id AS componentId, file_path AS file, symbol_name AS symbol, symbol_kind AS kind, description, chunk_id AS chunkId FROM symbol_map WHERE component_id = ? ORDER BY file_path, symbol_name'
      );
      const rows = stmt.all(componentId) as Array<Record<string, unknown>>;
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

  private async initialize(): Promise<void> {
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
      } catch (error) {
        logWarn('[nicespecs] Failed to initialize SQLite key mapper. Falling back to JSON store.', error);
        this.db = undefined;
      }
    }

    await this.ensureFallbackFile();
  }

  private async ensureFallbackFile(): Promise<void> {
    try {
      await vscode.workspace.fs.readFile(this.fallbackUri);
    } catch {
      await writeFileText(this.fallbackUri, JSON.stringify({ entries: [] }, null, 2));
    }
  }

  private async loadFallback(): Promise<KeyMapFile> {
    if (this.fallbackCache) {
      return this.fallbackCache;
    }
    await this.ensureFallbackFile();
    const text = await readFileText(this.fallbackUri);
    this.fallbackCache = JSON.parse(text) as KeyMapFile;
    return this.fallbackCache;
  }

  private async writeFallback(payload: KeyMapFile): Promise<void> {
    this.fallbackCache = payload;
    await writeFileText(this.fallbackUri, JSON.stringify(payload, null, 2));
  }
}

interface KeyMapFile {
  entries: SymbolIndexRecord[];
}

let sqliteModulePromise: Promise<SqliteModule | undefined> | undefined;

async function loadSqliteModule(): Promise<SqliteModule | undefined> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = (async () => {
      try {
        return await import('node:sqlite');
      } catch {
        return undefined;
      }
    })();
  }
  return sqliteModulePromise;
}
