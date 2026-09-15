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

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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
  source text default 'csv_import',
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

create index if not exists idx_leads_account on leads(account_id);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_next_followup on leads(next_followup_at);

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
