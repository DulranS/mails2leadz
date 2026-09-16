import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../../lib/account';
import { costForTokens } from '../../../../lib/aiUsage';

const DAYS_OF_SEND_HISTORY = 14;

// GET /api/analytics/summary — everything the /dashboard/analytics page
// needs in one round trip. All derived from data this account already owns
// (leads, messages, send_counters, its own running AI token count) — no
// external analytics/tracking service, nothing sent off this account's data.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const supabase = getSupabase();

    const [{ data: leads, error: leadsErr }, { data: messages, error: msgErr }, { data: counters, error: ctrErr }] =
      await Promise.all([
        supabase.from('leads').select('status, score, replied_at, created_at').eq('account_id', account.id),
        supabase
          .from('messages')
          .select('lead_id, direction, channel, status, sent_at, created_at')
          .eq('account_id', account.id),
        supabase
          .from('send_counters')
          .select('day, channel, count')
          .eq('account_id', account.id)
          .gte('day', new Date(Date.now() - DAYS_OF_SEND_HISTORY * 86400000).toISOString().slice(0, 10)),
      ]);
    if (leadsErr) throw leadsErr;
    if (msgErr) throw msgErr;
    if (ctrErr) throw ctrErr;

    // --- Funnel + score distribution ---------------------------------
    const funnel = { new: 0, drafted: 0, in_sequence: 0, replied: 0, won: 0, lost: 0, do_not_contact: 0 };
    const scoreDist = { HOT: 0, WARM: 0, COLD: 0, UNSCORED: 0 };
    for (const l of leads || []) {
      if (l.status === 'new') funnel.new++;
      else if (l.status === 'drafted') funnel.drafted++;
      else if (l.status === 'replied') funnel.replied++;
      else if (l.status === 'won') funnel.won++;
      else if (l.status === 'lost') funnel.lost++;
      else if (l.status === 'do_not_contact') funnel.do_not_contact++;
      else funnel.in_sequence++; // contacted, followup_N, sequence_exhausted
      scoreDist[l.score && scoreDist[l.score] !== undefined ? l.score : 'UNSCORED']++;
    }
    const totalLeads = (leads || []).length;

    // --- Reply rate / win rate, based on leads that were actually sent to ---
    const sentByLead = new Map(); // lead_id -> earliest sent_at
    for (const m of messages || []) {
      if (m.direction !== 'outbound' || m.status !== 'sent') continue;
      const at = m.sent_at || m.created_at;
      if (!sentByLead.has(m.lead_id) || at < sentByLead.get(m.lead_id)) sentByLead.set(m.lead_id, at);
    }
    const contactedCount = sentByLead.size;
    const repliedLeads = (leads || []).filter((l) => l.status === 'replied' || l.status === 'won' || l.replied_at);
    const wonCount = funnel.won;
    const replyRate = contactedCount > 0 ? repliedLeads.length / contactedCount : null;
    const winRate = contactedCount > 0 ? wonCount / contactedCount : null;

    // --- Sends over the last N days (email + whatsapp combined) --------
    const dayTotals = {};
    for (let i = DAYS_OF_SEND_HISTORY - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dayTotals[d] = 0;
    }
    for (const c of counters || []) {
      if (dayTotals[c.day] !== undefined) dayTotals[c.day] += c.count;
    }
    const sendHistory = Object.entries(dayTotals).map(([day, count]) => ({ day, count }));

    // --- AI cost to date -------------------------------------------------
    const aiCostUsd = costForTokens(account.ai_input_tokens || 0, account.ai_output_tokens || 0);
    const avgCostPerLead = totalLeads > 0 ? aiCostUsd / totalLeads : 0;

    return NextResponse.json({
      totalLeads,
      funnel,
      scoreDist,
      contactedCount,
      replyRate,
      winRate,
      sendHistory,
      aiCostUsd,
      avgCostPerLead,
      aiInputTokens: account.ai_input_tokens || 0,
      aiOutputTokens: account.ai_output_tokens || 0,
    });
  } catch (err) {
    console.error('analytics/summary error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
