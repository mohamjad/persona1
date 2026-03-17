-- Optional production-only upgrade for Cloud SQL / Postgres environments
-- where the pgvector extension is available and authorized.
--
-- The repo currently works without this migration because embeddings default
-- to JSON-backed placeholders. Apply this only when the database role is
-- allowed to install extensions and the hosting environment supports pgvector.

create extension if not exists vector;

alter table interactions
  add column if not exists embedding_vector vector(1536);

create table if not exists persona_shards_v (
  shard_id text primary key references persona_shards(shard_id) on delete cascade,
  embedding_vector vector(1536)
);

create table if not exists few_shot_examples_v (
  example_id text primary key references few_shot_examples(example_id) on delete cascade,
  embedding_vector vector(1536)
);

create index if not exists idx_interactions_embedding_vector
  on interactions using ivfflat (embedding_vector vector_cosine_ops) with (lists = 50);

create index if not exists idx_persona_shards_v_embedding_vector
  on persona_shards_v using ivfflat (embedding_vector vector_cosine_ops) with (lists = 50);

create index if not exists idx_few_shot_examples_v_embedding_vector
  on few_shot_examples_v using ivfflat (embedding_vector vector_cosine_ops) with (lists = 50);
