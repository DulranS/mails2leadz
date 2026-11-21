import { displayInvoiceRef } from "./invoiceNumber";
// ---------------------------------------------------------------------------
// Shared printable-document helpers. Every printable document in the app
// (project quotes/invoices, sale receipts) is deliberately implemented as a
// browser print dialog — window.open + document.write + print() — rather
// than a PDF-generation library: every OS's print dialog already offers
// "Save as PDF", so this gets a downloadable, professional-looking document
// without adding a client-side PDF dependency to the bundle. Centralized
// here so every document type (project or otherwise) shares one letterhead,
// one set of base styles, and one print trigger instead of each page
// reinventing its own.
// ---------------------------------------------------------------------------
import type { Settings } from "./types";
import type { ReceivableLine } from "./calculations";
import type { SupplierStatementLine } from "./supplierStatement";
import { formatMoney, todayIso } from "./format";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Returns false when the browser blocked the pop-up (nothing was opened), so
// a caller that wants to can tell the person instead of failing silently.
// Existing callers ignore the return value and behave exactly as before.
//
// `waitForLoad` holds the print dialog until the new document has finished
// loading its images — needed when the document carries a remote image (the
// letterhead logo is a Firebase Storage URL), which a fixed 250 ms delay can
// beat on a slow connection and print as a blank box. It never hangs: the
// dialog opens after 4 s regardless, and a broken image still counts as
// "loaded". Off by default so every existing document flow is untouched.
export function openPrintWindow(html: string, opts: { waitForLoad?: boolean } = {}): boolean {
  const win = window.open("", "_blank", "width=800,height=1000");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();

  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    win.focus();
    win.print();
  };

  if (opts.waitForLoad) {
    // Wait on the images themselves, not on document.readyState: Chromium
    // reports "complete" straight after document.close() even while an
    // image is still downloading (only the window "load" event waits), so
    // trusting readyState printed the logo as a blank box.
    const pending = Array.from(win.document.images).filter((img) => !img.complete);
    if (pending.length === 0) {
      setTimeout(fire, 100);
    } else {
      let left = pending.length;
      const settled = () => {
        left -= 1;
        if (left === 0) setTimeout(fire, 100);
      };
      pending.forEach((img) => {
        img.addEventListener("load", settled);
        img.addEventListener("error", settled); // a broken logo must not block printing
      });
    }
    setTimeout(fire, 4000);
  } else {
    // Give the new document a beat to lay out before invoking print.
    setTimeout(fire, 250);
  }
  return true;
}

export function printBaseStyles(): string {
  return `
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 720px; margin: 0 auto; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .muted { color: #666; font-size: 13px; }
      .meta { display: flex; justify-content: space-between; margin: 24px 0; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #ddd; font-size: 13px; }
      th { text-transform: uppercase; letter-spacing: 0.03em; font-size: 10px; color: #666; }
      td.num, th.num { text-align: right; }
      .total-row td { border-top: 2px solid #1a1a1a; border-bottom: none; font-weight: 600; }
      .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 20px; }
      .letterhead .biz-name { font-size: 17px; font-weight: 700; }
      .letterhead .biz-meta { font-size: 12px; color: #666; margin-top: 2px; }
      .letterhead .doc-type { font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; text-align: right; }
      .footer { margin-top: 32px; font-size: 11px; color: #888; }
      @media print { body { padding: 0; } }
    </style>
  `;
}

