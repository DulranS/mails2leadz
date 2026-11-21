import { parseTaxMode } from "./payTax";
import Papa from "papaparse";
import { formatTiers, parseTiers } from "./priceTiers";
import type {
  Booking,
  Shipment,
  Rental,
  BusinessTask,
  BankStatementLine,
  CapitalEntry,
  Customer,
  Employee,
  Expense,
  FixedAsset,
  InvestmentTxn,
  Lead,
  PlaybookEntry,
  LeaveRecord,
  SupportCase,
  FeedbackEntry,
  CollectionNote,
  LentLoan,
  LentLoanTxn,
  Security,
  Loan,
  Location,
  Opportunity,
  Product,
  Project,
  Purchase,
  PurchaseOrder,
  Sale,
  TaxPayment,
  TimeEntry,
  VariableCost,
} from "./types";
import { resolveLocationId } from "./stockTracking";
import { leadsFromRows, type LeadImportRow, type LeadImportError } from "./leadImport";

// ---------------------------------------------------------------------------
// Export: flat CSV per entity. Kept as separate files (one per collection)
// rather than one mega-CSV, since the schemas don't share columns and mixing
// them forces a lot of empty cells / ambiguity on re-import.
// ---------------------------------------------------------------------------

export function toCsv<T extends Record<string, unknown>>(rows: T[]): string {
  return Papa.unparse(rows);
}

// Spreadsheet-safe variant for files that are handed to SOMEONE ELSE to open in Excel / Sheets
// (the accountant pack). A customer or supplier name typed as `=HYPERLINK(...)` or `@SUM(...)`
// would otherwise run as a formula on the accountant's machine. Text that starts with = + - @ (or a
// tab / carriage return) gets a leading apostrophe, the standard defence; genuine numbers
// ("-12.50", "+5") are left alone so amounts stay numeric. Not used for the backup files, which
// must round-trip byte-for-byte through restore.
export function toCsvSafe<T extends Record<string, unknown>>(rows: T[]): string {
  const NUMERIC = /^[+-]?\d+(\.\d+)?$/;
  const safe = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "string" && /^[=+\-@\t\r]/.test(v) && !NUMERIC.test(v) ? `'${v}` : v;
    }
    return out;
  });
  return Papa.unparse(safe);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Row-builders are exported separately from the exportX() functions below
// so lib/backup.ts (full-zip backup) can reuse the exact same row shape
// without a second, driftable copy of this mapping — the per-entity
// exportX() functions are unchanged, just now a thin wrapper around these.
export function productsRows(products: Product[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    type: p.type,
    active: p.active,
    orderingCost: p.orderingCost ?? "",
    holdingCostPct: p.holdingCostPct ?? "",
    leadTimeDays: p.leadTimeDays ?? "",
    defaultCostPrice: p.defaultCostPrice ?? "",
    defaultSellPrice: p.defaultSellPrice ?? "",
    wholesalePrice: p.wholesalePrice ?? "",
    priceTiers: formatTiers(p.priceTiers).replace(/, /g, "; "), // "10:90; 50:80"
    warrantyMonths: p.warrantyMonths ?? "",
    taxRatePct: p.taxRatePct ?? "", // empty = the shop rate; 0 = tax-free
    laborCostPerUnit: p.laborCostPerUnit ?? "",
  }));
}

export function exportProducts(products: Product[]) {
  downloadCsv("products.csv", toCsv(productsRows(products)));
}

// Columns beyond the original id/product/qty/unitCost/date/supplier/notes
// set are the ones a real accountant asks for at year-end and the app
// already tracks internally but previously dropped on export: a computed
// line total (so they're not re-deriving qty×unitCost by hand across
// thousands of rows), how it was paid, who recorded it, which PO it was
// received against, and — for foreign-currency purchases — the original
// currency/rate/amount alongside the base-currency figure everything else
// in the app already uses (see lib/fx.ts). `unitCost`/`total` are always
// base-currency; the foreign* columns are blank for ordinary local
// transactions, so this is purely additive for anyone re-importing.
// Which branch a record belongs to, by NAME (a person reading the CSV has no
// use for an internal id). A record with no locationId resolves to the
// default location, same rule the stock and profit-by-location numbers use,
// so the export agrees with what the app shows. Export-only on purpose, like
// paymentMethod/dueDate: the importers only read the core fields needed to
// bulk-load new records.
function locationNameFor(locationId: string | undefined, locations: Location[]): string {
  const id = resolveLocationId(locationId, locations);
  return locations.find((l) => l.id === id)?.name ?? "";
}

export function purchasesRows(purchases: Purchase[], products: Product[], locations: Location[]) {
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  return purchases.map((p) => ({
    id: p.id,
    date: p.date,
    product: nameById.get(p.productId) ?? p.productId,
    productId: p.productId,
    qty: p.qty,
    unitCost: p.unitCost,
    total: p.qty * p.unitCost,
    supplier: p.supplier ?? "",
    location: locationNameFor(p.locationId, locations),
    paymentMethod: p.paymentMethod ?? "cash",
    dueDate: p.dueDate ?? "",
    currency: p.currency ?? "",
    exchangeRate: p.exchangeRate ?? "",
    foreignUnitCost: p.foreignUnitCost ?? "",
    foreignTotal: p.currency && p.foreignUnitCost != null ? p.qty * p.foreignUnitCost : "",
    expiryDate: p.expiryDate ?? "", // v315: optional, read back by importPurchases
    batchRef: p.batchRef ?? "",
    purchaseOrderId: p.purchaseOrderId ?? "",
    notes: p.notes ?? "",
  }));
}

export function exportPurchases(purchases: Purchase[], products: Product[], locations: Location[]) {
  downloadCsv("purchases.csv", toCsv(purchasesRows(purchases, products, locations)));
}

