# persona1

Conversation intelligence system for showing the likely branches of a conversation before the user sends a message.

## Current State

This repo is no longer a thin scaffold.

The currently implemented product path includes:

- Chrome extension with live compose detection, auto-inferred context mode, keyboard-first analysis, a circular move icon, icon-anchored branch bloom rendering, option insertion, outcome capture, mirror surfacing, and local scorecard output
- multi-platform extraction across LinkedIn, Gmail, X DMs, Slack, dating-app surfaces, and fallback compose targets
- OpenRouter-backed analysis with strict contract parsing and provider-backed persona update and mirror inference
- deterministic local/server fallback behavior for persona evolution when provider paths fail
- local-first persona storage, observation logging, usage gating, and sync-ready state
- Node/TypeScript API with analyze, persona update, persona sync, mirror check, auth register, billing checkout/webhook, usage, and health routes
- filesystem and Postgres persistence boundaries with explicit SQL migrations
- Stripe billing boundary and Firebase-compatible JWT verification boundary

The full build and test suite is green with `corepack pnpm test`.

## Repo Shape

- `/apps`: deployable product surfaces, including the API and Chrome extension
- `/packages`: shared kernel, persona engine, database, and billing modules
- `/businesses`: product config, presets, pricing, and feature flags
- `/docs`: current-state docs, architecture notes, and design philosophy
- `/infra`: infrastructure notes and deployment-facing scaffolding
- `/scripts`: smoke and local runtime scripts
- `/specs`: preserved product spec, source-of-truth plan, phased plan, and open questions

## Authoritative Docs

Start here:

- [AGENTS.md](/C:/Users/moham/persona1/AGENTS.md)
- [docs/design-philosophy.md](/C:/Users/moham/persona1/docs/design-philosophy.md)
- [docs/architecture.md](/C:/Users/moham/persona1/docs/architecture.md)
- [docs/current-state.md](/C:/Users/moham/persona1/docs/current-state.md)
- [specs/persona1-source-of-truth-plan.md](/C:/Users/moham/persona1/specs/persona1-source-of-truth-plan.md)
- [specs/persona1-phased-build-plan.md](/C:/Users/moham/persona1/specs/persona1-phased-build-plan.md)
- [specs/persona1-spec-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-spec-v2-source.txt)
- [specs/open-questions.md](/C:/Users/moham/persona1/specs/open-questions.md)

## Current Operating Model

The current product direction is:

`page context -> recipient context -> persona model -> branch tree -> selected move -> outcome -> persona update -> mirror`

The current live implementation is local-first by default, with server-backed sync, billing, and durable storage available when runtime credentials are supplied.

The active MVP UI is an injected icon-anchored branch bloom rather than Chrome's native side panel. The main interaction is: focus a draft, click the circular move icon or press `Ctrl/Cmd+Shift+Space`, inspect the three branches attached to that same writing surface, then hit `1`, `2`, or `3` to apply a move. Cold start and preset selection are inferred from context instead of being exposed in the normal flow.

## Local Runtime

Start the local API:

- `corepack pnpm start:api`

Run the extension smoke with OpenRouter:

- `corepack pnpm smoke:extension`

Validate the extension package:

- `corepack pnpm validate:extension`

## Documentation Standard

This repo is expected to keep the same discipline as `ai-os`:

- current-state docs match the actual code
- important failures and fallback behavior are documented
- contract surfaces are explicit
- runtime assumptions are written down
- there are no hidden product behaviors that exist only in code