// Letterhead strip shown at the top of any printed document, built from
// Settings.businessName/Address/Phone (all optional — see lib/types.ts).
// When no business name is set, this renders a plain heading instead of a
// half-empty header, so an owner who hasn't filled in Settings yet still
// gets a clean document instead of a broken-looking placeholder.
export function buildLetterheadHtml(settings: Settings, docType: string): string {
  if (!settings.businessName?.trim()) {
    return `<h1>${docType}</h1>`;
  }
  const metaLine = [
    settings.businessAddress,
    settings.businessPhone,
    settings.taxIdNumber?.trim() ? `TIN ${settings.taxIdNumber.trim()}` : undefined,
    settings.vatRegistrationNo?.trim() ? `VAT reg. ${settings.vatRegistrationNo.trim()}` : undefined,
  ]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml)
    .join(" · ");
  const logo = settings.logoUrl
    ? `<img src="${escapeHtml(settings.logoUrl)}" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:4px;flex-shrink:0;" />`
    : "";
  return `
    <div class="letterhead">
      <div style="display:flex;align-items:center;gap:10px;">
        ${logo}
        <div>
          <div class="biz-name">${escapeHtml(settings.businessName)}</div>
          ${metaLine ? `<div class="biz-meta">${metaLine}</div>` : ""}
        </div>
      </div>
      <div class="doc-type">${docType}</div>
    </div>
  `;
}

// A safe, universal WhatsApp share link: it deliberately never targets a
// specific number. customerContact is free text (phone OR email — see
// Sale.customerContact in lib/types.ts) with no enforced format, so
// guessing at country codes to build a wa.me/<number> deep link risks
// silently pointing at the wrong person. wa.me/?text=... instead just
// opens WhatsApp with the message pre-filled and lets the owner pick the
// contact themselves — one tap slower, zero chance of misfiring.
export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildReceivableReminderText(params: {
  businessName?: string;
  customer: string;
  itemName: string;
  amountOutstanding: number;
  dueDate: string;
  daysOverdue: number;
  currency: string;
  // Late charge built up so far under the owner's own terms (lib/lateFees.ts). Mentioned only when above zero.
  lateCharge?: number;
}): string {
  const { businessName, customer, itemName, amountOutstanding, dueDate, daysOverdue, currency, lateCharge } = params;
  const from = businessName?.trim() ? businessName.trim() : "us";
  const amount = formatMoney(amountOutstanding, currency);
  const status =
    daysOverdue > 0
      ? `is now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue (was due ${dueDate})`
      : `is due ${dueDate}`;
  const late = lateCharge && lateCharge > 0.005 ? ` A late charge of ${formatMoney(lateCharge, currency)} has built up under our terms.` : "";
  return `Hi ${customer}, this is a friendly reminder from ${from}: ${amount} for ${itemName} ${status}.${late} Let us know if you'd like to arrange payment — thank you!`;
}

// ---------------------------------------------------------------------------
// A proper Invoice for a credit sale — distinct from the "Receipt" a cash
// sale prints (see Sales page). A receipt says "here's what you were
// charged"; a customer chasing an invoice needs to see what's still owed
// after whatever they've already paid you, which a receipt alone can't show
// once partial payments start coming in against a credit sale. Shared here
// (rather than duplicated per-page, the way buildSaleReceiptHtml/the
// project buildInvoiceHtml are page-local) because both the Sales page
// (send it the moment you make the credit sale) and the Receivables page
// (re-send it while chasing an outstanding balance) need the exact same
// document — same layout, same payments-received breakdown, same balance
// math — and drifting into two near-identical copies would be its own bug
// waiting to happen. Deliberately kept to a single line item + a payments
// table: Sale is one line per record (see Sale in lib/types.ts), so there's
// nothing to batch, and no new field, collection, or invoice-numbering
// scheme is introduced — the invoice reference is just the existing sale
// id, which is already unique and already what a payment is filed against.
export interface InvoicePaymentRow {
  date: string;
  method: string;
  amount: number;
}