// Same reasoning as purchasesRows above: total, payment method, who rang
// it up, the invoice it belongs to (if any), and the foreign-currency
// trail are all things the app already records but weren't reaching the
// export — an accountant reconciling revenue for the year needs the line
// total and the collected-vs-credit split at minimum, and a foreign-priced
// sale is exactly the kind of row that gets questioned if there's nothing
// showing what was actually charged versus the converted base amount.
// batchRef (v315): the supplier batch or lot of the delivery the seller picked for this sale, blank when none was picked
// or that delivery has no batch number. Pass the purchases to fill it; without them the column is blank.
export function salesRows(sales: Sale[], products: Product[], locations: Location[], purchases: Purchase[] = []) {
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  const batchRefById = new Map<string, string>(purchases.map((p) => [p.id, p.batchRef?.trim() ?? ""]));
  return sales.map((s) => ({
    id: s.id,
    date: s.date,
    product: nameById.get(s.productId) ?? s.productId,
    productId: s.productId,
    qty: s.qty,
    unitPrice: s.unitPrice,
    total: s.qty * s.unitPrice,
    customer: s.customer ?? "",
    saleChannel: s.saleChannel ?? "",
    location: locationNameFor(s.locationId, locations),
    paymentMethod: s.paymentMethod ?? "cash",
    dueDate: s.dueDate ?? "",
    currency: s.currency ?? "",
    exchangeRate: s.exchangeRate ?? "",
    foreignUnitPrice: s.foreignUnitPrice ?? "",
    foreignTotal: s.currency && s.foreignUnitPrice != null ? s.qty * s.foreignUnitPrice : "",
    invoiceId: s.invoiceId ?? "",
    batchRef: s.batchPurchaseId ? batchRefById.get(s.batchPurchaseId) ?? "" : "",
    recordedBy: s.createdByName ?? "",
    notes: s.notes ?? "",
  }));
}

export function exportSales(sales: Sale[], products: Product[], locations: Location[], purchases: Purchase[] = []) {
  downloadCsv("sales.csv", toCsv(salesRows(sales, products, locations, purchases)));
}

export function expensesRows(expenses: Expense[], locations: Location[]) {
  return expenses.map((e) => ({
    id: e.id,
    name: e.name,
    amount: e.amount,
    category: e.category,
    kind: e.kind,
    isRecurring: e.isRecurring,
    recurrence: e.recurrence,
    startDate: e.startDate,
    endDate: e.endDate ?? "",
    // Blank = shared overhead. Unlike a sale or purchase, an expense with no
    // location is a normal state, not a legacy gap, so it does NOT fall back
    // to the default location here.
    location: e.locationId ? locations.find((l) => l.id === e.locationId)?.name ?? "" : "",
    // essential / useful / optional, blank = not reviewed. Last, so existing column positions don't move.
    importance: e.importance ?? "",
  }));
}

export function exportExpenses(expenses: Expense[], locations: Location[]) {
  downloadCsv("expenses.csv", toCsv(expensesRows(expenses, locations)));
}

export function variableCostsRows(variableCosts: VariableCost[], products: Product[]) {
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  return variableCosts.map((v) => ({
    id: v.id,
    name: v.name,
    type: v.type,
    amount: v.amount,
    product: v.productId ? nameById.get(v.productId) ?? v.productId : "(all products)",
    productId: v.productId ?? "",
    includeInCogs: v.includeInCogs ? "yes" : "no",
  }));
}

export function exportVariableCosts(variableCosts: VariableCost[], products: Product[]) {
  downloadCsv("variable_costs.csv", toCsv(variableCostsRows(variableCosts, products)));
}

export function capitalEntriesRows(entries: CapitalEntry[]) {
  return entries.map((c) => ({
    id: c.id,
    kind: c.kind,
    amount: c.amount,
    date: c.date,
    notes: c.notes ?? "",
    // Investor pool tagging (blank for the owner's own capital). Keeps a backup restore lossless.
    investor: c.investorName ?? "",
    investment_id: c.securityId ?? "",
    payout_type: c.distribution ?? "",
  }));
}

export function exportCapitalEntries(entries: CapitalEntry[]) {
  downloadCsv("capital_entries.csv", toCsv(capitalEntriesRows(entries)));
}

export function taxPaymentsRows(payments: TaxPayment[]) {
  return payments.map((t) => ({
    id: t.id,
    date: t.date,
    amount: t.amount,
    notes: t.notes ?? "",
  }));
}

export function exportTaxPayments(payments: TaxPayment[]) {
  downloadCsv("tax_payments.csv", toCsv(taxPaymentsRows(payments)));
}

export function purchaseOrdersRows(purchaseOrders: PurchaseOrder[], products: Product[]) {
  const nameById = new Map(products.map((p) => [p.id, p.name]));
  return purchaseOrders.map((po) => ({
    id: po.id,
    product: nameById.get(po.productId) ?? po.productId,
    productId: po.productId,
    qtyOrdered: po.qtyOrdered,
    unitCost: po.unitCost,
    orderDate: po.orderDate,
    expectedDate: po.expectedDate ?? "",
    supplier: po.supplier ?? "",
    status: po.status,
    receivedDate: po.receivedDate ?? "",
    qtyReceived: po.qtyReceived ?? "",
    receivedUnitCost: po.receivedUnitCost ?? "",
    notes: po.notes ?? "",
  }));
}

export function exportPurchaseOrders(purchaseOrders: PurchaseOrder[], products: Product[]) {
  downloadCsv("purchase_orders.csv", toCsv(purchaseOrdersRows(purchaseOrders, products)));
}

export function employeesRows(employees: Employee[]) {
  return employees.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    payRate: e.payRate,
    payFrequency: e.payFrequency,
    taxPct: e.taxPct,
    taxMode: e.taxMode ?? "flat",
    epfEtfApplicable: e.epfEtfApplicable ?? false,
    startDate: e.startDate,
    endDate: e.endDate ?? "",
    active: e.active,
    notes: e.notes ?? "",
  }));
}

export function exportEmployees(employees: Employee[]) {
  downloadCsv("employees.csv", toCsv(employeesRows(employees)));
}

