// app/api/ai-content/route.js
// Drafts a week of social posts (with a visual brief for whoever makes the design) from the customer's business profile.
// It only drafts: the owner edits, schedules and posts them by hand. When past posts have logged results, only the best
// platform / theme ids (never post text) are passed in so the plan leans toward what actually brought enquiries.
import { NextResponse } from 'next/server';
import { AiError } from '../../../lib/ai-client.js';
import { uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { PLATFORMS, localDateStr } from '../../../lib/content.js';
import { draftContentPlan, ContentPlanError } from '../../../lib/server/content-plan.js';

export const maxDuration = 60;

export async function POST(request) {
  try {
    const uid = uidFromRequest(request);
    if (!uid) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
    const body = await request.json().catch(() => ({}));

    const platforms = [...new Set((Array.isArray(body.platforms) ? body.platforms : []).map((p) => String(p).toLowerCase()))].filter((id) => PLATFORMS.some((p) => p.id === id)).slice(0, 5);
    if (platforms.length === 0) return NextResponse.json({ success: false, error: 'Pick at least one platform.' }, { status: 400, headers: NO_STORE });
    const count = Math.min(7, Math.max(1, Math.round(Number(body.count)) || 5));
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today || '')) ? body.today : localDateStr();
    try {
      const { posts, cached } = await draftContentPlan({ uid, platforms, count, today, focus: body.focus, hint: body.hint });
      return NextResponse.json({ success: true, posts, requested: count, cached }, { headers: NO_STORE });
    } catch (e) {
      if (e instanceof ContentPlanError) return NextResponse.json({ success: false, ...(e.code ? { code: e.code } : {}), error: e.message }, { status: e.status, headers: NO_STORE });
      throw e;
    }
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: NO_STORE });
    console.error('ai-content error:', error);
    return NextResponse.json({ success: false, error: 'Could not draft posts right now.' }, { status: 500, headers: NO_STORE });
  }
}
