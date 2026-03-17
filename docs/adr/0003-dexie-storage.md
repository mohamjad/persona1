# ADR-0003: Dexie For Local Extension State

## Status

Accepted.

## Decision

Use `Dexie` as the primary local-first storage layer for extension state.

## Why

- `chrome.storage.local` is weak for indexed state and transactional cache updates
- the extension now needs queryable tables for interactions, observations, mirror insights, branch cache, and scoring config cache
- Dexie keeps the storage model explicit and inspectable

## Consequences

- the extension boot path performs a one-time migration from legacy `chrome.storage.local`
- primary hot-path state no longer depends on ad hoc key/value reads