export function loansRows(loans: Loan[]) {
  return loans.map((l) => ({
    id: l.id,
    name: l.name,
    lender: l.lender ?? "",
    principal: l.principal,
    annualInterestRatePct: l.annualInterestRatePct,
    termMonths: l.termMonths,
    startDate: l.startDate,
    active: l.active,
    notes: l.notes ?? "",
  }));
}

export function exportLoans(loans: Loan[]) {
  downloadCsv("loans.csv", toCsv(loansRows(loans)));
}

// ---------------------------------------------------------------------------
// The five exports below (customers, projects, time entries, opportunities,
// fixed assets) are export-only — same asymmetry as variableCosts above.
// Each of these has real relational/nested shape on the actual record
// (a Project's cost segments and milestones, a Customer's derived unit
// economics, a TimeEntry's link to a Project) that lives in its own
// collection or is computed, not stored on the row itself — building a
// faithful CSV *importer* for any of them means designing a second way to
// create/link that data, which is a materially bigger feature than "let an
// owner get their own data out". Export closes the actual gap (nothing
// locks a business's customer list, project history, time logs,
// opportunity scores, or asset register into this app with no way out),
// without taking on a rewrite-shaped import feature nobody asked for.
// ---------------------------------------------------------------------------

export function customersRows(customers: Customer[]) {
  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    contact: c.contact ?? "",
    leadSource: c.leadSource ?? "",
    cac: c.cac ?? "",
    creditLimit: c.creditLimit ?? "",
    address: c.address ?? "",
    idReference: c.idReference ?? "",
    guarantor: c.guarantorName ?? "",
    guarantorContact: c.guarantorContact ?? "",
    collector: c.collectorName ?? "",
    notes: c.notes ?? "",
  }));
}

export function exportCustomers(customers: Customer[]) {
  downloadCsv("customers.csv", toCsv(customersRows(customers)));
}

export function projectsRows(projects: Project[]) {
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client ?? "",
    quotedPrice: p.quotedPrice,
    status: p.status,
    startDate: p.startDate,
    targetEndDate: p.targetEndDate ?? "",
    completedDate: p.completedDate ?? "",
    notes: p.notes ?? "",
  }));
}

export function exportProjects(projects: Project[]) {
  downloadCsv("projects.csv", toCsv(projectsRows(projects)));
}

export function timeEntriesRows(timeEntries: TimeEntry[], projects: Project[]) {
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  return timeEntries.map((t) => ({
    id: t.id,
    memberName: t.memberName,
    jobLabel: t.jobLabel,
    project: t.projectId ? projectNameById.get(t.projectId) ?? "" : "",
    billable: t.billable,
    hourlyRate: t.hourlyRate ?? "",
    clockIn: new Date(t.clockIn).toISOString(),
    clockOut: t.clockOut ? new Date(t.clockOut).toISOString() : "",
    hours: t.clockOut ? Math.round(((t.clockOut - t.clockIn) / 3600000) * 100) / 100 : "",
    notes: t.notes ?? "",
  }));
}

export function exportTimeEntries(timeEntries: TimeEntry[], projects: Project[]) {
  downloadCsv("time_entries.csv", toCsv(timeEntriesRows(timeEntries, projects)));
}

export function opportunitiesRows(opportunities: Opportunity[]) {
  return opportunities.map((o) => ({
    id: o.id,
    name: o.name,
    financialCeiling: o.financialCeiling,
    optionality: o.optionality,
    longevity: o.longevity,
    capitalRequired: o.capitalRequired,
    timeToProfit: o.timeToProfit,
    passportFriction: o.passportFriction,
    risk: o.risk,
    notes: o.notes ?? "",
  }));
}

export function exportOpportunities(opportunities: Opportunity[]) {
  downloadCsv("opportunities.csv", toCsv(opportunitiesRows(opportunities)));
}

export function fixedAssetsRows(fixedAssets: FixedAsset[]) {
  return fixedAssets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    purchaseDate: a.purchaseDate,
    cost: a.cost,
    depreciationMethod: a.depreciationMethod === "reducing_balance" ? "reducing balance" : "straight line",
    reducingRatePct: a.depreciationMethod === "reducing_balance" ? (a.reducingRatePct ?? "") : "",
    usefulLifeMonths: a.usefulLifeMonths,
    salvageValue: a.salvageValue ?? "",
    disposalDate: a.disposalDate ?? "",
    disposalAmount: a.disposalAmount ?? "",
    notes: a.notes ?? "",
  }));
}

// One row per trade or income entry, with the investment named. Export only: the full backup carries the
// real records (securities + investmentTxns) for a true restore.
export function investmentTxnsRows(txns: InvestmentTxn[], securities: Security[]) {
  const nameById = new Map(securities.map((s) => [s.id, s.name]));
  return [...txns]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((t) => ({
      date: t.date,
      investment: nameById.get(t.securityId) ?? "",
      type: t.kind === "buy" ? "bought" : t.kind === "sell" ? "sold" : "income",
      units: t.units ?? "",
      amount: t.amount,
      fees: t.fees ?? "",
      notes: t.notes ?? "",
    }));
}

// Money the business has lent out: the terms of each loan, and every repayment or write-off against them.
// Export only: the full backup carries the real records (lentLoans + lentLoanTxns) for a true restore.
export function lentLoansRows(loans: LentLoan[]) {
  return [...loans]
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.createdAt - b.createdAt))
    .map((l) => ({
      borrower: l.borrower,
      purpose: l.purpose ?? "",
      date_lent: l.startDate,
      amount_lent: l.principal,
      annual_interest_pct: l.annualInterestRatePct,
      monthly_payments: l.termMonths,
      repayment_style: l.repaymentStyle === "interest_only" ? "interest each month, principal at the end" : "equal monthly payments",
      borrower_contact: l.borrowerContact ?? "",
      guarantor: l.guarantorName ?? "",
      guarantor_contact: l.guarantorContact ?? "",
      collateral: l.collateral ?? "",
      collector: l.collectorName ?? "",
      notes: l.notes ?? "",
    }));
}

