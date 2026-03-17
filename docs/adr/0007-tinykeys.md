# ADR-0007: tinykeys For Shortcut Handling

## Status

Accepted.

## Decision

Use `tinykeys` for the injected keyboard interaction layer.

## Why

- the product is keyboard-first
- host pages already own many keyboard events
- `tinykeys` keeps shortcut registration explicit and compact inside the content-script runtime
