-- ============================================================================
-- Lumi — full Supabase schema (idempotent, reproducible)
--
-- Run once on a fresh Supabase project:
--   Dashboard → SQL Editor → New query → paste this file → Run
-- Safe to re-run: every statement is "if not exists" / "drop policy if exists".
--
-- Auth: tables key off auth.uid() via Row-Level Security, so each user only ever
-- sees/edits their own rows. The browser's JWT carries auth.uid().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per user (immutable-ish facts set at signup/onboarding)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  full_name    text,
  dob          date,
  age          integer,
  life_stage   text,
  income       numeric,
  goal         text,          -- legacy "primary goal" mirror (kept for back-compat)
  goal_current numeric,
  goal_target  numeric,
  risk         text
);

-- ---------------------------------------------------------------------------
-- goals — multiple savings goals per user
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  target_amount  numeric not null default 0,
  current_amount numeric not null default 0,
  deadline       date,
  status         text default 'on_track',
  created_at     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- expenses — transactions (manual entry, OCR, or Lumi-recorded)
-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  merchant  text,
  category  text,
  amount    numeric not null default 0,
  spent_at  date,
  source    text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- feed_events — the AI activity/alert feed
-- ---------------------------------------------------------------------------
create table if not exists public.feed_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- messages — Lumi chat history (cross-device continuity for signed-in users)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- preferences — what Lumi has LEARNED about the user (one row per user)
-- ---------------------------------------------------------------------------
create table if not exists public.preferences (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  communication_style     text,
  financial_anxiety_level text,
  risk_attitude           text,
  savings_commitment      text,
  life_notes              jsonb default '[]'::jsonb,
  updated_at              timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Indexes for the per-user list queries
-- ---------------------------------------------------------------------------
create index if not exists goals_user_id_idx       on public.goals(user_id);
create index if not exists expenses_user_id_idx     on public.expenses(user_id, spent_at desc);
create index if not exists feed_events_user_id_idx   on public.feed_events(user_id, created_at desc);
create index if not exists messages_user_id_idx      on public.messages(user_id, created_at);

-- ---------------------------------------------------------------------------
-- Row-Level Security — each user sees only their own rows
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.goals       enable row level security;
alter table public.expenses    enable row level security;
alter table public.feed_events enable row level security;
alter table public.messages    enable row level security;
alter table public.preferences enable row level security;

-- profiles key off id (= auth.users.id); the rest key off user_id.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own goals" on public.goals;
create policy "own goals" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own feed_events" on public.feed_events;
create policy "own feed_events" on public.feed_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own preferences" on public.preferences;
create policy "own preferences" on public.preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
