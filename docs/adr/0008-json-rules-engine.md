# ADR-0008: json-rules-engine For Annotation Scoring

## Status

Accepted.

## Decision

Use `json-rules-engine` inside `packages/scoring-engine`.

## Why

- annotation must be deterministic and inspectable
- scoring rules belong in a rule engine, not hidden prompt text
- the same draft must score differently when goal, recipient, and persona context differ

## Notes

- `persona1` now computes a session scoring config and deterministic draft score before branch generation
- low-information drafts are explicitly scored as `-`
