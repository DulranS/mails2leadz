// app/api/ai-insights/route.js
// "Pipeline coach": turns the customer's OWN computed numbers into a short, plain-language read-out
// and 3 concrete actions. The model sees only aggregate figures (no names, no emails, no message text),
// is told to use no other numbers, and the answer is cached for a day, so it is cheap and safe.
import { NextResponse } from 'next/server';
import { callAI, AiError, getBusinessProfile, profileBlock } from '../../../lib/ai-client.js';
import { uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';

export const maxDuration = 45;

const num = (v, max = 1e9) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.round(Number(v) * 100) / 100)) : null);

export async function POST(request) {
  try {
    const uid = uidFromRequest(request);
    if (!uid) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
    const { facts } = await request.json().catch(() => ({}));
    if (!facts || typeof facts !== 'object') return NextResponse.json({ success: false, error: 'Missing numbers.' }, { status: 400, headers: NO_STORE });

    // Only whitelisted aggregate numbers go to the model.
    const f = {
      sentLast90d: num(facts.sent), repliesLast90d: num(facts.replied), replyRate: num(facts.replyRate, 1),
      prospects: num(facts.prospects), qualifiedDeals: num(facts.openCount), openPipelineValue: num(facts.openValue),
      weightedPipeline: num(facts.weighted), staleDeals: num(facts.staleCount), staleValue: num(facts.staleValue),
      wonDeals: num(facts.wonCount), lostDeals: num(facts.lostCount), winRate: num(facts.winRate, 1),
      avgDaysToWin: num(facts.avgCycleDays, 3650), revenueWonLast90d: num(facts.revenue90), costLast90d: num(facts.cost90),
      forecast30d: num(facts.forecast30), forecast90d: num(facts.forecast90), monthlyGoal: num(facts.monthlyGoal), wonThisMonth: num(facts.wonThisMonth),
      repliesWithoutDeal: num(facts.unconverted), followUpsDue: num(facts.dueFollowUps), forecastConfidence: ['low', 'medium', 'high'].includes(facts.confidence) ? facts.confidence : 'low',
    };

    const profile = await getBusinessProfile(uid);
    const system = `You are a practical sales coach for a small business owner. Read ONLY the JSON numbers given and explain what they mean in plain, friendly language.\nRules: use no numbers that are not in the JSON; never invent benchmarks, industry averages or percentages; if a number is null or the sample is small, say the data is too thin to judge rather than guessing; no jargon; no hype.\nReturn JSON only: {"headline": string (max 18 words), "working": [up to 2 short strings: what is going well], "risks": [up to 2 short strings: what needs attention], "actions": [exactly 3 objects {"title": string (max 8 words), "why": string (max 25 words)}] ordered by money at stake}.`;
    const prompt = `${profileBlock(profile) || 'No business profile saved.'}\n\nNumbers (last 90 days unless stated):\n${JSON.stringify(f)}`;

    const ai = await callAI({ uid, feature: 'pipeline_insights', tier: 'fast', system, prompt, maxTokens: 600 });
    const d = ai.data;
    const arr = (x, n) => (Array.isArray(x) ? x.slice(0, n) : []);
    if (!d?.headline || !Array.isArray(d.actions) || d.actions.length === 0) {
      return NextResponse.json({ success: false, error: 'The AI returned an unusable summary. Try again.' }, { status: 502, headers: NO_STORE });
    }
    return NextResponse.json({
      success: true,
      headline: String(d.headline).slice(0, 200),
      working: arr(d.working, 2).map((x) => String(x).slice(0, 200)),
      risks: arr(d.risks, 2).map((x) => String(x).slice(0, 200)),
      actions: arr(d.actions, 3).map((a) => ({ title: String(a?.title || '').slice(0, 80), why: String(a?.why || '').slice(0, 220) })).filter((a) => a.title),
      cached: ai.cached,
    }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: NO_STORE });
    console.error('ai-insights error:', error);
    return NextResponse.json({ success: false, error: 'Could not create the summary right now.' }, { status: 500, headers: NO_STORE });
  }
}
