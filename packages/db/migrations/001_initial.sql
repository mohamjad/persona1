create table if not exists users (
  user_id text primary key,
  email text not null unique,
  plan text not null,
  auth_mode text not null,
  usage_count integer not null default 0,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists personas (
  user_id text primary key references users(user_id) on delete cascade,
  profile_json jsonb not null,
  updated_at timestamptz not null
);

create table if not exists interactions (
  interaction_id text primary key,
  user_id text not null references users(user_id) on delete cascade,
  session_id text not null,
  platform text not null,
  preset text not null,
  draft_raw text not null,
  draft_final text,
  chosen_option_id integer,
  recipient_context_hash text not null,
  outcome text not null,
  observed_signals text[] not null default '{}',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create index if not exists idx_interactions_user_created_at on interactions (user_id, created_at desc);

create table if not exists mirror_insights (
  insight_id text primary key,
  user_id text not null references users(user_id) on delete cascade,
  observation text not null,
  supporting_pattern text not null,
  evidence_count integer not null,
  confidence double precision not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null
);
