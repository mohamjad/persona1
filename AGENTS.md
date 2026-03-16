# persona1 Agent Guidance

## Purpose

This file defines the execution rules for agents working in the `persona1` repo.

The repo standard is:

- readable code
- cohesive modules
- explicit control flow
- strong failure testing
- documentation that prevents black-box behavior

Read this file before making architectural or implementation decisions.

Use it together with:

- [README.md](/C:/Users/moham/persona1/README.md)
- [docs/design-philosophy.md](/C:/Users/moham/persona1/docs/design-philosophy.md)
- [docs/architecture.md](/C:/Users/moham/persona1/docs/architecture.md)
- [docs/current-state.md](/C:/Users/moham/persona1/docs/current-state.md)
- [specs/persona1-source-of-truth-plan.md](/C:/Users/moham/persona1/specs/persona1-source-of-truth-plan.md)
- [specs/persona1-phased-build-plan.md](/C:/Users/moham/persona1/specs/persona1-phased-build-plan.md)
- [specs/persona1-spec-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-spec-v2-source.txt)
- [specs/open-questions.md](/C:/Users/moham/persona1/specs/open-questions.md)

## Current State

Current repo state:

- source spec preserved in-repo
- source-of-truth plan written
- architecture and design philosophy docs written
- product code implemented across API, extension, persona engine, billing, and repository layers
- tests and smoke harnesses in place

That means the next task should extend the shipped system without breaking the existing contract and documentation discipline.

## Core Rule

Do not trade clarity for speed unless the tradeoff is documented and justified by the active task.

This repo should prefer:

- explicit systems over magical systems
- small cohesive modules over sprawling abstractions
- boring readable code over clever opaque code
- visible failure handling over hidden recovery logic
- durable docs over tribal knowledge

## Readability Rules

- write code so a human can scan it and predict what it does
- prefer direct control flow
- keep modules aligned with real responsibilities
- keep public interfaces small and explicit
- use plain names
- add comments only where intent, invariants, or failure modes are not obvious

Avoid:

- giant mixed-responsibility files
- utility dumping grounds
- hidden side effects
- wrappers that obscure the real operation
- abstractions that exist only to sound scalable

## Anti-Black-Box Rules

This repo must not become a black box.

Required outcomes:

- important behavior is traceable from entrypoint to side effect
- important runtime decisions are recoverable from code and docs
- failure states are explicit
- critical paths can be inspected without reverse engineering

When introducing non-trivial logic:

- expose the inputs
- expose the outputs
- expose the failure path
- document assumptions
- avoid silent fallbacks unless they are intentional and documented

## Testing Discipline

Failure testing is required.

Every meaningful feature should cover:

- happy path
- expected failure path
- boundary conditions
- retry or recovery behavior when applicable

Minimum rule:

- if a component touches the network, filesystem, browser, model, queue, billing, auth, or storage, test how it fails

Prefer:

- focused unit tests for decision logic
- small integration tests for boundaries
- one smoke test for each new capability path

Do not stop at "it worked once."

## Documentation Discipline

Important behavior must not exist only in code.

For each meaningful capability or architecture change:

- update current-state docs
- document the intended control flow
- document the important failure modes
- document configuration assumptions
- keep naming consistent across code and docs

If something would be hard to infer later, write it down now.

## Architecture Discipline

Before adding a new layer or abstraction, ask:

1. does it remove duplication that matters?
2. does it make the code easier to change?
3. does it make failures easier to reason about?
4. is it simpler than the direct version?

If the answer is no, do not add the layer.

Prefer architecture that is:

- explicit
- incremental
- testable
- inspectable

Avoid:

- premature frameworking
- over-generalized plugin systems
- indirection before the first stable use case exists
- abstractions introduced for aesthetics instead of real leverage

## Product-Spec Discipline

The product source of truth lives in:

- [specs/persona1-source-of-truth-plan.md](/C:/Users/moham/persona1/specs/persona1-source-of-truth-plan.md)
- [specs/persona1-spec-v2-source.txt](/C:/Users/moham/persona1/specs/persona1-spec-v2-source.txt)

Rules:

- if an implementation choice contradicts the source spec, stop and document it
- if the source spec is ambiguous, log it in `specs/open-questions.md`
- if the implementation evolves, update the source-of-truth plan immediately

## Operational Discipline

Execution rules:

- do one task at a time
- keep changes cohesive
- do not silently expand scope
- write the smallest complete implementation that still leaves the repo better
- if a smoke test fails, fix it within scope before moving on
- if a decision is ambiguous, document it before it spreads

## First Implementation Rule

The first real code in this repo should optimize for:

1. correct product shape
2. strict contracts
3. inspectable failures
4. readable structure
5. documented behavior

Do not start with speculative abstractions.
Start with the first real vertical slice from the source-of-truth plan.

## Task Closeout Format

Every completed task should end with:

```text
TASK: [name]
STATUS: complete | blocked | failed

FILES CREATED OR UPDATED:
- [path]: [one line description]

TESTS:
- [test name]: passed | failed | not run

FAILURE CASES COVERED:
- [what was tested]

OPEN QUESTIONS:
- [any unresolved issues]

NOTES:
- [important implementation or operational notes]
```
