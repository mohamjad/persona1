# Design Philosophy

## Product Philosophy

persona1 is not a rewriter.

It is a conversation intelligence system that should help users see the board before they make a move.

That means the product should prefer:

- consequence visibility over wordsmithing
- context over templates
- specificity over generic confidence
- observed behavior over self-report
- intelligence over manipulation theater

The most important product rule from the source spec is:

- a slightly wrong specific prediction is more useful than a vague accurate one

If outputs feel like generic AI, trust dies immediately.

## UX Philosophy

The user should feel less cognitive load, not more.

That means:

- three options maximum
- one clear recommended option
- no essay-length analysis
- hidden detail by default
- fast, local-feeling interaction
- graceful fallback when extraction fails

The product should feel like:

- x-ray vision for a conversation

Not like:

- homework
- manipulation software
- a writing tutor that keeps talking

## Learning Philosophy

The persona model should be built from observed behavior.

The system should trust:

- drafts
- edits
- selected options
- rejected options
- outcomes

More than:

- user self-description

Any update to the persona profile should be conservative, versioned, and reversible in principle.

## Engineering Philosophy

This repo should be built so that a new engineer can answer:

- what entered the system
- what the system inferred
- what the system returned
- why it failed

without reverse engineering hidden abstractions.

The engineering bar is:

- readable modules
- explicit contracts
- well-named responsibilities
- conservative state transitions
- strong failure-path tests
- documentation that explains behavior before someone reads source

## Anti-Black-Box Philosophy

Black-box code is unacceptable here.

Important logic should be:

- inspectable
- testable
- loggable
- documentable

When the system makes a consequential decision, the implementation should make it possible to recover:

- the input context
- the prompt contract
- the parsed output
- the validation path
- the failure path

## Build Philosophy

Ship in small, complete layers.

Do not build speculative systems before the core product loop works.

The MVP should prove:

1. the branch tree feels real
2. the extension can read live context on supported platforms
3. the backend can serve inference reliably
4. the paywall and usage gates work
5. the observation pipeline collects real training signal

Everything else should follow that order.
