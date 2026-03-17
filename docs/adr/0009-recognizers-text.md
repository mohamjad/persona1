# ADR-0009: Recognizers Text For Deterministic Entities

## Status

Accepted for Phase 4.

## Decision

Use `@microsoft/recognizers-text-suite` for deterministic extraction of dates, amounts, deadlines, and other structured cues.

## Why

- not every factual cue should require LLM inference
- structured facts should enter the context pipeline as trusted evidence
