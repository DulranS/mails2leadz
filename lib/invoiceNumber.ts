// Sequential tax-invoice numbers (v324). Pure: no I/O.
//
// Format, from the revised Sri Lankan tax invoice (Gazette 2481/22, 27 Mar 2026; KPMG and LookupTax summaries):
//   YYMMM_QQQQ_XXXXX   e.g. 26NOV_1_00001
//   YY    last two digits of the invoice year
//   MMM   the month, upper-case (JAN to DEC)
//   QQQQ  a branch, section or project code, 1 to 15 digits
//   XXXXX a numeric serial, continued from the last number issued (not restarted each month), no spaces, at most 40 characters.
// Effective date: 1 October 2026. Gazette Extraordinary 2500/106 (6 August 2026) moved the amended format from 1 July to 1 October 2026
// (KPMG Sri Lanka, August 2026). That date has passed, so the format applies now. The notice does not say whether any earlier format is
// still allowed; confirm that with the IRD. The field list (TIN, names and addresses, title, serial, dates, values) is what this file and
// the print templates implement.

export const BRANCH_CODE = "1";
export const INVOICE_NO_MAX = 40;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const INVOICE_NO_RE = /^(\d{2})([A-Z]{3})_(\d{1,15})_(\d{5,})$/;

/** The invoice number for a sequence value, invoice date (YYYY-MM-DD) and branch code. */
export function invoiceNoFor(seq: number, isoDate: string, branch: string = BRANCH_CODE): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error("Invoice sequence must be a whole number from 1.");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error("Invoice date must be YYYY-MM-DD.");
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error("Invoice date has no valid month.");
  if (!/^\d{1,15}$/.test(branch)) throw new Error("Branch code must be 1 to 15 digits.");
  const no = `${m[1].slice(2)}${MONTHS[month - 1]}_${branch}_${String(seq).padStart(5, "0")}`;
  if (no.length > INVOICE_NO_MAX) throw new Error("Invoice number is longer than 40 characters.");
  return no;
}

/** The sequence value in an invoice number, or null for anything not in the format. */
export function invoiceSeqOf(no: string | undefined | null): number | null {
  if (!no) return null;
  const m = INVOICE_NO_RE.exec(no);
  return m ? parseInt(m[4], 10) : null;
}

export function isValidTin(tin: string | undefined | null): boolean {
  return !!tin && /^\d{9}$/.test(tin.trim());
}

/**
 * Invoice numbers for new sale rows. Rows that share an invoiceId are one invoice and share one number; a later save of an invoice
 * that already has a number keeps it. New numbers continue after the highest sequence in `existing` and after `afterSeq`.
 */
export function assignInvoiceNos(
  rows: readonly { invoiceId?: string; date: string }[],
  existing: readonly { invoiceId?: string; invoiceNo?: string }[],
  afterSeq = 0,
  branch: string = BRANCH_CODE
): { nos: string[]; top: number } {
  const known = new Map<string, string>();
  for (const e of existing) {
    if (e.invoiceId && e.invoiceNo && INVOICE_NO_RE.test(e.invoiceNo) && !known.has(e.invoiceId)) known.set(e.invoiceId, e.invoiceNo);
  }
  let top = Math.max(0, afterSeq);
  for (const e of existing) {
    const s = invoiceSeqOf(e.invoiceNo);
    if (s !== null && s > top) top = s;
  }
  const nos: string[] = [];
  for (const row of rows) {
    if (row.invoiceId && known.has(row.invoiceId)) {
      nos.push(known.get(row.invoiceId)!);
      continue;
    }
    top += 1;
    const no = invoiceNoFor(top, row.date, branch);
    if (row.invoiceId) known.set(row.invoiceId, no);
    nos.push(no);
  }
  return { nos, top };
}

/** The number to print: the sequential one when the record has it, otherwise the legacy ref built from the record ID. */
export function displayInvoiceRef(invoiceNo: string | undefined | null, legacyId: string): string {
  if (invoiceNo && INVOICE_NO_RE.test(invoiceNo)) return invoiceNo;
  return `INV-${legacyId.slice(-6).toUpperCase()}`;
}

/** Sequence values missing between the first and last issued number. Deleting an issued invoice causes one; see the delete rule. */
export function findNumberingGaps(existing: readonly (string | undefined | null)[]): number[] {
  const seen = new Set<number>();
  for (const no of existing) {
    const s = invoiceSeqOf(no);
    if (s !== null) seen.add(s);
  }
  if (seen.size === 0) return [];
  const max = Math.max(...seen);
  const gaps: number[] = [];
  for (let n = 1; n <= max; n++) if (!seen.has(n)) gaps.push(n);
  return gaps;
}

/** Invoice numbers more than one record carries. Should be empty. Non-empty means two offline devices issued the same number. */
export function findDuplicateInvoiceNos(existing: readonly (string | undefined | null)[]): string[] {
  const count = new Map<string, number>();
  for (const no of existing) {
    if (no && INVOICE_NO_RE.test(no)) count.set(no, (count.get(no) ?? 0) + 1);
  }
  return [...count.entries()].filter(([, n]) => n > 1).map(([no]) => no).sort();
}

/** The buyer's TIN for a customer name, when the customer has a valid one. Matched on name, ignoring case and spaces. */
export function tinForCustomer(customers: readonly { name: string; tin?: string }[], name: string | undefined): string | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  const hit = customers.find((c) => c.name.trim().toLowerCase() === key);
  return hit && isValidTin(hit.tin) ? hit.tin!.trim() : undefined;
}

/** The buyer's address for a customer name (v328), matched the same way as tinForCustomer. Printed under Bill to (VAT Act s.20(2)(b)). */
export function addressForCustomer(customers: readonly { name: string; address?: string }[], name: string | undefined): string | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  const hit = customers.find((c) => c.name.trim().toLowerCase() === key);
  const a = hit?.address?.trim();
  return a ? a : undefined;
}

/** The highest sequence number in use. The counter always equals this, because numbers are only issued, never deleted. */
export function highestInvoiceSeq(existing: readonly (string | undefined | null)[]): number {
  let top = 0;
  for (const no of existing) {
    const s = invoiceSeqOf(no);
    if (s !== null && s > top) top = s;
  }
  return top;
}
