import { localIsoDate } from "./localDate";
import JSZip from "jszip";
import {
  toCsv,
  toCsvSafe,
  productsRows,
  purchasesRows,
  salesRows,
  expensesRows,
  variableCostsRows,
  capitalEntriesRows,
  taxPaymentsRows,
  purchaseOrdersRows,
  employeesRows,
  loansRows,
  customersRows,
  projectsRows,
  timeEntriesRows,
  opportunitiesRows,
  fixedAssetsRows,
  investmentTxnsRows,
  lentLoansRows,
  lentLoanTxnsRows,
  collectionNotesRows,
  playbookRows,
  leaveRows,
  supportRows,
  feedbackRows,
  taskRows,
  bookingRows,
  shipmentRows,
  rentalRows,
} from "./csv";
import type {
  Booking,
  BusinessTask,
  Shipment,
  Rental,
  Budgets,
  CapitalEntry,
  Customer,
  TaxPayment,
  Employee,
  Expense,
  FixedAsset,
  InvestmentTxn,
  Security,
  CollectionNote,
  PlaybookEntry,
  LeaveRecord,
  SupportCase,
  FeedbackEntry,
  LentLoan,
  LentLoanTxn,
  Loan,
  Location,
  Opportunity,
  Product,
  Project,
  Purchase,
  PurchaseOrder,
  Sale,
  Settings,
  TimeEntry,
  VariableCost,
} from "./types";

export interface BackupData {
  products: Product[];
  purchases: Purchase[];
  sales: Sale[];
  expenses: Expense[];
  variableCosts: VariableCost[];
  capitalEntries: CapitalEntry[];
  taxPayments: TaxPayment[];
  purchaseOrders: PurchaseOrder[];
  employees: Employee[];
  loans: Loan[];
  contingencies: import("@/lib/contingent").Contingency[];
  dataRequests: import("@/lib/dataRequests").DataRequest[];
  customers: Customer[];
  projects: Project[];
  timeEntries: TimeEntry[];
  opportunities: Opportunity[];
  fixedAssets: FixedAsset[];
  settings: Settings;
  // Monthly revenue/expense targets (Reports -> Budget), keyed "YYYY-MM". One
  // document, not a collection, so it lives beside `settings` in the file.
  budgets?: Budgets;
  // The tax-invoice counter (v326): the highest invoice number issued, so a restored business does not reuse numbers.
  invoiceCounter?: { last: number };
  // Every other collection the app keeps for the business — payments
  // collected, returns, discounts, cash counts, estimates, and so on.
  // These have no CSV export, so full-backup.json is the ONLY place they
  // are carried; see the comment on downloadFullBackupZip.
  extra?: Record<string, unknown[]>;
}