export function lentLoanTxnsRows(txns: LentLoanTxn[], loans: LentLoan[]) {
  const nameById = new Map(loans.map((l) => [l.id, l.borrower]));
  return [...txns]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((t) => ({
      date: t.date,
      borrower: nameById.get(t.loanId) ?? "",
      type: t.kind === "repayment" ? "repayment received" : "written off (bad debt)",
      amount: t.amount,
      collected_by: t.collectedByName ?? "",
      notes: t.notes ?? "",
    }));
}

// The collections diary, oldest first: a readable copy of every call, message and visit.
export function collectionNotesRows(notes: CollectionNote[]) {
  return [...notes]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt))
    .map((n) => ({
      date: n.date,
      who: n.subjectLabel,
      about: n.subjectKind === "lent_loan" ? "loan" : "customer invoices",
      channel: n.channel,
      outcome: n.outcome,
      promised_date: n.promisedDate ?? "",
      promised_amount: n.promisedAmount ?? "",
      next_follow_up: n.nextFollowUpDate ?? "",
      logged_by: n.createdByName ?? "",
      note: n.note ?? "",
    }));
}

export function exportFixedAssets(fixedAssets: FixedAsset[]) {
  downloadCsv("fixed_assets.csv", toCsv(fixedAssetsRows(fixedAssets)));
}

// ---------------------------------------------------------------------------
// Import: parse + validate before returning rows to the caller for a Firestore
// batch write. Validation is intentionally strict (reject the whole file with
// a row-level error report) rather than silently skipping bad rows, since
// this is financial data.
// ---------------------------------------------------------------------------

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult<T> {
  rows: T[];
  errors: ImportError[];
}

// Exported so lib/posImport.ts's column-mapping wizard can parse an
// arbitrary POS export with the exact same Papa.parse config (header row,
// blank lines skipped) and get at both .data and .meta.fields — the
// import*(file) wrappers above only need .data, but the wizard needs the
// header list too, to build its mapping UI.
export function parseCsvFile(file: File): Promise<Papa.ParseResult<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results),
      error: (err: Error) => reject(err),
    });
  });
}

// Reads a number the way a person (or a spreadsheet's number format) wrote it, or returns null when it is not one.
// Spreadsheet apps hand back "1,250.50", "$1,250.50", "Rs. 1,200", "1,200/-", "(500.00)", "500-", "12%" or
// "1E+06" once a file has been opened, formatted and re-saved, and rejecting the whole import over formatting
// would make it useless. But the old approach (delete every character that is not a digit, minus or dot) was
// silently wrong in two ways that matter here:
//   - "Rs. 1,200" kept the dot of "Rs." and became ".1200" = 0.12 (Rs. is the normal way to write rupees);
//   - "(500.00)", the accounting way to write a negative, lost its brackets and became +500, so a bank
//     withdrawal was imported as a deposit. "500-" and "1E+06" (-> 106) had the same problem.
// So: strip only known decoration (currency words/symbols, %, "/-", "/=", brackets, grouping commas and
// spaces), honour the sign and exponent, and require what is left to be a clean number. Anything else
// ("12-15", "1.250,50", "12,50", "1.2.3", "abc") returns null and is reported as a row error rather than guessed.
export function parseAmount(v: string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  let t = String(v).replace(/[\u00a0\u202f\s]+/g, " ").trim();
  if (!t) return null;

  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }

  const CUR = "A-Za-z$\u00a3\u20ac\u20a8\u20b9\u00a5"; // letters (Rs, LKR, USD...) and $ £ € ₨ ₹ ¥
  // Leading currency, with an optional sign before or after it: "Rs. 1,200", "-Rs. 1,200", "Rs. -1,200", "$1,200"
  let m = t.match(new RegExp(`^([-+]?)\\s*[${CUR}]+\\.?\\s*([-+]?)(.*)$`));
  if (m) { if (m[1] === "-" || m[2] === "-") neg = !neg; t = m[3].trim(); }
  // Trailing decoration: "1,200 LKR", "12%", "1,200/-", "1,200/="
  t = t.replace(new RegExp(`\\s*(?:\\/[-=]|%|[${CUR}]+\\.?)$`), "").trim();
  // Trailing minus, the way some accounting exports write negatives: "500-"
  if (/\d-$/.test(t)) { neg = !neg; t = t.slice(0, -1).trim(); }

  let n: number;
  if (/^[-+]?\d+(\.\d+)?[eE][-+]?\d+$/.test(t)) {
    n = Number(t); // Excel's scientific notation, e.g. 1E+06
  } else {
    t = t.replace(/ /g, "");
    // Digits, optionally grouped with commas the western way (1,250,000) or the lakh way (1,25,000), with an
    // optional decimal part. "1,25" or "12,50" (a European decimal comma) is NOT accepted: it would silently
    // become 125 / 1250, so it is reported as a row error instead.
    if (!/^[-+]?((\d+|\d{1,3}(,\d{3})+|\d{1,2}(,\d{2})+,\d{3})(\.\d+)?|\.\d+)$/.test(t)) return null;
    n = Number(t.replace(/,/g, ""));
  }
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function num(v: string | undefined, field: string, row: number, errors: ImportError[]): number {
  if (v === undefined || v.trim() === "") {
    errors.push({ row, message: `"${field}" must be a number (got "${v ?? ""}")` });
    return 0;
  }
  const n = parseAmount(v);
  if (n === null) {
    errors.push({ row, message: `"${field}" must be a number (got "${v}")` });
    return 0;
  }
  return n;
}

// Same parsing as num(), but for optional fields: blank stays blank (undefined) instead of becoming an error.
function optionalNum(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  return parseAmount(v) ?? undefined;
}

// Accepts the common truthy/falsy spellings a spreadsheet app or a person
// typing by hand might use, not just a literal "true"/"false".
function bool(v: string | undefined, defaultVal: boolean): boolean {
  if (v === undefined || v.trim() === "") return defaultVal;
  const s = v.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return defaultVal;
}