export function buildSaleInvoiceHtml(params: {
  saleId: string;
  invoiceNo?: string; // the sequential invoice number, when the sale has one (v321)
  itemName: string;
  itemDetail?: string; // a small line under the item, e.g. its serial number and warranty end
  amount: number; // full sale value, base currency, TAX INCLUDED
  taxAmount?: number; // sales tax portion of `amount` — 0/absent shows no breakdown
  customer?: string;
  customerContact?: string;
  issueDate: string;
  dueDate?: string;
  payments: InvoicePaymentRow[];
  settings: Settings;
  customerTin?: string; // the buyer's TIN, printed under Bill to when set (v325)
  customerAddress?: string; // the buyer's address, printed under Bill to when set (v328)
  supplyDate?: string; // the date of supply, when it differs from the invoice date (v326)
}): string {
  const { saleId, itemName, itemDetail, amount, taxAmount = 0, customer, customerContact, customerTin, customerAddress, supplyDate, issueDate, dueDate, payments, settings } = params;
  const currency = settings.currency;
  const subtotal = amount - taxAmount;
  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(amount - amountPaid, 0);
  const isOverdue = balanceDue > 0.005 && !!dueDate && dueDate < todayIso();
  const invoiceRef = displayInvoiceRef(params.invoiceNo, saleId);

  const paymentsRows =
    payments.length > 0
      ? `
        <div class="muted" style="margin-top:20px;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Payments received</div>
        <table>
          <thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${payments
              .map(
                (p) =>
                  `<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(p.method.replace("_", " "))}</td><td class="num">${formatMoney(p.amount, currency)}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      `
      : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${invoiceRef}</title>${printBaseStyles()}</head>
    <body>
      ${buildLetterheadHtml(settings, settings.vatRegistrationNo?.trim() ? "TAX INVOICE" : "Invoice")}
      <div class="meta">
        <div>
          ${customer ? `<strong>Bill to:</strong> ${escapeHtml(customer)}${customerContact ? `<br/>${escapeHtml(customerContact)}` : ""}${customerAddress ? `<br/>${escapeHtml(customerAddress).replace(/\n/g, "<br/>")}` : ""}${customerTin ? `<br/>TIN ${escapeHtml(customerTin)}` : ""}` : ""}
        </div>
        <div style="text-align:right;">
          <div><strong>Invoice:</strong> ${invoiceRef}</div>
          <div><strong>Date of invoice:</strong> ${issueDate}</div>
          <div><strong>Date of supply:</strong> ${supplyDate ?? issueDate}</div>
          ${dueDate ? `<div><strong>Due:</strong> ${dueDate}${isOverdue ? " (overdue)" : ""}</div>` : ""}
        </div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
        <tbody>
          <tr><td>${escapeHtml(itemName)}${itemDetail ? `<div style="font-size:11px;color:#555">${escapeHtml(itemDetail)}</div>` : ""}</td><td class="num">${formatMoney(subtotal, currency)}</td></tr>
        </tbody>
        ${
          taxAmount > 0.005
            ? `<tfoot>
                <tr><td>Subtotal</td><td class="num">${formatMoney(subtotal, currency)}</td></tr>
                <tr><td>${escapeHtml(taxLabel)}</td><td class="num">${formatMoney(taxAmount, currency)}</td></tr>
              </tfoot>`
            : ""
        }
      </table>
      ${paymentsRows}
      <table style="margin-top:8px;">
        <tfoot>
          <tr><td>Amount due</td><td class="num">${formatMoney(amount, currency)}</td></tr>
          ${amountPaid > 0 ? `<tr><td>Less payments received</td><td class="num">−${formatMoney(amountPaid, currency)}</td></tr>` : ""}
          <tr class="total-row"><td>Balance due</td><td class="num">${formatMoney(balanceDue, currency)}</td></tr>
        </tfoot>
      </table>
      <div class="footer">${balanceDue <= 0.005 ? "Paid in full — thank you." : isOverdue ? "This invoice is past its due date." : "Thank you for your business."}</div>
      <div class="footer">Printed ${todayIso()}.</div>
    </body></html>`;
}

