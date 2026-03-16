# persona1 Source-of-Truth Plan

## Purpose

This document is the implementation-facing source-of-truth plan for `persona1`.

It is based directly on the provided `persona1_spec_v2.docx`.

The full extracted source text is preserved in:

- [specs/persona1-spec-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-spec-v2-source.txt)

This plan should be used to guide implementation.
The extracted source file should be used to verify that no original scope or detail has been lost.

## Planning Rule

If this document and the preserved source text ever diverge:

1. the preserved source text wins for intent
2. update this plan immediately
3. document the clarification in [specs/open-questions.md](/C:/Users/moham/persona1/specs/open-questions.md)

## 1. Product Thesis

`persona1` is a chess engine for human conversation.

The product is built around one central claim:

- people usually know what they want to say
- they do not know how it will land

The product therefore does not optimize for cleaner writing.
It optimizes for downstream conversational visibility.

Core product promise:

- the user sees the likely branches of the conversation before sending

## 2. Product Definition

### Core Loop

The core experience is:

1. the extension reads the live conversation context
2. the user types a draft
3. the system renders exactly three move branches
4. each branch includes:
   - message
   - predicted recipient response
   - branch path
   - optional strategic explanation
   - optional risk
5. the user chooses a move

The product output is a map, not a rewrite.

### Critical Product Constraint

The most important quality bar in the source spec is:

- fake game tree kills trust

That means the system must always prefer:

- specific predicted responses

over:

- vague, hedged, obviously generic predictions

## 3. Product Differentiation

The product differs from rewriter tools in these ways:

- models both sides of the conversation
- returns branches, not rewritten copy
- learns passively from observed behavior
- reads context automatically from live pages
- stores and calibrates a persistent persona model
- aims to show consequences before the user sends

## 4. User-Facing Product Surfaces

### Chess Tree UI

The extension UI must render:

- three options maximum
- one clearly recommended option
- the other two as secondary options

Each option card must include:

- message
- predicted response
- branch path
- why it works
- risk

Interaction rules:

- `Use This` inserts into compose box
- copy action available
- keyboard shortcuts `1`, `2`, `3`, `Enter`

### Mirror Feature

After enough interaction history, the product should surface communication patterns back to the user.

These are:

- observations
- not advice
- not reports
- only shown when supported by repeated evidence

The mirror is the retention and lock-in mechanism.

### Situation Presets

The source spec requires preset-based optimization, not tone-only variants.

Current preset list from source:

- `date`
- `negotiate`
- `apologize`
- `pitch`
- `reconnect`
- `confront`
- `close`
- `decline`

MVP cut reduces that to:

- `date`
- `pitch`
- `negotiate`

### Virality Mechanic

Two intended shareable artifacts are part of the product strategy:

- chess tree screenshots
- communication scorecards

Only the chess tree is MVP-relevant.
Scorecards are post-MVP.

## 5. Passive Learning Architecture

### Philosophy

There is no heavy onboarding form.

The system should learn from:

- drafts
- edits
- chosen options
- rejected options
- outcomes

instead of self-reported personality claims.

### Cold Start

The only initial setup is one-tap selection of:

- `dating`
- `professional`
- `general`

This sets the initial prior.

### Learning Phases

The source spec defines three learning phases:

1. Observation mode
2. Active calibration
3. Mirror activation

These phases should remain explicit in the implementation plan.

### Observation Pipeline

The extension should log:

- `draft_raw`
- `draft_final`
- `delta`
- `option_chosen`
- `option_rejected`
- `platform`
- `recipient_context_hash`
- `session_id`

Free tier:

- local-only persona storage

Paid tier:

- backend sync enabled

### Persona Profile Schema

The persona profile is a versioned JSON model containing:

- confidence
- communication defaults
- observed patterns
- strengths
- weaknesses
- context performance
- platform calibration
- last updated timestamp
- interaction count

Implementation rule:

- persona versioning is not optional

## 6. Inference Pipeline

The product pipeline is defined as:

1. `context_extractor`
2. `persona_loader`
3. `branch_generator`
4. `persona_updater`
5. `mirror_trigger`

Execution model:

- stages 1 and 2 run in parallel
- stage 3 depends on both
- stages 4 and 5 run asynchronously after interaction/outcome

### Prompt Contracts

The source spec includes concrete prompt contracts for:

- `context_extractor`
- `branch_generator`
- `persona_updater`
- `mirror_trigger`

Implementation rule:

- these should be preserved as prompt contracts in code and docs
- parser validation should be strict
- output shapes should be versioned if they evolve

### Branch Generator Non-Negotiables

The branch generator must:

- sound like the sender
- model the recipient specifically
- return specific predicted responses
- flag drafts that conflict with user goals
- recommend the most strategically aligned option, not merely the safest one
- avoid moralizing or disclaimers

## 7. Extension Specification

### Manifest and Runtime

The product is defined as a Manifest V3 Chrome extension.

Key surfaces:

- service worker
- content script
- sidebar UI
- popup UI
- platform-specific extractors

### File/Module Targets

The source spec expects:

- `background.js`
- `content.js`
- `sidebar.html`
- `sidebar.js`
- `popup.html`
- `popup.js`
- extractor modules per platform

