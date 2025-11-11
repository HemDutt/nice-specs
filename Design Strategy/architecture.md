# Nice Specs Documentation Extension – Architecture Plan

The goal is to turn the `@nicespecs` participant into a documentation-first coding agent. This document captures the end-to-end plan before we touch any implementation.

## 1. Core Guardrails
- Every incoming chat prompt is vetted before the extension does any work.
- Requests that are not explicitly documentation-related (structure, design, component understanding, etc.) are rejected with a deterministic message. This keeps `@nicespecs` scoped to knowledge capture.
- Guard logic runs before we derive context or traverse the workspace, ensuring the cost of non-doc requests is minimal.

## 2. Workspace Traversal Strategy
- Perform a breadth-first traversal of the entire workspace, but skip:
  - `node_modules`, `venv`, `.git`, build artifacts, and other third‑party or generated directories.
  - File types that are clearly dependencies (lock files, binaries, etc.).
- Maintain a traversal queue containing `{ folderUri, depth, parentId }`.
- For each folder we gather:
  - Direct child folders (for later processing).
  - Direct child files (code only; e.g., `.ts`, `.tsx`, `.js`, `.py`, `.java`, `.cs`, `.go`, `.rs`, `.swift`, etc.).
  - Metadata (line counts, dependency hints, framework signatures) to feed the RAG step.

### Documentation Placement
- Each generated `nicespecs.<component>.md` lives directly inside the folder it documents.
- This keeps the documentation co-located with the code, making it easy to include as context in subsequent runs and for human reviewers browsing the tree.
- A lightweight `.nicespecs/index.json` at the workspace root can track metadata (timestamps, relationships, cost estimates) without duplicating content.

## 3. Folder-Level RAG Summaries
- A folder is considered a “component” when it only contains code files (no subfolders) or when we have already processed its subfolders.
- For a leaf folder (code files only):
  - Ingest each file using a lightweight embedding or chunking approach; we can leverage VS Code’s chat model to summarize context without persisting embeddings initially.
  - Extract:
    - Purpose/mission of the component.
    - Key architecture concepts (data flows, APIs, design patterns).
    - Dependencies (internal modules, services, external packages).
    - Surface area (public functions, classes, exported types).
  - Produce a predictable markdown file `nicespecs.<lowercased-folder-name>.md` stored directly inside the folder it describes.
- For a folder with both code files and child folders:
  - Gather the freshly created child documentation.
  - Run RAG over a combined context of local code files + child summaries.
  - Document how the child components interact, compose into higher-level behavior, and what additional responsibilities exist at this level.

## 4. Parent Aggregation Rules
- Parent documentation must reference every child component by filename and summarize the relation (composition, orchestration, shared models, etc.).
- Parent-level doc structure:
  1. **Component Overview** – narrative describing the folder’s role.
  2. **Subcomponents** – bullet list referencing child `nicespecs.*.md` files.
  3. **Architectural Notes** – cross-cutting concerns, shared utilities, data contracts.
  4. **Dependencies** – internal modules and external services/APIs.
  5. **Open Questions / TODOs** – unresolved design gaps for humans to review.

### Local Detail vs. Child Relationships
- Each folder’s documentation must describe the code structures of its *own* files in depth (classes, functions, data models, configuration blocks, etc.).
- Child folders are captured only through relationship statements (e.g., “Delegates persistence to [nicespecs.history.storage.md](./History/storage/nicespecs.history.storage.md)”).
- Hyperlinks to child docs are mandatory whenever referencing a subcomponent. Relative paths keep docs portable across machines and repos.
- This split ensures information lives where the code resides while higher-level docs remain focused on orchestration instead of duplicating details.

## 5. Root Documentation
- Once every folder is processed, the workspace root receives `nicespecs.root.md`.
- This document is the authoritative component tree:
  - High-level system description.
  - Diagram-friendly outline of subcomponents.
  - Links to every generated doc.
  - Guidance for future contributors on how to extend the system safely.

## 6. Markdown Format & Agent Friendliness
- Each file uses consistent headings so code agents can parse them mechanically:
  ```
  # Component Name
  ## Purpose
  ## Responsibilities
  ## Key Modules & APIs
  ## Dependencies
  ## Interactions
  ## Risks & TODOs
  ```