// Opens the right printable document (single-item or multi-item) for a
// ReceivableLine — used by the Receivables and Receivables/Payables pages,
// which only ever deal in ReceivableLine rather than raw Sale rows. A
// grouped line's `items` already carry each product's name/qty/price, so
// no separate product lookup is needed here the way the Invoices page
// needs one for its raw-Sale print path.
export function printReceivableInvoice(line: ReceivableLine, payments: InvoicePaymentRow[], settings: Settings, customerTin?: string, customerAddress?: string) {
  if (line.items.length <= 1) {
    openPrintWindow(
      buildSaleInvoiceHtml({
        saleId: line.saleId,
        invoiceNo: line.invoiceNo,
        itemName: line.productName,
        amount: line.amountDue,
        taxAmount: line.taxAmount,
        customer: line.customer,
        customerContact: line.customerContact,
      customerTin,
      customerAddress,
      supplyDate: line.supplyDate,
        issueDate: line.date,
        dueDate: line.dueDate,
        payments,
        settings,
      })
    );
    return;
  }
  openPrintWindow(
    buildMultiItemInvoiceHtml({
      invoiceRef: displayInvoiceRef(line.invoiceNo, line.invoiceId ?? line.saleId),
      items: line.items.map((i) => ({ name: i.productName, qty: i.qty, unitPrice: i.unitPrice, amount: i.amountDue - i.taxAmount })),
      taxAmount: line.taxAmount,
      customer: line.customer,
      customerContact: line.customerContact,
      customerTin,
      customerAddress,
      supplyDate: line.supplyDate,
      issueDate: line.date,
      dueDate: line.dueDate,
      payments,
      settings,
    })
  );
}

// Multi-item counterpart to buildSaleInvoiceHtml — for an invoice made up
// of several Sale rows sharing Sale.invoiceId (see MultiItemInvoiceForm /
// ReceivableLine.items). One row per line item, one shared total, same
// letterhead/payments/balance layout as the single-item invoice so the two
// document types look like one consistent product.
export interface InvoiceLineItemRow {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export function buildMultiItemInvoiceHtml(params: {
  invoiceRef: string;
  items: InvoiceLineItemRow[]; // each `amount` is that line's subtotal, TAX EXCLUDED
  taxAmount?: number; // total sales tax across all lines — 0/absent shows no breakdown
  customer?: string;
  customerContact?: string;
  issueDate: string;
  dueDate?: string;
  payments: InvoicePaymentRow[];
  settings: Settings;
  customerTin?: string; // the buyer's TIN, printed under Bill to when set (v325)
  customerAddress?: string; // the buyer's address, printed under Bill to when set (v328)
  supplyDate?: string; // the date of supply, when it differs from the invoice date (v326)
}): string {
  const { invoiceRef, items, taxAmount = 0, customer, customerContact, customerTin, customerAddress, supplyDate, issueDate, dueDate, payments, settings } = params;
  const currency = settings.currency;
  const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
  const amount = subtotal + taxAmount;
  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
  const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(amount - amountPaid, 0);
  const isOverdue = balanceDue > 0.005 && !!dueDate && dueDate < todayIso();

  const paymentsRows =
    payments.length > 0
      ? `
        <div class="muted" style="margin-top:20px;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Payments received</div>
        <table>
          <thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${payments
              .map(
                (p) =>
                  `<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(p.method.replace("_", " "))}</td><td class="num">${formatMoney(p.amount, currency)}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      `
      : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${invoiceRef}</title>${printBaseStyles()}</head>
    <body>
      ${buildLetterheadHtml(settings, settings.vatRegistrationNo?.trim() ? "TAX INVOICE" : "Invoice")}
      <div class="meta">
        <div>
          ${customer ? `<strong>Bill to:</strong> ${escapeHtml(customer)}${customerContact ? `<br/>${escapeHtml(customerContact)}` : ""}${customerAddress ? `<br/>${escapeHtml(customerAddress).replace(/\n/g, "<br/>")}` : ""}${customerTin ? `<br/>TIN ${escapeHtml(customerTin)}` : ""}` : ""}
        </div>
        <div style="text-align:right;">
          <div><strong>Invoice:</strong> ${invoiceRef}</div>
          <div><strong>Date of invoice:</strong> ${issueDate}</div>
          <div><strong>Date of supply:</strong> ${supplyDate ?? issueDate}</div>
          ${dueDate ? `<div><strong>Due:</strong> ${dueDate}${isOverdue ? " (overdue)" : ""}</div>` : ""}
        </div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${items
            .map(
              (i) =>
                `<tr><td>${escapeHtml(i.name)}</td><td class="num">${i.qty}</td><td class="num">${formatMoney(i.unitPrice, currency)}</td><td class="num">${formatMoney(i.amount, currency)}</td></tr>`
            )
            .join("")}
        </tbody>
        ${
          taxAmount > 0.005
            ? `<tfoot>
                <tr><td colspan="3">Subtotal</td><td class="num">${formatMoney(subtotal, currency)}</td></tr>
                <tr><td colspan="3">${escapeHtml(taxLabel)}</td><td class="num">${formatMoney(taxAmount, currency)}</td></tr>
              </tfoot>`
            : ""
        }
      </table>
      ${paymentsRows}
      <table style="margin-top:8px;">
        <tfoot>
          <tr><td colspan="3">Amount due</td><td class="num">${formatMoney(amount, currency)}</td></tr>
          ${amountPaid > 0 ? `<tr><td colspan="3">Less payments received</td><td class="num">−${formatMoney(amountPaid, currency)}</td></tr>` : ""}
          <tr class="total-row"><td colspan="3">Balance due</td><td class="num">${formatMoney(balanceDue, currency)}</td></tr>
        </tfoot>
      </table>
      <div class="footer">${balanceDue <= 0.005 ? "Paid in full — thank you." : isOverdue ? "This invoice is past its due date." : "Thank you for your business."}</div>
      <div class="footer">Printed ${todayIso()}.</div>
    </body></html>`;
}

