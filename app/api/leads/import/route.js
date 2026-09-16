import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getSupabase } from '../../../../lib/supabase';
import { scoreLead } from '../../../../lib/ai';
import { trackUsage } from '../../../../lib/aiUsage';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount, businessProfileFrom } from '../../../../lib/account';

// Accepts a CSV file upload (multipart/form-data, field name "file"),
// scoped to the signed-in user's own account.
// Expected columns (case-insensitive, extras are kept as research_notes):
// email, phone, full_name, company_name, title, website
export async function POST(request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const business = businessProfileFrom(account);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded (field name must be "file")' }, { status: 400 });
    }

    const text = await file.text();
    const { data: rows, errors } = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    if (errors.length) {
      return NextResponse.json({ error: 'CSV parse error', details: errors.slice(0, 3) }, { status: 400 });
    }

    const supabase = getSupabase();
    const results = { inserted: 0, skipped_duplicate: 0, skipped_invalid: 0, errors: [] };

    for (const row of rows) {
      const email = (row.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.skipped_invalid++;
        continue;
      }

      const knownCols = ['email', 'phone', 'full_name', 'company_name', 'title', 'website'];
      const extraNotes = Object.entries(row)
        .filter(([k, v]) => !knownCols.includes(k) && v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');

      const lead = {
        account_id: account.id,
        email,
        phone: row.phone || null,
        full_name: row.full_name || null,
        company_name: row.company_name || null,
        title: row.title || null,
        website: row.website || null,
        research_notes: extraNotes || null,
        preferred_channel: 'email',
      };

      const scoreResult = await scoreLead(lead, business);
      lead.score = scoreResult.score;
      lead.score_reason = scoreResult.reason;
      await trackUsage(account.id, scoreResult.usage);

      const { error } = await supabase.from('leads').insert(lead);
      if (error) {
        if (error.code === '23505') {
          results.skipped_duplicate++;
        } else {
          results.errors.push({ email, message: error.message });
        }
      } else {
        results.inserted++;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error('leads/import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
