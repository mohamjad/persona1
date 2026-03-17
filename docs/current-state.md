# Current State

## Status

Current repo status:

- source spec extracted from the provided `.docx`
- source-of-truth planning docs created
- full repo scaffold implemented
- API implemented
- Chrome extension implemented with a three-outcome orb dock as the active MVP surface
- local-first persona engine implemented
- billing and usage tracking implemented
- repository adapters implemented
- provider-backed persona update and mirror inference implemented with deterministic fallback
- Firebase-compatible auth verification boundary implemented
- master_v2 runtime systems implemented: scoring parameterization, context enrichment, memory retrieval, rating, and branch simulation
- tests implemented and passing

## Source Documents

Current canonical planning inputs:

- [specs/persona1-spec-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-spec-v2-source.txt)
- [specs/persona1-source-of-truth-plan.md](/C:/Users/moham/persona1/specs/persona1-source-of-truth-plan.md)
- [specs/persona1-phased-build-plan.md](/C:/Users/moham/persona1/specs/persona1-phased-build-plan.md)
- [specs/persona1-master-source.txt](/C:/Users/moham/persona1/specs/persona1-master-source.txt)
- [specs/persona1-master-phase-plan.md](/C:/Users/moham/persona1/specs/persona1-master-phase-plan.md)
- [specs/persona1-master-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-master-v2-source.txt)

## Implemented Product Surface

Implemented now:

- `POST /v1/analyze`
- `POST /v1/persona/update`
- `GET /v1/persona/:user_id`
- `POST /v1/persona/sync`
- `POST /v1/mirror/check`
- `POST /v1/auth/register`
- `POST /v1/auth/session`
- `POST /v1/billing/checkout`
- `POST /v1/billing/webhook`
- `GET /v1/usage/:user_id`
- `GET /v1/health`

Extension capabilities now implemented:

- automatic cold-start inference on first live analyze
- active-input-only launcher behavior
- LinkedIn compose extraction
- Gmail compose extraction
- X DM extraction
- Slack extraction
- dating-app extraction
- fallback extraction
- compact three-orb dock rendering anchored directly to the active compose box
- circular move icon anchored directly to the draft surface
- low-information `-` draft state when there is not enough text to justify a scored move
- closed-state launcher hides while the branch bloom is open and can be dragged or dismissed
- each orb represents a different outcome and the preview stays collapsed until the user hovers or selects a line
- conversation-first context payloads with a live conversation summary, recent visible messages, and a goal hint separate from profile-level tone shaping
- `@formkit/auto-animate` is used to smooth the dock and preview transitions
- `motion` and `floating-ui` now back the deliberate open/close and compose anchoring paths
- `tinykeys` now owns the active hotkey path
- keyboard-first analysis with `Ctrl/Cmd+Shift+Space`
- chess-style draft annotations and branch annotations
- option insertion into the active compose box
- internal preset inference without exposing a preset picker in the live UI
- local usage tracking without enforced free-cap blocking
- local observation logging
- local persona storage
- Dexie-backed primary extension storage with branch cache and scoring-config cache
- branch prefetch after typing debounce with background cache reuse
- BAML contract source in `baml_src/` and generated TypeScript clients in `baml_client/`
- local outcome capture
- local mirror surfacing
- local communication scorecard
- provider-backed persona update and mirror response handling for authenticated flows
- self-contained browser smoke harness for LinkedIn-style, Gmail-style, and fallback compose analysis and branch insertion without depending on a stale external API process
- scoring-engine package using `json-rules-engine` to score drafts against session-aware scoring configs
- scoring parameterizer call through OpenRouter with deterministic fallback config generation
- server-side context enrichment using RecognizersText facts plus recipient sentiment and dialogue-state classification
- retrieved few-shot examples and persona-memory summaries injected into analysis calls
- optional mem0 retrieval hook for cloud memory search when credentials are present
- LangGraph-backed branch intelligence that simulates lookahead summaries and reranks branches before the response returns
- performance rating persisted in persona profiles and mirrored into extension scorecards
- persona shard persistence and few-shot example persistence in repository adapters and SQL migrations
- mirror surfacing gated to 25-interaction checkpoints with a 5-evidence minimum

## What Exists Today

Code and docs exist today for:

- repo guidance
- design philosophy
- architecture target
- current state
- open questions
- preserved source spec
- API server
- extension runtime
- AI kernel
- persona engine
- DB adapters
- billing service
- migrations
- tests

## External Dependencies Still Needed For Live Production Behavior

The repo is functional without these resources, but live behavior depends on them:

- `OPENROUTER_API_KEY` for live analysis, persona update, and mirror inference calls
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID` for live billing
- `AI_OS_DATABASE_URL` or `PERSONA1_DATABASE_URL` for Cloud SQL / Postgres persistence
- Firebase project configuration if the runtime auth mode is switched from local HMAC to Firebase JWT verification
- `MEM0_API_KEY` and optional `MEM0_PROJECT_ID` if cloud memory search should be enabled

## Build Rule

Any further implementation should preserve the existing move-tree contract shapes and extend them without hiding behavior behind new abstraction layers.
