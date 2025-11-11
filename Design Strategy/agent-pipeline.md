# Nice Specs Agent Pipeline

This document describes how the `@nicespecs` agent orchestrates documentation generation using coordinated personas, controlled reasoning structures, and chunk-aware context management.

## 1. Persona Strategy

| Persona | Role | Key Traits |
|---------|------|------------|
| `DocOrchestrator` | Primary planner that decides which folders to analyze, tracks progress, and ensures guardrails (docs-only scope) are enforced. | Systematic, conservative with tokens, gives clear instructions to workers. |
| `CodeAnalyst` | Reads code chunks, extracts behaviors, dependencies, and architectural patterns. | Detail-oriented, focuses on factual statements backed by code references. |
| `DocSynthesizer` | Converts structured findings + child component summaries into the final Markdown format. | Narrative yet precise, ensures consistency with the prescribed template. |
| `QualityReviewer` | Independent reviewer persona that validates coherence, detects hallucinations, and confirms links to source evidence. | Skeptical, flags ambiguities, requests clarification or reruns when needed. |

Personas are implemented via targeted prompt prefixes and role-specific instructions injected before each model call. They guarantee that reasoning stays aligned with responsibilities and reduce cross-contamination of context.

## 2. Reasoning Methodology

- **Planning**: `DocOrchestrator` uses a lightweight Chain-of-Thought (CoT) prompt to break the job into ordered steps (traversal, chunk selection, child aggregation). CoT is hidden from end users but preserved internally for traceability.
- **Chunk Analysis**: `CodeAnalyst` employs a tree-of-thought-style prompt when a chunk references other modules. It branches into hypotheses (e.g., “API surface?”, “Data models?”, “External calls?”) and gathers evidence before converging.
- **Synthesis**: `DocSynthesizer` runs a guided CoT that enforces the markdown template, referencing each intermediate note with bullet-proof reasoning to avoid hallucinations.
- **Review Loop**: `QualityReviewer` executes an explicit checklist prompt (grounding, completeness, tone, consistency with child docs). If critical issues arise, the reviewer requests a targeted regeneration of the affected section rather than a full rerun.

## 3. Reviewer Persona Usage

- Always invoked after a folder’s documentation is drafted but before the file is written.
- Receives:
  - The synthesized markdown.
  - The structured findings from `CodeAnalyst`.
  - Child documentation summaries (if any).
- Produces either:
  - `accept` with justification (document is ready), or
  - `revise` with actionable feedback (missing dependency, conflicting description, tone mismatch).
- For `revise`, the pipeline re-enters the synthesis step with the reviewer’s notes injected as constraints.

## 4. Chunking & Context History

### Code Chunk Handling
- Each code file is tokenized into semantic chunks (functions, classes, logical blocks).
- `CodeAnalyst` processes chunks sequentially but maintains a **Component Context Ledger**:
  - Stores key facts (responsibilities, inputs/outputs, dependencies).
  - Associates each fact with the originating chunk and file path.
  - Enables referencing earlier insights without reloading the entire file.
- When chunking exposes cross-file relationships, the ledger merges facts by symbol name so the synthesizer sees a unified view.

### Documentation Chunk Handling
- Existing `nicespecs.*.md` files are chunked by heading (Purpose, Responsibilities, etc.).
- During parent aggregation, the agent reads only the relevant sections (e.g., `Responsibilities`, `Dependencies`) to avoid mixing contexts from unrelated sections.
- Documentation chunks include metadata tags (component name, last updated timestamp) so embeddings and retrieval remain precise.

## 5. Preventing Context Mixups & Enforcing Scope

- **Namespace Isolation**: Chunks are tagged with `{componentId, filePath, chunkId}`. Prompts always reference these tags, preventing the model from confusing snippets.
- **Dual Buffers**:
  - `CodeBuffer`: active chunk(s) from the source code file being analyzed.
  - `DocBuffer`: summaries or child docs relevant to the current component.
  - Only one buffer is injected into the model at a time unless the step explicitly requires comparison.
- **Context Windows**:
  - For large components, the orchestrator paginates processing (e.g., analyze 5 chunks → synthesize interim notes → continue).
  - Interim notes are stored in the ledger and reloaded in subsequent prompts, reducing the need to resend raw code.
- **Source Provenance**: Every statement in the final doc links back to its `chunkId`. The reviewer checks these links to ensure no cross-chunk hallucinations.
- **Scope Rules**:
  - `DocSynthesizer` maintains two sections in its working memory:
    - `LocalDetail`: exhaustive breakdown of the component’s own files (structures, APIs, algorithms).
    - `ChildRelationships`: concise references to child docs with Markdown links (`[ChildName](./path/to/nicespecs.child.md)`), avoiding duplication.
  - Reviewer verifies that local detail never references child internals, only the relationship summary plus hyperlink.

## 6. Pipeline Flow Overview

1. **Guard & Approval**: Orchestrator verifies the request, estimates cost, and obtains user approval.
2. **Planning**: Generate traversal plan, chunk schedule, and reviewer checkpoints.
3. **Chunk Analysis** (`CodeAnalyst` for each folder):
   - Load code chunk → extract facts → update ledger.
4. **Child Context Load**: Retrieve embeddings for child docs, convert to structured notes.
5. **Synthesis** (`DocSynthesizer`):
   - Combine ledger facts + child summaries → emit markdown following the canonical template.
   - Insert relative hyperlinks for every child reference using the paths recorded in `.nicespecs/index.json`.
6. **Review** (`QualityReviewer`):
   - Run checklist; if revisions needed, loop back to synthesis with reviewer constraints.
7. **Persist & Embed**:
   - Save `nicespecs.<component>.md` in the folder.
   - Update `.nicespecs/index.json` and refresh the documentation embedding store.
8. **Parent Propagation**: When all children of a folder are documented, move up one level and repeat steps 3–7.

## 7. Resilience Considerations

- After each major step, the orchestrator records the current state (chunk pointer, ledger snapshot, reviewer verdict) in `.nicespecs/index.json`. This lets the run resume exactly where it left off.
- If token limits are hit mid-component, the orchestrator pauses, persists the partial ledger, and prompts the user to continue later.

This agent pipeline ensures deterministic documentation generation, clear separation of responsibilities via personas, disciplined reasoning methods, and robust chunk management to keep context accurate and reproducible.
