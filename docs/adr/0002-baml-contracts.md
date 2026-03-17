# ADR-0002: BAML Contract Source

## Status

Accepted, staged adoption.

## Decision

`persona1` keeps the contract source of truth for:

- `ContextOutput`
- `ScoringConfig`
- `AnnotationOutput`
- `BranchTree`
- `PersonaUpdateOutput`
- `MirrorOutput`

in `baml_src/` using `@boundaryml/baml`.

## Why

- the master plan requires one inspectable contract layer
- prompt, schema, and UI changes need one shared source of truth
- BAML gives a typed contract language that can be checked independently of runtime code

## Notes

- current runtime parsing is still zod-backed
- BAML source is now committed so the contract layer exists before full generated-client cutover
- generated-client replacement is a later migration, not a hidden runtime switch
