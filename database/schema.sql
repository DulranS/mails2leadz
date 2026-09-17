-- Outbound Engine — multi-tenant schema for SME accounts
-- Run once in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ACCOUNTS: one per SME customer (or your own personal-business use).
-- Holds the business identity that drives every AI-generated message, and
-- the sending credentials for THAT business — outbound mail/WhatsApp goes
-- out under the SME's own identity, never a shared sender.
--
-- SECURITY NOTE: gmail_refresh_token / twilio_auth_token are stored as plain
-- columns for simplicity. For real production use with paying customers,
-- move these into Supabase Vault (encrypted secrets) rather than a plain
-- table — that's a deliberate follow-up, not done here to avoid pulling in
-- a whole secrets-management system before you have your first customer.
-- ---------------------------------------------------------------------------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade unique,

  -- Business identity (drives AI drafting — see lib/ai.js)
  name text not null default 'My Business',
  sender_name text not null default '',
  sender_role text not null default 'Founder',
  offer_type text not null default 'service',       -- 'product' | 'service'
  offer_description text not null default '',
  cta text not null default 'a 15-minute call this week',
  tone text not null default 'direct, warm, no corporate fluff',

  -- Channel toggles + sending credentials, per account
  channel_email boolean not null default true,
  gmail_client_id text,
  gmail_client_secret text,
  gmail_refresh_token text,
  gmail_sender_email text,

  channel_whatsapp boolean not null default false,
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_whatsapp_number text,

  -- Limits (sane SME defaults — plenty for a real small business, low
  -- enough to never look like a spam operation)
  max_emails_per_day int not null default 40,
  max_whatsapp_per_day int not null default 40,
  min_hours_between_followups int not null default 48,
  max_followups int not null default 3,

  -- Running AI token usage (see lib/aiUsage.js) — powers the cost-to-date
  -- tile on /dashboard/analytics. Cumulative, not reset monthly, since the
  -- goal is "is this still cheap overall", not billing-cycle accounting.
  ai_input_tokens bigint not null default 0,
  ai_output_tokens bigint not null default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table accounts add column if not exists ai_input_tokens bigint not null default 0;
alter table accounts add column if not exists ai_output_tokens bigint not null default 0;

-- ---------------------------------------------------------------------------
-- AUTOMATED LEAD SOURCING: saved "find businesses like this" search that
-- the daily cron (GET /api/leads/source) runs unattended, so new leads
-- from Google Maps show up every morning without anyone clicking anything.
-- Set up once from /dashboard/sourcing. Leave auto_source_enabled false to
-- keep sourcing fully manual (the "Find leads on Google Maps" button still
-- works either way).
-- ---------------------------------------------------------------------------
alter table accounts add column if not exists auto_source_enabled boolean not null default false;
alter table accounts add column if not exists auto_source_query text;
alter table accounts add column if not exists auto_source_location text;
alter table accounts add column if not exists auto_source_daily_limit int not null default 15;

-- ---------------------------------------------------------------------------
-- LEADS: one row per contact. Uniqueness is per-account, not global — two
-- different SME customers can both have a lead with the same email.
-- ---------------------------------------------------------------------------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  email text,
  phone text,
  full_name text,
  company_name text,
  title text,
  website text,
  source text default 'csv_import',       -- csv_import, google_maps, website_enrichment
  place_id text,                          -- Google Places ID, when source = 'google_maps'
  rating numeric,
  review_count int,
  category text,
  research_notes text,
  score text default 'UNSCORED',
  score_reason text,
  status text default 'new',          -- new, drafted, followup_1..N, replied, won, lost, do_not_contact, sequence_exhausted
  preferred_channel text default 'email',
  last_contacted_at timestamptz,
  followup_count int default 0,
  next_followup_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (account_id, email)
);

-- Upgrading an existing deployment (table already existed before these
-- columns did): these are no-ops on a fresh install, required on an old one.
alter table leads add column if not exists place_id text;
alter table leads add column if not exists rating numeric;
alter table leads add column if not exists review_count int;
alter table leads add column if not exists category text;

create index if not exists idx_leads_account on leads(account_id);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_next_followup on leads(next_followup_at);

-- Composite indexes for the account_id + status lookups every list/queue
-- query in the app actually runs (Today's draft queue, the pipeline board,
-- the campaigns/followups cron batches) — the single-column indexes above
-- still work without these, but Postgres has to intersect two index scans
-- instead of walking one, which gets slower as a busy account's lead/message
-- count grows into the thousands.
create index if not exists idx_leads_account_status on leads(account_id, status);

-- One business (by Google Place ID) is only ever sourced once per account,
-- even across repeated manual searches or daily auto-sourcing runs.
create unique index if not exists idx_leads_account_place
  on leads(account_id, place_id) where place_id is not null;

