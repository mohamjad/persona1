# persona1 Phased Build Plan

## Purpose

This document turns the source-of-truth plan into execution phases.

It exists so implementation can move quickly without losing cohesion.

Use this with:

- [specs/persona1-source-of-truth-plan.md](/C:/Users/moham/persona1/specs/persona1-source-of-truth-plan.md)
- [specs/persona1-spec-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-spec-v2-source.txt)

## Implementation Status

Current repo status against these phases:

- Phase 0: complete
- Phase 1: complete
- Phase 2: complete
- Phase 3: complete
- Phase 4: complete, with provider-backed and deterministic fallback persona evolution
- Phase 5: complete at the code level, with repository adapters and sync endpoints in place
- Phase 6: complete at the product level, with platform extractors implemented across the spec surface
- Phase 7: substantially complete through tests, validation, and explicit failure handling; live infra still depends on external credentials

## Phase 0 - Planning And Repo Discipline

Goal:

- preserve the source spec
- write the source-of-truth plan
- define architecture and design philosophy
- define agent rules and documentation discipline

Done when:

- the source spec is preserved in-repo
- repo docs exist
- the first implementation slice is documented before code begins

## Phase 1 - Inference Vertical Slice

Goal:

- make the core product loop real in the smallest possible way

Scope:

- workspace scaffold
- shared contracts and types
- prompt contract modules
- strict branch-generator output parsing
- `POST /v1/analyze`
- `GET /v1/health`
- manual or smoke harness for the analyze path

Non-goals:

- persona updater
- mirror
- sync
- billing
- full platform extraction

Proof standard:

- analyze endpoint accepts structured input
- parser rejects malformed model output
- success and failure paths are tested

## Phase 2 - Extension Vertical Slice

Goal:

- make the extension render the chess-tree shell in real pages

Scope:

- Manifest V3 scaffold
- service worker skeleton
- content script compose detection
- sidebar shell and state machine
- popup shell
- LinkedIn extractor
- Gmail extractor
- fallback extractor
- storage key definitions

Non-goals:

- full UX polish
- outcome capture
- mirror surfacing
- full platform support

Proof standard:

- extension builds
- content script can detect supported compose contexts
- sidebar enters the expected states

## Phase 3 - MVP Monetization And Observation

Goal:

- make the MVP commercially and operationally real

Scope:

- cold-start context selection
- local persona storage
- local interaction log
- usage count gate
- paywall after three uses
- billing checkout and webhook skeleton

Non-goals:

- full tier matrix
- unlimited plan behavior
- world1 bundle behavior

Proof standard:

- usage count increments predictably
- paywall gate trips at the correct threshold
- local observation data is stored explicitly

## Phase 4 - Persona Evolution

Goal:

- make the product learn from use

Scope:

- outcome capture
- persona updater
- versioned persona model updates
- mirror trigger
- mirror insights storage

Proof standard:

- persona version increments
- conservative update logic is tested
- mirror only triggers when evidence threshold is met

## Phase 5 - Paid Sync And Backend Persistence

Goal:

- turn local-first MVP into a cross-device product for paid users

Scope:

- users table
- personas table
- interactions table
- mirror insights table
- sync endpoint
- merge rules
- canonical server persona behavior

Proof standard:

- local and remote persona state can converge deterministically
- merge conflicts are resolved by documented rules

## Phase 6 - Platform Expansion

Goal:

- expand supported conversation contexts carefully

Scope:

- Twitter/X DMs
- Slack
- dating apps
- additional extractor hardening

Proof standard:

- each platform extractor has isolated logic
- failure falls back cleanly instead of breaking the extension

## Phase 7 - Product Hardening

Goal:

- make the system trustworthy under real usage

Scope:

- extraction failure observability
- inference tracing
- stricter logs and diagnostics
- auth hardening
- billing hardening
- UX clarity improvements
- cost-control enforcement

Proof standard:

- important failures are inspectable
- logs are actionable
- system behavior remains readable under load and error

## Execution Rule

When implementing:

- finish the current phase cleanly before scattering work into the next one
- only violate phase order when there is a concrete dependency
- document every deviation
