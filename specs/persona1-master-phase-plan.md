# persona1 Master Phase Plan

## Purpose

This document reconciles:

- the extracted master spec in [persona1-master-source.txt](/C:/Users/moham/persona1/specs/persona1-master-source.txt)
- the current shipped repo state in [current-state.md](/C:/Users/moham/persona1/docs/current-state.md)
- the live UX issues already observed in the current extension:
  - flicker
  - context that feels shallow
  - tone that does not adapt enough to the live conversation
  - an interaction model that still feels heavier than the product thesis

It is the implementation plan to execute next.

## Assessment

The master document is directionally right.

Its strongest calls are correct:

- scoring must be parameterized by goal, recipient, and persona
- the learning loop must be real, not implied
- context extraction and scoring should not be the same thing
- local caching and background prefetch are required for perceived speed
- dependency growth must be governed explicitly

The current repo does not satisfy those requirements yet.

The current system is a useful vertical slice, but it is still:

- too prompt-centric
- too state-light
- too heuristic in scoring
- too monolithic in the content-script path

So the master document should be treated as the source of the next implementation arc, with corrections below.

## Discrepancies

### 1. UI shape

The master doc still assumes a heavier branch-tree / sidebar-oriented interaction in several places.

That is now wrong for the product.

The repo has already moved toward the correct direction:

- compose-surface launcher
- compose-surface outcome UI
- no detached workspace in the normal loop

Decision:

- keep the compose-surface product shape
- do not regress to a permanent side panel
- interpret every master-doc UX requirement through the orb-dock model, not a sidebar model

### 2. Phase 1 foundation is mostly not implemented

The master doc is correct that several foundation pieces are still missing:

- `@boundaryml/baml` not integrated
- `Dexie` not integrated
- `webext-bridge` not integrated
- `motion` not integrated
- `floating-ui` not integrated
- `tinykeys` not integrated
- `json-rules-engine` not integrated

Current repo equivalents are lighter substitutes or custom paths:

- raw prompt + strict zod parsing instead of BAML
- `chrome.storage.local` instead of Dexie
- direct `chrome.runtime.sendMessage` instead of a typed bridge
- custom CSS + `@formkit/auto-animate` instead of a full motion layer
- manual geometry instead of Floating UI
- raw key handlers instead of tinykeys
- heuristics instead of a parameterized scoring engine

Decision:

- treat these as real gaps, not cosmetic improvements
- Phase 1 must harden the infrastructure before more UX polish

### 3. Current auth/runtime state does not match the master doc

The master doc is correct that production auth is still incomplete:

- Firebase JWT auth exists as a boundary, but is not the live default
- `local_hmac` is still the real local mode

Decision:

- Firebase remains mandatory before any real paid-user flow
- local development should still keep `local_hmac`
- the phase plan must distinguish local MVP and production auth, not blur them

### 4. Learning loop is only partially real

The master doc says the learning loop is not really live.

Current repo state is better than the master doc assumed, but still not good enough:

- provider-backed persona update and mirror paths exist
- local deterministic fallback still dominates important paths
- there is no explicit parameterizer or scoring config cache

Decision:

- do not restart the learning loop architecture from scratch
- harden the existing updater/mirror contracts into the master-doc pipeline:
  - `context_extractor`
  - `parameterizer`
  - `persona_loader`
  - `branch_generator`
  - `annotation_engine`
  - `persona_updater`
  - `mirror_trigger`

### 5. Annotation layer is still disconnected

This is the biggest product-quality issue and the master doc is right about it.

Current repo scoring still relies on:

- local heuristic draft scoring
- LLM branch generation
- limited connection between annotation and conversation-specific goals

What is missing:

- per-session scoring config
- deterministic rule engine fed by that config
- explicit ambiguity arbitration

Decision:

- annotation/scoring must be rebuilt first
- do not keep piling prompt tricks onto the current heuristic badge system

### 6. Current branch generation is still too wrapper-like

Even after the orb-dock work, the current branches can still feel like:

- polished rewrites
- weakly grounded predictions
- tone suggestions instead of strategic moves

The master doc is right that true branch intelligence requires:

- stronger context modeling
- explicit predicted response logic
- eventually lookahead simulation

Decision:

- fix this in stages
- do not jump straight to LangGraph simulation before the scoring and parameterization layers exist

### 7. Master doc overreaches on immediate framework migration

