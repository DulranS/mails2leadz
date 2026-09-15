-- Outbound Engine — single source of truth schema (Supabase / Postgres)
-- Run once in the Supabase SQL editor. Replaces the old Firebase collections
-- AND the old saas_* / decision_makers tables — this is the one schema.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- LEADS: one row per contact, regardless of source or channel
-- ---------------------------------------------------------------------------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,               -- E.164 format, required for WhatsApp/SMS
  full_name text,
  company_name text,
  title text,
  website text,
  source text default 'csv_import',   -- csv_import, manual, api
  research_notes text,                -- freeform enrichment (scraped/AI notes)
  score text default 'UNSCORED',      -- HOT, WARM, COLD, UNSCORED
  score_reason text,
  status text default 'new',          -- new, contacted, replied, followup_1..N, won, lost, do_not_contact
  preferred_channel text default 'email', -- email, whatsapp, sms
  last_contacted_at timestamptz,
  followup_count int default 0,
  next_followup_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (email)
);

create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_next_followup on leads(next_followup_at);
create index if not exists idx_leads_score on leads(score);

-- ---------------------------------------------------------------------------
-- MESSAGES: every outbound + inbound message across every channel
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  direction text not null,          -- outbound, inbound
  channel text not null,            -- email, whatsapp, sms
  sequence_step int default 0,      -- 0 = initial outreach, 1..N = follow-up N
  subject text,                     -- email only
  body text not null,
  provider_message_id text,         -- Gmail message id / Twilio SID
  provider_thread_id text,
  status text default 'sent',       -- sent, failed, delivered, opened, replied, bounced
  error_message text,
  sent_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_messages_lead on messages(lead_id);
create index if not exists idx_messages_provider_thread on messages(provider_thread_id);

-- ---------------------------------------------------------------------------
-- DAILY SEND COUNTERS: enforce per-channel daily caps without a cron race
-- ---------------------------------------------------------------------------
create table if not exists send_counters (
  day date not null,
  channel text not null,
  count int not null default 0,
  primary key (day, channel)
);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY: the dashboard reads leads directly from the browser
-- using the anon key. Enable RLS and allow read-only anon access to `leads`
-- only — never grant anon access to `messages` (contains message content)
-- or `send_counters`. All writes go through server-side API routes using the
-- service role key, which bypasses RLS entirely.
-- ---------------------------------------------------------------------------
alter table leads enable row level security;

create policy "anon can read leads" on leads
  for select
  to anon
  using (true);