- Metadata block (YAML frontmatter or JSON code block) captures machine-friendly info:
  ```yaml
  component: history
  path: src/features/History
  children:
    - nicespecs.history.api.md
    - nicespecs.history.storage.md
  ```
- All documentation is Markdown (`.md`) to keep it readable and version-controlled.

## 7. Implementation Phases
1. **Guard & Command Wiring**
   - Hook into `@nicespecs` chat handler.
   - Reject non-doc prompts and expose a single slash command (e.g., `/docgen`).
2. **Traversal Engine**
   - Implement filtered BFS with configuration for ignored paths.
   - Collect candidate folders and file metadata.
3. **Leaf Documentation Generator**
   - Chunk code files, build prompts, and call the user-selected model for summaries.
   - Emit deterministic filenames.
4. **Parent Aggregator**
   - Compose children summaries plus local code context.
   - Generate higher-level docs and propagate upward.
5. **Root Composer & Index**
   - Produce the final root file.
   - Optionally emit an index (JSON) for tooling.

## 8. Incremental Update Flow
1. Track the timestamp (and optional git commit hash) of the last successful documentation run in `.nicespecs/index.json`.
2. On each invocation:
   - Determine which files changed since the last run (git diff or filesystem timestamps).
   - Map changed files to their owning folders.
   - For each folder, decide if the documentation needs regeneration by analyzing the semantic nature of the change (e.g., business logic, dependency imports, interface changes). Simple refactors or micro-optimizations can skip regeneration to conserve tokens.
3. If a child folder regenerates but its high-level responsibilities remain the same, skip touching the parent documentation. Only propagate updates when the parent’s own code changes or a child’s contract shifts.
4. Present the user with an estimated token cost for the incremental run before execution; proceed only after confirmation.

## 9. Embeddings & Retrieval Strategy
- Do not persist raw source embeddings across projects; the maintenance cost outweighs the benefit.
- Optionally use a local, open-source vector database (e.g., SQLite + `sqlite-vss`, Chroma, or LanceDB) to store embeddings for generated documentation files only. This keeps runtime light, avoids vendor lock-in, and allows quick semantic lookup when answering user questions.
- Documentation embeddings are rebuilt whenever a doc file changes; old entries are removed to prevent drift.

## 10. Resilience & Resume Support
- Maintain a job journal in `.nicespecs/index.json` that records which folders were successfully documented in the current run.
- If the process stops due to network issues, model throttling, or token exhaustion, the rerun resumes from the last unfinished folder instead of restarting the entire workspace.
- Implement exponential backoff and clear error messaging so users understand why a run paused and how to resume.

## 11. Cost Transparency
- Before starting a run (initial or incremental), estimate token usage by:
  - Counting lines/bytes for targeted files.
  - Applying heuristic tokens-per-line ratios per language.
  - Adding overhead for RAG prompts, model responses, and parent aggregation.
- Present the estimate plus a rough monetary cost (based on the currently selected model’s rate if available) and require explicit user approval.

## 12. Chunking & Context Quality
- Implement deterministic chunking that respects language syntax (function-level for C-like languages, class-level for OO modules, logical sections for configuration files).
- Keep chunk sizes conservative (e.g., 500–700 tokens) to minimize context overflow and hallucinations.
- Use overlapping windows (10–15% overlap) to preserve references across chunk boundaries.
- When summarizing documentation files, use the same chunking logic to avoid truncation and keep the embeddings aligned with section boundaries.

## 13. Additional Edge Cases & Mitigations
- **Symbolic Links / Cycles**: Detect symlinks during traversal and skip or resolve them to avoid infinite loops.
- **Binary or Generated Assets**: Ignore files exceeding a binary threshold or matching known artifact patterns even if they live alongside code (e.g., `.pb`, `.wasm`, `.svg`), preventing noise in summaries.
- **Renamed Components**: When a folder is renamed, map old documentation files via git history or `.nicespecs/index.json` and update hyperlinks accordingly.
- **Large Monolithic Files**: For files exceeding size caps, chunk progressively with explicit headers (“Part 1/3”) and warn the user if full coverage would exceed approved tokens.
- **Cross-Repo Dependencies**: If code references external repositories, capture contract-level information but flag unresolved references in the TODO section so humans can follow up.

Once the above plan is approved, we can start implementing the traversal and documentation pipeline. No code changes will be made until this architecture is signed off.
