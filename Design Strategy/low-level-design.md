# Low-Level Design – Nice Specs Documentation Extension

This document translates the architecture and agentic plans into concrete code modules, classes, and interfaces. The focus is maintainability, testability, and extensibility as VS Code’s language model APIs evolve.

## 1. Design Principles
- **Modular boundaries**: Separate traversal, chunking, LM orchestration, and persistence so each can evolve independently.
- **Configuration-driven**: Use a single config object (`DocGenConfig`) to control ignore lists, token budgets, chunk sizes, etc.
- **Pure-core, impure-shell**: Keep core logic (planning, evaluation) pure functions where possible; wrap side effects (filesystem, LM calls) in adapters.
- **Task orchestration via state machine**: A deterministic state machine drives documentation runs, making resume/retry straightforward.

## 2. High-Level Module Map

| Module | Responsibility |
|--------|----------------|
| `extension.ts` | Activation, chat participant registration, guardrails, command wiring. |
| `controllers/DocRunController` | Entry point for doc generation. Validates prompts, loads prior state, coordinates pipeline stages. |
| `planner/TraversalPlanner` | Builds the BFS order, applies ignore rules, hydrates folder metadata. |
| `chunker/CodeChunker` | Splits code files into semantic chunks with identifiers. |
| `chunker/DocChunker` | Splits existing docs by heading for reuse. |
| `lm/AgentOrchestrator` | Implements persona prompts, handles LM calls (analyst, synthesizer, reviewer). |
| `persist/IndexStore` | Reads/writes `.nicespecs/index.json`, stores progress, timestamps, estimated costs. |
| `persist/DocWriter` | Writes final markdown files and manages frontmatter. |
| `persist/EmbeddingStore` | Optional local vector DB wrapper for documentation embeddings. |
| `analysis/ChangeDetector` | Determines which folders need regeneration based on git diff / timestamps plus semantic heuristics. |
| `analysis/DocEvaluator` | Applies reviewer checklist, ensures files follow `documentation-strategy.md`. |
| `ui/CostEstimator` | Computes token estimates and formats approval prompts. |

## 3. Key Interfaces

```ts
interface DocGenConfig {
  workspaceRoot: vscode.Uri;
  ignorePaths: string[];
  chunkSizeTokens: number;
  chunkOverlapTokens: number;
  tokenBudget: number;
  reviewerEnabled: boolean;
}

interface FolderNode {
  uri: vscode.Uri;
  name: string;
  depth: number;
  children: FolderNode[];
  files: vscode.Uri[];
  parent?: FolderNode;
}

interface ChunkInfo {
  id: string;
  file: vscode.Uri;
  languageId: string;
  startLine: number;
  endLine: number;
  text: string;
}

interface ComponentLedger {
  componentId: string;
  facts: Record<string, LedgerFact[]>;
  childSummaries: ChildSummary[];
}

interface LedgerFact {
  key: string;
  value: string;
  sourceChunk: ChunkInfo;
  importance: 'primary' | 'secondary';
}

interface ChildSummary {
  componentId: string;
  docPath: string;
  synopsis: string;
}
```

## 4. Control Flow

1. **Activation** (`extension.ts`)
   - Register chat participant with guards.
   - Expose `/docgen` command that triggers `DocRunController.run`.

2. **Run Initialization** (`DocRunController`)
   - Load config + `.nicespecs/index.json`.
   - Invoke `ChangeDetector` to get target folders.
   - Call `CostEstimator` for approval prompt. Abort if user declines.

3. **Traversal Planning** (`TraversalPlanner`)
   - BFS from workspace root, skip ignored directories.
   - Emit ordered `FolderNode[]`.

