# Nice Specs

Nice Specs is a VS Code extension that adds a documentation-only participant (`@nicespecs`) to Copilot Chat, inline chat, and any other Language Model Chat surface. The participant streams answers with the same model you already selected in the chat pane, giving you deterministic documentation runs without juggling extra prompts.

## Why Nice Specs?

- **Docs-only guardrails** – `@nicespecs` rejects anything that is not an explicit documentation request, so chat history stays focused.
- **Deterministic pipeline** – BFS traversal, semantic chunking, persona orchestration, and reviewer checkpoints follow the canonical structure defined in `Design Strategy/documentation-strategy.md`.
- **Incremental + resumable** – Signature scanning, git-aware change detection, and persisted checkpoints ensure only changed folders are regenerated and stalled runs pick up exactly where they left off.
- **Local intelligence** – SQLite-backed embeddings and a symbol key map are stored under `.nicespecs`, enabling fast RAG queries in future tooling without sending code over the network.
- **Cost visibility** – Uses user selected LLM models from code agent active in VS Code. Token estimates, approvals, and actual spend are surfaced before and after every run.

## Requirements

- VS Code `1.86+` with the Language Model Chat proposed API enabled.
- Node.js `18+` (needed for `node:sqlite`).
- Access to a chat-capable model in VS Code (Copilot, Azure OpenAI, local model, etc.).

## Install & Build

```bash
npm install
npm run compile
```

Launch an Extension Development Host with the proposed APIs enabled (update the publisher ID if you customize it):

```bash
code --enable-proposed-api your-publisher-id.nice-specs
```

Once VS Code opens, hit `F5` to start the development host. Focus the chat view you prefer and start a conversation with `@nicespecs`.

## Documenting A Repository

### Chat flow

Type a prompt such as:

```
@nicespecs /docgen refresh the workspace docs
```

The participant streams progress, token estimates, and completion summaries back into the conversation.

### Command Palette

Prefer commands over chat? Use the built-in entries:

- **Nice Specs: Generate Documentation** – kicks off `/docgen` for all components with detected changes.
- **Nice Specs: Resume Documentation Run** – continues the last interrupted run using the stored checkpoint.
- **Nice Specs: Delete Generated Documentation** – removes every `nicespecs.<component>.md`, `.nicespecs/index.json`, cached state, embeddings, and key maps so you can start fresh.

## Incremental Runs & Recovery

- `SignatureScanner` fingerprints each folder (file samples + timestamps) so only modified folders get reprocessed.
- Git diffs since the last recorded commit nudge parent components when contracts change, keeping dependency docs in sync.
- `IndexStore` persists per-component state in `.nicespecs/state`. If VS Code reloads or a model aborts, rerun `/docgen` or **Resume Documentation Run** to continue without repeating finished work.
- A root composer regenerates `nicespecs.root.md` after each successful sweep so the top-level summary always matches the latest tree.

## Generated Artifacts

| File / Folder | Purpose |
| --- | --- |
| `nicespecs.<component>.md` | Markdown docs stored alongside the folder they describe. |
| `nicespecs.root.md` | Workspace-wide rollup that links to every component doc and summarizes the latest run. |
| `.nicespecs/index.json` + `.nicespecs/state/*.json` | Run metadata, parent/child links, and resume checkpoints. |
| `.nicespecs/embeddings.sqlite` | Deterministic 64-dimension vectors per doc for fast local RAG queries. |
| `.nicespecs/keymap.sqlite` (or `keymap.json`) | Symbol → file → chunk mapping so future answers can cite exact evidence. |
| `.nicespecs/embeddings.sqlite-journal` (optional) | SQLite journal created during updates; safe to delete after VS Code closes. |

Need to purge everything? Run **Nice Specs: Delete Generated Documentation** and rerun `/docgen`.

## Configuration

All settings live under `Nice Specs` in VS Code settings (`.vscode/settings.json`, workspace settings, or user settings).

| Setting | Description | Default |
| --- | --- | --- |
| `nicespecs.ignoreGlobs` | Folder names skipped during traversal. | `["node_modules",".git","dist","out","build",".next",".nicespecs"]` |
| `nicespecs.chunkSizeTokens` | Target token size for each code chunk fed to the personas. | `700` |
| `nicespecs.chunkOverlapTokens` | Token overlap between sequential chunks to preserve context. | `80` |
| `nicespecs.tokenBudget` | Max tokens a single run may consume before asking for approval. | `200000` |
| `nicespecs.reviewerEnabled` | Toggles the Quality Reviewer persona that validates finished docs. | `true` |
| `nicespecs.maxFileSizeBytes` | Largest file (in bytes) the chunker is willing to read. | `2097152` |
| `nicespecs.minChunkLines` / `maxChunkLines` | Bounds for per-chunk line counts. | `12` / `120` |
| `nicespecs.signatureSampleLines` | Number of lines per file used when computing change signatures. | `120` |

## Architecture At A Glance

The full design is documented in `Architecture/ChunkingAndEmbeddingArchitecture.md`, but the short version:

1. **Traversal Planner** builds a BFS tree of the workspace while honoring ignore globs.
2. **Change Detector** combines signature hashing with git diff heuristics to select the minimal set of folders that need fresh docs.
3. **CodeChunker** and **DocChunker** emit deterministic chunks for both code and existing child docs; these feed the multi-persona orchestrator (`CodeAnalyst`, `DocSynthesizer`, `QualityReviewer`).
4. **DocEvaluator** enforces the structure described in `Design Strategy/documentation-strategy.md`.
5. **DocWriter** saves Markdown alongside the component, updates `.nicespecs/index.json`, refreshes embeddings, and swaps the symbol map atomically.
6. **RootComposer** rebuilds `nicespecs.root.md`, including cost and token summaries for accountability.

## Development Workflow

```bash
npm run watch   # incremental TypeScript builds
npm test        # placeholder (runs after compile)
```

When iterating on the extension:

1. Open the repo in VS Code and run `npm install`.
2. Start `npm run watch` in a terminal if you want real-time rebuilds.
3. Launch the Extension Development Host via `F5`.
4. Use the chat or commands as described above to verify changes.

Problems loading SQLite? The key mapper automatically falls back to a JSON store, but embeddings require the bundled `node:sqlite` bindings. Make sure you launch VS Code using the same Node version you used to build the extension.
