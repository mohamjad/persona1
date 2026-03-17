# Architecture

## Purpose

This document is the current architecture map for `persona1`.

It started as the implementation target and now describes the architecture that is actually on disk.

## Product Boundary

persona1 is the product.

It is not the social automation or growth infrastructure around it.

In source-spec terms:

- persona1 = Chrome extension + backend + persona model + billing + product UX
- distribution = separate concern

Distribution may be documented in this repo for completeness, but it should not distort the product kernel.

## Target Topology

The source spec assumes a world1-style modular layout. In this repo, that target topology should still be preserved:

- `apps/persona1-ext`
  Chrome extension, Manifest V3, icon-anchored branch bloom UI, content scripts, service worker
- `apps/persona1-api`
  Cloud Run API, inference endpoints, auth, billing hooks, sync endpoints
- `packages/ai-kernel`
  prompt builder, parsers, token counting, inference orchestration helpers
- `packages/persona-engine`
  persona schema, update rules, mirror logic, merge logic
- `packages/db`
  Postgres client, migrations, repositories, typed persistence boundaries
- `packages/billing`
  Stripe integration, plan enforcement, usage metering
- `businesses/persona1`
  presets, pricing, feature flags, prompt templates, config
- `infra/persona1`
  deployment config, secrets refs, Cloud Run and Cloud SQL wiring
- `specs/`
  product spec, source-of-truth plan, open questions

## Core Runtime Pipeline

The core inference path is four-stage plus one async mirror trigger:

1. `context_extractor`
   reads DOM/page content and extracts recipient context JSON
2. `persona_loader`
   loads and calibrates the sender persona for the current context
3. `branch_generator`
   produces exactly three conversation branches
4. `persona_updater`
   updates the persona profile after outcome signal
5. `mirror_trigger`
   surfaces recurring communication patterns after thresholded evidence

Stages 1 and 2 are parallel.
Stage 3 depends on both.
Stages 4 and 5 are async.

## Primary Product Surfaces

### Extension

The extension owns:

- compose detection
- DOM extraction
- icon-anchored branch bloom attached to the active draft
- keyboard-first analysis and move application
- local observation logging
- local persona storage
- auth token presence for paid flows
- local free-tier usage gating
- local mirror derivation
- option insertion back into the live compose box
- local communication scorecard generation

### API

The API owns:

- analysis endpoint
- persona update endpoint
- persona sync
- mirror check
- auth registration
- billing checkout
- billing webhook
- usage reporting
- local registration flow for dev/runtime environments without Firebase wiring
- repository selection between filesystem and Postgres

### Database

The database owns durable server-side state for:

- users
- personas
- interactions
- mirror insights

## State Boundaries

### Local Extension State

The extension stores:

- current persona profile for local-first use
- usage count
- onboarding state
- cold-start context
- interaction log
- observation queue
- mirror insights
- settings

### Backend State

The backend stores canonical paid-user state and syncable model state.

Free-tier users are local-first by design in the MVP shape.

In the current implementation:

- free users can analyze without registration
- paid/synced routes require bearer auth
- the default runtime uses local HMAC auth
- a Firebase-compatible JWT verifier is implemented and can be enabled through runtime configuration
- the default local repository is filesystem-backed until `AI_OS_DATABASE_URL` or `PERSONA1_DATABASE_URL` is supplied

## Current Implementation Cut

The repo currently implements:

- LinkedIn extractor
- Gmail extractor
- X DM extractor
- Slack extractor
- dating-app extractor
- fallback extractor
- icon-anchored branch bloom with draft annotations and move labels
- popup settings and fallback controls
- full preset catalog across date, pitch, negotiate, apologize, reconnect, confront, close, and decline
- analyze endpoint
- persona update endpoint
- persona sync endpoint
- mirror check endpoint
- auth registration endpoint
- billing checkout and webhook endpoints
- usage endpoint
- local persona storage
- local observation logging
- local outcome capture
- local mirror surfacing
- local communication scorecard
- provider-backed persona update and mirror inference with deterministic fallback
- free gate after three uses
- Stripe adapter boundaries
- Postgres adapter boundaries
- Firebase-compatible auth verification boundary

## Architectural Non-Negotiables

- branch outputs must be parsed against strict contracts
- failure must degrade gracefully to manual input, not crash the UI
- platform extractors must be isolated per platform
- persona updates must be versioned
- important runtime assumptions must be documented
- no hidden prompt mutation or silent fallback behavior without logs and docs

## Explicit Deviations

The code intentionally deviates from the original source spec in one active operational place:

1. `OpenRouter` is the active inference provider instead of direct Anthropic integration.
2. The active MVP UI is an injected icon-anchored branch bloom instead of Chrome's native side panel because the inline workflow is more reliable under MV3 gesture restrictions and avoids blocked embedded-extension pages.

The auth story is no longer a structural deviation because a Firebase-compatible verifier already exists in code. The runtime still defaults to `local_hmac` until Firebase project configuration is supplied.
