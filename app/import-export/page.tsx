"use client";

import { useRef, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useRequireRole } from "@/lib/roleGuard";
import {
  exportCapitalEntries,
  exportCustomers,
  exportEmployees,
  exportExpenses,
  exportFixedAssets,
  exportLeads,
  exportLoans,
  exportOpportunities,
  exportProducts,
  exportProjects,
  exportPurchaseOrders,
  exportPurchases,
  exportSales,
  exportTaxPayments,
  exportTimeEntries,
  exportVariableCosts,
  importCapitalEntries,
  importEmployees,
  importExpenses,
  importLeads,
  importLoans,
  importProducts,
  importPurchaseOrders,
  importPurchases,
  importSales,
  importTaxPayments,
  type ImportError,
} from "@/lib/csv";
import { downloadFullBackupZip } from "@/lib/backup";
import { buildBackupPayload } from "@/lib/backupPayload";
import { Button, Card, PageHeader } from "@/components/ui";
import PosImportWizard from "@/components/PosImportWizard";

type Entity = "products" | "purchases" | "sales" | "expenses" | "capitalEntries" | "taxPayments" | "employees" | "loans" | "purchaseOrders" | "leads";

export default function ImportExportPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner"]);
  const data = useData();
  const [result, setResult] = useState<{ entity: Entity; added: number; errors: ImportError[]; skipped?: number } | null>(null);
  const [busy, setBusy] = useState<Entity | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [posWizardOpen, setPosWizardOpen] = useState(false);

  async function handleFullBackup() {
    setBackupBusy(true);
    try {
      await downloadFullBackupZip(buildBackupPayload(data));
      // Best-effort — if this write fails (e.g. a manager without
      // manage:settings somehow reaches this owner-only page), the
      // backup file has already downloaded either way, so don't block
      // or surface an error over the timestamp itself
      try {
        await data.updateSettings({ lastBackupAt: Date.now() });
      } catch {
        // ignore
      }
    } finally {
      setBackupBusy(false);
    }
  }
  const inputRefs = {
    products: useRef<HTMLInputElement>(null),
    purchases: useRef<HTMLInputElement>(null),
    sales: useRef<HTMLInputElement>(null),
    expenses: useRef<HTMLInputElement>(null),
    capitalEntries: useRef<HTMLInputElement>(null),
    taxPayments: useRef<HTMLInputElement>(null),
    employees: useRef<HTMLInputElement>(null),
    loans: useRef<HTMLInputElement>(null),
    purchaseOrders: useRef<HTMLInputElement>(null),
    leads: useRef<HTMLInputElement>(null),
  };

  async function handleImport(entity: Entity, file: File) {
    setBusy(entity);
    setResult(null);
    try {
      if (entity === "products") {
        const { rows, errors } = await importProducts(file);
        if (errors.length === 0) await data.bulkAddProducts(rows);
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      } else if (entity === "purchases") {
        const { rows, errors } = await importPurchases(file, data.products);
        if (errors.length === 0) await data.bulkAddPurchases(rows);
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      } else if (entity === "sales") {
        const { rows, errors } = await importSales(file, data.products, data.purchases);
        if (errors.length === 0) await data.bulkAddSales(rows);
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      } else if (entity === "expenses") {
        const { rows, errors } = await importExpenses(file);
        if (errors.length === 0) await data.bulkAddExpenses(rows);
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      } else if (entity === "capitalEntries") {
        const { rows, errors } = await importCapitalEntries(file);
        if (errors.length === 0) {
          for (const row of rows) await data.addCapitalEntry(row);
        }
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      } else if (entity === "taxPayments") {
        const { rows, errors } = await importTaxPayments(file);
        if (errors.length === 0) {
          for (const row of rows) await data.addTaxPayment(row);
        }
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      } else if (entity === "employees") {
        const { rows, errors } = await importEmployees(file);
        if (errors.length === 0) {
          for (const row of rows) await data.addEmployee(row);
        }
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      } else if (entity === "leads") {
        const { rows, errors, skippedDuplicates } = await importLeads(file, data.leads);
        if (errors.length === 0) await data.bulkAddLeads(rows);
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors, skipped: errors.length === 0 ? skippedDuplicates : 0 });
      } else if (entity === "loans") {
        const { rows, errors } = await importLoans(file);
        if (errors.length === 0) await data.bulkAddLoans(rows);
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      } else {
        const { rows, errors } = await importPurchaseOrders(file, data.products);
        if (errors.length === 0) await data.bulkAddPurchaseOrders(rows.map((r) => ({ ...r, status: "ordered" as const })));
        setResult({ entity, added: errors.length === 0 ? rows.length : 0, errors });
      }
    } finally {
      setBusy(null);
    }
  }

  const rows: {
    entity: Entity;
    label: string;
    description: string;
    columns: string;
    onExport: () => void;
  }[] = [
    {
      entity: "products",
      label: "What you sell",
      description: "Your items and services — what you buy and keep in stock, or what you do as a service.",
      columns: "name, sku, category, type (product/service), active, orderingCost, holdingCostPct, leadTimeDays, defaultCostPrice, defaultSellPrice, laborCostPerUnit",
      onExport: () => exportProducts(data.products),
    },
    {
      entity: "purchases",
      label: "Things you bought",
      description: "Wholesale buys for items, or delivery cost entries for services.",
      columns: "product (or productId), qty, unitCost, date (e.g. 2026-01-05, or day/month/year like 5/1/2026), supplier, notes, expiryDate (optional, a date), batchRef (optional, the supplier's batch or lot)",
      onExport: () => exportPurchases(data.purchases, data.products, data.locations),
    },
    {
      entity: "sales",
      label: "Things you sold",
      description: "What you sold, how many, and for how much each.",
      columns: "product (or productId), qty, unitPrice, date (e.g. 2026-01-05, or day/month/year like 5/1/2026), customer, notes, batchRef (optional, a batch of that product already in Balancr)",
      onExport: () => exportSales(data.sales, data.products, data.locations, data.purchases),
    },
    {
      entity: "expenses",
      label: "Bills & recurring income",
      description: "Running costs (marketing, rent, payroll) and any recurring income.",
      columns: "name, amount, category, kind (expense/revenue), isRecurring (true/false), recurrence (weekly/monthly/yearly), startDate, endDate",
      onExport: () => exportExpenses(data.expenses, data.locations),
    },
    {
      entity: "capitalEntries",
      label: "Money put in / taken out",
      description: "Initial investment, reinvestment, and owner withdrawals.",
      columns: "kind (investment/reinvestment/withdrawal), amount, date (e.g. 2026-01-05, or day/month/year like 5/1/2026), notes",
      onExport: () => exportCapitalEntries(data.capitalEntries),
    },
    {
      entity: "taxPayments",
      label: "Tax payments made",
      description: "Payments you've actually sent to your tax authority, netted against Sales Tax Payable on the Balance Sheet. This app doesn't file or verify anything with any tax authority — it's just your own record of what you paid.",
      columns: "amount, date (e.g. 2026-01-05, or day/month/year like 5/1/2026), notes",
      onExport: () => exportTaxPayments(data.taxPayments),
    },
    {
      entity: "employees",
      label: "Employees & payroll",
      description: "Staff/contractors — importing books each one's pay as a recurring bill automatically.",
      columns: "name, role, payRate, payFrequency (weekly/monthly/yearly), taxPct, startDate, endDate, active, notes",
      onExport: () => exportEmployees(data.employees),
    },
    {
      entity: "loans",
      label: "Loans & debt",
      description: "Bank/supplier loans — monthly payment and interest are worked out for you automatically.",
      columns: "name, lender, principal, annualInterestRatePct, termMonths, startDate, active, notes",
      onExport: () => exportLoans(data.loans),
    },
    {
      entity: "leads",
      label: "Leads & prospects",
      description: "A list of people or businesses to reach out to. Every lead starts as \u201cNew\u201d; anyone already in your pipeline with the same name and contact is skipped, not added twice. Up to 500 per file. Use lists you are entitled to contact: Balancr does not find or collect them for you.",
      columns: "name (or business name / company), contact (or phone / mobile / email), source, estValue, nextFollowUpDate (e.g. 2026-11-05), notes",
      onExport: () => exportLeads(data.leads),
    },
    {
      entity: "purchaseOrders",
      label: "Wholesale orders",
      description: "Orders placed with a supplier that haven't arrived yet. Importing always creates a new open order — receiving one still happens on the Orders page, so your stock stays accurate.",
      columns: "product (or productId), qtyOrdered, unitCost, orderDate, expectedDate, supplier, notes",
      onExport: () => exportPurchaseOrders(data.purchaseOrders, data.products),
    },
  ];

  if (guardLoading || !allowed) return null;

  return (
    <>
      <PageHeader title="Import / export" />
      <div className="space-y-4">
        <Card className="border-amber/40 bg-amber/5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Moving from another POS or till system?</div>
              <div className="text-xs text-muted mt-0.5">
                Export a CSV of your items or sales history from Square, Shopify, Clover, Toast, Lightspeed,
                Vend, WooCommerce, or almost anything else — you match up the columns, we handle the rest. No
                exact format required.
              </div>
            </div>
            <Button onClick={() => setPosWizardOpen(true)} className="shrink-0">
              Import from POS
            </Button>
          </div>
        </Card>

        <Card className="border-amber-dim/40">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Full backup</div>
              <div className="text-xs text-muted mt-0.5">
                One zip with a complete copy of your business — including payments collected, returns, discounts and
                every other record — plus spreadsheet files for each list below. Download it and keep a copy somewhere
                safe (email it to yourself, save it to cloud storage). If anything ever goes wrong, send the zip to
                whoever runs your account and everything can be put back.
              </div>
            </div>
            <Button variant="ghost" disabled={backupBusy} onClick={handleFullBackup} className="shrink-0">
              {backupBusy ? "Zipping…" : "Download full backup (.zip)"}
            </Button>
          </div>
        </Card>

        {rows.map((row) => (
          <Card key={row.entity}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{row.label}</div>
                <div className="text-xs text-muted mt-0.5">{row.description}</div>
                <div className="text-[11px] text-muted mt-1 font-mono">{row.columns}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" onClick={row.onExport}>
                  Export CSV
                </Button>
                <input
                  ref={inputRefs[row.entity]}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport(row.entity, file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  disabled={
                    busy === row.entity ||
                    (["purchases", "sales", "purchaseOrders"].includes(row.entity) && data.products.length === 0)
                  }
                  onClick={() => inputRefs[row.entity].current?.click()}
                >
                  {busy === row.entity ? "Importing…" : "Import CSV"}
                </Button>
              </div>
            </div>

            {result?.entity === row.entity && (
              <div className="mt-3 text-xs">
                {result.errors.length === 0 ? (
                  <div className="text-good">
                    Added {result.added} rows.
                    {result.skipped ? <span className="text-muted"> {result.skipped} already in your pipeline (or repeated in the file), skipped.</span> : null}
                  </div>
                ) : (
                  <div className="text-bad space-y-1">
                    <div>{result.errors.length} row(s) had a problem — nothing was added yet. Fix these and try again:</div>
                    <ul className="list-disc list-inside text-muted">
                      {result.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>
                          Row {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                    {result.errors.length > 10 && <div className="text-muted">…and {result.errors.length - 10} more.</div>}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Extra costs per sale</div>
              <div className="text-xs text-muted mt-0.5">Export only — set these up on the Items page.</div>
            </div>
            <Button variant="ghost" onClick={() => exportVariableCosts(data.variableCosts, data.products)}>
              Export CSV
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Customers</div>
              <div className="text-xs text-muted mt-0.5">Export only — manage these on the Customers page.</div>
            </div>
            <Button variant="ghost" onClick={() => exportCustomers(data.customers)}>
              Export CSV
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Projects</div>
              <div className="text-xs text-muted mt-0.5">
                Export only — cost segments and milestones aren&apos;t included here; manage those on the Projects
                page.
              </div>
            </div>
            <Button variant="ghost" onClick={() => exportProjects(data.projects)}>
              Export CSV
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Time entries</div>
              <div className="text-xs text-muted mt-0.5">Export only — manage these on the Time page.</div>
            </div>
            <Button variant="ghost" onClick={() => exportTimeEntries(data.timeEntries, data.projects)}>
              Export CSV
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Opportunities</div>
              <div className="text-xs text-muted mt-0.5">Export only — manage these on the Opportunities page.</div>
            </div>
            <Button variant="ghost" onClick={() => exportOpportunities(data.opportunities)}>
              Export CSV
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Fixed assets</div>
              <div className="text-xs text-muted mt-0.5">Export only — manage these on the Assets page.</div>
            </div>
            <Button variant="ghost" onClick={() => exportFixedAssets(data.fixedAssets)}>
              Export CSV
            </Button>
          </div>
        </Card>
      </div>

      <PosImportWizard open={posWizardOpen} onClose={() => setPosWizardOpen(false)} />
    </>
  );
}
