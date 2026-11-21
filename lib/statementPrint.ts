// ---------------------------------------------------------------------------
// Printable financial statements (Statements page → "Print / save as PDF").
//
// Same delivery mechanism as every other document in the app (see
// lib/print.ts): a browser print dialog, which every OS already offers
// "Save as PDF" in, rather than a PDF library. What's different here is the
// source of the content. Invoices and receipts are assembled from raw data
// into a template; a statement is already rendered on screen by the page,
// so this prints THAT rendering — it clones the on-screen markup, strips the
// controls, and re-themes it for paper. It never recomputes or re-formats a
// figure, which is what guarantees the paper copy cannot disagree with the
// screen: there is no second code path that could drift.
//
// Nothing here files, submits or verifies anything with a tax authority or
// any other body; it only produces a document the owner hands over
// themselves (a bank, an accountant, the tax office).
//
// Split in two so the part that decides what goes on paper can be tested
// without a browser: buildStatementPrintHtml is a pure string builder;
// cloneForPrint / collectAppCss / printStatement are the thin DOM layer.
// ---------------------------------------------------------------------------
import type { Settings } from "./types";
import { buildLetterheadHtml, escapeHtml, openPrintWindow, printBaseStyles } from "./print";
import { todayIso } from "./format";

export const STATEMENT_PRINT_DISCLAIMER =
  "Unaudited management statement prepared from the business's own records. It has not been audited or reviewed, and it has not been filed with or submitted to any tax authority or other body.";

// The app is dark-only and its colours are fixed Tailwind tokens (bg-panel,
// text-fg, ...), not CSS variables, so the light "paper" theme is an
// explicit override layer scoped to .stmt-print rather than a theme switch.
// Everything is !important because the app's own compiled CSS is inlined
// into the print document too (that's how the on-screen layout survives),
// and these rules must win over it regardless of source order.
//
// Fonts: the app's webfonts are deliberately NOT used on paper. The print
// window is a fresh document that would have to re-download them, and
// printing before they arrive silently swaps the typeface. The same system
// stack the invoices and receipts use is instant, consistent with them, and
// tabular-nums keeps the figures aligned in it.
export const STATEMENT_PRINT_CSS = `
  @page { margin: 14mm 12mm; }
  html, body { background: #fff !important; color: #111 !important; overflow: visible !important; height: auto !important; width: auto !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .stmt-meta { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 12px; color: #555; margin: -6px 0 18px; }
  /* The whole document sits in one wrapper table so its <tfoot> — the
     disclaimer — repeats at the bottom of EVERY printed page and the layout
     reserves room for it automatically. (A statement whose log spills onto a
     second page would otherwise leave the first page, the one a bank looks
     at, without the "unaudited / not filed" wording.) The base print styles
     give every table/td padding and borders, so the frame resets them. */
  .stmt-frame { width: 100%; margin: 0 !important; border-collapse: collapse; }
  .stmt-frame > tbody > tr > td, .stmt-frame > tfoot > tr > td { padding: 0 !important; border: 0 !important; font-size: inherit !important; }
  .stmt-frame > tfoot { display: table-footer-group; }
  .stmt-disclaimer { margin-top: 12px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 11px; line-height: 1.5; color: #555; break-inside: avoid; page-break-inside: avoid; }
  .stmt-disclaimer div + div { margin-top: 3px; }

  .stmt-print, .stmt-print * { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif !important; }
  .stmt-print .num { font-variant-numeric: tabular-nums; }
  .stmt-print > * + * { margin-top: 12px; }
  .stmt-print .space-y-4 > * + * { margin-top: 10px !important; }

  /* Denser than the screen: a statement is meant to be one sheet. The
     spacing utilities the statement rows use are tightened for paper only. */
  .stmt-print .py-2 { padding-top: 4px !important; padding-bottom: 4px !important; }
  .stmt-print .pt-3 { padding-top: 7px !important; }
  .stmt-print .mt-4 { margin-top: 9px !important; }
  .stmt-print .mt-5 { margin-top: 11px !important; }
  .stmt-print .mb-4 { margin-bottom: 9px !important; }

  .stmt-print .bg-panel, .stmt-print .bg-panel2 { background: transparent !important; box-shadow: none !important; }
  .stmt-print .bg-panel { break-inside: avoid; page-break-inside: avoid; }
  .stmt-print [class*="border-line"] { border-color: #d4d4d4 !important; }

  .stmt-print .text-fg { color: #111 !important; }
  .stmt-print .text-muted { color: #555 !important; }
  .stmt-print .text-good { color: #0a7a4a !important; }
  .stmt-print .text-bad { color: #b3261e !important; }
  .stmt-print .text-amber, .stmt-print .text-amber-soft { color: #8a5a00 !important; }

  .stmt-print [class*="bg-good"] { background: #e7f6ee !important; }
  .stmt-print [class*="border-good"] { border-color: #86cba7 !important; }
  .stmt-print [class*="bg-bad"] { background: #fdecee !important; }
  .stmt-print [class*="border-bad"] { border-color: #eba0a8 !important; }
  .stmt-print [class*="bg-amber"] { background: #fdf3dd !important; }
  .stmt-print [class*="border-amber"] { border-color: #e0bd72 !important; }

  /* Belt and braces: cloneForPrint already removes these; if a future edit
     to the page ever lets one through, it still can't reach the paper. */
  .stmt-print form, .stmt-print button, .stmt-print input, .stmt-print select,
  .stmt-print textarea, .stmt-print [data-print-hide] { display: none !important; }
`;

