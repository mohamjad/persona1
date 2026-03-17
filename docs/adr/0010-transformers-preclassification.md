# ADR-0010: transformers.js For Local Pre-Classification

## Status

Accepted for Phase 4.

## Decision

Use `@xenova/transformers` for local pre-classification of recipient tone and dialogue state before branch generation.

## Why

- the product needs more structured understanding than a raw prompt wrapper
- local pre-classification reduces pressure on the main model call and keeps context reasoning explicit
