# Query Agent Pipeline

Nice Specs now supports two coordinated pipelines:
1. **Documentation pipeline** (see `agent-pipeline.md`) that generates or refreshes component docs.
2. **Query pipeline** (this doc) that answers user questions about the codebase’s design, architecture, and implementation details when no new documentation needs to be produced.

This document expands the second path, covering trigger logic, the reasoning stages, storage dependencies, and failure handling.

## 1. Activation Rules
- Every incoming user prompt is first routed through the orchestrator guard.
- If the guard detects the user is asking for *new or updated documentation*, we continue with the existing doc pipeline.
- Otherwise, if the prompt asks about existing design/architecture/code behavior, we switch to the **Query Agent Pipeline**.
- Ambiguous prompts (could be doc or Q&A) are clarified by asking the user to choose between “Generate/Update docs” vs “Answer a question about current code.”

## 2. Pipeline Overview
1. **Intent Capture**: Normalize the question, extract keywords (components, APIs, feature names).
2. **Embedding Search**: Query the embedding store (`.nicespecs/embeddings.json`) with the question to retrieve the most relevant component docs and sections.
3. **Key Mapper Lookup**: Use the SQLite Key Mapper (`.nicespecs/keymap.sqlite`, JSON fallback) to identify files, classes, structs, and enums directly related to the keywords or embeddings hits.
4. **Evidence Assembly**:
   - Load the corresponding component documentation files for the matched entries.
   - Map each referenced symbol to the source chunk ids from the key mapper.
   - Pull code excerpts or function signatures from the most relevant files if chunk data is cached; otherwise read-and-chunk on demand (respecting token budgets).
5. **Dependency Graph Construction**:
   - Build a graph where nodes represent symbols/components; edges capture:
     - “defined in” (symbol → file).
     - “references” relationships discovered in docs or code chunk metadata.
   - Annotate nodes with doc excerpts, responsibilities, and known dependencies.
6. **Tree-of-Thought Reasoning**:
   - Run a ToT-style prompt over the assembled graph:
     1. Hypothesize possible answers or explanations.
     2. Walk the graph to validate each hypothesis (e.g., follow edges from API → service → storage).
     3. Eliminate inconsistent paths; converge on the most supported explanation.
7. **Answer Generation**:
   - Respond in conversational Markdown with:
     - A summary paragraph answering the question.
     - A bullet list of supporting evidence (file paths, chunk ids, or doc sections).
     - Optional diagram-friendly outline (textual) if the dependency graph is complex.
   - Include “See also” links to the relevant component docs for additional reading.

## 3. Personas & Prompts
| Stage | Persona | Notes |
|-------|---------|-------|
| Intent + Embedding Retrieval | `DocOrchestrator` (lightweight) | Confirms classification and extracts keywords. |
| Evidence Assembly | `CodeAnalyst` | When fresh chunks are needed, reuse the same JSON fact format as doc pipeline to stay consistent. |
| Tree-of-Thought Reasoning | `QuerySynthesizer` (new prompt variant of DocSynthesizer) | Receives dependency graph + evidence; obliged to cite sources. |
| Verification | `QualityReviewer` | Ensures answer stays within evidence and highlights gaps if confidence is low. |

The `QuerySynthesizer` prompt must enforce:
- Always cite file paths and chunk ids when making factual statements.
- Highlight unknowns or missing data rather than speculating.
- Identify whether suggested workarounds require code changes (so we can redirect back to the doc pipeline if necessary).

## 4. Storage & Data Contracts
### Embedding Store
- Same file used for documentation pipeline (`.nicespecs/embeddings.json`).
- Entries are keyed by doc path; QA lookups should capture section granularity when embeddings were produced per heading.
- When no embeddings exist (fresh repo), fallback to direct file scans but warn the user that coverage may be incomplete.

### Key Mapper
- Tables already map `{componentId, file, symbol, kind, chunkId}`.
- Query pipeline relies on this mapping to trace from symbol names mentioned in the question to actual files quickly.
- If the SQLite module is unavailable and we are on the JSON fallback, limit concurrent queries to avoid large in-memory operations.

### Ledger Facts
- When we need fresh code facts (e.g., question touches files affected after the last doc run), we reuse `CodeAnalyst` to produce `LedgerFact` objects and treat them as temporary evidence (not persisted unless docs regenerate later).

## 5. Dependency Graph Representation
- **Nodes**: `component`, `file`, `symbol` (class/interface/function), `doc-section`.
- **Edges**:
  - `contains` (component → file, file → symbol).
  - `documents` (doc-section → symbol/file).
  - `depends_on` (symbol → symbol or component, derived from responsibilities/dependencies text).
  - `mentioned_in_query` (keyword nodes for clarity).
- Graph is maintained in memory per query and discarded afterward.
- Graph traversal respects token budgets by truncating node metadata to essentials (responsibility sentence + source reference).

## 6. Output Format
1. **Answer Summary** (2–3 sentences).
2. **Key Findings** (bulleted, each bullet includes a source reference: `file.ts:42` or `nicespecs.component.md#L120`).
3. **Dependency Graph Insight** (optional):
   - Render as indented text: e.g.,
     ```
     API Handler (api/handler.ts:14)
     ├─ calls → BillingClient (services/billing.ts:55)
     │  └─ persists via LedgerStore (storage/ledger.ts:30)
     └─ emits → `InvoiceGenerated` event (events.md#L88)
     ```
4. **Confidence & Gaps**:
   - Provide a short note with confidence level and any missing context (e.g., “Storage layer docs missing; recommend running doc generation for `src/storage`.”).

## 7. Edge Cases & Mitigations
| Scenario | Handling |
|----------|----------|
| **No embeddings or key-map entries** | Inform user that the repo hasn’t been documented yet; suggest running the doc pipeline first. Optionally fall back to a direct code search with a token-warning. |
| **Query spans multiple repositories** | Clarify scope; the agent only answers for the current workspace. |
| **Conflicting evidence** | Highlight both interpretations and recommend follow-up (e.g., “Docs say X but code chunk Y contradicts it.”). |
| **Large dependency graph** | Limit depth (e.g., max 25 nodes) and summarize remaining nodes as “+ N more”; offer to narrow the question. |
| **Stale documentation vs. updated code** | If git diff shows newer code than the last doc run for the relevant components, note the staleness and, if possible, include live code excerpts flagged as “not yet documented.” |
| **Unauthorized query (non-doc work)** | If the user explicitly requests code changes or execution, redirect them to run those steps manually; the query pipeline only explains existing code. |
| **Token exhaustion mid-answer** | Persist partial evidence state (query id + collected nodes) so the user can resume the answer after approving more tokens. |
| **Missing child docs** | If the dependency graph expects a child doc link that is absent, flag it as a TODO and include the parent’s best-known description. |

## 8. Development Checklist
- [ ] Implement a query classifier in the orchestrator guard.
- [ ] Add embedding + key-map lookup utilities that return ranked candidate nodes.
- [ ] Extend persona prompts (new `QuerySynthesizer` role or specialized templates).
- [ ] Integrate graph builder and ToT reasoning prompts.
- [ ] Update telemetry/logging so we can trace which evidence supported each answer.
- [ ] Add tests for: no embeddings, multiple matching symbols, graph truncation, stale docs warning, and reviewer rework loop.

With this pipeline in place, Nice Specs can confidently respond to architecture/design questions by leveraging the rich documentation it already maintains, while keeping the documentation generation workflow isolated and predictable.
