# ADR-0006: Floating UI For Compose Anchoring

## Status

Accepted.

## Decision

Use `@floating-ui/dom` to keep the launcher and HUD anchored to the live compose box.

## Why

- hard-coded geometry drifts under scroll, zoom, and layout changes
- the product depends on staying attached to the draft surface, not a detached panel
- Floating UI gives a small, inspectable positioning layer without forcing a framework rewrite