The master doc suggests a broad foundation migration all at once.

That is risky for repo health if done as one giant rewrite.

Decision:

- preserve current repo continuity
- migrate in vertical slices
- keep the active extension working while infrastructure is replaced underneath it

That means:

- no big-bang rewrite to WXT as the first step
- no simultaneous auth, memory, scoring, and branch intelligence rewrite
- each dependency must land with an ADR and a live path

## Corrected Implementation Strategy

The corrected strategy is:

1. fix the extension hot path and context pipeline first
2. replace disconnected scoring with parameterized scoring
3. make auth + learning loop production-real
4. harden context understanding and caching
5. add memory and rating systems
6. only then build true predictive branch intelligence

This keeps the repo clean and respects the product shape already validated with users.

## Phases

## Phase 0 - Hot Path Stabilization

### Goal

Stabilize the current compose-surface experience before introducing heavier infrastructure.

### Problems this phase fixes

- flicker from full content-script rerenders
- clunky open/close behavior
- shallow context updates while typing
- tone and prediction feeling detached from the current thread
- content-script being too large and mixed-responsibility

### Work

- split the current content-script into cohesive modules:
  - compose detection
  - context snapshotting
  - UI state machine
  - orb dock renderer
  - motion/transition adapter
  - insertion bridge
- stop rebuilding the whole compose UI on every state change
- make open/close/update flows incremental and stateful
- separate:
  - conversation-local context
  - profile-level memory/persona context
- ensure tone is derived from:
  - current conversation context first
  - profile context second
  - preset third
- add stronger thread-window extraction:
  - last recipient turn
  - visible thread summary
  - current draft
  - page metadata
  - confidence score

### Tests

- browser smoke for open/close without flicker
- browser smoke for focus changes between compose boxes
- browser smoke for orb apply after live draft edits
- failure test when compose node is removed mid-session

### Exit condition

- orb dock feels stable
- no obvious flicker on open, hover, select, or close
- context snapshot updates correctly as the current thread changes

## Phase 1 - Foundation Infrastructure

### Goal

Replace fragile implementation shortcuts with explicit infrastructure.

### Work

- add `@boundaryml/baml` for:
  - `ContextOutput`
  - `BranchTree`
  - `PersonaUpdateOutput`
  - `MirrorOutput`
  - `ScoringConfig`
  - `AnnotationOutput`
- add `Dexie` for local-first typed storage:
  - persona
  - interactions
  - observations
  - mirror insights
  - branch cache
  - scoring config cache
  - settings
- add `webext-bridge` for typed extension context messaging
- add `motion` for deliberate hero interactions
- add `floating-ui` for positioning the orb dock and hover/preview elements
- add `tinykeys` for shortcut handling
- add `json-rules-engine` and create `packages/scoring-engine`
- write ADRs for every new package in this phase

### Corrections to the master doc

- Shadow DOM stays mandatory
- compose-surface orb dock stays the primary UI
- Motion augments the orb dock and preview, not a sidebar tree
- AutoAnimate stays for incidental transitions; Motion handles the major gestures

### Tests

- contract parse tests for all BAML outputs
- Dexie integration tests
- bridge message tests
- floating-ui positioning smoke across viewport sizes
- keyboard shortcut tests
- scoring-engine rule evaluation tests

### Exit condition

- no raw message-passing left in the active hot path
- no raw `chrome.storage.local` reliance for primary state
- annotation engine runs locally against typed scoring config
- malformed model output cannot crash the UI

### Current implementation status

In repo now:

- Dexie-backed primary extension state
- branch cache and scoring-config cache
- webext-bridge scaffolding in the active hot path with compatibility fallback still present
- Motion, Floating UI, and tinykeys integrated into the compose-surface orb runtime
- `packages/scoring-engine` using `json-rules-engine`
- BAML contract source plus generated TypeScript client artifacts
- ADR-0002 through ADR-0013 written in `docs/adr`

Remaining before this phase is fully closed:

- remove the legacy raw message fallback from the active path after bridge hardening
- cut runtime contract parsing from zod-only to generated-client-backed BAML usage where safe

## Phase 2 - Parameterized Scoring

### Goal

Make the annotation layer conversation-aware and strategically meaningful.

### Work

- implement `parameterizer` as a real model stage
- generate `ScoringConfig` per live conversation session
- cache scoring config in Dexie by session
- feed the annotation engine with:
  - current conversation context
  - recipient risk factors
  - persona risk factors
  - situation preset
  - primary goal
