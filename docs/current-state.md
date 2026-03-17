# Current State

## Status

Current repo status:

- source spec extracted from the provided `.docx`
- source-of-truth planning docs created
- full repo scaffold implemented
- API implemented
- Chrome extension implemented with an icon-anchored branch bloom as the active MVP surface
- local-first persona engine implemented
- billing and usage tracking implemented
- repository adapters implemented
- provider-backed persona update and mirror inference implemented with deterministic fallback
- Firebase-compatible auth verification boundary implemented
- tests implemented and passing

## Source Documents

Current canonical planning inputs:

- [specs/persona1-spec-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-spec-v2-source.txt)
- [specs/persona1-source-of-truth-plan.md](/C:/Users/moham/persona1/specs/persona1-source-of-truth-plan.md)
- [specs/persona1-phased-build-plan.md](/C:/Users/moham/persona1/specs/persona1-phased-build-plan.md)

## Implemented Product Surface

Implemented now:

- `POST /v1/analyze`
- `POST /v1/persona/update`
- `GET /v1/persona/:user_id`
- `POST /v1/persona/sync`
- `POST /v1/mirror/check`
- `POST /v1/auth/register`
- `POST /v1/billing/checkout`
- `POST /v1/billing/webhook`
- `GET /v1/usage/:user_id`
- `GET /v1/health`

Extension capabilities now implemented:

- automatic cold-start inference on first live analyze
- LinkedIn compose extraction
- Gmail compose extraction
- X DM extraction
- Slack extraction
- dating-app extraction
- fallback extraction
- compact branch bloom rendering anchored directly to the active compose box
- circular move icon anchored directly to the draft surface
- closed-state launcher hides while the branch bloom is open and can be dragged or dismissed
- each branch card leads with the likely outcome and stays inside the compose surface footprint
- keyboard-first analysis with `Ctrl/Cmd+Shift+Space`
- chess-style draft annotations and branch annotations
- option insertion into the active compose box
- internal preset inference without exposing a preset picker in the live UI
- local usage tracking without enforced free-cap blocking
- local observation logging
- local persona storage
- local outcome capture
- local mirror surfacing
- local communication scorecard
- provider-backed persona update and mirror response handling for authenticated flows
- browser smoke harness for LinkedIn-style, Gmail-style, and fallback compose analysis and branch insertion

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

## Build Rule

Any further implementation should preserve the existing move-tree contract shapes and extend them without hiding behavior behind new abstraction layers.
