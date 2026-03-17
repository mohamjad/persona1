# ADR-0005: Motion For Deliberate Compose-Surface Gestures

## Status

Accepted.

## Decision

Use `motion` for the launcher and orb-HUD open/close transitions.

## Why

- the extension needs a deliberate, fast-feeling compose-surface motion language
- CSS-only transitions were producing heavier, less coordinated state changes
- Motion handles the intentional gestures while `auto-animate` still covers incidental reflow
