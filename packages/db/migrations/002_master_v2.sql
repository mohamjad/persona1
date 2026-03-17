alter table users add column if not exists firebase_uid text unique;
alter table users add column if not exists performance_mu double precision;
alter table users add column if not exists performance_sigma double precision;
alter table users add column if not exists performance_ordinal double precision;
alter table users add column if not exists performance_matches integer;

alter table interactions add column if not exists embedding jsonb;

create table if not exists persona_shards (
  shard_id text primary key,
  user_id text not null references users(user_id) on delete cascade,
  shard_type text not null,
  content text not null,
  embedding jsonb,
  platform text,
  recipient_archetype text,
  confidence double precision not null default 0.5,
  data_point_count integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_persona_shards_user_updated_at
  on persona_shards (user_id, updated_at desc);

create table if not exists few_shot_examples (
  example_id text primary key,
  preset text not null,
  recipient_archetype text,
  situation_description text not null,
  example_content text not null,
  outcome_signal text,
  source text,
  embedding jsonb,
  created_at timestamptz not null
);

create index if not exists idx_few_shot_examples_preset_created_at
  on few_shot_examples (preset, created_at desc);
