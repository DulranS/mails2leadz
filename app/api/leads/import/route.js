import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getSupabase } from '../../../../lib/supabase';
import { scoreLead } from '../../../../lib/ai';
import { trackUsage } from '../../../../lib/aiUsage';
import { findEmailsForWebsites } from '../../../../lib/emailFinder';
import { mapRowToLead, stripBom } from '../../../../lib/csvColumns';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount, businessProfileFrom } from '../../../../lib/account';

// Serverless functions have a duration ceiling — a scoring call per row
// plus, for rows with no email, a website lookup, adds up fast on a huge
// file. Cap rows per request so an oversized CSV fails loudly with a clear
// message instead of silently timing out partway through with no result
// at all (the worst possible failure mode for an import).
export const maxDuration = 60;
const MAX_ROWS_PER_IMPORT = 400;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts a CSV file upload (multipart/form-data, field name "file"),
// scoped to the signed-in user's own account.
//
// Column names are matched flexibly (see lib/csvColumns.js) — "Company",
// "Business Name", "E-mail", "Phone Number", "WhatsApp" etc. all map onto
// the right field regardless of exact spelling/casing. An email address is
// no longer required: a row with a phone and/or a website is still a
// usable lead (and if it has a website but no email, this route looks one
// up automatically before deciding). A row is only rejected if it has
// none of email, phone, full_name, or company_name — i.e. nothing at all
// to act on.
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

    const rawText = stripBom(await file.text());
    const { data: rawRows, errors } = Papa.parse(rawText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (errors.length) {
      return NextResponse.json({ error: 'CSV parse error', details: errors.slice(0, 3) }, { status: 400 });
    }
    if (!rawRows.length) {
      return NextResponse.json({ error: 'That file has no data rows.' }, { status: 400 });
    }

    const truncated = rawRows.length > MAX_ROWS_PER_IMPORT;
    const rows = rawRows.slice(0, MAX_ROWS_PER_IMPORT);

    // Pass 1: map every row's columns, decide which rows need a website
    // lookup (no email, has a website), and reject only rows with
    // genuinely nothing usable.
    const results = {
      inserted: 0,
      skipped_duplicate: 0,
      skipped_invalid: 0,
      enriched_with_email: 0,
      invalid_samples: [],
      note: truncated
        ? `File had ${rawRows.length} rows — only the first ${MAX_ROWS_PER_IMPORT} were processed. Split large files into batches.`
        : undefined,
    };

    const prepared = [];
    for (const row of rows) {
      const { mapped, unmapped } = mapRowToLead(row);
      const email = (mapped.email || '').trim().toLowerCase();
      const validEmail = email && EMAIL_RE.test(email) ? email : null;
      const invalidEmailNote = email && !validEmail ? `email column had "${mapped.email}" (not a valid address)` : null;

      const phone = mapped.phone?.trim() || null;
      const fullName = mapped.full_name?.trim() || null;
      const companyName = mapped.company_name?.trim() || null;
      const website = mapped.website?.trim() || null;
      const title = mapped.title?.trim() || null;

      if (!validEmail && !phone && !fullName && !companyName) {
        results.skipped_invalid++;
        if (results.invalid_samples.length < 5) {
          results.invalid_samples.push({ row: JSON.stringify(row).slice(0, 200), reason: 'no email, phone, name, or company found in this row' });
        }
        continue;
      }

      const extraNotes = Object.entries(unmapped)
        .map(([k, v]) => `${k}: ${v}`)
        .concat(invalidEmailNote ? [invalidEmailNote] : [])
        .join('; ');

      prepared.push({
        email: validEmail,
        phone,
        full_name: fullName,
        company_name: companyName,
        title,
        website,
        research_notes: extraNotes || null,
        needsEmailLookup: !validEmail && !!website,
      });
    }

    // Pass 2: for rows with a website but no email, look one up — same
    // logic as /dashboard/sourcing, run with bounded concurrency so a
    // batch of lookups doesn't run fully sequentially.
    const lookupIndexes = prepared.map((p, i) => (p.needsEmailLookup ? i : -1)).filter((i) => i !== -1);
    if (lookupIndexes.length) {
      const found = await findEmailsForWebsites(lookupIndexes.map((i) => prepared[i].website));
      lookupIndexes.forEach((i, j) => {
        if (found[j]) {
          prepared[i].email = found[j];
          results.enriched_with_email++;
        }
      });
    }

    // Pass 3: pre-fetch this account's existing emails/phones once, so we
    // skip the AI scoring call entirely for rows we already know are
    // duplicates (cheaper and faster than scoring first and discovering
    // the DB rejects it).
    const supabase = getSupabase();
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('email, phone')
      .eq('account_id', account.id);
    const existingEmails = new Set((existingLeads || []).filter((l) => l.email).map((l) => l.email));
    const existingPhones = new Set((existingLeads || []).filter((l) => l.phone).map((l) => l.phone));

    for (const lead of prepared) {
      const isDuplicate =
        (lead.email && existingEmails.has(lead.email)) ||
        (!lead.email && lead.phone && existingPhones.has(lead.phone));
      if (isDuplicate) {
        results.skipped_duplicate++;
        continue;
      }

      lead.account_id = account.id;
      lead.preferred_channel = !lead.email && lead.phone ? 'whatsapp' : 'email';
      delete lead.needsEmailLookup;

      const scoreResult = await scoreLead(lead, business);
      lead.score = scoreResult.score;
      lead.score_reason = scoreResult.reason;
      await trackUsage(account.id, scoreResult.usage);

      const { error } = await supabase.from('leads').insert(lead);
      if (error) {
        if (error.code === '23505') {
          results.skipped_duplicate++;
        } else {
          results.invalid_samples.length < 5 && results.invalid_samples.push({ row: lead.company_name || lead.email || '(unnamed row)', reason: error.message });
        }
      } else {
        if (lead.email) existingEmails.add(lead.email);
        if (lead.phone) existingPhones.add(lead.phone);
        results.inserted++;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error('leads/import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