function requiredStr(v: string | undefined, field: string, row: number, errors: ImportError[]): string {
  if (!v || !v.trim()) {
    errors.push({ row, message: `"${field}" is required` });
    return "";
  }
  return v.trim();
}

// Accepts ISO (YYYY-MM-DD), slash-separated (YYYY/MM/DD, D/M/YYYY or M/D/YYYY) and dash-separated (D-M-YYYY)
// dates, and normalizes all of them to ISO. This matters because the moment someone opens an exported CSV in
// Excel or Google Sheets and saves it back, date cells commonly get reformatted to the spreadsheet's regional
// default — rejecting anything but strict ISO would silently break every re-imported file.
//
// Day or month first? 25/10/2026 can only be day-first and 10/25/2026 only month-first, so those are never in
// doubt. For 05/10/2026 (both parts 12 or under) the order comes from the FILE: if any date in the same file
// is only possible day-first the whole file is day-first, if any is only possible month-first it is
// month-first (detectDateOrder). A file with nothing to go on is read day-first, which is how dates are
// written in Sri Lanka, the UK and most of the world. (It used to be month-first, so a Colombo spreadsheet's
// 05/10/2026 silently became 10 May.)
export type DateOrder = "dmy" | "mdy";

export function detectDateOrder(data: Record<string, string>[]): DateOrder {
  let dayFirst = false;
  let monthFirst = false;
  for (const r of data) {
    for (const [k, v] of Object.entries(r)) {
      if (!/date/i.test(k)) continue;
      const m = String(v ?? "").trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > 12 && b <= 12) dayFirst = true;
      else if (b > 12 && a <= 12) monthFirst = true;
    }
  }
  return monthFirst && !dayFirst ? "mdy" : "dmy";
}

function isoDate(v: string | undefined, field: string, row: number, errors: ImportError[], order: DateOrder = "dmy"): string {
  const s = (v ?? "").trim();
  const fail = () => {
    errors.push({ row, message: `"${field}" must be a date like 2026-01-05 or 25/12/2026 (got "${v ?? ""}")` });
    return "";
  };
  if (!s) return fail();

  // A date has to exist on the calendar, not just look like one: "2026-02-31" and "2026-13-45" used to pass
  // the shape checks and were saved as-is, which then sorted, filtered and period-locked wrongly.
  const real = (y: number, mo: number, d: number): string => {
    if (!(y >= 1900 && y <= 2200) || mo < 1 || mo > 12 || d < 1) return fail();
    if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return fail();
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };

  // Already ISO.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return real(Number(m[1]), Number(m[2]), Number(m[3]));

  // YYYY/MM/DD variants with slashes.
  m = s.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (m) return real(Number(m[1]), Number(m[2]), Number(m[3]));

  // D/M/YYYY, M/D/YYYY, D-M-YYYY, M-D-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (a > 12 && b <= 12) return real(y, b, a); // can only be day first
    if (b > 12 && a <= 12) return real(y, a, b); // can only be month first
    if (a <= 12 && b <= 12) return order === "mdy" ? real(y, a, b) : real(y, b, a);
    return fail(); // neither part can be a month
  }

  return fail();
}

// Split into a pure row-transform (import*Rows) plus a thin file-parsing
// wrapper (import*) so lib/posImport.ts's column-mapping wizard can feed
// it already-remapped rows (from an arbitrary POS export) through the
// exact same validation — required fields, number/date cleanup, product
// lookup — without a second, driftable copy of any of that logic. The
// public import*(file) signature callers already use is unchanged.
export function importProductsRows(data: Record<string, string>[]): ImportResult<Omit<Product, "id" | "createdAt">> {
  const errors: ImportError[] = [];
  const rows = data.map((r, i) => {
    const type = (r.type ?? "product").trim().toLowerCase() === "service" ? "service" : "product";
    // Wholesale price must be positive; the item's tax rate is 0 to 100 (0 = tax-free). Out of range is reported, not guessed.
    const wholesalePrice = optionalNum(r.wholesalePrice);
    if (wholesalePrice !== undefined && !(wholesalePrice > 0)) errors.push({ row: i + 2, message: '"wholesalePrice" must be more than 0 (leave it empty for none)' });
    const warrantyMonths = optionalNum(r.warrantyMonths);
    if (warrantyMonths !== undefined && !(warrantyMonths > 0 && warrantyMonths <= 120)) errors.push({ row: i + 2, message: '"warrantyMonths" must be between 1 and 120 (leave it empty for none)' });
    const tiersParsed = parseTiers(r.priceTiers ?? "");
    if (tiersParsed.error) errors.push({ row: i + 2, message: `"priceTiers": ${tiersParsed.error}` });
    const taxRatePct = optionalNum(r.taxRatePct);
    if (taxRatePct !== undefined && !(taxRatePct >= 0 && taxRatePct <= 100)) errors.push({ row: i + 2, message: '"taxRatePct" must be between 0 and 100 (leave it empty to use the shop rate)' });
    return {
      name: requiredStr(r.name, "name", i + 2, errors),
      sku: (r.sku ?? "").trim(),
      category: (r.category ?? "").trim(),
      type: type as Product["type"],
      active: bool(r.active, true),
      orderingCost: optionalNum(r.orderingCost),
      holdingCostPct: optionalNum(r.holdingCostPct),
      leadTimeDays: optionalNum(r.leadTimeDays),
      defaultCostPrice: optionalNum(r.defaultCostPrice),
      defaultSellPrice: optionalNum(r.defaultSellPrice),
      wholesalePrice: wholesalePrice !== undefined && wholesalePrice > 0 ? wholesalePrice : undefined,
      priceTiers: tiersParsed.tiers.length > 0 ? tiersParsed.tiers : undefined,
      warrantyMonths: warrantyMonths !== undefined && warrantyMonths > 0 && warrantyMonths <= 120 ? Math.round(warrantyMonths) : undefined,
      taxRatePct: taxRatePct !== undefined && taxRatePct >= 0 && taxRatePct <= 100 ? taxRatePct : undefined,
      laborCostPerUnit: optionalNum(r.laborCostPerUnit),
    };
  });
  return { rows, errors };
}

