import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { searchBusinesses } from '../../../../lib/leadSourcing';
import { findEmailsForWebsites } from '../../../../lib/emailFinder';
import { scoreLead } from '../../../../lib/ai';
import { trackUsage } from '../../../../lib/aiUsage';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount, businessProfileFrom } from '../../../../lib/account';
import { isAuthorizedCronRequest } from '../../../../lib/cronAuth';
import { mapWithConcurrency } from '../../../../lib/concurrency';

// Serverless functions default to 10s on Vercel Hobby / 15-60s on Pro —
// sourcing does a Places API call plus a handful of parallel website
// fetches plus one AI call per result, so give it real headroom.
export const maxDuration = 60;
const MAX_RESULTS_PER_RUN = 30;
const SCORE_CONCURRENCY = 4;

// POST /api/leads/source  { query, location, limit }
// Manual "Find leads on Google Maps" trigger from the dashboard, scoped to
// the signed-in user's own account. One request: search → find contact
// emails on each business's own site → AI-score → insert as new leads.
export async function POST(request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);

    const body = await request.json().catch(() => ({}));
    const { query, location } = body;
    if (!query || !query.trim()) {
      return NextResponse.json({ error: 'Tell it what kind of business to find, e.g. "dentists".' }, { status: 400 });
    }

    const outcome = await sourceLeadsForAccount(account, {
      query: query.trim(),
      location: (location || '').trim(),
      limit: Math.min(body.limit || 20, MAX_RESULTS_PER_RUN),
    });
    return NextResponse.json(outcome);
  } catch (err) {
    console.error('leads/source error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/leads/source — Vercel Cron, once/day (see vercel.json). Runs
// automated sourcing for every account that has turned it on in
// /dashboard/sourcing with a saved search (industry + location). This is
// the fully-automated version of the same feature: the SME sets it up
// once, new leads just appear every morning.
export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabase();
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('auto_source_enabled', true)
    .not('auto_source_query', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = {};
  for (const account of accounts || []) {
    try {
      results[account.id] = await sourceLeadsForAccount(account, {
        query: account.auto_source_query,
        location: account.auto_source_location || '',
        limit: Math.min(account.auto_source_daily_limit || 15, MAX_RESULTS_PER_RUN),
      });
    } catch (err) {
      results[account.id] = { error: err.message };
    }
  }
  return NextResponse.json(results);
}

async function sourceLeadsForAccount(account, { query, location, limit }) {
  const supabase = getSupabase();
  const business = businessProfileFrom(account);

  const found = await searchBusinesses({ query, location, maxResults: limit });
  if (!found.length) {
    return { found: 0, with_email: 0, inserted: 0, skipped_duplicate: 0, skipped_no_name: 0, results: [] };
  }

  // Efficiency: skip already-sourced businesses BEFORE paying for an
  // email lookup or an AI scoring call on them — cheaper and faster than
  // discovering the duplicate only when the insert is rejected.
  const { data: existing } = await supabase
    .from('leads')
    .select('place_id')
    .eq('account_id', account.id)
    .not('place_id', 'is', null);
  const existingPlaceIds = new Set((existing || []).map((l) => l.place_id));

  const outcome = { found: found.length, with_email: 0, inserted: 0, skipped_duplicate: 0, skipped_no_name: 0, results: [] };
  const candidates = found.filter((b) => {
    if (b.place_id && existingPlaceIds.has(b.place_id)) { outcome.skipped_duplicate++; return false; }
    return true;
  });

  const emails = await findEmailsForWebsites(candidates.map((b) => b.website));
  candidates.forEach((b, i) => { b.email = emails[i]; });

  const named = candidates.filter((b) => {
    if (!b.company_name) { outcome.skipped_no_name++; return false; }
    return true;
  });

  // Scoring is one AI call per business — bounded concurrency here cuts
  // this route's wall-clock time on a bigger search (up to 30 results)
  // instead of scoring them one at a time.
  await mapWithConcurrency(named, SCORE_CONCURRENCY, async (biz) => {
    if (biz.email) outcome.with_email++;

    const lead = {
      account_id: account.id,
      email: biz.email || null,
      phone: biz.phone || null,
      company_name: biz.company_name,
      website: biz.website || null,
      place_id: biz.place_id || null,
      rating: biz.rating,
      review_count: biz.review_count,
      category: biz.category || null,
      source: 'google_maps',
      research_notes: [
        biz.category,
        biz.address,
        biz.rating != null ? `${biz.rating}★ (${biz.review_count || 0} reviews)` : null,
      ].filter(Boolean).join(' · ') || null,
      preferred_channel: !biz.email && biz.phone ? 'whatsapp' : 'email',
    };

    const scoreResult = await scoreLead(lead, business);
    lead.score = scoreResult.score;
    lead.score_reason = scoreResult.reason;
    await trackUsage(account.id, scoreResult.usage);

    const { error } = await supabase.from('leads').insert(lead);
    if (error) {
      if (error.code === '23505') outcome.skipped_duplicate++;
      else console.error('leads/source insert error:', error.message);
    } else {
      outcome.inserted++;
      outcome.results.push({ company_name: lead.company_name, email: lead.email, phone: lead.phone, score: lead.score });
    }
  });

  return outcome;
}