4. **Folder Processing Loop**
   - For each `FolderNode`:
     1. `Chunker` loads code files → `ChunkInfo[]`.
     2. `DocChunker` loads child docs if they exist.
     3. `AgentOrchestrator.analyze(folder, chunks, childDocs)`:
        - Runs `CodeAnalyst` persona per chunk → ledger facts.
        - Runs `DocSynthesizer` to assemble markdown using ledger + child summaries.
        - Runs `QualityReviewer` if enabled.
     4. `DocWriter` saves `nicespecs.<folder>.md`.
     5. `EmbeddingStore` indexes the new doc.
     6. `IndexStore` updates progress (timestamp, cost, run state).

5. **Completion**
   - After all folders, synthesize `nicespecs.root.md`.
   - Persist updated index, emit success message with token stats.

## 5. AgentOrchestrator Composition

```ts
class AgentOrchestrator {
  constructor(private readonly lm: LanguageModelChat) {}

  async analyze(folder: FolderNode, chunks: ChunkInfo[], childDocs: ChildSummary[], ledger?: ComponentLedger): Promise<DocDraft> {
    const componentLedger = ledger ?? { componentId: folder.name, facts: {}, childSummaries: childDocs };
    for (const chunk of chunks) {
      const factNotes = await this.runCodeAnalyst(chunk, componentLedger);
      componentLedger.facts[chunk.id] = factNotes;
    }

    const draft = await this.runDocSynthesizer(componentLedger);
    if (config.reviewerEnabled) {
      await this.runQualityReviewer(draft, componentLedger);
    }
    return draft;
  }
}
```

Each persona call is a wrapper around `lm.sendRequest(...)` with role-specific system prompts and scratchpads.

## 6. Persistence Layer

- **IndexStore**
  - Schema:
    ```json
    {
      "lastRunAt": "2025-01-15T12:00:00Z",
      "components": {
        "history": {
          "path": "src/features/History",
          "docPath": "src/features/History/nicespecs.history.md",
          "children": ["history.api"],
          "lastUpdated": "2025-01-15T12:00:00Z",
          "lastCost": 12345,
          "status": "complete"
        }
      },
      "inProgress": {
        "componentId": "history",
        "chunkPointer": 5
      }
    }
    ```
  - Supports atomic updates and resume logic.

- **EmbeddingStore**
  - Adapter interface so we can plug in SQLite/Chroma/LanceDB.
  - Methods: `upsert(docPath, embeddingVector)`, `delete(docPath)`, `query(queryVector, k)`.

## 7. Error Handling & Resume

- `DocRunController` wraps each folder run in a try/catch.
- On error:
  - State is persisted with `status: "paused"`.
  - User receives actionable message (e.g., “Token limit exceeded while documenting `History`. Resume with `/docgen resume`. ”).
- Resume command loads `inProgress`, replays ledger facts from disk, and continues from the last chunk pointer.

## 8. Testing Strategy

- **Unit Tests**
  - Chunker: ensure deterministic chunk boundaries for sample files.
  - Planner: verify ignored directories and BFS order.
  - IndexStore: confirm atomic writes, resume metadata.
  - DocEvaluator: validate docs against the strategy checklist.

- **Integration Tests**
  - Mock LM responses to simulate personas and verify doc generation end-to-end on a fixture repo.

- **Manual Scenarios**
  - Large repo dry run with token estimate warnings.
  - Resume after simulated network failure.
  - Minimal repo (single folder) to test base cases.

## 9. Design Strategy Summary
- By isolating traversal, analysis, synthesis, and persistence, we can upgrade individual capabilities (e.g., better chunkers, new reviewer heuristics) without destabilizing the whole system.
- The state-machine-like controller plus `IndexStore` journaling makes long-running documentation jobs resilient to errors and easy to resume.
- Agent personas stay encapsulated inside `AgentOrchestrator`, so changes to LM prompts or providers are localized.
- The documentation strategy is enforced via `DocWriter` + `DocEvaluator`, ensuring every output conforms to the schema before hitting disk.

This LLD should provide enough structure to begin implementing the extension with confidence and maintainability in mind.