- replace standalone heuristic-only annotation with:
  - deterministic rule evaluation
  - confidence score
  - optional LLM arbitration on ambiguity

### Tests

- unit tests for rule categories:
  - blunder
  - mistake
  - interesting
  - good
  - brilliant
- integration tests showing the same draft scoring differently across different recipients/presets
- arbitration tests for low-confidence rules

### Exit condition

- annotation is no longer generic
- same text scores differently when context changes
- the score reason is inspectable and tied to session config

## Phase 3 - Real Learning Loop and Auth

### Goal

Make the product thesis true for real users.

### Work

- enable live Firebase Auth in production mode
- keep `local_hmac` only for local development
- harden provider-backed `persona_updater`
- harden provider-backed `mirror_trigger`
- wire outcome capture through:
  - local storage
  - backend update
  - synchronized persona version increment
- implement branch prefetch after typing debounce

### Tests

- end-to-end auth flow tests
- outcome capture -> persona update integration tests
- mirror trigger threshold tests
- branch prefetch cache hit/miss tests

### Exit condition

- paid-user auth is real
- persona changes are observable after repeated real interactions
- branch open latency is mostly served from cache

## Phase 4 - Context Hardening

### Goal

Make the system read the live conversation better before it writes.

### Work

- add deterministic entity extraction with `RecognizersText`
- add local message pre-classification with `transformers.js`
- seed the few-shot conversation example library
- add pgvector-backed retrieval for parameterizer support
- improve recipient archetype and dialogue-state understanding

### Tests

- entity extraction tests for dates, deadlines, amounts
- sentiment/dialogue-state classification tests
- retrieval relevance tests
- context extraction regression tests on multiple fixture threads

### Exit condition

- context extractor passes more structured facts into the model
- parameterization quality improves on harder cases
- branch output feels materially less generic

## Phase 5 - Memory Architecture

### Goal

Move from one blob persona to selective memory.

### Work

- enable pgvector on Cloud SQL
- add persona shard storage
- add few-shot example storage
- integrate mem0 in `persona_loader`
- retrieve only relevant memory shards per session

### Tests

- shard creation tests
- shard retrieval tests
- token-footprint comparison tests
- memory quality regression tests

### Exit condition

- large user profiles no longer require full persona injection
- memory retrieval is selective, explainable, and measurable

## Phase 6 - Rating and Scorecard System

### Goal

Turn outcomes into a meaningful performance model.

### Work

- integrate `openskill.js`
- persist rating fields in the user model
- update scorecard logic to reflect:
  - performance
  - difficulty
  - uncertainty
- expose rating changes in the popup/scorecard

### Tests

- rating update tests
- recipient difficulty mapping tests
- scorecard regression tests

### Exit condition

- performance rating changes are visible and explainable
- scorecard reflects real interaction outcomes, not static heuristics

## Phase 7 - Predictive Branch Intelligence

### Goal

Make the system genuinely predictive instead of merely suggestive.

### Work

- introduce `LangGraphJS` stage orchestration
- implement one-turn lookahead simulation per branch
- generate recipient-response predictions through explicit inference
- score branch sequences, not isolated moves

### Tests

- graph-state inspection tests
- branch simulation tests
- failure/retry tests for lookahead stage
- cache tests for simulated responses

### Exit condition

- predicted responses are generated through an explicit branch-intelligence stage
- the selected-line preview is based on simulation, not thin assertion

## Implementation Rules

- no phase jumping
- no dependency addition without ADR
- no prompt-contract change without matching schema/test/doc update
- no UI rewrite without browser smoke coverage
- no hidden fallback behavior

## Immediate Next Execution Slice

The next coding slice should be:

1. Phase 0 hot-path stabilization
2. Phase 1 foundation work, in this order:
   - Dexie
   - webext-bridge
   - floating-ui
   - tinykeys
   - Motion
   - scoring-engine scaffold
   - BAML adoption

Reason:

- these directly address the currently observed flicker, context, and clunkiness issues
- they improve repo cleanliness immediately
- they create the right base for the rest of the master doc

## Done Means

This plan is only complete when:

- repo docs reflect the actual shipped state
- the extension hot path is smooth and inspectable
- scoring is parameterized
- auth and learning are real
- branch intelligence is predictive
- every phase has matching tests, docs, and failure-path coverage