export async function importProducts(file: File): Promise<ImportResult<Omit<Product, "id" | "createdAt">>> {
  const { data } = await parseCsvFile(file);
  return importProductsRows(data);
}

// Optional date (v315): blank stays absent; anything typed must be a real date, reported as a row error otherwise.
function optionalIsoDate(v: string | undefined, field: string, row: number, errors: ImportError[], order: DateOrder = "dmy"): string | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  return isoDate(v, field, row, errors, order) || undefined; // isoDate returns "" after recording the error
}

// Purchases/sales resolve a "product" name column against existing products
// (by name or sku), and can also fall back to a raw productId column.
// Purchases take two optional columns (v315), the same two the purchase form has: expiryDate (use-by, a date) and
// batchRef (the supplier's batch or lot). A file without them imports exactly as before.
export function importPurchasesRows(
  data: Record<string, string>[],
  products: Product[]
): ImportResult<Omit<Purchase, "id" | "createdAt">> {
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const byNameOrSku = new Map<string, string>();
  for (const p of products) {
    byNameOrSku.set(p.name.toLowerCase(), p.id);
    if (p.sku) byNameOrSku.set(p.sku.toLowerCase(), p.id);
  }

  const rows = data.map((r, i) => {
    const row = i + 2;
    let productId = (r.productId ?? "").trim();
    if (!productId) {
      const key = (r.product ?? "").trim().toLowerCase();
      productId = byNameOrSku.get(key) ?? "";
      if (!productId) errors.push({ row, message: `Unknown product "${r.product ?? ""}"` });
    }
    const qty = num(r.qty, "qty", row, errors);
    const unitCost = num(r.unitCost, "unitCost", row, errors);
    const date = isoDate(r.date, "date", row, errors, dateOrder);
    const expiryDate = optionalIsoDate(r.expiryDate, "expiryDate", row, errors, dateOrder);
    const batchRef = (r.batchRef ?? "").trim();
    return {
      productId,
      qty,
      unitCost,
      date,
      supplier: (r.supplier ?? "").trim(),
      notes: (r.notes ?? "").trim(),
      ...(expiryDate ? { expiryDate } : {}),
      ...(batchRef ? { batchRef } : {}),
    };
  });
  return { rows, errors };
}

export async function importPurchases(
  file: File,
  products: Product[]
): Promise<ImportResult<Omit<Purchase, "id" | "createdAt">>> {
  const { data } = await parseCsvFile(file);
  return importPurchasesRows(data, products);
}

// A sales file may name the batch a sale came from (batchRef, v315). It is checked only when the caller passes the
// purchases (the sales import page does). The POS import does not pass them, so a batchRef column in a POS file is
// ignored there, as before. The batch must be a delivery of the same product, received on or before the sale date,
// and the label must be unambiguous; otherwise the row is reported and nothing is imported.
export function importSalesRows(
  data: Record<string, string>[],
  products: Product[],
  purchases?: Purchase[]
): ImportResult<Omit<Sale, "id" | "createdAt">> {
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const byNameOrSku = new Map<string, string>();
  for (const p of products) {
    byNameOrSku.set(p.name.toLowerCase(), p.id);
    if (p.sku) byNameOrSku.set(p.sku.toLowerCase(), p.id);
  }

  const rows = data.map((r, i) => {
    const row = i + 2;
    let productId = (r.productId ?? "").trim();
    if (!productId) {
      const key = (r.product ?? "").trim().toLowerCase();
      productId = byNameOrSku.get(key) ?? "";
      if (!productId) errors.push({ row, message: `Unknown product "${r.product ?? ""}"` });
    }
    const qty = num(r.qty, "qty", row, errors);
    const unitPrice = num(r.unitPrice, "unitPrice", row, errors);
    const date = isoDate(r.date, "date", row, errors, dateOrder);
    const batchRef = (r.batchRef ?? "").trim();
    let batchPurchaseId: string | undefined;
    if (purchases && batchRef && productId) {
      const key = batchRef.toLowerCase();
      const matches = purchases.filter((p) => p.productId === productId && (p.batchRef ?? "").trim().toLowerCase() === key);
      if (matches.length === 0) errors.push({ row, message: `"batchRef" "${batchRef}" is not a batch of this product` });
      else if (matches.length > 1) errors.push({ row, message: `"batchRef" "${batchRef}" is on ${matches.length} deliveries of this product, so it cannot say which one; pick the batch on the sale in the app` });
      else if (date && matches[0].date > date) errors.push({ row, message: `"batchRef" "${batchRef}" was received after this sale's date` });
      else batchPurchaseId = matches[0].id;
    }
    return {
      productId,
      qty,
      unitPrice,
      date,
      customer: (r.customer ?? "").trim(),
      notes: (r.notes ?? "").trim(),
      ...(batchPurchaseId ? { batchPurchaseId } : {}),
    };
  });
  return { rows, errors };
}

export async function importSales(
  file: File,
  products: Product[],
  purchases?: Purchase[]
): Promise<ImportResult<Omit<Sale, "id" | "createdAt">>> {
  const { data } = await parseCsvFile(file);
  return importSalesRows(data, products, purchases);
}

export async function importExpenses(file: File): Promise<ImportResult<Omit<Expense, "id" | "createdAt">>> {
  const { data } = await parseCsvFile(file);
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const rows = data.map((r, i) => {
    const row = i + 2;
    const kind = (r.kind ?? "expense").trim().toLowerCase() === "revenue" ? "revenue" : "expense";
    const recurrence = ["weekly", "monthly", "yearly", "none"].includes((r.recurrence ?? "").trim())
      ? (r.recurrence!.trim() as Expense["recurrence"])
      : "none";
    return {
      name: requiredStr(r.name, "name", row, errors),
      amount: num(r.amount, "amount", row, errors),
      category: (r.category ?? "").trim(),
      kind: kind as Expense["kind"],
      isRecurring: bool(r.isRecurring, false),
      recurrence,
      startDate: isoDate(r.startDate, "startDate", row, errors, dateOrder),
      endDate: r.endDate?.trim() || undefined,
    };
  });
  return { rows, errors };
}