// One zip with two layers:
//
//  1. full-backup.json — a COMPLETE snapshot: every collection the app keeps
//     for this business (including payments collected/made, write-offs,
//     returns, discounts, cash counts, stock adjustments, suppliers,
//     estimates, leads, recurring schedules, project costs, bank lines and
//     journal entries) plus settings. This is the real safety net. It is
//     restorable by whoever runs your account with scripts/restore-from-
//     backup.mjs. Team members/invites are deliberately excluded: they are
//     tied to sign-in accounts, not to business data, and are re-created by
//     re-inviting people.
//  2. The per-entity CSVs — spreadsheet-friendly copies for your own use.
//     Only the "core accounting" ones re-import through Import / export,
//     and a CSV re-import brings back those records only, NOT the payments
//     collected against them, returns or discounts (those live only in the
//     JSON). The manifest says so plainly, because a backup that quietly
//     omits money that was collected is worse than no backup.
export async function downloadFullBackupZip(data: BackupData) {
  const zip = new JSZip();
  const today = localIsoDate();

  zip.file("products.csv", toCsv(productsRows(data.products)));
  // Locations ride in `extra` (they have no CSV of their own), which is where
  // buildBackupPayload puts them — read them back from there so the sales /
  // purchases / expenses CSVs here name the same branches the app's own
  // per-entity exports do.
  const backupLocations = (data.extra?.locations ?? []) as Location[];
  zip.file("purchases.csv", toCsv(purchasesRows(data.purchases, data.products, backupLocations)));
  zip.file("sales.csv", toCsv(salesRows(data.sales, data.products, backupLocations, data.purchases)));
  zip.file("expenses.csv", toCsv(expensesRows(data.expenses, backupLocations)));
  zip.file("variable_costs.csv", toCsv(variableCostsRows(data.variableCosts, data.products)));
  zip.file("capital_entries.csv", toCsv(capitalEntriesRows(data.capitalEntries)));
  zip.file("tax_payments.csv", toCsv(taxPaymentsRows(data.taxPayments)));
  zip.file("purchase_orders.csv", toCsv(purchaseOrdersRows(data.purchaseOrders, data.products)));
  zip.file("employees.csv", toCsv(employeesRows(data.employees)));
  zip.file("loans.csv", toCsv(loansRows(data.loans)));
  zip.file("customers.csv", toCsv(customersRows(data.customers)));
  zip.file("projects.csv", toCsv(projectsRows(data.projects)));
  zip.file("time_entries.csv", toCsv(timeEntriesRows(data.timeEntries, data.projects)));
  zip.file("opportunities.csv", toCsv(opportunitiesRows(data.opportunities)));
  zip.file("fixed_assets.csv", toCsv(fixedAssetsRows(data.fixedAssets)));
  // Investments ride in `extra` like locations do; the CSV is a readable copy of the trades and income.
  const backupSecurities = (data.extra?.securities ?? []) as Security[];
  const backupInvestmentTxns = (data.extra?.investmentTxns ?? []) as InvestmentTxn[];
  if (backupInvestmentTxns.length > 0) zip.file("investments.csv", toCsv(investmentTxnsRows(backupInvestmentTxns, backupSecurities)));
  // Money lent out rides in `extra` the same way; the CSVs are readable copies of the loans and their repayments.
  const backupLentLoans = (data.extra?.lentLoans ?? []) as LentLoan[];
  const backupLentLoanTxns = (data.extra?.lentLoanTxns ?? []) as LentLoanTxn[];
  if (backupLentLoans.length > 0) zip.file("money_lent.csv", toCsv(lentLoansRows(backupLentLoans)));
  if (backupLentLoanTxns.length > 0) zip.file("money_lent_repayments.csv", toCsv(lentLoanTxnsRows(backupLentLoanTxns, backupLentLoans)));
  // The collections diary: a readable copy of every call, message and visit to someone who owes money.
  const backupCollectionNotes = (data.extra?.collectionNotes ?? []) as CollectionNote[];
  if (backupCollectionNotes.length > 0) zip.file("collections_diary.csv", toCsv(collectionNotesRows(backupCollectionNotes)));

  // The playbook: procedures and contract dates as one readable spreadsheet.
  const backupPlaybook = (data.extra?.playbook ?? []) as PlaybookEntry[];
  if (backupPlaybook.length > 0) zip.file("playbook.csv", toCsvSafe(playbookRows(backupPlaybook)));

  // The customer support log: every case, who it was for, and how it ended.
  const backupSupport = (data.extra?.supportCases ?? []) as SupportCase[];
  if (backupSupport.length > 0) zip.file("support_cases.csv", toCsvSafe(supportRows(backupSupport)));

  // Customer feedback: every 0 to 10 answer with the customer's own words.
  const backupFeedback = (data.extra?.feedback ?? []) as FeedbackEntry[];
  if (backupFeedback.length > 0) zip.file("feedback.csv", toCsvSafe(feedbackRows(backupFeedback)));

  // Delegated tasks and bookings: who has what, and every appointment.
  const backupTasks = (data.extra?.tasks ?? []) as BusinessTask[];
  if (backupTasks.length > 0) zip.file("tasks.csv", toCsvSafe(taskRows(backupTasks)));
  const backupBookings = (data.extra?.bookings ?? []) as Booking[];
  if (backupBookings.length > 0) zip.file("bookings.csv", toCsvSafe(bookingRows(backupBookings)));
  // Rentals: what is out, when it is due back, and what came back.
  const backupRentals = (data.extra?.rentals ?? []) as Rental[];
  if (backupRentals.length > 0) zip.file("rentals.csv", toCsvSafe(rentalRows(backupRentals)));
  // Shipments: where each delivery is and its proof of delivery.
  const backupShipments = (data.extra?.shipments ?? []) as Shipment[];
  if (backupShipments.length > 0) zip.file("shipments.csv", toCsvSafe(shipmentRows(backupShipments)));

  // Leave records (owner's backup only): who was away, which kind, how many days.
  const backupLeave = (data.extra?.leaveRecords ?? []) as LeaveRecord[];
  if (backupLeave.length > 0) zip.file("leave.csv", toCsvSafe(leaveRows(backupLeave)));

  // ---- complete snapshot -------------------------------------------------
  const collections: Record<string, unknown[]> = {
    products: data.products,
    purchases: data.purchases,
    sales: data.sales,
    expenses: data.expenses,
    variableCosts: data.variableCosts,
    capitalEntries: data.capitalEntries,
    taxPayments: data.taxPayments,
    purchaseOrders: data.purchaseOrders,
    employees: data.employees,
    loans: data.loans,
    customers: data.customers,
    projects: data.projects,
    timeEntries: data.timeEntries,
    opportunities: data.opportunities,
    fixedAssets: data.fixedAssets,
    ...(data.extra ?? {}),
  };
  zip.file(
    "full-backup.json",
    JSON.stringify(
      {
        format: "balancr-full-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: data.settings,
        budgets: data.budgets ?? {},
        invoiceCounter: data.invoiceCounter ?? { last: 0 },
        collections,
      },
      null,
      2
    )
  );
  const snapshotLines = Object.keys(collections)
    .sort()
    .map(
      (k) =>
        `  ${k.padEnd(28)} ${collections[k].length} record(s)${k === "auditLog" ? " (most recent 1,000)" : ""}`
    );

  const manifest = [
    `Balancr backup — ${today}`,
    "",
    `Business: ${data.settings.businessName?.trim() || "(no business name set)"}`,
    `Currency: ${data.settings.currency}`,
    "",
    "full-backup.json — COMPLETE copy of everything in this business (this is the",
    "file to keep safe). It includes payments collected/made, returns, discounts,",
    "write-offs, cash counts, stock adjustments, locations, stock transfers, suppliers,",
    "estimates, leads, recurring schedules and more, which the spreadsheet files below do NOT.",
    "To restore it, send it to whoever runs your Balancr account.",
    "Not included: team members/invites (re-invite people instead).",
    "",
    "Contents of full-backup.json:",
    ...snapshotLines,
    `  ${"budgets (monthly targets)".padEnd(28)} ${Object.keys(data.budgets ?? {}).length} month(s)`,
    "",
    "The spreadsheet (.csv) files below are convenience copies for your own use.",
    "",
    "Re-importable via Import / export (each file matches that page's format):",
    `  products.csv          ${data.products.length} row(s)`,
    `  purchases.csv         ${data.purchases.length} row(s)`,
    `  sales.csv              ${data.sales.length} row(s)`,
    `  expenses.csv           ${data.expenses.length} row(s)`,
    `  variable_costs.csv    ${data.variableCosts.length} row(s)`,
    `  capital_entries.csv   ${data.capitalEntries.length} row(s)`,
    `  tax_payments.csv       ${data.taxPayments.length} row(s)`,
    `  purchase_orders.csv   ${data.purchaseOrders.length} row(s)`,
    `  employees.csv          ${data.employees.length} row(s)`,
    `  loans.csv              ${data.loans.length} row(s)`,
    "",
    "Records only, not re-importable (no importer exists for these yet —",
    "kept here so this data isn't locked in with no way to get it out):",
    `  customers.csv          ${data.customers.length} row(s)`,
    `  projects.csv           ${data.projects.length} row(s)`,
    `  time_entries.csv       ${data.timeEntries.length} row(s)`,
    `  opportunities.csv      ${data.opportunities.length} row(s)`,
    `  fixed_assets.csv       ${data.fixedAssets.length} row(s)`,
    "",
    "To restore from the CSVs instead: go to Import / export and import each",
    "re-importable file individually. NOTE — this brings back those records only,",
    "not payments collected against credit sales/bills, returns or discounts;",
    "use full-backup.json for a true restore.",
  ].join("\n");
  zip.file("backup-info.txt", manifest);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `balancr-backup-${today}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