### Platform Support

Source target platforms:

- LinkedIn
- Gmail
- Twitter/X DMs
- dating apps
- Slack
- fallback

MVP cut:

- LinkedIn
- Gmail
- fallback

### Sidebar State Machine

The spec defines the sidebar states explicitly:

- `idle`
- `compose_detected`
- `context_ready`
- `analyzing`
- `branches_ready`
- `option_selected`
- `outcome_capture`
- `mirror_ready`
- `error`

Implementation rule:

- treat this as a real state machine, not informal UI behavior

### Local Storage Schema

Required local keys from source spec:

- `p1_persona`
- `p1_user_id`
- `p1_auth_token`
- `p1_plan`
- `p1_usage_count`
- `p1_onboarding_done`
- `p1_cold_start_context`
- `p1_interaction_log`
- `p1_observation_queue`
- `p1_mirror_insights`
- `p1_settings`

### Shortcuts

Required shortcuts:

- toggle sidebar
- analyze
- select option 1
- select option 2
- select option 3
- copy selected
- collapse sidebar

## 8. Backend Specification

### Stack

The source spec calls for:

- Node.js
- TypeScript
- GCP Cloud Run
- Cloud SQL Postgres
- Firebase Auth
- Stripe
- Anthropic Claude
- GCP Secret Manager
- structured logging
- business config

### API Surface

Required API endpoints from source:

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

### Database Schema

Required durable tables from source:

- `users`
- `personas`
- `interactions`
- `mirror_insights`

Implementation rule:

- schema should be migrated explicitly
- repositories should make persistence boundaries clear

## 9. Monetization

The full pricing target in the source spec is:

- free
- monthly
- unlimited
- world1 bundle

The MVP cut is:

- `$9/month` only

The source spec also requires:

- free tier limited to 3 total uses
- Stripe embedded checkout in extension
- cost-cap and throttling strategy on the monthly plan

Implementation rule:

- MVP should implement only the launch billing shape unless reprioritized

## 10. Distribution Kernel

The source spec explicitly separates product from distribution.

That distinction should remain intact.

Distribution details preserved from source:

- founder account is the real demo
- content system includes outcome posts, observations, motion posts, mirror drops, and contrast posts
- AI-OS distribution is separate infrastructure
- multiple X accounts, proxies, and scheduling are part of distribution, not product kernel
- launch sequence depends on social proof before heavy product mention

Implementation rule:

- keep these notes documented
- do not let distribution logic infect core product architecture

## 11. Risk Register

The source spec names the following key risks:

- fake game tree
- wrong passive persona modeling
- too much cognitive load
- DOM extraction breakage
- manipulative-feeling outputs
- noisy outcome signal
- install friction
- API cost erosion

Implementation rule:

- every risk should map to at least one design or test mitigation

## 12. Success Metrics

The source spec defines:

- week 1 metrics
- month 1 metrics
- platform threshold metrics

These should be preserved as product metrics, not engineering-only notes.

## 13. MVP Build Order

The source spec says section 11 is the only thing that matters for the first build night.

That MVP cut is the starting implementation plan:

### Ship First

- extension scaffold
- cold-start selection
- LinkedIn and Gmail extractors
- branch generator prompt and analyze endpoint
- sidebar chess tree UI
- paywall after 3 uses
- local persona storage
- observation logging
- Cloud Run API with core billing and auth endpoints

### Do Not Ship In First Cut

- persona updater
- mirror trigger
- outcome capture
- Twitter/dating/Slack extractors
- multi-device sync
- scorecard mechanic
- full preset catalog
- multi-tier billing

### Actual Build Priority

1. branch generator prompt
2. analyze endpoint
3. content script compose detection
4. sidebar tree UI
5. cold-start popup
6. paywall gate
7. observation logging

## 14. Proposed Repo Milestones

### Milestone 0

Docs and planning only.

Deliverables:

- source spec preserved
- source-of-truth plan
- architecture doc
- design philosophy
- agent guidance

### Milestone 1

Inference vertical slice.

Deliverables:

- analyze endpoint
- strict prompt contract
- strict parser
- one manual test harness

### Milestone 2

Extension vertical slice.

Deliverables:

- extension shell
- LinkedIn + Gmail extraction
- sidebar state machine
- option insertion + copy flow

### Milestone 3

Monetization and observation.

Deliverables:

- usage counting
- paywall gate
- local persona storage
- local observation log

### Milestone 4

Persona evolution layer.

Deliverables:

- persona updater
- outcome capture
- mirror trigger
- paid sync

## 15. Coverage Checklist

The following source sections are explicitly preserved by this repo:

- section 0: world1 placement and intended module layout
- section 1: problem statement
- section 2: product definition, chess UI, mirror, presets, virality
- section 3: passive learning architecture
- section 4: full inference pipeline and prompt contracts
- section 5: extension spec, state machine, storage, shortcuts, extractors
- section 6: backend stack, endpoints, schema
- section 7: monetization
- section 8: distribution kernel and launch sequence
- section 9: risk register
- section 10: success metrics
- section 11: MVP build order

No original source content should be considered discarded while the preserved source file remains in the repo.