// Bank statement CSV import. Accepts either a single signed "amount" column
// (positive = in, negative = out) or separate "debit"/"credit" columns —
// most banks export one or the other, and rejecting whichever format the
// person's bank happens to use would make this useless for half of them.
// Deliberately no bank-feed API, no aggregator: this reads a file the
// person exported themselves from their own online banking.
export async function importBankStatementLines(
  file: File
): Promise<ImportResult<Omit<BankStatementLine, "id" | "createdAt" | "status">>> {
  const { data } = await parseCsvFile(file);
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const rows = data.map((r, i) => {
    const row = i + 2;
    let amount: number;
    if (r.amount !== undefined && r.amount.trim() !== "") {
      amount = num(r.amount, "amount", row, errors);
    } else {
      const debit = optionalNum(r.debit) ?? 0;
      const credit = optionalNum(r.credit) ?? 0;
      if (debit === 0 && credit === 0) {
        errors.push({ row, message: `Need an "amount" column, or "debit"/"credit"` });
      }
      amount = credit - debit;
    }
    return {
      date: isoDate(r.date, "date", row, errors, dateOrder),
      description: (r.description ?? r.memo ?? r.narrative ?? "").trim(),
      amount,
    };
  });
  return { rows, errors };
}

export async function importCapitalEntries(
  file: File
): Promise<ImportResult<Omit<CapitalEntry, "id" | "createdAt">>> {
  const { data } = await parseCsvFile(file);
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const rows = data.map((r, i) => {
    const row = i + 2;
    const kind = ["investment", "reinvestment", "withdrawal"].includes((r.kind ?? "").trim())
      ? (r.kind!.trim() as CapitalEntry["kind"])
      : "investment";
    return {
      kind,
      amount: num(r.amount, "amount", row, errors),
      date: isoDate(r.date, "date", row, errors, dateOrder),
      notes: (r.notes ?? "").trim() || undefined,
      investorName: (r.investor ?? "").trim() || undefined,
      securityId: (r.investment_id ?? "").trim() || undefined,
      distribution: (["profit", "capital"].includes((r.payout_type ?? "").trim())
        ? (r.payout_type!.trim() as "profit" | "capital")
        : undefined),
    };
  });
  return { rows, errors };
}

export async function importTaxPayments(
  file: File
): Promise<ImportResult<Omit<TaxPayment, "id" | "createdAt">>> {
  const { data } = await parseCsvFile(file);
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const rows = data.map((r, i) => {
    const row = i + 2;
    return {
      amount: num(r.amount, "amount", row, errors),
      date: isoDate(r.date, "date", row, errors, dateOrder),
      notes: (r.notes ?? "").trim() || undefined,
    };
  });
  return { rows, errors };
}

export async function importEmployees(
  file: File
): Promise<ImportResult<Omit<Employee, "id" | "createdAt" | "linkedExpenseId">>> {
  const { data } = await parseCsvFile(file);
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const rows = data.map((r, i) => {
    const row = i + 2;
    const payFrequency = ["weekly", "monthly", "yearly"].includes((r.payFrequency ?? "").trim())
      ? (r.payFrequency!.trim() as Employee["payFrequency"])
      : "monthly";
    const active = bool(r.active, true);
    return {
      name: requiredStr(r.name, "name", row, errors),
      role: (r.role ?? "").trim(),
      payRate: num(r.payRate, "payRate", row, errors),
      payFrequency,
      taxPct: optionalNum(r.taxPct) ?? 0,
      taxMode: parseTaxMode(r.taxMode),
      epfEtfApplicable: bool(r.epfEtfApplicable, false),
      startDate: isoDate(r.startDate, "startDate", row, errors, dateOrder),
      endDate: r.endDate?.trim() || undefined,
      active,
      notes: (r.notes ?? "").trim() || undefined,
    };
  });
  return { rows, errors };
}

// Leads: a list of prospects in, ready for outreach. All the rules (loose column names, duplicates, limits) live in
// lib/leadImport.ts so they can be tested without a file.
export async function importLeads(
  file: File,
  existing: Pick<Lead, "name" | "contact">[]
): Promise<{ rows: LeadImportRow[]; errors: LeadImportError[]; skippedDuplicates: number }> {
  const { data } = await parseCsvFile(file);
  return leadsFromRows(data, existing);
}

export function leadsRows(leads: Lead[]) {
  return leads.map((l) => ({
    name: l.name,
    contact: l.contact ?? "",
    source: l.source ?? "",
    stage: l.stage,
    estValue: l.estValue ?? "",
    nextFollowUpDate: l.nextFollowUpDate ?? "",
    lostReason: l.lostReason ?? "",
    notes: l.notes ?? "",
  }));
}

// Playbook entries as a readable spreadsheet (the full text is kept; contract dates are columns).
export function playbookRows(entries: PlaybookEntry[]) {
  return entries.map((e) => ({
    kind: e.kind,
    title: e.title,
    owner: e.owner ?? "",
    reviewEveryDays: e.reviewEveryDays ?? "",
    lastReviewed: e.lastReviewed ?? "",
    counterparty: e.counterparty ?? "",
    startDate: e.startDate ?? "",
    endDate: e.endDate ?? "",
    noticeDays: e.noticeDays ?? "",
    text: e.body,
  }));
}

// Support cases as a readable spreadsheet.
export function supportRows(cases: SupportCase[]) {
  return cases.map((c) => ({
    customer: c.customerName,
    contact: c.contact ?? "",
    kind: c.kind,
    priority: c.priority,
    subject: c.subject,
    dueOn: c.dueOn ?? "",
    openedOn: c.openedOn,
    status: c.status,
    resolvedOn: c.resolvedOn ?? "",
    assignedTo: c.assignedTo ?? "",
    details: c.detail ?? "",
    resolution: c.resolution ?? "",
  }));
}

