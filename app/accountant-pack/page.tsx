"use client";

import Link from "next/link";
import { useData } from "@/contexts/DataContext";
import { useRequireRole } from "@/lib/roleGuard";
import {
  capitalEntriesRows,
  customersRows,
  downloadCsv,
  expensesRows,
  fixedAssetsRows,
  investmentTxnsRows,
  lentLoansRows,
  lentLoanTxnsRows,
  loansRows,
  productsRows,
  purchasesRows,
  salesRows,
  taxPaymentsRows,
  toCsvSafe as toCsv,
} from "@/lib/csv";
import { todayIso } from "@/lib/format";
import { Button, Card, PageHeader, TableCardSkeleton } from "@/components/ui";

// One page with everything a bookkeeper or accountant asks for at year-end, so the owner can
// say "go to Accountant pack" instead of sending ten screenshots - and so the view-only
// accountant login can pull the same files itself. Every file is built from records already on
// screen (no new maths): the same exporters as the owner's CSV page, plus the three summaries an
// accountant always wants - what customers owe, what the business owes, and month-by-month profit.
export default function AccountantPackPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const data = useData();
  const asOf = todayIso();

  if (guardLoading || !allowed) return null;

  if (data.loading) {
    return (
      <>
        <PageHeader title="Accountant pack" />
        <TableCardSkeleton rows={6} cols={2} />
      </>
    );
  }

  const currency = data.settings.currency;

  const files: { label: string; description: string; onDownload: () => void }[] = [
    {
      label: "Monthly profit & loss",
      description: "Revenue, cost of sales, expenses, interest, depreciation and profit for every month, plus tax.",
      onDownload: () =>
        downloadCsv(
          `monthly-profit-and-loss-${asOf}.csv`,
          toCsv(
            data.monthlyPnL.map((m) => ({
              month: m.month,
              revenue: round2(m.totalRevenue),
              cost_of_sales: round2(m.cogs + m.cogsVariableCosts),
              gross_profit: round2(m.grossProfit),
              contribution_margin: round2(m.contributionMargin),
              operating_expenses: round2(m.operatingExpenses),
              interest_expense: round2(m.interestExpense),
              depreciation: round2(m.depreciationExpense),
              bad_debt: round2(m.badDebtExpense),
              stock_shrinkage: round2(m.stockShrinkage),
              gain_or_loss_on_asset_disposal: round2(m.disposalGainLoss),
              investment_income: round2(m.investmentIncome),
              gain_or_loss_on_selling_investments: round2(m.realizedInvestmentGain),
              interest_received_on_money_lent: round2(m.lendingInterest),
              bad_debt_on_money_lent: round2(m.lendingWriteOff),
              net_profit_before_tax: round2(m.netProfitPreTax),
              tax: round2(m.tax),
              net_profit_after_tax: round2(m.netProfitAfterTax),
            }))
          )
        ),
    },
    {
      label: "Money customers owe you (aging)",
      description: "Every unpaid invoice with its due date, days overdue and how much is still outstanding.",
      onDownload: () =>
        downloadCsv(
          `receivables-aging-${asOf}.csv`,
          toCsv(
            data.receivablesAging.lines.map((l) => ({
              customer: l.customer,
              invoice_date: l.date,
              due_date: l.dueDate,
              days_overdue: Math.max(l.daysOverdue, 0),
              bucket: l.bucket,
              invoice_total: round2(l.amountDue),
              tax_included: round2(l.taxAmount),
              paid: round2(l.amountPaid),
              written_off: round2(l.amountWrittenOff),
              outstanding: round2(l.amountOutstanding),
              opening_balance: l.isOpeningBalance ? "yes" : "",
            }))
          )
        ),
    },
    {
      label: "Money you owe suppliers (aging)",
      description: "Every unpaid supplier purchase with its due date and what is still outstanding.",
      onDownload: () =>
        downloadCsv(
          `payables-aging-${asOf}.csv`,
          toCsv(
            data.payablesAging.lines.map((l) => ({
              supplier: l.supplier,
              purchase_date: l.date,
              due_date: l.dueDate,
              days_overdue: Math.max(l.daysOverdue, 0),
              bucket: l.bucket,
              total: round2(l.amountDue),
              paid: round2(l.amountPaid),
              outstanding: round2(l.amountOutstanding),
              opening_balance: l.isOpeningBalance ? "yes" : "",
            }))
          )
        ),
    },
    {
      label: "Sales",
      description: "Every sale: date, item, quantity, price, customer, payment method, tax.",
      onDownload: () => downloadCsv(`sales-${asOf}.csv`, toCsv(salesRows(data.sales, data.products, data.locations, data.purchases))),
    },
    {
      label: "Purchases",
      description: "Every stock and supplies purchase, with supplier and payment terms.",
      onDownload: () => downloadCsv(`purchases-${asOf}.csv`, toCsv(purchasesRows(data.purchases, data.products, data.locations))),
    },
    {
      label: "Expenses and bills",
      description: "Rent, utilities, subscriptions and other expenses, one-off and recurring.",
      onDownload: () => downloadCsv(`expenses-${asOf}.csv`, toCsv(expensesRows(data.expenses, data.locations))),
    },
    {
      label: "Owner capital and draws",
      description: "Money put into or taken out of the business by the owner.",
      onDownload: () => downloadCsv(`owner-capital-${asOf}.csv`, toCsv(capitalEntriesRows(data.capitalEntries))),
    },
    {
      label: "Tax payments",
      description: "Payments you recorded against sales tax collected.",
      onDownload: () => downloadCsv(`tax-payments-${asOf}.csv`, toCsv(taxPaymentsRows(data.taxPayments))),
    },
    {
      label: "Loans",
      description: "Loan balances, rates and terms.",
      onDownload: () => downloadCsv(`loans-${asOf}.csv`, toCsv(loansRows(data.loans))),
    },
    {
      label: "Fixed assets",
      description: "Equipment and vehicles with cost, life and depreciation basis.",
      onDownload: () => downloadCsv(`fixed-assets-${asOf}.csv`, toCsv(fixedAssetsRows(data.fixedAssets))),
    },
    ...(data.lentLoans.length > 0
      ? [
          {
            label: "Money lent out",
            description: "Every loan the business has made, and every repayment received or amount written off.",
            onDownload: () => {
              downloadCsv(`money-lent-${asOf}.csv`, toCsv(lentLoansRows(data.lentLoans)));
              if (data.lentLoanTxns.length > 0) downloadCsv(`money-lent-repayments-${asOf}.csv`, toCsv(lentLoanTxnsRows(data.lentLoanTxns, data.lentLoans)));
            },
          },
        ]
      : []),
    ...(data.investmentTxns.length > 0
      ? [
          {
            label: "Investments",
            description: "Every purchase, sale and income entry on shares, bonds, funds and deposits.",
            onDownload: () => downloadCsv(`investments-${asOf}.csv`, toCsv(investmentTxnsRows(data.investmentTxns, data.securities))),
          },
        ]
      : []),
    {
      label: "Items and stock costs",
      description: "Your product and service list with cost and selling prices.",
      onDownload: () => downloadCsv(`items-${asOf}.csv`, toCsv(productsRows(data.products))),
    },
    {
      label: "Customers",
      description: "Customer directory with contact details and credit limits.",
      onDownload: () => downloadCsv(`customers-${asOf}.csv`, toCsv(customersRows(data.customers))),
    },
  ];

  return (
    <>
      <PageHeader title="Accountant pack" />

      <Card className="mb-6">
        <div className="text-sm">
          Everything an accountant normally asks for, in one place. Amounts are in {currency}, as of {asOf}.
        </div>
        <div className="text-xs text-muted mt-1.5">
          For the statements themselves (income statement, cash flow, balance sheet, tax summary), open{" "}
          <Link href="/statements" className="text-amber-soft hover:underline">
            Reports
          </Link>{" "}
          and use Print / save as PDF. Files are plain CSV and open in Excel, Google Sheets or any accounting tool.
        </div>
      </Card>

      <div className="space-y-3">
        {files.map((f) => (
          <Card key={f.label}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs text-muted mt-0.5">{f.description}</div>
              </div>
              <Button variant="ghost" onClick={f.onDownload} className="shrink-0">
                Download CSV
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
