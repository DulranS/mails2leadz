import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../../lib/account';

// POST /api/leads/enrich  (multipart/form-data, field name "file")
// Optional "lead sourcing" step: takes a CSV of businesses you already have
// (e.g. exported from a maps/directory listing you pulled yourself —
// columns: place_id, business_name, rating, reviews, category, address,
// whatsapp_number, website) and looks up a public contact email on each
// business's own website (checking /contact, /about, etc.) so those rows
// become importable leads. This does NOT scrape Google Maps or any other
// platform itself, and it does NOT touch personal/individual data — only
// publicly published business contact emails on a business's own site.
//
// This proxies to `backend/` (a small separate FastAPI service — see
// backend/README section) because that kind of multi-page web fetching
// doesn't fit inside a single serverless function invocation reliably.
// If ENRICHMENT_SERVICE_URL isn't configured, this feature is simply
// unavailable and the dashboard hides it — everything else in the product
// works fine without it, since leads can always be imported directly via
// /api/leads/import.
export async function POST(request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    await getOrCreateAccount(user.id); // just an auth/ownership gate, not otherwise used here

    const base = process.env.ENRICHMENT_SERVICE_URL;
    if (!base) {
      return NextResponse.json(
        { error: 'Lead enrichment isn\'t configured. Set ENRICHMENT_SERVICE_URL to your deployed backend/ service, or skip this and import a CSV that already has emails.' },
        { status: 501 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded (field name must be "file")' }, { status: 400 });
    }
    const csv_content = await file.text();

    const upstream = await fetch(`${base.replace(/\/$/, '')}/api/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ENRICHMENT_SERVICE_KEY ? { 'X-Service-Key': process.env.ENRICHMENT_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({ csv_content }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return NextResponse.json({ error: `Enrichment service error: ${text || upstream.status}` }, { status: 502 });
    }

    const { job_id } = await upstream.json();
    return NextResponse.json({ job_id });
  } catch (err) {
    console.error('leads/enrich POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/leads/enrich?job_id=...
// Polls job status on the enrichment service. Returns the enriched CSV
// once status is "completed" — the dashboard then feeds that straight
// into the existing /api/leads/import flow (same scoring, same dedupe).
export async function GET(request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const base = process.env.ENRICHMENT_SERVICE_URL;
    if (!base) {
      return NextResponse.json({ error: 'Lead enrichment isn\'t configured.' }, { status: 501 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id');
    if (!jobId) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 });

    const upstream = await fetch(`${base.replace(/\/$/, '')}/api/status/${encodeURIComponent(jobId)}`, {
      headers: process.env.ENRICHMENT_SERVICE_KEY ? { 'X-Service-Key': process.env.ENRICHMENT_SERVICE_KEY } : {},
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `Enrichment service error: ${upstream.status}` }, { status: 502 });
    }
    const job = await upstream.json();
    return NextResponse.json(job);
  } catch (err) {
    console.error('leads/enrich GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