// Printable Estimate — a pre-sale quote (see Estimate in lib/types.ts).
// Same letterhead/table layout as the invoices above so it reads as part
// of the same document family, but deliberately no payments table and no
// "balance due" framing: nothing has been charged yet. Shows "Valid until"
// instead of a due date, and the status badge in place of an overdue flag.
export function buildEstimateHtml(params: {
  estimateRef: string;
  items: InvoiceLineItemRow[]; // each `amount` is that line's subtotal, TAX EXCLUDED
  taxAmount?: number;
  customer?: string;
  customerContact?: string;
  issueDate: string;
  validUntil?: string;
  status: string;
  notes?: string;
  settings: Settings;
}): string {
  const { estimateRef, items, taxAmount = 0, customer, customerContact, issueDate, validUntil, status, notes, settings } = params;
  const currency = settings.currency;
  const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
  const total = subtotal + taxAmount;
  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Estimate ${estimateRef}</title>${printBaseStyles()}</head>
    <body>
      ${buildLetterheadHtml(settings, "Estimate")}
      <div class="meta">
        <div>
          ${customer ? `<strong>For:</strong> ${escapeHtml(customer)}${customerContact ? `<br/>${escapeHtml(customerContact)}` : ""}` : ""}
        </div>
        <div style="text-align:right;">
          <div><strong>Estimate:</strong> ${estimateRef}</div>
          <div><strong>Date:</strong> ${issueDate}</div>
          ${validUntil ? `<div><strong>Valid until:</strong> ${validUntil}</div>` : ""}
          <div><strong>Status:</strong> ${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${items
            .map(
              (i) =>
                `<tr><td>${escapeHtml(i.name)}</td><td class="num">${i.qty}</td><td class="num">${formatMoney(i.unitPrice, currency)}</td><td class="num">${formatMoney(i.amount, currency)}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
      <table style="margin-top:8px;">
        <tfoot>
          ${taxAmount > 0.005 ? `<tr><td colspan="3">Subtotal</td><td class="num">${formatMoney(subtotal, currency)}</td></tr>
          <tr><td colspan="3">${escapeHtml(taxLabel)}</td><td class="num">${formatMoney(taxAmount, currency)}</td></tr>` : ""}
          <tr class="total-row"><td colspan="3">Estimated total</td><td class="num">${formatMoney(total, currency)}</td></tr>
        </tfoot>
      </table>
      ${notes ? `<div class="footer" style="font-size:12px;color:#444;">${escapeHtml(notes)}</div>` : ""}
      <div class="footer">This is an estimate, not an invoice — pricing and availability are not guaranteed until confirmed.</div>
      <div class="footer">Printed ${todayIso()}.</div>
    </body></html>`;
}

// ---------------------------------------------------------------------------
// Customer statement of account: everything ONE customer still owes, on one page, to hand or
// send to a slow payer. Built only from the receivables aging lines the app already computes
// (so it can never disagree with the Receivables screen) and printed like every other document.
// ---------------------------------------------------------------------------
const STATEMENT_BUCKETS: { key: string; label: string }[] = [
  { key: "current", label: "Not yet due" },
  { key: "1-30", label: "1-30 days late" },
  { key: "31-60", label: "31-60 days late" },
  { key: "61-90", label: "61-90 days late" },
  { key: "90+", label: "Over 90 days late" },
];

export function buildCustomerStatementHtml(params: {
  customer: string;
  customerContact?: string;
  lines: ReceivableLine[];
  settings: Settings;
}): string {
  const { customer, customerContact, settings } = params;
  const currency = settings.currency;
  const lines = params.lines
    .filter((l) => l.amountOutstanding > 0.005)
    .sort((a, b) => a.date.localeCompare(b.date) || a.dueDate.localeCompare(b.dueDate));
  const total = lines.reduce((sum, l) => sum + l.amountOutstanding, 0);
  const overdueTotal = lines.reduce((sum, l) => sum + (l.daysOverdue > 0 ? l.amountOutstanding : 0), 0);
  const byBucket = new Map<string, number>();
  for (const l of lines) byBucket.set(l.bucket, (byBucket.get(l.bucket) ?? 0) + l.amountOutstanding);

  const rows = lines
    .map((l) => {
      const late = l.daysOverdue > 0;
      const ref = l.isOpeningBalance ? "Opening balance" : l.items.length > 1 ? displayInvoiceRef(l.invoiceNo, l.invoiceId ?? l.saleId) : "";
      return `<tr>
        <td>${escapeHtml(l.date)}</td>
        <td>${escapeHtml(l.productName)}${ref ? `<div class="muted" style="font-size:11px;">${escapeHtml(ref)}</div>` : ""}</td>
        <td>${escapeHtml(l.dueDate)}${late ? `<div style="font-size:11px;color:#b00020;">${l.daysOverdue} days overdue</div>` : ""}</td>
        <td class="num">${formatMoney(l.amountDue, currency)}</td>
        <td class="num">${formatMoney(l.amountPaid + l.amountWrittenOff, currency)}</td>
        <td class="num"><strong>${formatMoney(l.amountOutstanding, currency)}</strong></td>
      </tr>`;
    })
    .join("");

  const bucketRows = STATEMENT_BUCKETS.filter((b) => (byBucket.get(b.key) ?? 0) > 0.005)
    .map((b) => `<tr><td colspan="5">${b.label}</td><td class="num">${formatMoney(byBucket.get(b.key) ?? 0, currency)}</td></tr>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Statement - ${escapeHtml(customer)}</title>${printBaseStyles()}</head>
    <body>
      ${buildLetterheadHtml(settings, "Statement of account")}
      <div class="meta">
        <div><strong>For:</strong> ${escapeHtml(customer)}${customerContact ? `<br/>${escapeHtml(customerContact)}` : ""}</div>
        <div style="text-align:right;"><div><strong>As of:</strong> ${todayIso()}</div></div>
      </div>
      ${
        lines.length === 0
          ? `<p>Nothing is outstanding on this account. Thank you.</p>`
          : `<table>
        <thead><tr><th>Date</th><th>Description</th><th>Due</th><th class="num">Invoiced</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <table style="margin-top:8px;">
        <tfoot>
          ${bucketRows}
          <tr class="total-row"><td colspan="5">Total now owed</td><td class="num">${formatMoney(total, currency)}</td></tr>
          ${overdueTotal > 0.005 ? `<tr><td colspan="5" style="color:#b00020;">Of which overdue</td><td class="num" style="color:#b00020;">${formatMoney(overdueTotal, currency)}</td></tr>` : ""}
        </tfoot>
      </table>`
      }
      <div class="footer">Please arrange payment of any overdue balance. If you have already paid, thank you, and please let us know so we can update our records.</div>
      <div class="footer">Printed ${todayIso()}.</div>
    </body></html>`;
}

export function printCustomerStatement(customer: string, customerContact: string | undefined, lines: ReceivableLine[], settings: Settings) {
  openPrintWindow(buildCustomerStatementHtml({ customer, customerContact, lines, settings }));
}

// ---------------------------------------------------------------------------
// Supplier statement of account: what our books say we still owe ONE supplier. Built from the payables lines the app
// already computes (see lib/supplierStatement.ts), so it matches the Money owed screen. Handed to the supplier, it is
// the basis for reconciling against the statement they send.
// ---------------------------------------------------------------------------
export function buildSupplierStatementHtml(params: {
  supplier: string;
  supplierContact?: string;
  lines: SupplierStatementLine[];
  settings: Settings;
}): string {
  const { supplier, supplierContact, lines, settings } = params;
  const currency = settings.currency;
  const total = lines.reduce((sum, l) => sum + l.outstanding, 0);
  const overdueTotal = lines.reduce((sum, l) => sum + (l.daysOverdue > 0 ? l.outstanding : 0), 0);
  const rows = lines
    .map((l) => {
      const late = l.daysOverdue > 0;
      return `<tr>
        <td>${escapeHtml(l.date)}</td>
        <td>${escapeHtml(l.description)}${l.reference ? `<div class="muted" style="font-size:11px;">${escapeHtml(l.reference)}</div>` : ""}</td>
        <td>${escapeHtml(l.dueDate)}${late ? `<div style="font-size:11px;color:#b00020;">${l.daysOverdue} days past due</div>` : ""}</td>
        <td class="num">${formatMoney(l.billed, currency)}</td>
        <td class="num">${formatMoney(l.settled, currency)}</td>
        <td class="num"><strong>${formatMoney(l.outstanding, currency)}</strong></td>
      </tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Supplier statement - ${escapeHtml(supplier)}</title>${printBaseStyles()}</head>
    <body>
      ${buildLetterheadHtml(settings, "Statement of account")}
      <div class="meta">
        <div><strong>Supplier:</strong> ${escapeHtml(supplier)}${supplierContact ? `<br/>${escapeHtml(supplierContact)}` : ""}</div>
        <div style="text-align:right;"><div><strong>As of:</strong> ${todayIso()}</div></div>
      </div>
      ${
        lines.length === 0
          ? `<p>Nothing is outstanding to this supplier in our records.</p>`
          : `<table>
        <thead><tr><th>Date</th><th>Description</th><th>Due</th><th class="num">Billed</th><th class="num">Paid / credited</th><th class="num">Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <table style="margin-top:8px;">
        <tfoot>
          <tr class="total-row"><td colspan="5">Total we owe you, per our records</td><td class="num">${formatMoney(total, currency)}</td></tr>
          ${overdueTotal > 0.005 ? `<tr><td colspan="5" style="color:#b00020;">Of which past due</td><td class="num" style="color:#b00020;">${formatMoney(overdueTotal, currency)}</td></tr>` : ""}
        </tfoot>
      </table>`
      }
      <div class="footer">This is our record of what we owe you. If it differs from yours, please send us your statement so we can reconcile it.</div>
      <div class="footer">Printed ${todayIso()}.</div>
    </body></html>`;
}

export function printSupplierStatement(supplier: string, supplierContact: string | undefined, lines: SupplierStatementLine[], settings: Settings) {
  openPrintWindow(buildSupplierStatementHtml({ supplier, supplierContact, lines, settings }));
}