export interface StatementPrintParams {
  /** Serialized, already-sanitized statement markup (see cloneForPrint). */
  bodyHtml: string;
  /** "Income statement", "Balance sheet", ... — shown in the letterhead. */
  docType: string;
  /** "For September 2026" / "As of 2026-09-21" — shown under the letterhead. */
  periodLabel: string;
  settings: Settings;
  /** The app's compiled CSS, so the on-screen layout carries over. */
  appCss: string;
  /** Injectable for tests; defaults to today. */
  printedOn?: string;
}

export function buildStatementPrintHtml(p: StatementPrintParams): string {
  const { bodyHtml, docType, periodLabel, settings, appCss } = p;
  const printedOn = p.printedOn ?? todayIso();
  const business = settings.businessName?.trim();
  // The <title> is what browsers offer as the default file name for "Save as
  // PDF", so make it something an accountant can file: what, when, whose.
  const title = [docType, periodLabel, business].filter(Boolean).join(" - ");
  // A stylesheet is raw text inside <style>; neutralize a literal "</style"
  // so nothing in the CSS could ever end the block early.
  const safeCss = appCss.replace(/<\/style/gi, "<\\/style");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>${safeCss}</style>
    ${printBaseStyles()}
    <style>${STATEMENT_PRINT_CSS}</style>
    </head>
    <body>
      <table class="stmt-frame">
        <tbody><tr><td>
          ${buildLetterheadHtml(settings, escapeHtml(docType))}
          <div class="stmt-meta">
            <span>${escapeHtml(periodLabel)}</span>
            <span>Currency: ${escapeHtml(settings.currency)}</span>
            <span>Printed ${escapeHtml(printedOn)}</span>
          </div>
          <main class="stmt-print">${bodyHtml}</main>
        </td></tr></tbody>
        <tfoot><tr><td>
          <div class="stmt-disclaimer">
            <div>${escapeHtml(STATEMENT_PRINT_DISCLAIMER)}</div>
            <div>Figures are as recorded in the app on ${escapeHtml(printedOn)}.</div>
          </div>
        </td></tr></tfoot>
      </table>
    </body></html>`;
}

// ---- DOM layer ------------------------------------------------------------

// Returns a detached, print-safe copy of `source`; the live page is never
// touched. Order matters:
//  1. Anything the page explicitly marks data-print-hide goes (instructional
//     text, empty log cards, glossary pop-ups).
//  2. Glossary labels (components/Term) are buttons on screen but they carry
//     the line's actual wording ("Cost of goods sold"), so they're unwrapped
//     to plain text — removing them with the other buttons would delete the
//     label off the statement.
//  3. Every remaining control — forms, buttons, inputs — is removed. This is
//     an allow-nothing default on purpose: a control that gets added to a
//     statement later is stripped without anyone having to remember to
//     mark it.
export function cloneForPrint(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-print-hide]").forEach((n) => n.remove());
  clone.querySelectorAll("button[data-print-unwrap]").forEach((btn) => {
    const span = document.createElement("span");
    while (btn.firstChild) span.appendChild(btn.firstChild);
    btn.replaceWith(span);
  });
  clone.querySelectorAll("form, button, input, select, textarea, script").forEach((n) => n.remove());
  return clone;
}

// The app's own compiled stylesheet (Tailwind), read back out of the live
// document so the print copy lays out exactly like the screen. A sheet the
// browser won't let us read (cross-origin) is skipped rather than failing
// the whole print.
export function collectAppCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText);
    } catch {
      // cross-origin stylesheet — not ours, not needed
    }
  }
  return chunks.join("\n");
}

// Returns false if the browser blocked the print window, so the caller can
// say so instead of leaving the person clicking a button that does nothing.
export function printStatement(params: {
  source: HTMLElement;
  docType: string;
  periodLabel: string;
  settings: Settings;
}): boolean {
  const html = buildStatementPrintHtml({
    bodyHtml: cloneForPrint(params.source).innerHTML,
    docType: params.docType,
    periodLabel: params.periodLabel,
    settings: params.settings,
    appCss: collectAppCss(),
  });
  return openPrintWindow(html, { waitForLoad: true });
}