// Customer feedback as a readable spreadsheet.
export function feedbackRows(entries: FeedbackEntry[]) {
  return entries.map((f) => ({
    customer: f.customerName,
    contact: f.contact ?? "",
    score: f.score,
    receivedOn: f.receivedOn,
    channel: f.channel ?? "",
    followedUp: f.followedUp ? "yes" : "no",
    comment: f.comment ?? "",
  }));
}

// Delegated tasks as a readable spreadsheet: who has it, when it is due, and whether it is done.
export function taskRows(tasks: BusinessTask[]) {
  return tasks.map((t) => ({
    title: t.title,
    assignedTo: t.assigneeName,
    kind: t.assigneeKind === "outside" ? "outside (no login)" : "team member",
    dueDate: t.dueDate ?? "",
    priority: t.priority,
    status: t.status,
    doneOn: t.doneOn ?? "",
    details: t.details ?? "",
  }));
}

// Bookings as a readable spreadsheet.
export function bookingRows(bookings: Booking[]) {
  return bookings.map((b) => ({
    date: b.date,
    startTime: b.startTime,
    durationMin: b.durationMin,
    customer: b.customerName,
    contact: b.contact ?? "",
    service: b.service,
    with: b.resource ?? "",
    status: b.status,
    depositAmount: b.depositAmount ?? "",
    notes: b.notes ?? "",
  }));
}

// Rentals as a readable spreadsheet: what is out, who has it, when it is due and what came back.
export function rentalRows(rentals: Rental[]) {
  return rentals.map((r) => ({
    item: r.item,
    customer: r.customer,
    contact: r.customerContact ?? "",
    outDate: r.outDate,
    dueBackDate: r.dueBackDate,
    returnedDate: r.returnedDate ?? "",
    dailyRate: r.dailyRate,
    deposit: r.deposit ?? "",
    depositRefunded: r.depositRefunded ?? "",
    charged: r.charged ?? "",
    damageCharge: r.damageCharge ?? "",
    damageNotes: r.damageNotes ?? "",
    notes: r.notes ?? "",
    recordedBy: r.createdByName ?? "",
  }));
}

// Shipments as a readable spreadsheet: where each one is, and the proof of delivery.
export function shipmentRows(shipments: Shipment[]) {
  return shipments.map((s) => ({
    reference: s.reference,
    carrier: s.carrier ?? "",
    supplier: s.supplierName ?? "",
    origin: s.origin ?? "",
    destination: s.destination ?? "",
    stage: s.stage,
    expected: s.etaDate ?? "",
    shippedOn: s.shippedOn ?? "",
    arrivedOn: s.arrivedOn ?? "",
    clearedOn: s.clearedOn ?? "",
    deliveredOn: s.deliveredOn ?? "",
    receivedBy: s.receivedBy ?? "",
    proofRef: s.proofRef ?? "",
    notes: s.notes ?? "",
  }));
}

// Leave records as a readable spreadsheet.
export function leaveRows(records: LeaveRecord[]) {
  return records.map((r) => ({
    employee: r.employeeName,
    type: r.type,
    from: r.from,
    to: r.to,
    days: r.days,
    note: r.note ?? "",
  }));
}

export function exportLeads(leads: Lead[]) {
  downloadCsv("leads.csv", toCsvSafe(leadsRows(leads)));
}

export async function importLoans(file: File): Promise<ImportResult<Omit<Loan, "id" | "createdAt">>> {
  const { data } = await parseCsvFile(file);
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const rows = data.map((r, i) => {
    const row = i + 2;
    return {
      name: requiredStr(r.name, "name", row, errors),
      lender: (r.lender ?? "").trim() || undefined,
      principal: num(r.principal, "principal", row, errors),
      annualInterestRatePct: num(r.annualInterestRatePct, "annualInterestRatePct", row, errors),
      termMonths: num(r.termMonths, "termMonths", row, errors),
      startDate: isoDate(r.startDate, "startDate", row, errors, dateOrder),
      active: bool(r.active, true),
      notes: (r.notes ?? "").trim() || undefined,
    };
  });
  return { rows, errors };
}

// Purchase orders import only ever creates newly-placed orders ("ordered"
// status) — any status/receivedDate/qtyReceived columns in the file are
// ignored. Receiving an order updates the inventory ledger and must go
// through the app's receive flow (Orders page) so stock stays correct;
// importing a "received" row directly would silently create stock the
// costing engine never actually saw arrive.
export async function importPurchaseOrders(
  file: File,
  products: Product[]
): Promise<ImportResult<Omit<PurchaseOrder, "id" | "createdAt" | "status" | "receivedDate" | "qtyReceived" | "receivedUnitCost">>> {
  const { data } = await parseCsvFile(file);
  const errors: ImportError[] = [];
  const dateOrder = detectDateOrder(data);
  const byNameOrSku = new Map<string, string>();
  for (const p of products) {
    byNameOrSku.set(p.name.toLowerCase(), p.id);
    if (p.sku) byNameOrSku.set(p.sku.toLowerCase(), p.id);
  }

  const rows = data.map((r, i) => {
    const row = i + 2;
    let productId = (r.productId ?? "").trim();
    if (!productId) {
      const key = (r.product ?? "").trim().toLowerCase();
      productId = byNameOrSku.get(key) ?? "";
      if (!productId) errors.push({ row, message: `Unknown product "${r.product ?? ""}"` });
    }
    return {
      productId,
      qtyOrdered: num(r.qtyOrdered, "qtyOrdered", row, errors),
      unitCost: num(r.unitCost, "unitCost", row, errors),
      orderDate: isoDate(r.orderDate, "orderDate", row, errors, dateOrder),
      expectedDate: r.expectedDate?.trim() ? isoDate(r.expectedDate, "expectedDate", row, errors, dateOrder) : undefined,
      supplier: (r.supplier ?? "").trim() || undefined,
      notes: (r.notes ?? "").trim() || undefined,
    };
  });
  return { rows, errors };
}
