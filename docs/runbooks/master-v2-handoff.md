# Master V2 Handoff

## Purpose

This document is the handoff for the `persona1_master_v2` implementation now
shipped in repo. It separates three things clearly:

- what is already implemented in code
- what is live locally right now
- what still needs credentials, authorization, or product-specific activation

Use this together with:

- [README.md](/C:/Users/moham/persona1/README.md)
- [docs/architecture.md](/C:/Users/moham/persona1/docs/architecture.md)
- [docs/current-state.md](/C:/Users/moham/persona1/docs/current-state.md)
- [specs/persona1-master-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-master-v2-source.txt)

## Implemented In Repo

The following are implemented and tested in code:

- OpenRouter-backed analyze path with strict contracts
- per-session scoring parameterization with deterministic fallback
- deterministic draft annotation
- recipient context enrichment with RecognizersText and sentiment/dialogue-state classification
- memory retrieval across:
  - past interactions
  - persona shards
  - seeded few-shot examples
  - optional Mem0 cloud search
- OpenSkill-based performance rating
- LangGraph-based branch lookahead and reranking
- Firebase-capable JWT verification on the API
- Firebase session bootstrap route on the API
- filesystem and Postgres repository support
- SQL migrations for:
  - Firebase UID
  - rating columns
  - persona shards
  - few-shot examples
- optional pgvector upgrade migration
- local extension parity for:
  - rating
  - mirror cadence
  - scorecard surfacing

## Verified Runtime

The shipped tree has passed:

- `corepack pnpm test`
- `corepack pnpm validate:extension`
- `corepack pnpm smoke:extension`
- `corepack pnpm smoke:api`
- `corepack pnpm baml:check`

So the implementation is not just scaffolded; it is integrated and green in the
local runtime.

## Local Default Mode

Without extra credentials, the repo runs in a safe local-first shape:

- auth mode defaults to `local_hmac`
- storage defaults to filesystem if no Postgres URL is supplied
- Mem0 retrieval is skipped if Mem0 credentials are absent
- Firebase session bootstrap exists, but Firebase is not required for local use
- pgvector is not required for the repo to function

This means the repo is usable locally now without blocking on production
infrastructure.

## Credential-Gated Activation

These items are already implemented in code, but require runtime secrets or
authorization to activate fully.

### 1. OpenRouter

Required for live model inference:

- `OPENROUTER_API_KEY`
- optional `OPENROUTER_MODEL`

Without this, `/v1/analyze` returns unavailable and the rest of the repo still
builds/tests cleanly.

### 2. Firebase Auth

Required for production JWT-based auth:

- `PERSONA1_AUTH_MODE=firebase_jwt`
- `FIREBASE_PROJECT_ID`
- either:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - or ambient application default credentials

What is already done:

- API-side token verification
- API-side session bootstrap at `/v1/auth/session`

What still needs product-specific authorization wiring:

- extension-side user sign-in UX for your actual Firebase project

The repo is backend-ready for Firebase auth. The missing part is project-specific
client auth UX, not server capability.

### 3. Postgres / Cloud SQL

Required for durable shared backend state:

- `AI_OS_DATABASE_URL`
  or
- `PERSONA1_DATABASE_URL`

Run:

1. [001_initial.sql](/C:/Users/moham/persona1/packages/db/migrations/001_initial.sql)
2. [002_master_v2.sql](/C:/Users/moham/persona1/packages/db/migrations/002_master_v2.sql)

This enables:

- durable users
- personas
- interactions
- mirror insights
- persona shards
- few-shot examples
- rating columns
- Firebase UID binding

### 4. pgvector

Optional production upgrade, only when DB authorization and hosting support it:

- apply [003_pgvector_optional.sql](/C:/Users/moham/persona1/packages/db/migrations/003_pgvector_optional.sql)

Important:

- the repo currently works without pgvector
- the current implementation stores embedding-ready fields without requiring the extension
- this upgrade is for better semantic retrieval later, not for core runtime correctness today

### 5. Mem0

Optional cloud memory retrieval:

- `MEM0_API_KEY`
- optional `MEM0_PROJECT_ID`

If absent:

- memory retrieval still works from interactions, persona shards, and seeded few-shot examples

### 6. Stripe

Required for real billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`

Without these:

- billing boundaries exist
- production checkout cannot complete

## Intentional Production Notes

These are not missing features. They are intentional implementation choices.

### Inline LangGraph, not Cloud Tasks

The repo currently runs branch lookahead inline.

Why:

- it keeps the MVP deterministic and inspectable
- it keeps the local loop fast enough for current scope

When to move it:

- if branch simulation cost starts hurting latency
- if you want background deeper rollouts

At that point, move simulation to Cloud Tasks. The current implementation does
not require that yet.

### JSON-backed embeddings before pgvector

The repo is vector-ready, but defaults to JSON-backed embedding fields until
pgvector is explicitly enabled.

Why:

- keeps local/dev environments portable
- avoids pretending extension installation is mandatory for basic runtime
- prevents the DB layer from hard-failing in environments without extension auth

### Local-first extension state remains valid

The extension still works in local-first mode. This is intentional.

The server now supports production-grade auth and durable state, but the
extension does not require those paths to function for MVP/local use.

## Recommended Activation Order

For the cleanest production bring-up:

1. keep OpenRouter live first
2. switch backend storage to Postgres
3. apply migrations `001` and `002`
4. enable Firebase JWT mode on the API
5. add project-specific extension sign-in UX
6. enable Stripe
7. enable Mem0 if you want cloud memory
8. enable pgvector only when DB support is confirmed

## Final State Summary

The `master_v2` architecture is implemented in repo.

What remains is mostly environment activation:

- secrets
- cloud auth
- database extension authorization
- project-specific client sign-in UX

Those are deployment/runtime concerns, not missing core architecture.
