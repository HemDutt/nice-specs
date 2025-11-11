# Chunking & Embedding Architecture

## Why Chunking Matters
Nice Specs depends on deterministic, evidence-backed summaries. Chunkers ensure every LM prompt receives bounded, semantically coherent slices of code or docs, while embedding + key-map stores make those summaries discoverable later.

## Component Overview
- **CodeChunker (`src/chunker/codeChunker.ts`)** – Reads each file in a target folder, enforces size caps, and slices content using brace depth + regex boundaries (classes, functions, modules). Output: `ChunkInfo` records with IDs, line ranges, and language metadata.
- **DocChunker (`src/chunker/docChunker.ts`)** – Loads existing child documentation, extracts canonical sections (`Purpose`, `Responsibilities`, etc.), and prepares synopsis snippets with relative links.
- **Component Ledger** – Aggregates chunk-derived facts, child summaries, tags, and plan metadata before synthesis. Acts as the single source of truth for persona prompts.
- **EmbeddingStore (`src/persist/embeddingStore.ts`)** – Persists normalized 64-dimension vectors per doc using SQLite. Provides `upsert`, `delete`, and cosine-similarity `query`.
- **KeyMapper (`src/persist/keyMapper.ts`)** – Stores `{componentId, file, symbol, kind, chunkId}` entries so answers can cite exact code locations.

## Flow Diagram
```mermaid
graph LR
  Folder["FolderNode\n(files + children)"] --> CodeChunker
  CodeChunker -->|ChunkInfo[]| ChunkBuffer["Chunk Buffer"]
  Folder --> DocChunker
  DocChunker -->|ChildSummary[]| ChildBuffer["Child Buffer"]
  ChunkBuffer --> Ledger
  ChildBuffer --> Ledger
  Ledger --> Personas["AgentOrchestrator personas"]
  Personas --> Docs["nicespecs.<component>.md"]
  Docs --> Embeddings[EmbeddingStore]
  Docs --> KeyMapper
```

## Chunk Creation Details
- **Deterministic IDs**: `chunk.id = <file path>#chunk-<n>` ensures stable references for reviewer prompts, key-map entries, and future queries.
- **Boundary Heuristics**:
  - `maxChunkLines` / `minChunkLines` from config bound chunk sizes (~500–700 tokens).
  - Brace depth ensures we don’t split inside class or function bodies unless required.
  - Regex `BLOCK_BOUNDARY_REGEX` catches declarations (`class|interface|function|const|async|module`) to prefer semantic splits.
- **Overlap Handling**: After emitting a chunk, the start pointer rewinds up to five lines so context (imports, closing braces) carries into the next chunk, mimicking the documented “10–15% overlap” heuristic.
- **Filtering**: Files exceeding `config.maxFileSizeBytes` are skipped with warnings, preventing runaway token usage; ignore lists from `DocGenConfig` avoid `node_modules`, build output, etc.

## Child Documentation Chunking
- For every child folder, `DocChunker` looks up `nicespecs.<child>.md` via `docFileForFolder`.
- Regex extraction isolates key sections; missing sections are surfaced as `_Not documented_`, signaling the synthesizer to temper expectations.
- Generated `ChildSummary` carries:
  - `synopsis` (Purpose + Responsibilities blend) used in parent doc narrative.
  - `relativeLink` for hyperlink correctness regardless of workspace root.
  - Section map reused by reviewer prompts and parent synthesis.

## Ledger & Fact Normalization
- `CodeAnalysisAgent` consumes `ChunkInfo[]` in configurable batches (default 4), prompting the LM to produce JSON facts (`summary`, `responsibilities`, `dependencies`, `analysis bullets`, `tags`).
- Ledger facts retain chunk IDs, file paths, and line ranges, enabling:
  - Reviewer checklist to cross-check statements.
  - Symbol indexing during synthesis (every symbol is tied back to chunk evidence).
  - Future incremental runs to detect whether facts changed for a given file.

## Embedding Strategy
- **Vectorization**: `embedText` tokenizes doc text, hashes terms into a 64-element bag-of-words vector, then L2-normalizes. Lightweight but deterministic—no external model dependency, which aligns with the “no network” guardrails.
- **Storage**: SQLite table `embeddings(doc_path TEXT PRIMARY KEY, vector TEXT, updated INTEGER)` keeps metadata compact. Query operations iterate over rows, score via cosine similarity, and maintain a top-K heap client-side.
- **Usage**:
  - Documentation pipeline updates embeddings right after writing Markdown so the query pipeline sees fresh context immediately.
  - Query pipeline requests top `k` (default 5) docs per question, converts matches into user-facing snippets, and references `updated` timestamps.

## Symbol & Section Retrieval
- `DocSynthesisAgent`’s JSON spec requires every file to appear in `fileInventory` (with symbols). Once rendered:
  - `DocWriter` passes `symbolIndex` to `KeyMapper.replaceComponent`, replacing old records atomically.
  - Query pipeline or future tooling can jump from symbol name → file → chunk ID without re-reading code.

## Failure & Resume Considerations
- Chunkers respect cancellation tokens (`throwIfCancelled`) so long runs can abort cleanly.
- Ledger state (facts, child summaries, plan) is persisted in `.nicespecs/index.json` after analysis but before synthesis. If VS Code restarts, the agent reloads ledger facts instead of re-chunking files.
- Embedding and key-map updates occur only after `DocEvaluator` validates markdown; partial runs never poison the stores.

## Extending the Architecture
- Alternate chunkers (e.g., language-specific parsers) can replace `CodeChunker` as long as they emit the same `ChunkInfo` shape.
- Higher-dimensional or external embeddings can slot into `EmbeddingStore` by swapping `embedText` and query logic, preserving the same interface for controllers.
- Additional consumers (linting agents, ADR generators) can reuse the ledger format plus embedding store to stay aligned with the current evidence pipeline.
