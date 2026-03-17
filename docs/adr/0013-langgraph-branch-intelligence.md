# ADR-0013: LangGraph For Predictive Branch Orchestration

## Status

Accepted for Phase 7.

## Decision

Use `@langchain/langgraph` for explicit predictive branch orchestration once the scoring and memory layers are stable.

## Why

- the master plan requires inspectable branch simulation, not implicit multi-step prompting
- LangGraph gives a graph-based state model for lookahead without hiding the stage boundaries

## Constraints

- not allowed in the hot path until scoring, caching, and memory are already explicit
- must remain inspectable and debuggable from node to node