-- ---------------------------------------------------------------------------
-- MESSAGES: every drafted, sent, and inbound message. Nothing gets sent to
-- a lead until a human approves a 'draft' row here — see
-- app/api/messages/[id]/approve.
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  direction text not null,          -- outbound, inbound
  channel text not null,            -- email, whatsapp
  sequence_step int default 0,
  subject text,
  body text not null,
  provider_message_id text,
  provider_thread_id text,
  status text default 'draft',      -- draft, sent, rejected, failed, delivered, replied, bounced, received
  error_message text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_messages_account on messages(account_id);
create index if not exists idx_messages_lead on messages(lead_id);
create index if not exists idx_messages_status on messages(status);
create index if not exists idx_messages_provider_thread on messages(provider_thread_id);
create index if not exists idx_messages_account_status on messages(account_id, status);

-- ---------------------------------------------------------------------------
-- SEND COUNTERS: per-account daily caps per channel.
-- ---------------------------------------------------------------------------
create table if not exists send_counters (
  account_id uuid not null references accounts(id) on delete cascade,
  day date not null,
  channel text not null,
  count int not null default 0,
  primary key (account_id, day, channel)
);

-- ---------------------------------------------------------------------------
-- ATOMIC COUNTERS — increment_ai_usage / increment_send_counter.
-- Both replace a read-then-write round trip in application code
-- (lib/aiUsage.js, lib/quota.js) with one statement each. That's not just
-- fewer round trips: a read-then-write from Node can lose an update when
-- two calls land close together (the daily cron drafting messages at the
-- same moment as a manual "Draft now" click, or two approvals racing on the
-- same account's send counter) — the second write overwrites the first
-- instead of adding to it. `accounts.ai_input_tokens = ai_input_tokens + $1`
-- and the `on conflict ... do update set count = count + excluded.count`
-- below both happen inside Postgres in one statement, so there's no window
-- for that to happen.
-- ---------------------------------------------------------------------------
create or replace function increment_ai_usage(p_account_id uuid, p_input_tokens bigint, p_output_tokens bigint)
returns void as $$
begin
  update accounts
  set ai_input_tokens = ai_input_tokens + coalesce(p_input_tokens, 0),
      ai_output_tokens = ai_output_tokens + coalesce(p_output_tokens, 0)
  where id = p_account_id;
end;
$$ language plpgsql;

create or replace function increment_send_counter(p_account_id uuid, p_day date, p_channel text, p_n int default 1)
returns void as $$
begin
  insert into send_counters (account_id, day, channel, count)
  values (p_account_id, p_day, p_channel, p_n)
  on conflict (account_id, day, channel)
  do update set count = send_counters.count + excluded.count;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- PLACES SEARCH CACHE — short-TTL cache for Google Places "Text Search"
-- results (lib/leadSourcing.js). Places bills per request, so this exists
-- purely to protect against paying twice for the same query+location within
-- a short window (an accidental double-click on "Find leads on Google
-- Maps", a network retry, or a user re-running the exact same search a few
-- minutes later while reviewing results). It deliberately does NOT cover
-- the daily automated-sourcing cron, which already only runs once a day per
-- saved search and is *supposed* to see whatever's new since yesterday —
-- caching that would defeat the point of running it daily.
-- ---------------------------------------------------------------------------
create table if not exists places_search_cache (
  cache_key text primary key,
  results jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Keep `updated_at` honest on every UPDATE. Added because nothing in the
-- app code was setting it by hand (leads.updated_at stayed stuck at
-- creation time), which quietly broke anything that needs "when did this
-- last change" — e.g. the analytics/digest "won in the last day" check.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on leads;
create trigger set_updated_at before update on leads
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on accounts;
create trigger set_updated_at before update on accounts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- TEMPLATES: an account's own proven copy, saved from a message that was
-- actually sent (see lib/templates.js). Used as few-shot calibration when
-- drafting new messages — never sent as-is, never shared across accounts.
-- This is what makes AI quality *compound* the more a business uses the
-- tool, instead of staying flat at "generic AI voice" forever.
-- ---------------------------------------------------------------------------
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  channel text not null,             -- email, whatsapp
  is_followup boolean not null default false,
  subject text,
  body text not null,
  source_message_id uuid references messages(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_templates_account on templates(account_id, channel, is_followup);

alter table templates enable row level security;

create policy "owner reads own templates" on templates
  for select to authenticated using (
    account_id in (select id from accounts where owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY — this is what makes it safe for multiple SME
-- customers to share one database. Every table is scoped to rows owned by
-- the signed-in user's account. Server-side API routes use the service
-- role key (bypasses RLS) but still filter by account_id explicitly in
-- every query — RLS is the safety net, not the only check.
-- ---------------------------------------------------------------------------
alter table accounts enable row level security;
alter table leads enable row level security;
alter table messages enable row level security;

create policy "owner reads own account" on accounts
  for select to authenticated using (owner_id = auth.uid());

create policy "owner updates own account" on accounts
  for update to authenticated using (owner_id = auth.uid());

create policy "owner reads own leads" on leads
  for select to authenticated using (
    account_id in (select id from accounts where owner_id = auth.uid())
  );

create policy "owner reads own messages" on messages
  for select to authenticated using (
    account_id in (select id from accounts where owner_id = auth.uid())
  );
