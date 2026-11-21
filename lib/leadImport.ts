// Bulk import of leads from a spreadsheet: the front of an outbound flow (a list of prospects -> outreach -> follow-up
// -> close). The list can come from anywhere the owner got it lawfully (a directory, an event sign-up sheet, a
// purchased or partner list, their own phone contacts); Balancr does not collect lists for you.
//
// Pure: takes rows already read from a CSV (so it can be tested without a file or a browser) and returns the leads to
// create, row-level problems, and how many rows were skipped as duplicates. All-or-nothing like every other import: if
// any row has a problem nothing is added. New leads always start at the first stage; any stage column is ignored on
// purpose (a list is not a pipeline).
//
// Column names are matched loosely, so a list exported from another tool needs little or no editing:
//   name      <- name, business name, company, company name, full name, customer, lead
//   contact   <- contact, phone, mobile, telephone, whatsapp, email (first one found, in that order)
//   source    <- source, lead source, channel
//   estValue  <- estValue, value, deal value, est value, estimated value
//   nextFollowUpDate <- nextFollowUpDate, follow up, follow up date, next follow up (YYYY-MM-DD)
//   notes     <- notes, note, comments, website, address (whatever is found is joined)

export const MAX_LEAD_IMPORT_ROWS = 500;
const MAX_NAME = 200;
const MAX_CONTACT = 200;
const MAX_SOURCE = 100;
const MAX_NOTES = 2000;

export interface LeadImportRow {
  name: string;
  contact?: string;
  source?: string;
  estValue?: number;
  nextFollowUpDate?: string;
  notes?: string;
}

export interface LeadImportError {
  row: number; // spreadsheet row number: the header is row 1, the first lead is row 2
  message: string;
}

export interface LeadImportResult {
  rows: LeadImportRow[];
  errors: LeadImportError[];
  skippedDuplicates: number;
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const NAME_KEYS = ["name", "businessname", "company", "companyname", "fullname", "customer", "lead", "leadname"];
// Contact columns in order of usefulness for a first message: a number you can message, then an email.
const CONTACT_KEYS = ["contact", "phone", "mobile", "telephone", "whatsapp", "email"];
const SOURCE_KEYS = ["source", "leadsource", "channel"];
const VALUE_KEYS = ["estvalue", "value", "dealvalue", "estimatedvalue"];
const FOLLOWUP_KEYS = ["nextfollowupdate", "followup", "followupdate", "nextfollowup"];
const NOTES_KEYS = ["notes", "note", "comments", "website", "address"];

function cells(raw: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) {
    const kk = key(k);
    const val = typeof v === "string" ? v.trim() : "";
    if (kk && !m.has(kk)) m.set(kk, val);
  }
  return m;
}

function firstOf(m: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = m.get(k);
    if (v) return v;
  }
  return "";
}

// "Rs. 1,200", "1,200/-", "$1,200.50" -> number; anything else -> null. A negative value is a mistake, not a lead value.
export function looseNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const cleaned = t.replace(/^(rs\.?|lkr|usd|\$|€|£)\s*/i, "").replace(/\/-$/, "").replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function normalizeLeadName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
export function normalizeLeadContact(s: string): string {
  return s.toLowerCase().replace(/[\s\-().+]/g, "");
}
const dupKey = (name: string, contact: string) => `${normalizeLeadName(name)}|${normalizeLeadContact(contact)}`;

// `existing` is the leads already in the business: a row that matches one (same name and same contact) is skipped, not
// added twice. Two rows in the file that match each other are likewise counted once.
export function leadsFromRows(
  raw: Record<string, string>[],
  existing: { name: string; contact?: string }[] = []
): LeadImportResult {
  const errors: LeadImportError[] = [];
  const rows: LeadImportRow[] = [];
  let skippedDuplicates = 0;

  if (raw.length > MAX_LEAD_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [{ row: 0, message: `This file has ${raw.length} rows. Import at most ${MAX_LEAD_IMPORT_ROWS} leads at a time: split the file and import it in parts.` }],
      skippedDuplicates: 0,
    };
  }

  const seen = new Set<string>(existing.map((e) => dupKey(e.name ?? "", e.contact ?? "")));

  raw.forEach((r, i) => {
    const row = i + 2;
    const m = cells(r);
    if ([...m.values()].every((v) => v === "")) return; // a blank line in the middle of a list

    const name = firstOf(m, NAME_KEYS);
    const contact = firstOf(m, CONTACT_KEYS);
    const source = firstOf(m, SOURCE_KEYS);
    const valueRaw = firstOf(m, VALUE_KEYS);
    const followRaw = firstOf(m, FOLLOWUP_KEYS);
    const notesParts = NOTES_KEYS.map((k) => m.get(k) ?? "").filter(Boolean);
    const notes = notesParts.join(" | ");

    const before = errors.length;
    if (!name) errors.push({ row, message: "name is empty (every lead needs a name or a business name)" });
    else if (name.length > MAX_NAME) errors.push({ row, message: `name is longer than ${MAX_NAME} characters` });
    if (contact.length > MAX_CONTACT) errors.push({ row, message: `contact is longer than ${MAX_CONTACT} characters` });
    if (source.length > MAX_SOURCE) errors.push({ row, message: `source is longer than ${MAX_SOURCE} characters` });
    if (notes.length > MAX_NOTES) errors.push({ row, message: `notes are longer than ${MAX_NOTES} characters` });

    let estValue: number | undefined;
    if (valueRaw) {
      const n = looseNumber(valueRaw);
      if (n === null || n < 0) errors.push({ row, message: `estValue "${valueRaw}" is not a positive number` });
      else if (n > 0) estValue = n;
    }
    let nextFollowUpDate: string | undefined;
    if (followRaw) {
      if (!isIsoDate(followRaw)) errors.push({ row, message: `follow-up date "${followRaw}" must look like 2026-11-05 (year-month-day)` });
      else nextFollowUpDate = followRaw;
    }
    if (errors.length > before) return;

    const k = dupKey(name, contact);
    if (seen.has(k)) {
      skippedDuplicates++;
      return;
    }
    seen.add(k);

    rows.push({
      name,
      ...(contact ? { contact } : {}),
      ...(source ? { source } : {}),
      ...(estValue !== undefined ? { estValue } : {}),
      ...(nextFollowUpDate ? { nextFollowUpDate } : {}),
      ...(notes ? { notes } : {}),
    });
  });

  return { rows, errors, skippedDuplicates };
}
