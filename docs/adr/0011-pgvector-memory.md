# ADR-0011: pgvector For Selective Memory Retrieval

## Status

Accepted for Phase 5.

## Decision

Use `pgvector` in Postgres/Cloud SQL for persona shard and few-shot retrieval.

## Why

- full-profile injection does not scale cleanly
- the memory architecture in the master plan depends on selective retrieval, not persona blob growth
