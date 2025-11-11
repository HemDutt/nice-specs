import * as vscode from 'vscode';
import { workspaceRelativePath } from '../utils/path';

interface EmbeddingRecord {
  docPath: string;
  vector: number[];
  updated: number;
}

type SqliteModule = typeof import('node:sqlite');
type SqliteDatabase = import('node:sqlite').DatabaseSync;

const STORAGE_DIR = '.nicespecs';
const SQLITE_FILE = 'embeddings.sqlite';

export class EmbeddingStore {
  private readonly dbPath: vscode.Uri;
  private db: SqliteDatabase | undefined;

  constructor(private readonly workspaceRoot: vscode.Uri) {
    this.dbPath = vscode.Uri.joinPath(workspaceRoot, STORAGE_DIR, SQLITE_FILE);
  }

  async ensureReady(): Promise<void> {
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

  async upsert(docUri: vscode.Uri, text: string): Promise<void> {
    await this.ensureReady();
    const vector = embedText(text);
    const relative = workspaceRelativePath(docUri, this.workspaceRoot);
    const stmt = this.db!.prepare(
      `INSERT INTO embeddings (doc_path, vector, updated)
       VALUES (?, ?, ?)
       ON CONFLICT(doc_path) DO UPDATE SET vector = excluded.vector, updated = excluded.updated`
    );
    stmt.run(relative, JSON.stringify(vector), Date.now());
  }

  async delete(docUri: vscode.Uri): Promise<void> {
    await this.ensureReady();
    const relative = workspaceRelativePath(docUri, this.workspaceRoot);
    const stmt = this.db!.prepare('DELETE FROM embeddings WHERE doc_path = ?');
    stmt.run(relative);
  }

  async query(text: string, k = 5): Promise<EmbeddingRecord[]> {
    await this.ensureReady();
    const queryVector = embedText(text);
    const stmt = this.db!.prepare('SELECT doc_path AS docPath, vector, updated FROM embeddings');
    const scored: Array<{ entry: EmbeddingRecord; score: number }> = [];
    for (const row of stmt.iterate()) {
      const entry: EmbeddingRecord = {
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

function insertTopK(list: Array<{ entry: EmbeddingRecord; score: number }>, candidate: { entry: EmbeddingRecord; score: number }, k: number) {
  list.push(candidate);
  list.sort((a, b) => b.score - a.score);
  if (list.length > k) {
    list.length = k;
  }
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

function embedText(text: string): number[] {
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

function simpleHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
  }
  return dot;
}
