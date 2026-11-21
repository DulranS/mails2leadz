"use client";

// Notifications used to live in this context, but they change on their own
// clock (a background effect writes new ones whenever receivables/stock/etc.
// cross a threshold) and had only one real consumer (the notifications
// page). Bundling them in here meant every notification write forced a new
// context value and re-rendered every screen that reads *any* piece of
// DataContext, not just the notifications page. They now live in
// contexts/NotificationsContext.tsx, nested inside this provider so it can
// still read the business data (receivables aging, stock levels, etc.) it
// needs to generate reminders from.

import { productDeleteBlock } from "@/lib/productDelete";
import { POLICY_ENTITY, policyChanges, policySummary, depreciationMethodLabel } from "@/lib/policyLog";
import { priorMonthEnd, type TrendPrior } from "@/lib/balanceTrend";
import { assignInvoiceNos } from "@/lib/invoiceNumber";
import { mergeFlags, shallowSame } from "@/lib/renderGuards";
import { trackedSnapshot } from "@/lib/loadStats";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  useRef,
} from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  setDoc,
  getDoc,
  writeBatch,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { taxFor, taxRatePctFor } from "@/lib/tax";
import { consumptionUnitCost } from "@/lib/costing";
import { clearListedUndefined, clearUndefinedFields, EXPENSE_CLEARABLE_FIELDS, PRODUCT_CLEARABLE_FIELDS } from "@/lib/firestorePatch";
import { getFirebase } from "@/lib/firebase";
import type { Contingency } from "@/lib/contingent";
import type { DataRequest } from "@/lib/dataRequests";
import { useAuth } from "./AuthContext";
import type {
  Product,
  Purchase,
  PurchaseOrder,
  Sale,
  Expense,
  VariableCost,
  CapitalEntry,
  EquityPlan,
  ShareholderDividend,
  Employee,
  Loan,
  MonthlyBudget,
  Budgets,
  Settings,
  Member,
  Invite,
  Role,
  AuditAction,
  AuditLogEntry,
  CashCount,
  ReceivablePayment,
  ReceivableWriteOff,
  PayablePayment,
  BillPayment,
  CatalogItem,
  TimeEntry,
  FixedAsset,
  Security,
  InvestmentTxn,
  LentLoan,
  LentLoanTxn,
  CollectionNote,
  Project,
  ProjectCostSegment,
  ProjectMilestone,
  Customer,
  Supplier,
  RecurringInvoice,
  PaymentMethod,
  StockAdjustment,
  StockOut,
  PlaybookEntry,
  LeaveRecord,
  SupportCase,
  FeedbackEntry,
  BusinessTask,
  Booking,
  Tab,
  KitchenTicket,
  TabLine,
  ShiftEntry,
  Shipment,
  Rental,
  SupplierCreditEntry,
  CustomerDepositEntry,
  ReviewMark,
  SaleReturn,
  SupplierReturn,
  NewSupplierReturn,
  Discount,
  RecurringExpenseTemplate,
  RecurringExpenseOccurrence,
  JournalEntry,
  Opportunity,
  BankStatementLine,
  TaxPayment,
  Estimate,
  Lead,
  Location,
  StockTransfer,
  OpeningBalance,
} from "@/lib/types";
import { DEFAULT_SETTINGS, PRODUCTION_SUPPLIER_LABEL } from "@/lib/types";
import { can } from "@/lib/permissions";
import { dueRecurringInvoices, catchUpNextDueDate } from "@/lib/recurringInvoices";
import { dayOfMonthOf } from "@/lib/recurringTransactions";
import { dueRecurringExpenseTemplates, catchUpNextDueDate as catchUpExpenseNextDueDate } from "@/lib/recurringExpenses";
import { isAutopay, postedExpenseFields } from "@/lib/recurringAutopay";
import { spentByPersonInMonth, spendLimitProblem } from "@/lib/spendLimit";
import { videoUrlOrUndefined } from "@/lib/procedureTraining";
import {
  computeAllLedgers,
  computeSupplierReturnPnLInputs,
  supplierReturnTaxFor,
  supplierReturnCausesOversell,
  landedUnitCost,
  computeSaleEconomics,
  computeMonthlyPnL,
  currentInventoryValue,
  currentInventoryUnits,
  estimateAnnualDemand,
  computeEOQ,
  computeBreakEven,
  computeCapitalSummary,
  computeOnOrderByProduct,
  computeOpenOrderValue,
  monthlyPayrollCost,
  employerCostPerPeriod,
  computeLoanPortfolio,
  computeCurrentPortionOfLoans,
  computeBalanceSheet,
  computeFinancialHealthRatios,
  computeReceivablesAging,
  computeLoanSummary,
  computeOpeningEquity,
  computeCustomerCreditStatus,
  computePayablesAging,
  computeBillsPayable,
  computeAllProjectFinancials,
  computeProjectPortfolioSummary,
  computeProjectBudgetAlerts,
  computeMarketingMetrics,
  computeCustomerRetention,
  computeLeadConversion,
  computeSupplierConcentration,
  computeCustomerConcentration,
  computeManualOpsSignals,
  computeOfferStats,
  computeGrowthMetrics,
  computeAverageOrderValue,
  computeGrowthLevers,
  computeRevenuePerEmployee,
  computeStaffUtilization,
  computeCashRunwayMonths,
  type MarketingMetrics,
  type CustomerRetention,
  type LeadConversion,
  type SupplierConcentration,
  type CustomerConcentration,
  type ManualOpsSignals,
  type GrowthMetrics,
  type AverageOrderValue,
  type GrowthLevers,
  type RevenuePerEmployee,
  type StaffUtilization,
  type CashRunway,
  type ProductLedgerResult,
  type OfferStats,
  type SaleEconomics,
  type MonthlyPnL,
  type EoqResult,
  type BreakEvenResult,
  type CapitalSummary,
  type OpenOrderValue,
  type LoanPortfolioSummary,
  type BalanceSheet,
  type FinancialHealthRatios,
  type ReceivablesAging,
  type CustomerCreditStatus,
  type PayablesAging,
  type BillsPayablesAging,
  type ProjectFinancials,
  type ProjectPortfolioSummary,
  type ProjectBudgetAlert,
} from "@/lib/calculations";
import { computeSupplierCredit, validateNewCreditEntry, validateRemovals } from "@/lib/supplierCredit";
import { computeCustomerDeposits, validateNewDepositEntry, validateDepositRemovals } from "@/lib/customerDeposits";
import { lockedSaleEditAllowed, SALES_LOCKED_MESSAGE } from "@/lib/salesLock";
import { isGiftCardCustomer } from "@/lib/giftCards";
import { cleanTabName, closingSales, tabTotal, validateTabName, type CloseOptions } from "@/lib/tabs";
import { partPaymentPlan } from "@/lib/tabKitchen";
import { MAX_BOM_DEPTH, bomProblem } from "@/lib/bomTree";
import { validateShift, type ShiftInput } from "@/lib/rota";
import { computeLocationStockLevels, type LocationStockLevel } from "@/lib/stockTracking";
import { locationScopeFor, scopedRows } from "@/lib/locationScope";
import { purchaseEditChangesReturnedFigures } from "@/lib/purchaseEditGuard";
import { todayIso } from "@/lib/format";
import { validateConsignment, type ConsignmentEntry, type ConsignmentInput } from "@/lib/consignment";
import { PRICE_DROP_STATUSES, PROJECT_STATUSES, TRADE_IN_STATUSES, validateElectronics, type ElectronicsInput, type StoredElectronicsRecord } from "@/lib/electronicsRecords";
import { canMove, estimateLinesFromJob, nextWorkOrderNumber, validateWorkOrder, type WorkOrder, type WorkOrderInput } from "@/lib/workOrders";
import { cleanRentalInput, lateDays, MAX_RENTAL_NOTES, rentalCharge, rentalDays, validateRentalInput, validateReturnInput, type RentalInput, type RentalReturnInput } from "@/lib/rentals";
import { deliveryTaxFor } from "@/lib/delivery";
import { bookingDeleteProblem, bookingStatusProblem } from "@/lib/bookings";
import { eventDeleteProblem, validateEventInput, type GameEventInput } from "@/lib/events";
import type { GameEvent, Cheque, Trip, Membership, FarmBatch } from "@/lib/types";
import type { BusinessRequest, StaffProcedure, ComplianceItem, Incident, MaintenanceItem, KpiMeasure, PerformanceReview, Risk, QualityCheck } from "@/lib/types";
import { validateRisk, validateQualityCheck, closeActionProblem, type RiskInput, type QualityInput } from "@/lib/riskQuality";
import { validateLogEntry, inspectionDoneProblem, type BusinessLogInput } from "@/lib/businessLog";
import { needsPoApproval, decidePoApproval } from "@/lib/poApproval";
import { validateAccrual, accrualAsExpenses, accruedLiabilityAsOf, firstOfNextMonth } from "@/lib/accruals";
import { validateCandidate, moveStage, hireProblem, STAGE_LABEL, type Candidate, type CandidateStage } from "@/lib/recruiting";
import { validateObligation, completeObligation, type Obligation } from "@/lib/obligations";
import { validateContract, type Contract } from "@/lib/contracts";
import { validateEntry, type SustainabilityEntry } from "@/lib/sustainability";
import type { OrgLink } from "@/lib/succession";
import { validateImprovement, validateAlternative, type Improvement, type Alternative } from "@/lib/feedbackLoops";
import { periodEnd } from "@/lib/monthClose";
import { isPeriodClosed } from "@/lib/periodLock";
import { dividendAllocations, distributableProfit, profitPaidOut, validateDividend, withholdingSplit } from "@/lib/shareholderDividends";
import type { Accrual } from "@/lib/types";
import { priceChangesFor, type PriceChange } from "@/lib/priceHistory";
import type { BusinessLogEntry, WebOrder } from "@/lib/types";
import type { TillPayout } from "@/lib/types";
import { validateTillPayout, unrecordedTillOutflow, expenseFromTillPayout } from "@/lib/tillPayouts";
import {
  validateRequestInput, cleanRequestInput, decideRequestPlan, cancelRequestPlan, reimburseClaimPlan,
  validateProcedure, nextVersion, acknowledgePlan, validateCompliance, validateIncident,
  validateMaintenance, maintenanceDonePlan, validateKpi, recordKpiReadingPlan, validateReview, cleanGoals,
  type RequestInput, type ComplianceInput, type IncidentInput, type MaintenanceInput, type KpiInput, type ReviewInput, type ProcedureInput,
} from "@/lib/operations";
import { todayIso as opsToday } from "@/lib/format";
import { addIsoDays as addDaysIso } from "@/lib/leadPipeline";
import { contactKeysFor, resolveAutomations } from "@/lib/leadIntake";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { cleanEntry, livePopulation, validateBatchInput, validateEntryInput, type BatchInput, type EntryInput } from "@/lib/farm";
import { membershipCoverProblem, membershipDeleteProblem, validateMembershipInput, type MembershipInput } from "@/lib/memberships";
import { tripKm, validateTripInput, cleanTrip, type TripInput } from "@/lib/mileage";
import { chequeDeleteProblem, transitionProblem, validateChequeInput, type ChequeInput } from "@/lib/cheques";
import { leadDeleteProblem, leadSaleProblem, leadStageProblem } from "@/lib/leadSales";
import { componentQty, normalizeScrap, unitCostOfRun } from "@/lib/production";
import { computeInvestmentPortfolio, findOversell, type InvestmentPortfolio } from "@/lib/investments";
import { computeLendingPortfolio, validateLentLoanTerms, validateLentTxn, type LendingPortfolio } from "@/lib/lending";
import { customerKey, validateCollectionNote } from "@/lib/collections";
import { withPeriodGuards } from "@/lib/periodGuards";
import { milestoneAlreadyRecorded, milestoneSaleAmounts } from "@/lib/milestoneSale";
import { buildHealthSnapshot } from "@/lib/healthSnapshot";
import { planStockCount } from "@/lib/stockCount";
import { lateChargeFor, lateFeeBilledFor, lateFeeKeyFor, lateFeeStillDue } from "@/lib/lateFees";
import { withReadOnly } from "@/lib/readOnlyGuard";
import { formatIsoLong, normalizeClosedThrough, validateBooksClosedThrough } from "@/lib/periodLock";

interface DataContextValue {
  loading: boolean;
  role: Role | null;
  memberName: string | null;

  products: Product[];
  catalog: CatalogItem[]; // cost-stripped product mirror; populated for Staff, empty otherwise (use `products` instead)
  purchases: Purchase[];
  purchaseOrders: PurchaseOrder[];
  sales: Sale[]; // all sales for Owner/Manager; only the signed-in person's own for Staff
  estimates: Estimate[]; // same visibility rule as sales
  leads: Lead[]; // same visibility rule as estimates — Staff sees only leads they created
  expenses: Expense[];
  variableCosts: VariableCost[];
  capitalEntries: CapitalEntry[];
  taxPayments: TaxPayment[]; // Owner/Manager only — self-reported remittances to the tax authority, see lib/types.ts
  employees: Employee[];
  loans: Loan[];
  contingencies: Contingency[]; // memo only, never in totals: guarantees, claims, disputed tax, commitments (lib/contingent.ts)
  dataRequests: DataRequest[]; // personal data requests and their deadlines (lib/dataRequests.ts)
  budgets: Budgets; // monthly revenue/expense targets, keyed "YYYY-MM" — see MonthlyBudget in lib/types.ts
  settings: Settings;
  members: Member[];
  invites: Invite[];
  auditLog: AuditLogEntry[];
  cashCounts: CashCount[]; // all for Owner/Manager, own-only for Staff
  tillPayouts: TillPayout[]; // all for Owner/Manager, own-only for Staff (v292)
  receivablePayments: ReceivablePayment[];
  receivableWriteOffs: ReceivableWriteOff[]; // Owner/Manager only — bad-debt write-offs against credit sales, see lib/types.ts
  payablePayments: PayablePayment[];
  billPayments: BillPayment[]; // Owner/Manager only — payments against unpaid, one-off Expenses ("bills"), see lib/types.ts
  timeEntries: TimeEntry[]; // all for Owner/Manager, own-only for Staff
  fixedAssets: FixedAsset[];
  securities: Security[];
  investmentTxns: InvestmentTxn[];
  // Holdings, returns and monthly effects as of today (lib/investments.ts); already folded into monthlyPnL and balanceSheet.
  investmentPortfolio: InvestmentPortfolio;
  // Money the business has lent out (lib/lending.ts): the loans, the repayments and write-offs recorded against
  // them, and the position as of today. Already folded into monthlyPnL and balanceSheet.
  lentLoans: LentLoan[];
  lentLoanTxns: LentLoanTxn[];
  // The collections diary (lib/collections.ts): calls, messages and visits to people who owe the business money.
  // Owner/Manager write it, the accountant reads it. Staff never see it.
  collectionNotes: CollectionNote[];
  lendingPortfolio: LendingPortfolio;
  projects: Project[];
  projectCostSegments: ProjectCostSegment[];
  projectMilestones: ProjectMilestone[];
  customers: Customer[]; // read by every active role — see firestore.rules
  suppliers: Supplier[]; // Owner/Manager only — see firestore.rules
  recurringInvoices: RecurringInvoice[]; // Owner/Manager only — retainer/repeat-billing schedules, see lib/types.ts
  supplierCredits: SupplierCreditEntry[]; // Owner/Manager only: deposits, credit used on bills, credit refunded (see lib/supplierCredit.ts)
  supplierCreditSummary: ReturnType<typeof computeSupplierCredit>; // what each supplier holds for you today; .total is the balance-sheet asset
  customerDeposits: CustomerDepositEntry[]; // Owner/Manager only: money customers paid in advance, used on their invoices, refunded (see lib/customerDeposits.ts)
  reviewMarks: ReviewMark[]; // Owner/Manager: large team-made entries someone has checked (see lib/reviewQueue.ts)
  customerDepositSummary: ReturnType<typeof computeCustomerDeposits>; // what you hold for each customer today; .total is the balance-sheet liability
  stockOuts: StockOut[]; // Owner/Manager only: lost sales logged when something was out of stock (memo, never in the books)
  // v176 operations (lib/operations.ts). Nothing here posts to the books or moves stock.
  requests: BusinessRequest[];
  procedures: StaffProcedure[];
  complianceItems: ComplianceItem[];
  incidents: Incident[];
  maintenanceItems: MaintenanceItem[];
  kpis: KpiMeasure[];
  reviews: PerformanceReview[];
  risks: Risk[];
  qualityChecks: QualityCheck[];
  accruals: Accrual[]; // v209: costs incurred and not yet billed, reversing the next month (lib/accruals.ts)
  priceHistory: PriceChange[]; // v186b: every sell, cost or wholesale price change, newest first (the latest 200)
  improvements: Improvement[]; // v234: changes raised from customer feedback and the team, each with an owner and a day
  supplierAlternatives: Alternative[]; // v234: alternative suppliers for products bought from one supplier
  contracts: Contract[]; // v249: the contract register (lib/contracts.ts)
  recurringInvoiceRuns: { recurringInvoiceId: string; date: string; invoiceId: string }[]; // v258: each generated recurring invoice (the link from a sale to its schedule)
  sustainabilityEntries: SustainabilityEntry[]; // v255: the sustainability and community log (lib/sustainability.ts)
  orgLinks: Record<string, OrgLink>; // v233: who each team member reports to, and their named deputy (lib/succession.ts)
  obligations: Obligation[]; // v232: deadlines and renewals with their next due day (lib/obligations.ts)
  candidates: Candidate[]; // v230: candidates for roles, and the stage each has reached (lib/recruiting.ts)
  webOrders: WebOrder[]; // v183: orders queued by the order API, waiting for the owner to confirm them as sales
  businessLog: BusinessLogEntry[]; // v182: competitors and objectives (owner, manager); correspondence and inspections (the team)
  playbook: PlaybookEntry[]; // Owner/Manager/Accountant read: written procedures and contract dates (lib/playbook.ts), never in the books
  feedbackEntries: FeedbackEntry[]; // Owner/Manager/Accountant read: customer feedback scores (lib/feedback.ts), never in the books
  tasks: BusinessTask[]; // Owner/Manager/Accountant read: delegated work and who has it (lib/tasks.ts), never in the books
  events: GameEvent[]; // ticketed game nights and tournaments (lib/events.ts)
  cheques: Cheque[]; // cheques received and issued, including post-dated ones (lib/cheques.ts)
  trips: Trip[]; // business trips by vehicle (lib/mileage.ts)
  memberships: Membership[]; // prepaid included hours that bookings draw down (lib/memberships.ts)
  farmBatches: FarmBatch[]; // animals or crops followed from stocking to harvest (lib/farm.ts)
  bookings: Booking[]; // every active member reads: appointments and reservations (lib/bookings.ts), never in the books
  tabs: Tab[]; // every active member reads: open orders for a table, charged in one go when paid (lib/tabs.ts)
  shifts: ShiftEntry[]; // every active member reads the rota; owner and manager set it (lib/rota.ts)
  rentals: Rental[]; // owner, manager and accountant read: rented-out items, returns, deposits (lib/rentals.ts)
  workOrders: WorkOrder[]; // every member reads: jobs with labour and parts, for the front desk and the workshop (lib/workOrders.ts)
  consignments: ConsignmentEntry[]; // owner, manager and accountant read: goods out with partners, their reported sales, what is owed (lib/consignment.ts)
  businessRecords: StoredElectronicsRecord[]; // owner and manager: licences and permits with expiry dates, trade-ins, supplier price-protection claims (lib/electronicsRecords.ts)
  shipments: Shipment[]; // every active member reads: goods on their way and proof of delivery (lib/shipments.ts), never in the books
  supportCases: SupportCase[]; // Owner/Manager/Accountant read: the customer support log (lib/support.ts), never in the books
  leaveRecords: LeaveRecord[]; // Owner only, like payroll: days off per employee (lib/leave.ts), never in the books
  stockAdjustments: StockAdjustment[]; // Owner/Manager only — breakage/spoilage/theft/count corrections, see lib/types.ts
  saleReturns: SaleReturn[]; // Owner/Manager only — customer returns against a Sale
  supplierReturns: SupplierReturn[]; // Owner/Manager only — goods sent back to a supplier against a Purchase
  discounts: Discount[]; // Owner/Manager only — discounts given against a Sale
  recurringExpenseTemplates: RecurringExpenseTemplate[]; // Owner/Manager only — itemized recurring costs like "Operations", see lib/types.ts
  recurringExpenseOccurrences: RecurringExpenseOccurrence[]; // Owner/Manager only — per-period drafts generated from the templates above
  journalEntries: JournalEntry[]; // Owner only — weekly lessons-learned reflection entries
  opportunities: Opportunity[]; // Owner only — scored/ranked hypothetical ventures
  bankStatementLines: BankStatementLine[]; // Owner/Manager only — manual/CSV-imported bank reconciliation lines
  locations: Location[]; // every active role reads this — a Staff sale still needs a location picker
  stockTransfers: StockTransfer[]; // Owner/Manager only — inventory moved between locations
  openingBalances: OpeningBalance[]; // Owner/Manager only — money owed to/by the business on the day it started using the app

  ledgers: Map<string, ProductLedgerResult>;
  saleEconomics: SaleEconomics[];
  monthlyPnL: MonthlyPnL[];
  inventoryValue: number;
  inventoryUnits: number;
  eoqByProduct: Map<string, EoqResult>;
  breakEven: BreakEvenResult;
  capitalSummary: CapitalSummary;
  onOrderByProduct: Map<string, number>;
  openOrders: OpenOrderValue;
  monthlyPayroll: number;
  loanPortfolio: LoanPortfolioSummary;
  balanceSheet: BalanceSheet;
  priorTrend: TrendPrior;
  financialHealth: FinancialHealthRatios;
  marketingMetrics: MarketingMetrics;
  customerRetention: CustomerRetention;
  leadConversion: LeadConversion;
  manualOpsSignals: ManualOpsSignals;
  supplierConcentration: SupplierConcentration;
  customerConcentration: CustomerConcentration;
  growthMetrics: GrowthMetrics;
  averageOrderValue: AverageOrderValue;
  growthLevers: GrowthLevers;
  revenuePerEmployee: RevenuePerEmployee;
  staffUtilization: StaffUtilization[]; // per team member, trailing 30 days — see computeStaffUtilization
  cashRunway: CashRunway;
  receivablesAging: ReceivablesAging;
  customerCreditStatus: Map<string, CustomerCreditStatus>; // keyed by lowercased customer name — only customers with a creditLimit set appear
  payablesAging: PayablesAging;
  billsPayable: BillsPayablesAging; // general bills owed — rent, utilities, contractor/employee bills — see computeBillsPayable
  avgDailyCashSales: number; // trailing 30-day average of cash/card/bank-transfer sales, for cash-runway projections
  projectFinancials: Map<string, ProjectFinancials>;
  projectPortfolio: ProjectPortfolioSummary;
  projectBudgetAlerts: ProjectBudgetAlert[]; // active projects at/over the budget-warning threshold, worst first
  offerStats: Map<string, OfferStats>; // keyed by Product.id, for every service Product with recipeLines set
  locationStockLevels: LocationStockLevel[]; // physical qty-on-hand per product per Location — see lib/stockTracking.ts

  addLocation: (l: Omit<Location, "id" | "createdAt" | "active" | "isDefault">) => Promise<void>;
  updateLocation: (id: string, l: Partial<Location>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  addStockTransfer: (
    t: Omit<StockTransfer, "id" | "createdAt" | "createdByUid" | "createdByName">
  ) => Promise<void>;
  addOpeningBalance: (
    o: Omit<OpeningBalance, "id" | "createdAt" | "createdByUid" | "createdByName">
  ) => Promise<void>;
  deleteOpeningBalance: (id: string) => Promise<void>;

  addProduct: (p: Omit<Product, "id" | "createdAt">) => Promise<string>;
  updateProduct: (id: string, p: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  bulkAddProducts: (rows: Omit<Product, "id" | "createdAt">[]) => Promise<void>;
  // Applies a single % discount (or markup, via a negative value) to
  // `defaultSellPrice` across many products/services at once — e.g.
  // "10% off everything in the Summer category" or "5% off these 3 items
  // for this wholesale customer". Works identically for goods and
  // services, retail or wholesale: this app has no separate B2B/B2C price
  // tier, so a batch discount is just a one-shot rewrite of each selected
  // Product's own sell price (same field the Sale form and Offers page
  // already read from) — not a new pricing concept. Items with no
  // defaultSellPrice set are silently skipped (there's nothing to discount
  // off of), and the returned count/skipped list lets the UI report back
  // exactly what happened.
  bulkDiscountProducts: (
    ids: string[],
    discountPercent: number
  ) => Promise<{ updatedIds: string[]; skippedIds: string[] }>;

  addPurchase: (p: Omit<Purchase, "id" | "createdAt">) => Promise<void>;
  updatePurchase: (id: string, p: Partial<Purchase>) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
  bulkAddPurchases: (rows: Omit<Purchase, "id" | "createdAt">[]) => Promise<void>;

  addPurchaseOrder: (po: Omit<PurchaseOrder, "id" | "createdAt" | "status">) => Promise<void>;
  updatePurchaseOrderApproval: (id: string, decision: "approved" | "rejected", note?: string) => Promise<void>;
  updatePurchaseOrder: (id: string, po: Partial<PurchaseOrder>) => Promise<void>;
  cancelPurchaseOrder: (id: string) => Promise<void>;
  addDraftPurchaseOrders: (orders: { productId: string; qtyOrdered: number; unitCost: number; supplier?: string }[]) => Promise<void>;
  sendDraftPurchaseOrder: (id: string) => Promise<void>;
  deletePurchaseOrder: (id: string) => Promise<void>;
  receivePurchaseOrder: (
    id: string,
    receipt: {
      qtyReceived: number;
      receivedUnitCost: number; // what the supplier charged per unit, before any delivery costs below
      receivedDate: string;
      locationId?: string;
      // Optional TOTALS for this whole delivery, spread across the units received into the stock cost (see Purchase.freightCost)
      freightCost?: number;
      customsCost?: number;
      otherLandedCost?: number;
      // Optional, memo-only (see Purchase.expiryDate): lets the Expiry watch cover stock that arrived through a PO
      expiryDate?: string;
      batchRef?: string;
      receivingNote?: string;
    }
  ) => Promise<void>;
  bulkAddPurchaseOrders: (
    rows: Omit<PurchaseOrder, "id" | "createdAt">[]
  ) => Promise<void>;

  addSale: (s: Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  // Several sale lines saved together, all or none (goods plus a delivery line, or the lines of one invoice).
  addSales: (list: Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName">[]) => Promise<void>;
  updateSale: (id: string, s: Partial<Sale>) => Promise<void>;
  // Clears the projectId tag on a Purchase/Expense/Sale — a plain
  // updatePurchase/updateExpense/updateSale({ projectId: undefined }) can't
  // do this: Firestore's updateDoc rejects `undefined` field values outright
  // (it only ever *sets* fields), so actually removing one needs the
  // deleteField() sentinel, which doesn't fit Partial<T>'s string type.
  untagProjectRecord: (kind: "purchase" | "expense" | "sale", id: string) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  bulkAddSales: (rows: Omit<Sale, "id" | "createdAt">[]) => Promise<void>;

  // Estimates — pre-sale quotes, never touching stock/WAC/COGS until
  // convertEstimateToInvoice turns an accepted one into real Sale rows.
  // See the Estimate doc comment in lib/types.ts.
  addEstimate: (e: Omit<Estimate, "id" | "createdAt" | "createdByUid" | "createdByName" | "status" | "convertedInvoiceId">) => Promise<void>;
  updateEstimate: (id: string, e: Partial<Estimate>) => Promise<void>;
  deleteEstimate: (id: string) => Promise<void>;
  convertEstimateToInvoice: (id: string) => Promise<void>;
  // Revise a quote: writes a NEW draft that replaces it, and marks the old one "revised" in the same batch, so the customer is
  // never left with two live versions. Money never moves here; a deposit already held stays a credit (see lib/quoteRevision.ts).
  reviseEstimate: (
    id: string,
    e: Omit<
      Estimate,
      | "id"
      | "createdAt"
      | "createdByUid"
      | "createdByName"
      | "status"
      | "convertedInvoiceId"
      | "revision"
      | "revisionOf"
      | "supersededBy"
      | "sentAt"
      | "decidedAt"
      | "decidedByName"
      | "decisionFrom"
    >
  ) => Promise<string>;

  // Leads/pipeline — "outreach → follow-up → closing", upstream of
  // Customer/Sale. See the Lead doc comment in lib/types.ts. `create:sale`
  // (every role) can log a new lead; moving it through stages or deleting
  // it needs `manage:sales`/`delete:sales` (Owner/Manager) — same split as
  // Estimates just above.
  addLead: (l: Omit<Lead, "id" | "createdAt" | "createdByUid" | "createdByName" | "stage">) => Promise<void>;
  // A whole list at once (CSV import): every lead starts at the first stage, in batches, with one audit line for the list.
  bulkAddLeads: (rows: Omit<Lead, "id" | "createdAt" | "createdByUid" | "createdByName" | "stage">[]) => Promise<void>;
  updateLead: (id: string, l: Partial<Lead>) => Promise<void>;
  // Records a contact attempt, its timing and the sequence/opt-out fields it changes. Staff may call it on leads they created
  // or are assigned (log:leadContact); it never changes a stage or a value. The patch is built by lib/leadPipeline.ts.
  logLeadContact: (id: string, patch: Partial<Pick<Lead, "contacts" | "firstContactedAt" | "lastContactedAt" | "sequence" | "nextFollowUpDate" | "doNotContact">>) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;

  // Customer returns against a Sale — see the SaleReturn doc comment in
  // lib/types.ts for the restock/no-restock revenue+COGS math.
  addSaleReturn: (
    r: Omit<SaleReturn, "id" | "createdAt" | "createdByUid" | "createdByName">
  ) => Promise<void>;
  deleteSaleReturn: (id: string) => Promise<void>;

  // Goods sent back to a supplier against a Purchase — see the SupplierReturn
  // doc comment in lib/types.ts for how stock, payables, cash, input tax and
  // profit move. The cost snapshot, input-tax share and supplier name are
  // filled in from the purchase here, never trusted from the caller.
  addSupplierReturn: (r: NewSupplierReturn) => Promise<void>;
  deleteSupplierReturn: (id: string) => Promise<void>;

  // Discounts given against a Sale, tracked separately from `unitPrice` —
  // see the Discount doc comment in lib/types.ts.
  addDiscount: (
    d: Omit<Discount, "id" | "createdAt" | "createdByUid" | "createdByName">
  ) => Promise<void>;
  deleteDiscount: (id: string) => Promise<void>;

  // Stock movements that aren't a Purchase or a Sale — breakage, spoilage,
  // theft, a count correction. See the StockAdjustment doc comment in
  // lib/types.ts — never touches revenue/COGS, only qty on hand.
  addStockAdjustment: (
    a: Omit<StockAdjustment, "id" | "createdAt" | "createdByUid" | "createdByName">
  ) => Promise<void>;
  deleteStockAdjustment: (id: string) => Promise<void>;
  // A physical stock count: what was counted per item (null / absent = not counted). Records one count-correction
  // adjustment for every counted item that differs from the books, all in one batch, worked out against the stock on hand
  // at the moment of recording (lib/stockCount.ts). Returns how many adjustments were recorded.
  recordStockCount: (counts: { productId: string; counted: number | null }[], opts?: { locationId?: string; notes?: string }) => Promise<number>;
  addSupplierCredit: (e: Omit<SupplierCreditEntry, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  deleteSupplierCredit: (id: string) => Promise<void>;
  addCustomerDeposit: (e: Omit<CustomerDepositEntry, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  markReviewed: (key: string) => Promise<void>;
  deleteCustomerDeposit: (id: string) => Promise<void>;
  addStockOut: (r: Omit<StockOut, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  deleteStockOut: (id: string) => Promise<void>;
  addPlaybookEntry: (e: Omit<PlaybookEntry, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updatePlaybookEntry: (id: string, e: Omit<PlaybookEntry, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  deletePlaybookEntry: (id: string) => Promise<void>;
  addRequest: (input: RequestInput) => Promise<void>;
  updateRequestStatus: (id: string, status: "approved" | "declined" | "cancelled") => Promise<void>;
  updateRequestReimbursed: (id: string) => Promise<void>;
  deleteRequest: (id: string) => Promise<void>;
  addProcedure: (input: ProcedureInput) => Promise<void>;
  updateProcedure: (id: string, input: ProcedureInput) => Promise<void>;
  updateProcedureAck: (id: string) => Promise<void>;
  deleteProcedure: (id: string) => Promise<void>;
  addCompliance: (input: ComplianceInput) => Promise<void>;
  updateCompliance: (id: string, input: ComplianceInput) => Promise<void>;
  deleteCompliance: (id: string) => Promise<void>;
  addIncident: (input: IncidentInput) => Promise<void>;
  updateIncident: (id: string, input: IncidentInput & { status: "open" | "closed" }) => Promise<void>;
  deleteIncident: (id: string) => Promise<void>;
  addMaintenance: (input: MaintenanceInput) => Promise<void>;
  updateMaintenance: (id: string, input: MaintenanceInput) => Promise<void>;
  logMaintenanceDone: (id: string, input: { date: string; km?: number; note?: string; cost?: number }) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;
  addKpi: (input: KpiInput) => Promise<void>;
  updateKpi: (id: string, input: KpiInput) => Promise<void>;
  recordKpiReading: (id: string, input: { day: string; value: number; note?: string }) => Promise<void>;
  deleteKpi: (id: string) => Promise<void>;
  addReview: (input: ReviewInput & { employeeId: string }) => Promise<void>;
  updateReview: (id: string, input: ReviewInput & { employeeId: string }) => Promise<void>;
  deleteReview: (id: string) => Promise<void>;
  addRisk: (input: RiskInput) => Promise<void>;
  updateRisk: (id: string, input: RiskInput) => Promise<void>;
  deleteRisk: (id: string) => Promise<void>;
  addQualityCheck: (input: QualityInput) => Promise<void>;
  updateQualityCheck: (id: string, input: QualityInput & { actionDoneOn?: string | null }) => Promise<void>;
  deleteQualityCheck: (id: string) => Promise<void>;
  addLogEntry: (input: BusinessLogInput) => Promise<void>;
  updateLogEntry: (id: string, input: BusinessLogInput) => Promise<void>;
  recordInspectionDone: (id: string, doneOn: string) => Promise<void>;
  updateLogStatus: (id: string, status: string) => Promise<void>;
  addAccrual: (input: { name: string; amount: number; category: string; periodMonth: string; notes?: string }) => Promise<void>;
  deleteAccrual: (id: string) => Promise<void>;
  deleteLogEntry: (id: string) => Promise<void>;
  addCandidate: (input: { name: string; role: string; appliedOn: string; source?: string; contact?: string; notes?: string }) => Promise<void>;
  moveCandidate: (id: string, to: CandidateStage, onboardingStarted?: boolean) => Promise<void>;
  setOrgLink: (memberId: string, link: OrgLink) => Promise<void>;
  addContract: (input: Omit<Contract, "id">) => Promise<void>;
  updateContract: (id: string, patch: Partial<Omit<Contract, "id">>) => Promise<void>;
  deleteContract: (id: string) => Promise<void>;
  addSustainabilityEntry: (input: Omit<SustainabilityEntry, "id">) => Promise<void>;
  deleteSustainabilityEntry: (id: string) => Promise<void>;
  addImprovement: (input: { title: string; source: "customer" | "team" | "supplier" | "other"; owner: string; dueDate: string; notes?: string }) => Promise<void>;
  setImprovementStatus: (id: string, status: "open" | "done" | "dropped") => Promise<void>;
  deleteImprovement: (id: string) => Promise<void>;
  addAlternative: (input: { productId: string; currentSupplier: string; alternative: string; quoteUnitCost: number; notes?: string }) => Promise<void>;
  setAlternativeStatus: (id: string, status: "considering" | "trial" | "approved" | "rejected") => Promise<void>;
  deleteAlternative: (id: string) => Promise<void>;
  addObligation: (input: { name: string; dueDate: string; repeat: "once" | "monthly" | "quarterly" | "yearly"; notes?: string }) => Promise<void>;
  completeObligation: (id: string, doneOn: string) => Promise<void>;
  deleteObligation: (id: string) => Promise<void>;
  updateCandidateChecks: (id: string, checks: { referencesCheckedOn?: string; rightToWorkCheckedOn?: string }) => Promise<void>;
  updateWebOrder: (id: string, patch: { status?: "new" | "confirmed" | "declined"; decidedAt?: number; decidedByName?: string; lines?: WebOrder["lines"]; deliveredOn?: string; driverName?: string; area?: string; recognition?: "confirmation" | "delivery"; paymentMethod?: string; deliveryInvoices?: number; startedAt?: number; finishedAt?: number; promisedDate?: string; customerAddress?: string; }) => Promise<void>;
  deleteWebOrder: (id: string) => Promise<void>;
  addSupportCase: (c: Omit<SupportCase, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateSupportCase: (id: string, c: Omit<SupportCase, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  deleteSupportCase: (id: string) => Promise<void>;
  addFeedbackEntry: (f: Omit<FeedbackEntry, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateFeedbackEntry: (id: string, f: Omit<FeedbackEntry, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  addBusinessTask: (t: Omit<BusinessTask, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName" | "status" | "doneOn">) => Promise<void>;
  updateBusinessTask: (id: string, t: Omit<BusinessTask, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName" | "status" | "doneOn">) => Promise<void>;
  setBusinessTaskDone: (id: string, done: boolean, today: string) => Promise<void>;
  deleteBusinessTask: (id: string) => Promise<void>;
  addEvent: (e: GameEventInput) => Promise<string>;
  updateEvent: (id: string, e: GameEventInput) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  addCheque: (c: ChequeInput) => Promise<string>;
  updateCheque: (id: string, c: ChequeInput) => Promise<void>;
  setChequeStatus: (id: string, to: Cheque["status"], opts: { date: string; returnReason?: string; bankCharge?: number }) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  addTrip: (t: TripInput) => Promise<string>;
  updateTrip: (id: string, t: TripInput) => Promise<void>;
  deleteTrip: (id: string) => Promise<void>;
  addMembership: (m: MembershipInput) => Promise<string>;
  updateMembership: (id: string, m: MembershipInput) => Promise<void>;
  deleteMembership: (id: string) => Promise<void>;
  addFarmBatch: (b: BatchInput) => Promise<string>;
  updateFarmBatch: (id: string, b: BatchInput) => Promise<void>;
  deleteFarmBatch: (id: string) => Promise<void>;
  addFarmEntry: (batchId: string, e: EntryInput) => Promise<void>;
  deleteFarmEntry: (batchId: string, entryId: string) => Promise<void>;
  addBooking: (b: Omit<Booking, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateBooking: (id: string, b: Omit<Booking, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  // Records a Done booking as one sale, in one transaction: the sale is saved and the booking is linked to it, or neither happens.
  recordBookingSale: (bookingId: string, s: Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<string>;
  // Records a Won lead as one sale, in one transaction, the same way as recordBookingSale.
  recordLeadSale: (leadId: string, s: Omit<Sale, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<string>;
  deleteBooking: (id: string) => Promise<void>;
  addTab: (table: string) => Promise<string>;
  updateTabLines: (id: string, lines: TabLine[]) => Promise<void>;
  setTabTickets: (id: string, tickets: KitchenTicket[]) => Promise<void>;
  payTabPart: (id: string, pick: Record<string, number>, o: CloseOptions) => Promise<void>;
  closeTab: (id: string, o: CloseOptions) => Promise<void>;
  deleteTab: (id: string) => Promise<void>;
  addShift: (i: ShiftInput) => Promise<void>;
  updateShift: (id: string, i: ShiftInput) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  addShiftsForWeek: (inputs: ShiftInput[]) => Promise<void>;
  addShipment: (s: Omit<Shipment, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateShipment: (id: string, s: Omit<Shipment, "id" | "createdAt" | "updatedAt" | "createdByUid" | "createdByName">) => Promise<void>;
  deleteShipment: (id: string) => Promise<void>;
  addRental: (r: RentalInput) => Promise<void>;
  addConsignmentEntry: (e: ConsignmentInput) => Promise<void>;
  addWorkOrder: (w: WorkOrderInput) => Promise<void>;
  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => Promise<void>;
  makeEstimateFromWorkOrder: (id: string) => Promise<void>;
  deleteWorkOrder: (id: string) => Promise<void>;
  deleteConsignmentEntry: (id: string) => Promise<void>;
  addElectronicsRecord: (r: ElectronicsInput) => Promise<void>;
  deleteElectronicsRecord: (id: string) => Promise<void>;
  updateElectronicsStatus: (id: string, status: string) => Promise<void>;
  updateRental: (id: string, r: RentalInput) => Promise<void>;
  deleteRental: (id: string) => Promise<void>;
  returnRental: (id: string, input: RentalReturnInput) => Promise<void>;
  deleteFeedbackEntry: (id: string) => Promise<void>;
  setFeedbackTestimonial: (id: string, t: { quote: string; displayName: string } | null) => Promise<void>;
  addLeaveRecord: (r: Omit<LeaveRecord, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  deleteLeaveRecord: (id: string) => Promise<void>;

  // Recurring, itemized expenses — see the RecurringExpenseTemplate doc
  // comment in lib/types.ts for why this exists alongside plain
  // Expense.isRecurring, and generateDueRecurringExpenses below for the
  // generate-then-confirm flow.
  addRecurringExpenseTemplate: (
    t: Omit<RecurringExpenseTemplate, "id" | "createdAt" | "nextDueDate" | "lastGeneratedDate" | "lastExpenseId">
  ) => Promise<void>;
  updateRecurringExpenseTemplate: (
    id: string,
    t: Partial<Omit<RecurringExpenseTemplate, "id" | "createdAt">>
  ) => Promise<void>;
  deleteRecurringExpenseTemplate: (id: string) => Promise<void>;
  // Edits a still-pending occurrence's line amounts (this month's actual
  // bills) before it's posted.
  updateExpenseOccurrenceLines: (id: string, lines: { label: string; amount: number }[]) => Promise<void>;
  // Turns a pending occurrence into a real Expense — see the
  // RecurringExpenseOccurrence doc comment in lib/types.ts for exactly
  // what this does and doesn't touch before this point.
  postExpenseOccurrence: (id: string) => Promise<void>;
  // Discards a pending occurrence without posting it (e.g. a period with
  // genuinely nothing to book). Only valid while still "pending" — once
  // posted, delete the resulting Expense instead.
  discardExpenseOccurrence: (id: string) => Promise<void>;

  // Productized offers — the "repeat this offer's economics" action. One
  // click books BOTH sides at once: a Sale at the offer's fixed price, and
  // a Purchase for the recipe's total cost (see Product.recipeLines in
  // lib/types.ts) — so the same margin shows up every single time,
  // without re-typing the recipe or re-negotiating anything. `qty` lets
  // one click fulfill more than one delivery at once (e.g. sold 3 of the
  // same package to one client).
  fulfillOffer: (
    productId: string,
    opts: {
      qty?: number; // defaults to 1
      date: string;
      customer?: string;
      customerContact?: string;
      paymentMethod?: PaymentMethod;
      creditTermDays?: number;
      notes?: string;
    }
  ) => Promise<void>;

  // Runs a Product's bill of materials (BomComponent[] in lib/types.ts)
  // forward: consumes each component's stock (as StockAdjustments, reason
  // "production_use") and adds the produced qty to the finished good's
  // stock (as one Purchase, at the computed cost) — see the `components`
  // doc comment on Product in lib/types.ts for exactly why each of those
  // mechanisms was chosen. Throws if the product has no `components` set.
  recordProduction: (
    finishedProductId: string,
    opts: {
      qty: number;
      date: string;
      laborOrOverheadPerUnit?: number; // optional — labor/overhead to add on top of component cost, per unit produced
      scrapQty?: number; // optional — whole units spoiled in the run: their components are used up too, and their cost is spread over the good units
      notes?: string;
      locationId?: string; // where components are consumed from AND finished goods are received into — same place, one production run
    }
  ) => Promise<void>;

  addExpense: (e: Omit<Expense, "id" | "createdAt">) => Promise<void>;
  updateExpense: (id: string, e: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  bulkAddExpenses: (rows: Omit<Expense, "id" | "createdAt">[]) => Promise<void>;

  addVariableCost: (v: Omit<VariableCost, "id" | "createdAt">) => Promise<void>;
  updateVariableCost: (id: string, v: Partial<VariableCost>) => Promise<void>;
  deleteVariableCost: (id: string) => Promise<void>;

  addCapitalEntry: (c: Omit<CapitalEntry, "id" | "createdAt">) => Promise<void>;
  // Several capital entries saved together, all or none (an investor payout: one entry per investor).
  addCapitalEntries: (entries: Omit<CapitalEntry, "id" | "createdAt">[]) => Promise<void>;
  updateCapitalEntry: (id: string, c: Partial<CapitalEntry>) => Promise<void>;
  deleteCapitalEntry: (id: string) => Promise<void>;

  // Tax remittances — see the TaxPayment doc comment in lib/types.ts.
  addTaxPayment: (t: Omit<TaxPayment, "id" | "createdAt">) => Promise<void>;
  updateTaxPayment: (id: string, t: Partial<TaxPayment>) => Promise<void>;
  deleteTaxPayment: (id: string) => Promise<void>;

  addEmployee: (e: Omit<Employee, "id" | "createdAt" | "linkedExpenseId">) => Promise<void>;
  updateEmployee: (id: string, e: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;

  // Weekly lessons-learned journal — see the JournalEntry doc comment in
  // lib/types.ts. Owner only.
  addJournalEntry: (j: Omit<JournalEntry, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateJournalEntry: (id: string, j: Partial<JournalEntry>) => Promise<void>;
  deleteJournalEntry: (id: string) => Promise<void>;

  // Opportunity/venture scoring — see the Opportunity doc comment in
  // lib/types.ts and computeOpportunityScore in lib/calculations.ts. Owner only.
  addOpportunity: (o: Omit<Opportunity, "id" | "createdAt">) => Promise<void>;
  updateOpportunity: (id: string, o: Partial<Opportunity>) => Promise<void>;
  deleteOpportunity: (id: string) => Promise<void>;

  // Bank reconciliation — see the BankStatementLine doc comment in
  // lib/types.ts. Owner/Manager, matching manage:reconciliation.
  addBankStatementLine: (l: Omit<BankStatementLine, "id" | "createdAt">) => Promise<void>;
  updateBankStatementLine: (id: string, l: Partial<BankStatementLine>) => Promise<void>;
  deleteBankStatementLine: (id: string) => Promise<void>;
  bulkAddBankStatementLines: (rows: Omit<BankStatementLine, "id" | "createdAt" | "status">[]) => Promise<void>;

  addCustomer: (c: Omit<Customer, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateCustomer: (id: string, c: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addSupplier: (s: Omit<Supplier, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateSupplier: (id: string, s: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;

  // Recurring invoices — retainer/repeat billing schedules. Creating one
  // only saves the schedule; actual invoices (real Sales, visible on
  // /invoices, chaseable like any other credit sale) are generated
  // automatically when they come due — see the generation effect below —
  // or immediately via generateRecurringInvoiceNow.
  addRecurringInvoice: (
    r: Omit<RecurringInvoice, "id" | "createdAt" | "lastGeneratedDate" | "lastInvoiceId">
  ) => Promise<void>;
  updateRecurringInvoice: (id: string, r: Partial<RecurringInvoice>) => Promise<void>;
  deleteRecurringInvoice: (id: string) => Promise<void>;
  // Generates today's invoice for one schedule right now, regardless of its
  // nextDueDate — for "bill this client today" instead of waiting for the
  // schedule to come due on its own. Idempotent per (schedule, calendar
  // day): a second call the same day is a no-op, so an eager double-click
  // can't double-bill a customer. Returns the new invoiceId, or null if
  // today's invoice for this schedule already exists.
  generateRecurringInvoiceNow: (id: string) => Promise<string | null>;

  addLoan: (l: Omit<Loan, "id" | "createdAt">) => Promise<void>;
  updateLoan: (id: string, l: Partial<Loan>) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
  bulkAddLoans: (rows: Omit<Loan, "id" | "createdAt">[]) => Promise<void>;

  addContingency: (c: Omit<Contingency, "id" | "createdAt">) => Promise<void>;
  updateContingency: (id: string, c: Partial<Contingency>) => Promise<void>;
  deleteContingency: (id: string) => Promise<void>;

  addDataRequest: (r: Omit<DataRequest, "id" | "createdAt">) => Promise<void>;
  updateDataRequest: (id: string, r: Partial<DataRequest>) => Promise<void>;
  deleteDataRequest: (id: string) => Promise<void>;

  updateSettings: (s: Partial<Settings>) => Promise<void>;
  // Records a raise of outside money in one all-or-nothing write: the updated shareholder list and round history,
  // and (optionally) the cash received as a capital entry, so the books can never get the money without the
  // shares or the shares without the money. Owner only.
  recordEquityRaise: (args: { equity: EquityPlan; capitalEntry?: Omit<CapitalEntry, "id" | "createdAt"> }) => Promise<void>;
  // v289. Owner-only. Declares a dividend to the cap table: the split is stored on the settings doc and the cash goes out as a
  // capital withdrawal, in one batch, so the record and the cash can never disagree. Deleting removes both together.
  recordShareholderDividend: (args: { dividend: Pick<ShareholderDividend, "date" | "amount" | "note"> & { withholdingPct?: number }; capitalEntry: Omit<CapitalEntry, "id" | "createdAt"> }) => Promise<void>;
  deleteShareholderDividend: (dividendId: string) => Promise<void>;
  // Owner-only. Closes the books through a month-end date (or pass null to
  // reopen everything). See lib/periodLock.ts for exactly what that locks.
  setBooksClosedThrough: (date: string | null) => Promise<void>;
  saveBudget: (month: string, target: MonthlyBudget) => Promise<void>;

  // Team management (Owner only — enforced both here and in firestore.rules)
  createInvite: (email: string, name: string, role: Role) => Promise<string>;
  revokeInvite: (id: string) => Promise<void>;
  changeMemberRole: (uid: string, role: Role) => Promise<void>;
  setMemberActive: (uid: string, active: boolean) => Promise<void>;
  // The locations a staff member works at. An empty list means every location. The owner is never restricted.
  setMemberLocations: (uid: string, locationIds: string[]) => Promise<void>;
  // The locations this signed-in person may use (null = every location). The lists above are already filtered by it.
  myLocationScope: Set<string> | null;
  // Owner editing their own Member doc — name and/or the email mirror kept
  // here for display (Firebase Auth's email is the actual credential; call
  // useAuth().changeEmail first, then this, to keep the two in sync).
  updateOwnProfile: (patch: { name?: string; email?: string }) => Promise<void>;

  // Cash reconciliation & receivables — the two anti-theft/collections tools
  addCashCount: (c: {
    date: string;
    openingFloat: number;
    countedCash: number;
    notes?: string;
  }) => Promise<void>;
  // Till payouts (v292): cash taken out of the till for a small spend. Recording one as an expense is Owner/Manager only.
  addTillPayout: (p: { date: string; amount: number; reason: string }) => Promise<void>;
  recordTillPayoutAsExpense: (p: TillPayout, category: string) => Promise<void>;
  deleteTillPayout: (docId: string) => Promise<void>;
  // Owner-only correction path for a cash count entered wrong — see the
  // comment on the implementation below for why this is deliberately
  // narrower than every other "edit" in the app.
  updateCashCount: (
    id: string,
    c: { date?: string; openingFloat?: number; countedCash?: number; notes?: string }
  ) => Promise<void>;
  deleteCashCount: (id: string) => Promise<void>;
  addReceivablePayment: (p: Omit<ReceivablePayment, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateReceivablePayment: (id: string, p: Partial<Pick<ReceivablePayment, "amount" | "date" | "method" | "note">>) => Promise<void>;
  deleteReceivablePayment: (id: string) => Promise<void>;
  // Bad-debt write-offs — Owner/Manager only, same trust line as everything
  // else that permanently changes what a receivable is worth (see
  // ReceivableWriteOff in lib/types.ts). No amount/saleId edit on update —
  // correcting a wrong write-off means deleting it and recording a new one,
  // same reasoning as updateReceivablePayment only allowing date/note edits.
  addReceivableWriteOff: (w: Omit<ReceivableWriteOff, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateReceivableWriteOff: (id: string, w: Partial<Pick<ReceivableWriteOff, "date" | "reason">>) => Promise<void>;
  deleteReceivableWriteOff: (id: string) => Promise<void>;

  // Payable payments
  addPayablePayment: (p: Omit<PayablePayment, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updatePayablePayment: (id: string, p: Partial<Pick<PayablePayment, "amount" | "date" | "method" | "note">>) => Promise<void>;
  deletePayablePayment: (id: string) => Promise<void>;

  // Bill payments — against unpaid, one-off Expenses. Same create/correct
  // split as payable payments above.
  addBillPayment: (p: Omit<BillPayment, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  updateBillPayment: (id: string, p: Partial<Pick<BillPayment, "amount" | "date" | "method" | "note">>) => Promise<void>;
  deleteBillPayment: (id: string) => Promise<void>;

  // Fixed assets
  addFixedAsset: (a: Omit<FixedAsset, "id" | "createdAt">) => Promise<void>;
  updateFixedAsset: (id: string, a: Partial<FixedAsset>) => Promise<void>;
  deleteFixedAsset: (id: string) => Promise<void>;

  // Investments (owner only). Prices are typed in by hand; nothing connects to a broker or price feed.
  addSecurity: (s: Omit<Security, "id" | "createdAt">) => Promise<string>;
  updateSecurity: (id: string, s: Partial<Security>) => Promise<void>;
  deleteSecurity: (id: string) => Promise<void>;
  addInvestmentTxn: (t: Omit<InvestmentTxn, "id" | "createdAt">) => Promise<void>;
  deleteInvestmentTxn: (id: string) => Promise<void>;
  addLentLoan: (l: Omit<LentLoan, "id" | "createdAt">) => Promise<string>;
  updateLentLoan: (id: string, l: Partial<Omit<LentLoan, "id" | "createdAt">>) => Promise<void>;
  deleteLentLoan: (id: string) => Promise<void>;
  addLentLoanTxn: (t: Omit<LentLoanTxn, "id" | "createdAt">) => Promise<void>;
  deleteLentLoanTxn: (id: string) => Promise<void>;
  addCollectionNote: (n: Omit<CollectionNote, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  deleteCollectionNote: (id: string) => Promise<void>;

  // Project / job costing
  addProject: (p: Omit<Project, "id" | "createdAt">) => Promise<void>;
  updateProject: (id: string, p: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addProjectCostSegment: (s: Omit<ProjectCostSegment, "id" | "createdAt">) => Promise<void>;
  updateProjectCostSegment: (id: string, s: Partial<ProjectCostSegment>) => Promise<void>;
  deleteProjectCostSegment: (id: string) => Promise<void>;
  addProjectMilestone: (m: Omit<ProjectMilestone, "id" | "createdAt">) => Promise<void>;
  updateProjectMilestone: (id: string, m: Partial<ProjectMilestone>) => Promise<void>;
  deleteProjectMilestone: (id: string) => Promise<void>;
  // Records a billing milestone as a real sale of one service item (so it reaches revenue, money owed, cash and
  // tax). A paid milestone also records the payment. Links the milestone to the sale; refuses a second recording.
  // Bills the late charge that has built up on an overdue invoice, as a sale of one service item to the same customer
  // (only what has not been billed before). Never automatic: only the owner's tap.
  recordLateFee: (lineKey: string, productId: string) => Promise<void>;
  recordMilestoneAsSale: (
    milestoneId: string,
    opts: { productId: string; amountIncludesTax: boolean; paymentMethod?: "cash" | "card" | "bank_transfer" }
  ) => Promise<void>;

  // Time tracking — every active role clocks itself in/out; Owner/Manager
  // can also log or correct an entry on someone else's behalf and delete
  // mistakes. See the TimeEntry doc comment in lib/types.ts for why more
  // than one entry can be open for the same person at once.
  clockIn: (jobLabel: string, opts?: { billable?: boolean; hourlyRate?: number; projectId?: string }) => Promise<void>;
  clockOut: (id: string) => Promise<void>;
  addTimeEntry: (
    e: Omit<TimeEntry, "id" | "createdAt" | "createdByUid" | "createdByName">
  ) => Promise<void>;
  updateTimeEntry: (id: string, e: Partial<TimeEntry>) => Promise<void>;
  deleteTimeEntry: (id: string) => Promise<void>;
}

// Tells the server a lead changed stage, so the owner's webhook (if one is set) hears about it. The server re-reads the lead and
// sends it; this never blocks the save and a failure only means the webhook was not called.
async function postLeadStageChange(
  user: { getIdToken: () => Promise<string> } | null,
  businessId: string | null,
  leadId: string,
  from: string,
  to: string,
): Promise<void> {
  try {
    if (!user || !businessId) return;
    const idToken = await user.getIdToken();
    await fetch("/api/webhooks/lead-stage", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, [BUSINESS_ID_HEADER]: businessId },
      body: JSON.stringify({ leadId, from, to }),
    });
  } catch (err) {
    console.error("[lead stage webhook]", err);
  }
}

// v209b: an operations event to the business webhook. Best effort: a failure here never undoes the record it reports.
async function postOpsEvent(user: { getIdToken: () => Promise<string> } | null | undefined, businessId: string | null | undefined, event: string, recordId: string): Promise<void> {
  try {
    if (!user || !businessId) return;
    const idToken = await user.getIdToken();
    await fetch("/api/webhooks/ops-event", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, [BUSINESS_ID_HEADER]: businessId },
      body: JSON.stringify({ event, recordId }),
    });
  } catch (err) {
    console.error("[ops event webhook]", err);
  }
}

// v319: asks the server to send AutoLeads an invoice.paid event for a payment. The server re-reads the invoice and sends only when it is fully paid.
async function postAutoLeadsPayment(user: { getIdToken: () => Promise<string> } | null | undefined, businessId: string | null | undefined, paymentId: string): Promise<void> {
  try {
    if (!user || !businessId) return;
    const idToken = await user.getIdToken();
    await fetch("/api/autoleads/invoice-paid", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, [BUSINESS_ID_HEADER]: businessId },
      body: JSON.stringify({ paymentId }),
    });
  } catch (err) {
    console.error("[autoleads event]", err);
  }
}

// Ids for records made here (contact-style entries inside an operations record, and the records themselves).
const newOpsId = (): string => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
// Update payloads: an optional field the user cleared is deleted, not left at its old value (undefined is ignored on write).
const updateFields = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
// Every field a business log entry can carry, so an edit clears the ones that no longer apply.
const LOG_FIELDS = [
  "kind", "title", "date", "where", "offer", "priceSeen", "threat", "targetDate", "progressPct", "status", "ownerName", "linkedKpiName",
  "direction", "channel", "party", "summary", "steps", "frequencyDays", "lastDoneOn", "notes", "qty",
  "alternative", "accountable", "consulted", "informed",
] as const;
const logPatch = (i: BusinessLogInput): Record<string, unknown> =>
  Object.fromEntries(LOG_FIELDS.map((k) => {
    const v = (i as unknown as Record<string, unknown>)[k];
    return [k, typeof v === "string" ? v.trim() || undefined : v];
  }));
// New records: optional fields left out entirely.
const stripUndefined = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const DataContext = createContext<DataContextValue | undefined>(undefined);


const EMPTY_LIST: never[] = [];
function readyList<T>(loading: boolean, list: T[]): T[] {
  return loading ? (EMPTY_LIST as T[]) : list;
}

// Batches of 400 to stay safely under Firestore's 500-writes-per-batch limit.
const BATCH_SIZE = 400;

// Browser-tab memory of which business/day the health summary was already attempted for (see the effect in DataProvider).
const healthSnapshotAttempted = new Set<string>();

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, businessId, role, memberName, businessSuspended } = useAuth();
  const uid = user?.uid ?? null;

  const [productsRaw, setProducts] = useState<Product[]>([]);
  const [catalogRaw, setCatalog] = useState<CatalogItem[]>([]);
  const [purchasesRaw, setPurchases] = useState<Purchase[]>([]);
  const [purchaseOrdersRaw, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [salesRaw, setSales] = useState<Sale[]>([]);
  const [estimatesRaw, setEstimates] = useState<Estimate[]>([]);
  const [leadsRaw, setLeads] = useState<Lead[]>([]);
  const [expensesRaw, setExpenses] = useState<Expense[]>([]);
  const [variableCostsRaw, setVariableCosts] = useState<VariableCost[]>([]);
  const [capitalEntriesRaw, setCapitalEntries] = useState<CapitalEntry[]>([]);
  const [taxPaymentsRaw, setTaxPayments] = useState<TaxPayment[]>([]);
  const [employeesRaw, setEmployees] = useState<Employee[]>([]);
  const [loansRaw, setLoans] = useState<Loan[]>([]);
  const [contingenciesRaw, setContingencies] = useState<Contingency[]>([]);
  const [dataRequestsRaw, setDataRequests] = useState<DataRequest[]>([]);
  const [budgets, setBudgets] = useState<Budgets>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [cashCountsRaw, setCashCounts] = useState<CashCount[]>([]);
  const [tillPayoutsRaw, setTillPayouts] = useState<TillPayout[]>([]);
  const [receivablePaymentsRaw, setReceivablePayments] = useState<ReceivablePayment[]>([]);
  const [receivableWriteOffsRaw, setReceivableWriteOffs] = useState<ReceivableWriteOff[]>([]);
  const [payablePaymentsRaw, setPayablePayments] = useState<PayablePayment[]>([]);
  const [billPaymentsRaw, setBillPayments] = useState<BillPayment[]>([]);
  const [timeEntriesRaw, setTimeEntries] = useState<TimeEntry[]>([]);
  const [fixedAssetsRaw, setFixedAssets] = useState<FixedAsset[]>([]);
  const [securitiesRaw, setSecurities] = useState<Security[]>([]);
  const [investmentTxnsRaw, setInvestmentTxns] = useState<InvestmentTxn[]>([]);
  const [lentLoansRaw, setLentLoans] = useState<LentLoan[]>([]);
  const [lentLoanTxnsRaw, setLentLoanTxns] = useState<LentLoanTxn[]>([]);
  const [collectionNotesRaw, setCollectionNotes] = useState<CollectionNote[]>([]);
  const [projectsRaw, setProjects] = useState<Project[]>([]);
  const [projectCostSegmentsRaw, setProjectCostSegments] = useState<ProjectCostSegment[]>([]);
  const [projectMilestonesRaw, setProjectMilestones] = useState<ProjectMilestone[]>([]);
  const [customersRaw, setCustomers] = useState<Customer[]>([]);
  const [suppliersRaw, setSuppliers] = useState<Supplier[]>([]);
  const [recurringInvoicesRaw, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
  const [stockAdjustmentsRaw, setStockAdjustments] = useState<StockAdjustment[]>([]);
  const [stockOutsRaw, setStockOuts] = useState<StockOut[]>([]);
  const [playbookRaw, setPlaybook] = useState<PlaybookEntry[]>([]);
  const [leaveRecordsRaw, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [supportCasesRaw, setSupportCases] = useState<SupportCase[]>([]);
  const [feedbackRaw, setFeedback] = useState<FeedbackEntry[]>([]);
  const [tasksRaw, setTasks] = useState<BusinessTask[]>([]);
  const [bookingsRaw, setBookings] = useState<Booking[]>([]);
  const [eventsRaw, setEvents] = useState<GameEvent[]>([]);
  const [chequesRaw, setCheques] = useState<Cheque[]>([]);
  const [tripsRaw, setTrips] = useState<Trip[]>([]);
  // Operations (v176). Who sees which of these is set by role below and by firestore.rules.
  const [requests, setRequests] = useState<BusinessRequest[]>([]);
  const [procedures, setProcedures] = useState<StaffProcedure[]>([]);
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceItem[]>([]);
  const [kpis, setKpis] = useState<KpiMeasure[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[]>([]);
  const [businessLog, setBusinessLog] = useState<BusinessLogEntry[]>([]);
  const [webOrders, setWebOrders] = useState<WebOrder[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [orgLinks, setOrgLinks] = useState<Record<string, OrgLink>>({});
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [sustainabilityEntries, setSustainabilityEntries] = useState<SustainabilityEntry[]>([]);
  const [recurringInvoiceRuns, setRecurringInvoiceRuns] = useState<{ recurringInvoiceId: string; date: string; invoiceId: string }[]>([]);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [supplierAlternatives, setSupplierAlternatives] = useState<Alternative[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceChange[]>([]);
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [membershipsRaw, setMemberships] = useState<Membership[]>([]);
  const [farmBatchesRaw, setFarmBatches] = useState<FarmBatch[]>([]);
  const [tabsRaw, setTabs] = useState<Tab[]>([]);
  const [shiftsRaw, setShifts] = useState<ShiftEntry[]>([]);
  const [shipmentsRaw, setShipments] = useState<Shipment[]>([]);
  const [rentalsRaw, setRentals] = useState<Rental[]>([]);
  const [consignmentsRaw, setConsignments] = useState<ConsignmentEntry[]>([]);
  const [businessRecordsRaw, setBusinessRecords] = useState<StoredElectronicsRecord[]>([]);
  const [workOrdersRaw, setWorkOrders] = useState<WorkOrder[]>([]);
  const [supplierCreditsRaw, setSupplierCredits] = useState<SupplierCreditEntry[]>([]);
  const [customerDepositsRaw, setCustomerDeposits] = useState<CustomerDepositEntry[]>([]);
  const [reviewMarksRaw, setReviewMarks] = useState<ReviewMark[]>([]);
  const [saleReturnsRaw, setSaleReturns] = useState<SaleReturn[]>([]);
  const [supplierReturnsRaw, setSupplierReturns] = useState<SupplierReturn[]>([]);
  const [discountsRaw, setDiscounts] = useState<Discount[]>([]);
  const [recurringExpenseTemplatesRaw, setRecurringExpenseTemplates] = useState<RecurringExpenseTemplate[]>([]);
  const [recurringExpenseOccurrencesRaw, setRecurringExpenseOccurrences] = useState<RecurringExpenseOccurrence[]>([]);
  const [journalEntriesRaw, setJournalEntries] = useState<JournalEntry[]>([]);
  const [opportunitiesRaw, setOpportunities] = useState<Opportunity[]>([]);
  const [bankStatementLinesRaw, setBankStatementLines] = useState<BankStatementLine[]>([]);
  const [locationsRaw, setLocations] = useState<Location[]>([]);
  const [stockTransfersRaw, setStockTransfers] = useState<StockTransfer[]>([]);
  const [openingBalancesRaw, setOpeningBalances] = useState<OpeningBalance[]>([]);
  const [loadedFlags, setLoadedFlags] = useState<Record<string, boolean>>({});
  // Live listeners report in as they arrive. Their reports are batched into one update per turn of the event loop, so a burst of arrivals causes one
  // render of the app instead of one per collection.
  const pendingFlags = useRef<Record<string, boolean>>({});
  const flushScheduled = useRef(false);
  // Highest invoice sequence number handed out this session (lib/invoiceNumber.ts, v321).
  const invoiceSeqFloor = useRef(0);
  const isOfflineNow = () => typeof navigator !== "undefined" && navigator.onLine === false;
  // Pending invoice numbers (v326). A sale saved offline has numberPending and no number. Once the device is online, this takes
  // the next numbers from the shared counter in one transaction. The transaction re-reads each sale first, so a sale numbered
  // on another device in the meantime is skipped, and two devices can never give one sale two numbers.
  useEffect(() => {
    if (!businessId || isOfflineNow()) return;
    const pendingSales = salesRaw.filter((x) => x.numberPending === true && !x.invoiceNo);
    if (pendingSales.length === 0) return;
    const bizId = businessId;
    (async () => {
      try {
        const { db } = getFirebase();
        const ordered = [...pendingSales].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
        const counterRef = doc(db, "users", bizId, "meta", "invoiceCounter");
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(counterRef);
          const last = snap.exists() && typeof snap.data().last === "number" ? (snap.data().last as number) : 0;
          const still: typeof ordered = [];
          for (const x of ordered) {
            const d = await tx.get(doc(db, "users", bizId, "sales", x.id));
            if (d.exists() && d.data().numberPending === true && !d.data().invoiceNo) still.push(x);
          }
          if (still.length === 0) return;
          const r = assignInvoiceNos(still.map((x) => ({ invoiceId: x.invoiceId, date: x.date })), salesRaw, Math.max(last, invoiceSeqFloor.current));
          tx.set(counterRef, { last: r.top });
          still.forEach((x, i) => tx.update(doc(db, "users", bizId, "sales", x.id), { invoiceNo: r.nos[i], numberPending: false }));
          invoiceSeqFloor.current = r.top;
        });
      } catch {
        // Offline again, or a rule refused the write: the pass runs again on the next change to the sales.
      }
    })();
  }, [salesRaw, businessId]);

  // Which collections this role actually needs — and, just as importantly,
  // the ones it must never even attempt to subscribe to. A Staff account
  // has no read access to `products`/`purchases`/etc at the database level
  // (see firestore.rules), so opening a listener on them wouldn't just come
  // back empty — it would fail with a permission-denied error and never
  // resolve, leaving the app stuck on a loading screen. Scoping the
  // subscription list by role up front avoids ever making that request.
  const requiredKeys = useMemo((): string[] => {
    if (role === "owner")
      return [
        "products", "purchases", "purchaseOrders", "sales", "estimates", "leads", "expenses", "accruals", "variableCosts",
        "capitalEntries", "taxPayments", "employees", "loans", "contingencies", "dataRequests", "budgets", "settings", "members", "invites",
        "auditLog", "cashCounts", "tillPayouts", "receivablePayments", "receivableWriteOffs", "payablePayments", "billPayments", "timeEntries", "fixedAssets", "securities", "investmentTxns", "lentLoans", "lentLoanTxns", "collectionNotes",
        "projects", "projectCostSegments", "projectMilestones", "customers", "suppliers", "recurringInvoices",
        "stockAdjustments", "stockOuts", "supplierCredits", "customerDeposits", "reviewMarks", "saleReturns", "supplierReturns", "discounts", "recurringExpenseTemplates", "recurringExpenseOccurrences",
        "journalEntries", "opportunities", "bankStatementLines", "locations", "stockTransfers", "openingBalances", "playbook", "supportCases", "leaveRecords", "feedback", "tasks", "bookings", "events", "cheques", "mileage", "memberships", "farmBatches", "tabs", "shifts", "shipments", "rentals", "consignments", "workOrders", "businessRecords",
        "requests", "procedures", "compliance", "incidents", "maintenance", "kpis", "reviews", "qualityChecks", "businessLog", "webOrders"
      ];
    // An accountant reads exactly what a manager reads (and writes nothing) - see firestore.rules.
    if (role === "manager" || role === "accountant")
      return [
        "products", "purchases", "purchaseOrders", "sales", "estimates", "leads", "expenses", "accruals", "variableCosts",
        "capitalEntries", "taxPayments", "loans", "contingencies", "dataRequests", "budgets", "settings", "cashCounts", "tillPayouts", "receivablePayments", "receivableWriteOffs", "payablePayments", "billPayments", "timeEntries", "fixedAssets", "securities", "investmentTxns", "lentLoans", "lentLoanTxns", "collectionNotes",
        "projects", "projectCostSegments", "projectMilestones", "customers", "suppliers", "recurringInvoices",
        "stockAdjustments", "stockOuts", "supplierCredits", "customerDeposits", "reviewMarks", "saleReturns", "supplierReturns", "discounts", "recurringExpenseTemplates", "recurringExpenseOccurrences",
        "bankStatementLines", "locations", "stockTransfers", "openingBalances", "playbook", "supportCases", "feedback", "tasks", "bookings", "events", "cheques", "mileage", "memberships", "farmBatches", "tabs", "shifts", "shipments", "rentals", "consignments", "workOrders", "businessRecords",
        "procedures", "compliance", "maintenance", "kpis", ...(role === "manager" ? ["requests", "incidents", "reviews", "risks", "businessLog", "webOrders"] : []),
      ];
    if (role === "staff") return ["catalog", "sales", "estimates", "leads", "settings", "cashCounts", "tillPayouts", "receivablePayments", "timeEntries", "customers", "tabs", "shifts", "locations", "bookings", "shipments", "workOrders", "events", "farmBatches", "requests", "procedures", "incidents", "maintenance", "qualityChecks", "businessLog"];
    return [];
  }, [role]);

  useEffect(() => {
    if (!businessId || !uid || !role) {
      setProducts([]);
      setCatalog([]);
      setPurchases([]);
      setPurchaseOrders([]);
      setSales([]);
      setEstimates([]);
      setExpenses([]);
      setVariableCosts([]);
      setCapitalEntries([]);
      setTaxPayments([]);
      setEmployees([]);
      setLoans([]);
      setBudgets({});
      setSettings(DEFAULT_SETTINGS);
      setMembers([]);
      setInvites([]);
      setAuditLog([]);
      setCashCounts([]);
      setReceivablePayments([]);
      setReceivableWriteOffs([]);
      setPayablePayments([]);
      setBillPayments([]);
      setTimeEntries([]);
      setFixedAssets([]);
      setSecurities([]);
      setInvestmentTxns([]);
      setLentLoans([]);
      setLentLoanTxns([]);
      setCollectionNotes([]);
      setProjects([]);
      setProjectCostSegments([]);
      setProjectMilestones([]);
      setCustomers([]);
      setSuppliers([]);
      setRecurringInvoices([]);
      setStockAdjustments([]);
      setStockOuts([]);
      setPlaybook([]);
      setLeaveRecords([]);
      setSupportCases([]);
      setFeedback([]);
      setTasks([]);
      setBookings([]);
      setCheques([]);
      setTrips([]);
      setRequests([]);
      setProcedures([]);
      setComplianceItems([]);
      setIncidents([]);
      setMaintenanceItems([]);
      setKpis([]);
      setReviews([]);
      setRisks([]);
      setQualityChecks([]);
      setBusinessLog([]);
      setWebOrders([]);
      setCandidates([]);
      setObligations([]);
      setOrgLinks({});
      setContracts([]);
      setSustainabilityEntries([]);
      setRecurringInvoiceRuns([]);
      setImprovements([]);
      setSupplierAlternatives([]);
      setPriceHistory([]);
      setAccruals([]);
      setMemberships([]);
      setFarmBatches([]);
      setTabs([]);
      setShifts([]);
      setShipments([]);
      setRentals([]);
      setConsignments([]);
      setBusinessRecords([]);
      setWorkOrders([]);
      setSupplierCredits([]);
      setCustomerDeposits([]);
      setReviewMarks([]);
      setSaleReturns([]);
      setSupplierReturns([]);
      setDiscounts([]);
      setRecurringExpenseTemplates([]);
      setRecurringExpenseOccurrences([]);
      setJournalEntries([]);
      setOpportunities([]);
      setBankStatementLines([]);
      setLocations([]);
      setStockTransfers([]);
      setOpeningBalances([]);
      setLoadedFlags({});
      return;
    }
    const { db } = getFirebase();
    const bump = (key: string) => {
      pendingFlags.current[key] = true;
      if (flushScheduled.current) return;
      flushScheduled.current = true;
      setTimeout(() => {
        flushScheduled.current = false;
        const batch = pendingFlags.current;
        pendingFlags.current = {};
        setLoadedFlags((f) => mergeFlags(f, batch));
      }, 0);
    };
    // Read access to the books: owner, manager, and the view-only accountant (see firestore.rules).
    const isOwnerOrManager = role === "owner" || role === "manager" || role === "accountant";
    const unsubs: (() => void)[] = [];
    // Staff see the leads they created and the leads assigned to them. Two listeners (each matches one rule clause), merged here.
    let staffCreatedLeads: Lead[] = [];
    let staffAssignedLeads: Lead[] = [];
    const mergeStaffLeads = () => {
      const byId = new Map<string, Lead>();
      for (const l of [...staffCreatedLeads, ...staffAssignedLeads]) byId.set(l.id, l);
      setLeads([...byId.values()].sort((a, b) => b.createdAt - a.createdAt));
      bump("leads");
    };

    if (isOwnerOrManager) {
      unsubs.push(
        trackedSnapshot(collection(db, "users", businessId, "products"), (snap) => {
          setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
          bump("products");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "purchases"), orderBy("date", "desc")), (snap) => {
          setPurchases(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Purchase)));
          bump("purchases");
        }),
        trackedSnapshot(
          query(collection(db, "users", businessId, "purchaseOrders"), orderBy("orderDate", "desc")),
          (snap) => {
            setPurchaseOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseOrder)));
            bump("purchaseOrders");
          }
        ),
        trackedSnapshot(query(collection(db, "users", businessId, "sales"), orderBy("date", "desc")), (snap) => {
          setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale)));
          bump("sales");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "estimates"), orderBy("date", "desc")), (snap) => {
          setEstimates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Estimate)));
          bump("estimates");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "leads"), orderBy("createdAt", "desc")), (snap) => {
          setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead)));
          bump("leads");
        }),
        trackedSnapshot(collection(db, "users", businessId, "expenses"), (snap) => {
          setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)));
          bump("expenses");
        }),
        // v209: accruals are read alongside the expenses, for everyone who reads the books, since the monthly profit includes them.
        trackedSnapshot(collection(db, "users", businessId, "accruals"), (snap) => {
          setAccruals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Accrual)));
          bump("accruals");
        }),
        trackedSnapshot(collection(db, "users", businessId, "variableCosts"), (snap) => {
          setVariableCosts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as VariableCost)));
          bump("variableCosts");
        }),
        trackedSnapshot(
          query(collection(db, "users", businessId, "capitalEntries"), orderBy("date", "desc")),
          (snap) => {
            setCapitalEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CapitalEntry)));
            bump("capitalEntries");
          }
        ),
        trackedSnapshot(
          query(collection(db, "users", businessId, "taxPayments"), orderBy("date", "desc")),
          (snap) => {
            setTaxPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaxPayment)));
            bump("taxPayments");
          }
        ),
        trackedSnapshot(query(collection(db, "users", businessId, "loans"), orderBy("startDate", "desc")), (snap) => {
          setLoans(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Loan)));
          bump("loans");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "contingencies"), orderBy("date", "desc")), (snap) => {
          setContingencies(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contingency)));
          bump("contingencies");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "dataRequests"), orderBy("receivedOn", "desc")), (snap) => {
          setDataRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DataRequest)));
          bump("dataRequests");
        }),
        trackedSnapshot(doc(db, "users", businessId, "meta", "budgets"), (snap) => {
          setBudgets((snap.data() as Budgets | undefined) ?? {});
          bump("budgets");
        }),
        trackedSnapshot(collection(db, "users", businessId, "cashCounts"), (snap) => {
          setCashCounts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashCount)));
          bump("cashCounts");
        }),
        trackedSnapshot(collection(db, "users", businessId, "tillPayouts"), (snap) => {
          setTillPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TillPayout)));
          bump("tillPayouts");
        }),
        trackedSnapshot(collection(db, "users", businessId, "receivablePayments"), (snap) => {
          setReceivablePayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReceivablePayment)));
          bump("receivablePayments");
        }),
        trackedSnapshot(collection(db, "users", businessId, "receivableWriteOffs"), (snap) => {
          setReceivableWriteOffs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReceivableWriteOff)));
          bump("receivableWriteOffs");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "payablePayments"), orderBy("date", "desc")), (snap) => {
          setPayablePayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayablePayment)));
          bump("payablePayments");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "billPayments"), orderBy("date", "desc")), (snap) => {
          setBillPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BillPayment)));
          bump("billPayments");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "suppliers"), orderBy("name", "asc")), (snap) => {
          setSuppliers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier)));
          bump("suppliers");
        }),
        trackedSnapshot(
          query(collection(db, "users", businessId, "timeEntries"), orderBy("clockIn", "desc")),
          (snap) => {
            setTimeEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimeEntry)));
            bump("timeEntries");
          }
        ),
        trackedSnapshot(query(collection(db, "users", businessId, "fixedAssets"), orderBy("purchaseDate", "desc")), (snap) => {
          setFixedAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FixedAsset)));
          bump("fixedAssets");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "securities"), orderBy("createdAt", "desc")), (snap) => {
          setSecurities(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Security)));
          bump("securities");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "investmentTxns"), orderBy("date", "desc")), (snap) => {
          setInvestmentTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvestmentTxn)));
          bump("investmentTxns");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "lentLoans"), orderBy("startDate", "desc")), (snap) => {
          setLentLoans(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LentLoan)));
          bump("lentLoans");
        }, (err) => {
          // Newer than the rest of the app: if the updated Firestore rules are not deployed yet this read is refused.
          // Treat it as "no lending recorded" so everything else still loads, instead of hanging the whole app.
          console.error("Couldn't read lent loans (are the latest Firestore rules deployed?)", err);
          setLentLoans([]);
          bump("lentLoans");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "lentLoanTxns"), orderBy("date", "desc")), (snap) => {
          setLentLoanTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LentLoanTxn)));
          bump("lentLoanTxns");
        }, (err) => {
          console.error("Couldn't read loan repayments (are the latest Firestore rules deployed?)", err);
          setLentLoanTxns([]);
          bump("lentLoanTxns");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "collectionNotes"), orderBy("date", "desc")), (snap) => {
          setCollectionNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CollectionNote)));
          bump("collectionNotes");
        }, (err) => {
          // Newer than the rest of the app, same as lentLoans: a refused read means the updated rules are not
          // deployed yet. Show an empty diary rather than hanging the whole app on a loading screen.
          console.error("Couldn't read the collections diary (are the latest Firestore rules deployed?)", err);
          setCollectionNotes([]);
          bump("collectionNotes");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "projects"), orderBy("startDate", "desc")), (snap) => {
          setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project)));
          bump("projects");
        }),
        trackedSnapshot(collection(db, "users", businessId, "projectCostSegments"), (snap) => {
          setProjectCostSegments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectCostSegment)));
          bump("projectCostSegments");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "stockAdjustments"), orderBy("date", "desc")), (snap) => {
          setStockAdjustments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockAdjustment)));
          bump("stockAdjustments");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "stockOuts"), orderBy("date", "desc")), (snap) => {
          setStockOuts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockOut)));
          bump("stockOuts");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "playbook"), orderBy("updatedAt", "desc")), (snap) => {
          setPlaybook(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlaybookEntry)));
          bump("playbook");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "supportCases"), orderBy("openedOn", "desc")), (snap) => {
          setSupportCases(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupportCase)));
          bump("supportCases");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "feedback"), orderBy("receivedOn", "desc")), (snap) => {
          setFeedback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FeedbackEntry)));
          bump("feedback");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "tasks"), orderBy("createdAt", "desc")), (snap) => {
          setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessTask)));
          bump("tasks");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "leaveRecords"), orderBy("from", "desc")), (snap) => {
          setLeaveRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeaveRecord)));
          bump("leaveRecords");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "supplierCredits"), orderBy("date", "desc")), (snap) => {
          setSupplierCredits(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupplierCreditEntry)));
          bump("supplierCredits");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "customerDeposits"), orderBy("date", "desc")), (snap) => {
          setCustomerDeposits(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerDepositEntry)));
          bump("customerDeposits");
        }),
        trackedSnapshot(collection(db, "users", businessId, "reviewMarks"), (snap) => {
          setReviewMarks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReviewMark)));
          bump("reviewMarks");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "cheques"), orderBy("chequeDate", "desc")), (snap) => {
          setCheques(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cheque)));
          bump("cheques");
        })
      );
      // v176 operations. Accountants read compliance, KPIs, procedures and equipment; requests, incidents and reviews are for Owner and Manager.
      unsubs.push(
        trackedSnapshot(query(collection(db, "users", businessId, "compliance"), orderBy("expiresOn")), (snap) => {
          setComplianceItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ComplianceItem)));
          bump("compliance");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "kpis"), orderBy("name")), (snap) => {
          setKpis(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KpiMeasure)));
          bump("kpis");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "maintenance"), orderBy("name")), (snap) => {
          setMaintenanceItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MaintenanceItem)));
          bump("maintenance");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "procedures"), orderBy("title")), (snap) => {
          setProcedures(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffProcedure)));
          bump("procedures");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "priceHistory"), orderBy("changedAt", "desc"), limit(200)), (snap) => {
          setPriceHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PriceChange)));
          bump("priceHistory");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "qualityChecks"), orderBy("date", "desc"), limit(500)), (snap) => {
          setQualityChecks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityCheck)));
          bump("qualityChecks");
        }),
        ...(role === "accountant"
          ? []
          : [
              // v234: improvements and supplier alternatives, for the owner and manager only.
              trackedSnapshot(collection(db, "users", businessId, "improvements"), (snap) => {
                setImprovements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Improvement)));
                bump("improvements");
              }),
              trackedSnapshot(collection(db, "users", businessId, "supplierAlternatives"), (snap) => {
                setSupplierAlternatives(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Alternative)));
                bump("supplierAlternatives");
              }),
              // v258: the generation log of recurring invoices, so recurring revenue can be told apart, for the owner and manager.
              trackedSnapshot(collection(db, "users", businessId, "recurringInvoiceRuns"), (snap) => {
                setRecurringInvoiceRuns(snap.docs.map((d) => d.data() as { recurringInvoiceId: string; date: string; invoiceId: string }));
                bump("recurringInvoiceRuns");
              }),
              // v255: the sustainability and community log, for the owner and manager.
              trackedSnapshot(collection(db, "users", businessId, "sustainabilityEntries"), (snap) => {
                setSustainabilityEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SustainabilityEntry)));
                bump("sustainabilityEntries");
              }),
              // v249: the contract register, for the owner and manager.
              trackedSnapshot(collection(db, "users", businessId, "contracts"), (snap) => {
                setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contract)));
                bump("contracts");
              }),
              // v233: reporting lines and deputies, for the owner and manager only.
              trackedSnapshot(collection(db, "users", businessId, "orgLinks"), (snap) => {
                setOrgLinks(Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as OrgLink])));
                bump("orgLinks");
              }),
              // v232: obligations calendar, for the owner and manager only.
              trackedSnapshot(collection(db, "users", businessId, "obligations"), (snap) => {
                setObligations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Obligation)));
                bump("obligations");
              }),
              // v230: recruiting records, for the owner and manager only (the same readers as web orders).
              trackedSnapshot(collection(db, "users", businessId, "candidates"), (snap) => {
                setCandidates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Candidate)));
                bump("candidates");
              }),
              trackedSnapshot(query(collection(db, "users", businessId, "webOrders"), orderBy("createdAt", "desc"), limit(300)), (snap) => {
                setWebOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WebOrder)));
                bump("webOrders");
              }),
              trackedSnapshot(query(collection(db, "users", businessId, "businessLog")), (snap) => {
                setBusinessLog(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessLogEntry)));
                bump("businessLog");
              }),
              trackedSnapshot(query(collection(db, "users", businessId, "risks"), orderBy("createdAt", "desc")), (snap) => {
                setRisks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Risk)));
                bump("risks");
              }),
              trackedSnapshot(query(collection(db, "users", businessId, "requests"), orderBy("createdAt", "desc")), (snap) => {
                setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessRequest)));
                bump("requests");
              }),
              trackedSnapshot(query(collection(db, "users", businessId, "incidents"), orderBy("date", "desc")), (snap) => {
                setIncidents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Incident)));
                bump("incidents");
              }),
              trackedSnapshot(query(collection(db, "users", businessId, "reviews"), orderBy("date", "desc")), (snap) => {
                setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PerformanceReview)));
                bump("reviews");
              }),
            ])
      );
      unsubs.push(
        trackedSnapshot(query(collection(db, "users", businessId, "mileage"), orderBy("date", "desc")), (snap) => {
          setTrips(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Trip)));
          bump("mileage");
        })
      );
      unsubs.push(
        trackedSnapshot(query(collection(db, "users", businessId, "memberships"), orderBy("endDate", "desc")), (snap) => {
          setMemberships(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Membership)));
          bump("memberships");
        })
      );
      unsubs.push(
        trackedSnapshot(query(collection(db, "users", businessId, "rentals"), orderBy("createdAt", "desc")), (snap) => {
          setRentals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Rental)));
          bump("rentals");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "workOrders"), orderBy("createdAt", "desc")), (snap) => {
          setWorkOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)));
          bump("workOrders");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "consignments"), orderBy("date", "desc")), (snap) => {
          setConsignments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConsignmentEntry)));
          bump("consignments");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "businessRecords"), orderBy("createdAt", "desc")), (snap) => {
          setBusinessRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StoredElectronicsRecord)));
          bump("businessRecords");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "saleReturns"), orderBy("date", "desc")), (snap) => {
          setSaleReturns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SaleReturn)));
          bump("saleReturns");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "supplierReturns"), orderBy("date", "desc")), (snap) => {
          setSupplierReturns(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupplierReturn)));
          bump("supplierReturns");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "discounts"), orderBy("date", "desc")), (snap) => {
          setDiscounts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Discount)));
          bump("discounts");
        }),
        trackedSnapshot(collection(db, "users", businessId, "recurringExpenseTemplates"), (snap) => {
          setRecurringExpenseTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringExpenseTemplate)));
          bump("recurringExpenseTemplates");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "recurringExpenseOccurrences"), orderBy("period", "desc")), (snap) => {
          setRecurringExpenseOccurrences(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringExpenseOccurrence)));
          bump("recurringExpenseOccurrences");
        }),
        trackedSnapshot(collection(db, "users", businessId, "projectMilestones"), (snap) => {
          setProjectMilestones(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectMilestone)));
          bump("projectMilestones");
        }),
        trackedSnapshot(
          query(collection(db, "users", businessId, "bankStatementLines"), orderBy("date", "desc")),
          (snap) => {
            setBankStatementLines(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BankStatementLine)));
            bump("bankStatementLines");
          }
        ),
        trackedSnapshot(collection(db, "users", businessId, "locations"), (snap) => {
          setLocations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Location)));
          bump("locations");
        }),
        trackedSnapshot(
          query(collection(db, "users", businessId, "stockTransfers"), orderBy("date", "desc")),
          (snap) => {
            setStockTransfers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockTransfer)));
            bump("stockTransfers");
          }
        )
      );
      // Opening balances: Owner/Manager only, like the purchases and payments
      // they sit beside. Staff never see the receivables/payables totals that
      // include them (see customerCreditStatus).
      if (isOwnerOrManager) {
        unsubs.push(
          trackedSnapshot(collection(db, "users", businessId, "openingBalances"), (snap) => {
            setOpeningBalances(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OpeningBalance)));
            bump("openingBalances");
          })
        );
      }
    }

    if (role === "owner") {
      unsubs.push(
        trackedSnapshot(collection(db, "users", businessId, "employees"), (snap) => {
          setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
          bump("employees");
        }),
        trackedSnapshot(collection(db, "users", businessId, "members"), (snap) => {
          setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Member)));
          bump("members");
        }),
        trackedSnapshot(collection(db, "users", businessId, "invites"), (snap) => {
          setInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invite)));
          bump("invites");
        }),
        // Bounded, unlike this context's other listeners: auditLog is
        // append-only and grows forever (every write anywhere in the app
        // logs an entry), while its only two readers — Activity
        // (slice(0, 500)) and Team's activity tab (slice(0, 40)) — never
        // show more than 500 rows, and nothing else (backup export, CSV
        // export) reads this array. Syncing and holding the entire
        // lifetime trail in every client was pure unbounded cost/memory
        // growth with no feature behind it. 1000 gives Activity's
        // search/entity/action filters room above their 500-row display
        // cap without re-fetching on every filter change.
        trackedSnapshot(
          query(collection(db, "users", businessId, "auditLog"), orderBy("at", "desc"), limit(1000)),
          (snap) => {
            setAuditLog(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry)));
            bump("auditLog");
          }
        ),
        trackedSnapshot(
          query(collection(db, "users", businessId, "journalEntries"), orderBy("date", "desc")),
          (snap) => {
            setJournalEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JournalEntry)));
            bump("journalEntries");
          }
        ),
        trackedSnapshot(collection(db, "users", businessId, "opportunities"), (snap) => {
          setOpportunities(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Opportunity)));
          bump("opportunities");
        })
      );
    }

    if (role === "staff") {
      unsubs.push(
        trackedSnapshot(collection(db, "users", businessId, "catalog"), (snap) => {
          setCatalog(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CatalogItem)));
          bump("catalog");
        }),
        trackedSnapshot(
          query(collection(db, "users", businessId, "sales"), where("createdByUid", "==", uid), orderBy("date", "desc")),
          (snap) => {
            setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale)));
            bump("sales");
          }
        ),
        trackedSnapshot(
          query(collection(db, "users", businessId, "estimates"), where("createdByUid", "==", uid), orderBy("date", "desc")),
          (snap) => {
            setEstimates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Estimate)));
            bump("estimates");
          }
        ),
        trackedSnapshot(
          query(collection(db, "users", businessId, "leads"), where("createdByUid", "==", uid), orderBy("createdAt", "desc")),
          (snap) => {
            staffCreatedLeads = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
            mergeStaffLeads();
          }
        ),
        trackedSnapshot(
          query(collection(db, "users", businessId, "leads"), where("ownerUid", "==", uid), orderBy("createdAt", "desc")),
          (snap) => {
            staffAssignedLeads = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
            mergeStaffLeads();
          }
        ),
        // v182: the team reads correspondence and inspections only; the query matches the rule exactly.
        trackedSnapshot(query(collection(db, "users", businessId, "businessLog"), where("kind", "in", ["correspondence", "inspection", "waitlist", "backorder", "handover"])), (snap) => {
          setBusinessLog(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessLogEntry)));
          bump("businessLog");
        }),
        // v177e: every quality check is readable by the team (anyone can log one).
        trackedSnapshot(query(collection(db, "users", businessId, "qualityChecks"), orderBy("date", "desc")), (snap) => {
          setQualityChecks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityCheck)));
          bump("qualityChecks");
        }),
        // v176 operations: staff see their own requests and incidents, every procedure, and the equipment list.
        trackedSnapshot(query(collection(db, "users", businessId, "requests"), where("createdByUid", "==", uid), orderBy("createdAt", "desc")), (snap) => {
          setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BusinessRequest)));
          bump("requests");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "incidents"), where("createdByUid", "==", uid), orderBy("createdAt", "desc")), (snap) => {
          setIncidents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Incident)));
          bump("incidents");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "procedures"), orderBy("title")), (snap) => {
          setProcedures(snap.docs.map((d) => ({ id: d.id, ...d.data() } as StaffProcedure)));
          bump("procedures");
        }),
        trackedSnapshot(query(collection(db, "users", businessId, "maintenance"), orderBy("name")), (snap) => {
          setMaintenanceItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MaintenanceItem)));
          bump("maintenance");
        }),
        trackedSnapshot(
          query(collection(db, "users", businessId, "cashCounts"), where("createdByUid", "==", uid)),
          (snap) => {
            setCashCounts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashCount)));
            bump("cashCounts");
          }
        ),
        trackedSnapshot(
          query(collection(db, "users", businessId, "tillPayouts"), where("createdByUid", "==", uid)),
          (snap) => {
            setTillPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TillPayout)));
            bump("tillPayouts");
          }
        ),
        trackedSnapshot(
          query(collection(db, "users", businessId, "receivablePayments"), where("createdByUid", "==", uid)),
          (snap) => {
            setReceivablePayments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReceivablePayment)));
            bump("receivablePayments");
          }
        ),
        trackedSnapshot(collection(db, "users", businessId, "locations"), (snap) => {
          setLocations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Location)));
          bump("locations");
        }),
        trackedSnapshot(
          query(collection(db, "users", businessId, "timeEntries"), where("memberUid", "==", uid)),
          (snap) => {
            setTimeEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimeEntry)));
            bump("timeEntries");
          }
        )
      );
    }

    // Every active role can read settings (currency, credit-term defaults) —
    // only Owner can write them.
    unsubs.push(
      trackedSnapshot(doc(db, "users", businessId, "meta", "settings"), (snap) => {
        if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Settings) });
        bump("settings");
      })
    );

    // Customer directory — every active role reads the full list (see
    // firestore.rules): it's a name/contact lookup, not financial data, and
    // Staff needs it for the sale-form autocomplete.
    unsubs.push(
      trackedSnapshot(query(collection(db, "users", businessId, "customers"), orderBy("name", "asc")), (snap) => {
        setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer)));
        bump("customers");
      })
    );
    // Bookings are read by every active member (the front desk needs the day's bookings), so this listener runs for every role.
    unsubs.push(
      trackedSnapshot(query(collection(db, "users", businessId, "bookings"), orderBy("createdAt", "desc")), (snap) => {
        setBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking)));
        bump("bookings");
      })
    );
    // Farm batches are read by every active member: whoever works the tanks, ponds or houses logs the day's feed and losses.
    unsubs.push(
      trackedSnapshot(query(collection(db, "users", businessId, "farmBatches"), orderBy("startDate", "desc")), (snap) => {
        setFarmBatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FarmBatch)));
        bump("farmBatches");
      })
    );
    // Events are read by every active member: the front desk sells the tickets.
    unsubs.push(
      trackedSnapshot(query(collection(db, "users", businessId, "events"), orderBy("date", "desc")), (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GameEvent)));
        bump("events");
      })
    );
    // Open tabs are read by every active member: the people taking orders at the tables need them.
    unsubs.push(
      trackedSnapshot(query(collection(db, "users", businessId, "tabs"), orderBy("createdAt", "desc")), (snap) => {
        setTabs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tab)));
        bump("tabs");
      })
    );
    // The rota is read by every active member (so staff see their own shifts); owner and manager change it.
    unsubs.push(
      trackedSnapshot(query(collection(db, "users", businessId, "shifts"), orderBy("date")), (snap) => {
        setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ShiftEntry)));
        bump("shifts");
      })
    );
    // Shipments are read by every active member, the same as bookings, so this listener runs for every role.
    unsubs.push(
      trackedSnapshot(query(collection(db, "users", businessId, "shipments"), orderBy("createdAt", "desc")), (snap) => {
        setShipments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Shipment)));
        bump("shipments");
      })
    );

    if (isOwnerOrManager) {
      unsubs.push(
        trackedSnapshot(
          query(collection(db, "users", businessId, "recurringInvoices"), orderBy("nextDueDate", "asc")),
          (snap) => {
            setRecurringInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringInvoice)));
            bump("recurringInvoices");
          }
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [businessId, uid, role]);

  const loading = !businessId || !role || !requiredKeys.every((k) => loadedFlags[k]);

  // While the first load is still streaming in (a big business has ~40 collections arriving one
  // after another), expose stable empty arrays instead of the half-filled ones. Every derived
  // figure below (stock ledgers, P&L, aging, balance sheet ...) is memoized on these arrays, so
  // without this they were recomputed over and over on partial data - once per arriving
  // collection - which is what made sign-in slow for high-volume accounts. Pages already show
  // skeletons until `loading` is false, so nobody sees these empties; everything computes once.
  const products = readyList(loading, productsRaw);
  const catalog = readyList(loading, catalogRaw);
  // Branch-restricted staff (lib/locationScope.ts): the transaction lists below show only the locations this person may use.
  // Owners and unrestricted members get the same arrays back, unchanged.
  const myMember = members.find((m) => m.id === user?.uid);
  const locationsForScope = readyList(loading, locationsRaw);
  const myLocationScope = useMemo(() => locationScopeFor(myMember, role, locationsForScope), [myMember, role, locationsForScope]);
  const purchases = useMemo(() => scopedRows(readyList(loading, purchasesRaw), myLocationScope, locationsForScope), [loading, purchasesRaw, myLocationScope, locationsForScope]);
  const purchaseOrders = readyList(loading, purchaseOrdersRaw);
  const sales = useMemo(() => scopedRows(readyList(loading, salesRaw), myLocationScope, locationsForScope), [loading, salesRaw, myLocationScope, locationsForScope]);
  const estimates = useMemo(() => scopedRows(readyList(loading, estimatesRaw), myLocationScope, locationsForScope), [loading, estimatesRaw, myLocationScope, locationsForScope]);
  const leads = readyList(loading, leadsRaw);
  const expenses = readyList(loading, expensesRaw);
  const variableCosts = readyList(loading, variableCostsRaw);
  const capitalEntries = readyList(loading, capitalEntriesRaw);
  const taxPayments = readyList(loading, taxPaymentsRaw);
  const employees = readyList(loading, employeesRaw);
  const loans = readyList(loading, loansRaw);
  const contingencies = readyList(loading, contingenciesRaw);
  const dataRequests = readyList(loading, dataRequestsRaw);
  const cashCounts = readyList(loading, cashCountsRaw);
  const tillPayouts = readyList(loading, tillPayoutsRaw);
  const receivablePayments = readyList(loading, receivablePaymentsRaw);
  const receivableWriteOffs = readyList(loading, receivableWriteOffsRaw);
  const payablePayments = readyList(loading, payablePaymentsRaw);
  const billPayments = readyList(loading, billPaymentsRaw);
  const timeEntries = readyList(loading, timeEntriesRaw);
  const fixedAssets = readyList(loading, fixedAssetsRaw);
  const securities = readyList(loading, securitiesRaw);
  const investmentTxns = readyList(loading, investmentTxnsRaw);
  const lentLoans = readyList(loading, lentLoansRaw);
  const lentLoanTxns = readyList(loading, lentLoanTxnsRaw);
  const collectionNotes = readyList(loading, collectionNotesRaw);
  const projects = readyList(loading, projectsRaw);
  const projectCostSegments = readyList(loading, projectCostSegmentsRaw);
  const projectMilestones = readyList(loading, projectMilestonesRaw);
  const customers = readyList(loading, customersRaw);
  const suppliers = readyList(loading, suppliersRaw);
  const recurringInvoices = readyList(loading, recurringInvoicesRaw);
  const stockAdjustments = useMemo(() => scopedRows(readyList(loading, stockAdjustmentsRaw), myLocationScope, locationsForScope), [loading, stockAdjustmentsRaw, myLocationScope, locationsForScope]);
  const stockOuts = readyList(loading, stockOutsRaw);
  const playbook = readyList(loading, playbookRaw);
  const leaveRecords = readyList(loading, leaveRecordsRaw);
  const supportCases = readyList(loading, supportCasesRaw);
  const feedbackEntries = readyList(loading, feedbackRaw);
  const tasks = readyList(loading, tasksRaw);
  const bookings = readyList(loading, bookingsRaw);
  const events = readyList(loading, eventsRaw);
  const cheques = readyList(loading, chequesRaw);
  const trips = readyList(loading, tripsRaw);
  const memberships = readyList(loading, membershipsRaw);
  const farmBatches = readyList(loading, farmBatchesRaw);
  const tabs = readyList(loading, tabsRaw);
  const shifts = readyList(loading, shiftsRaw);
  const shipments = readyList(loading, shipmentsRaw);
  const rentals = readyList(loading, rentalsRaw);
  const consignments = readyList(loading, consignmentsRaw);
  const businessRecords = readyList(loading, businessRecordsRaw);
  const workOrders = readyList(loading, workOrdersRaw);
  const supplierCredits = readyList(loading, supplierCreditsRaw);
  const customerDeposits = readyList(loading, customerDepositsRaw);
  const reviewMarks = readyList(loading, reviewMarksRaw);
  const saleReturns = useMemo(() => scopedRows(readyList(loading, saleReturnsRaw), myLocationScope, locationsForScope), [loading, saleReturnsRaw, myLocationScope, locationsForScope]);
  const supplierReturns = readyList(loading, supplierReturnsRaw);
  const discounts = readyList(loading, discountsRaw);
  const recurringExpenseTemplates = readyList(loading, recurringExpenseTemplatesRaw);
  const recurringExpenseOccurrences = readyList(loading, recurringExpenseOccurrencesRaw);
  const journalEntries = readyList(loading, journalEntriesRaw);
  const opportunities = readyList(loading, opportunitiesRaw);
  const bankStatementLines = readyList(loading, bankStatementLinesRaw);
  const locations = readyList(loading, locationsRaw);
  const stockTransfers = readyList(loading, stockTransfersRaw);
  const openingBalances = readyList(loading, openingBalancesRaw);

  // Auto-generates invoices for recurring-invoice schedules that have come
  // due. Runs whenever the schedule list changes (including right after it
  // finishes generating one, since that write updates nextDueDate and
  // re-fires this effect) and stops on its own once nothing is due —
  // dueRecurringInvoices only ever returns a schedule while its
  // The helpers below read the latest settings, products and user. The effects call them through refs, so an effect re-runs only when its
  // own data changes, not on every render (see generateInvoiceForSchedule).
  const generateInvoiceRef = useRef(generateInvoiceForSchedule);
  generateInvoiceRef.current = generateInvoiceForSchedule;
  const generateExpenseRef = useRef(generateExpenseOccurrenceForTemplate);
  generateExpenseRef.current = generateExpenseOccurrenceForTemplate;
  // nextDueDate is still <= today, and generateInvoiceForSchedule always
  // pushes nextDueDate into the future before returning. Owner/Manager
  // only, and only once the initial data load has actually finished, so
  // this never fires against a half-populated `recurringInvoices` array on
  // first mount. See generateInvoiceForSchedule's own comment for the
  // cross-tab double-billing safeguard.
  useEffect(() => {
    // A locked business (suspended, trial ended, renewal overdue) must not have
    // the app quietly keep creating invoices in the background.
    if (loading || !businessId || businessSuspended) return;
    if (role !== "owner" && role !== "manager") return;
    const due = dueRecurringInvoices(recurringInvoices, todayIso());
    if (due.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const schedule of due) {
        if (cancelled) return;
        try {
          await generateInvoiceRef.current(businessId, schedule, todayIso());
        } catch (err) {
          console.error("Failed to auto-generate recurring invoice", schedule.id, err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, businessId, businessSuspended, role, recurringInvoices]);

  // Same auto-generation pattern as recurring invoices above, but for
  // itemized recurring expense templates — produces a PENDING occurrence
  // (not a posted Expense) each time one comes due, ready for review in
  // the UI. See generateExpenseOccurrenceForTemplate's own comment for
  // why generation stops at "pending" instead of posting directly.
  useEffect(() => {
    if (loading || !businessId || businessSuspended) return;
    if (role !== "owner" && role !== "manager") return;
    const due = dueRecurringExpenseTemplates(recurringExpenseTemplates, todayIso());
    if (due.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const template of due) {
        if (cancelled) return;
        try {
          await generateExpenseRef.current(businessId, template, todayIso());
        } catch (err) {
          console.error("Failed to generate recurring expense occurrence", template.id, err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, businessId, businessSuspended, role, recurringExpenseTemplates]);

  // Auto-provision the default "Main" Location the first time this loads
  // for a business that has none yet — so multi-location is purely additive
  // and nobody who never adds a second location ever has to think about it.
  // Owner-only (rather than owner-or-manager) purely to avoid two roles
  // racing to create two "Main" locations on the same first load.
  useEffect(() => {
    if (loading || !businessId || businessSuspended || role !== "owner") return;
    if (locations.length > 0) return;
    (async () => {
      try {
        const { db } = getFirebase();
        await addDoc(collection(db, "users", businessId, "locations"), {
          name: "Main",
          active: true,
          isDefault: true,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.error("Failed to auto-provision default location", err);
      }
    })();
  }, [loading, businessId, businessSuspended, role, locations]);

  // Derived calculations are memoized off the raw arrays' identities, which
  // only change when a snapshot actually delivers new data. For Staff these
  // run over partial/empty arrays and yield harmless zeroed results — no
  // page a Staff account can reach actually renders them (see AppShell nav
  // + per-page role guards), so this is dead-but-safe computation for that
  // role, not a data leak.
  const ledgers = useMemo(
    () => computeAllLedgers(products, purchases, sales, saleReturns, stockAdjustments, supplierReturns, settings.costingMethod ?? "average"),
    [products, purchases, sales, saleReturns, stockAdjustments, supplierReturns, settings.costingMethod]
  );
  const locationStockLevels = useMemo(
    () =>
      computeLocationStockLevels(products, locations, purchases, sales, saleReturns, stockAdjustments, stockTransfers, supplierReturns),
    [products, locations, purchases, sales, saleReturns, stockAdjustments, stockTransfers, supplierReturns]
  );
  const saleEconomics = useMemo(
    () => computeSaleEconomics(sales, ledgers, variableCosts, saleReturns, discounts),
    [sales, ledgers, variableCosts, saleReturns, discounts]
  );
  const offerProducts = useMemo(
    () => products.filter((p) => p.recipeLines && p.recipeLines.length > 0),
    [products]
  );
  const offerStats = useMemo(
    () => computeOfferStats(offerProducts, sales, saleEconomics),
    [offerProducts, sales, saleEconomics]
  );
  const investmentPortfolio = useMemo(
    () => computeInvestmentPortfolio(securities, investmentTxns, todayIso()),
    [securities, investmentTxns]
  );
  const lendingPortfolio = useMemo(
    () => computeLendingPortfolio(lentLoans, lentLoanTxns, todayIso()),
    [lentLoans, lentLoanTxns]
  );
  const monthlyPnL = useMemo(
    () =>
      computeMonthlyPnL(
        sales,
        saleEconomics,
        expenses,
        purchases,
        loans,
        capitalEntries,
        settings.taxRatePct,
        settings.monthlyOwnerDraw ?? 0,
        fixedAssets,
        receivablePayments,
        payablePayments,
        receivableWriteOffs,
        billPayments,
        stockAdjustments
          .filter((a) => a.reason !== "production_use")
          .map((a) => ({ date: a.date, value: ledgers.get(a.productId)?.adjustmentValue.get(a.id) ?? 0 })),
        investmentPortfolio.monthly,
        lendingPortfolio.monthly,
        computeSupplierReturnPnLInputs(supplierReturns, ledgers),
        supplierCredits,
        customerDeposits,
        accruals
      ),
    [
      accruals,
      supplierCredits,
      customerDeposits,
      supplierReturns,
      investmentPortfolio,
      lendingPortfolio,
      stockAdjustments,
      ledgers,
      sales,
      saleEconomics,
      expenses,
      purchases,
      loans,
      capitalEntries,
      settings.taxRatePct,
      settings.monthlyOwnerDraw,
      fixedAssets,
      receivablePayments,
      payablePayments,
      receivableWriteOffs,
      billPayments,
    ]
  );
  const inventoryValue = useMemo(() => currentInventoryValue(ledgers), [ledgers]);
  const inventoryUnits = useMemo(() => currentInventoryUnits(ledgers), [ledgers]);

  const eoqByProduct = useMemo(() => {
    const map = new Map<string, EoqResult>();
    const asOf = todayIso();
    for (const p of products) {
      if (p.type !== "product") continue;
      const ledger = ledgers.get(p.id);
      const demand = estimateAnnualDemand(sales, p.id, asOf);
      map.set(p.id, computeEOQ(p, ledger?.wac ?? 0, demand, settings));
    }
    return map;
  }, [products, sales, ledgers, settings]);

  const breakEven = useMemo(
    () => computeBreakEven(monthlyPnL[monthlyPnL.length - 1], monthlyPnL),
    [monthlyPnL]
  );
  const capitalSummary = useMemo(
    () => computeCapitalSummary(capitalEntries, monthlyPnL),
    [capitalEntries, monthlyPnL]
  );
  const onOrderByProduct = useMemo(() => computeOnOrderByProduct(purchaseOrders), [purchaseOrders]);
  const openOrders = useMemo(() => computeOpenOrderValue(purchaseOrders), [purchaseOrders]);
  const monthlyPayroll = useMemo(() => monthlyPayrollCost(employees), [employees]);
  const loanPortfolio = useMemo(() => computeLoanPortfolio(loans, todayIso()), [loans]);
  const currentPortionOfLoans = useMemo(() => computeCurrentPortionOfLoans(loans, todayIso()), [loans]);
  const receivablesAging = useMemo(
    () => computeReceivablesAging(products, sales, saleEconomics, receivablePayments, todayIso(), receivableWriteOffs, openingBalances, customerDeposits),
    [products, sales, saleEconomics, receivablePayments, receivableWriteOffs, openingBalances, customerDeposits]
  );
  // Staff only load their own sales and payments (see the role-scoped
  // listeners above), so a balance built from them would miss what other people
  // sold and collected — a false "all clear" or a false "over limit". Staff get
  // no balance-based status at all; the forms tell them the limit exists.
  const customerCreditStatus = useMemo(
    () => (role === "staff" ? new Map() : computeCustomerCreditStatus(customers, receivablesAging)),
    [role, customers, receivablesAging]
  );
  const payablesAging = useMemo(
    () => computePayablesAging(products, purchases, payablePayments, todayIso(), openingBalances, supplierReturns, supplierCredits),
    [products, purchases, payablePayments, openingBalances, supplierReturns, supplierCredits]
  );
  const supplierCreditSummary = useMemo(
    () => computeSupplierCredit(supplierReturns, supplierCredits, todayIso()),
    [supplierReturns, supplierCredits]
  );
  const customerDepositSummary = useMemo(
    () => computeCustomerDeposits(customerDeposits, todayIso()),
    [customerDeposits]
  );
  const billsPayable = useMemo(
    () => computeBillsPayable(expenses, billPayments, todayIso()),
    [expenses, billPayments]
  );
  // FIX: outstanding receivables/payables must feed the Balance Sheet — see
  // the comment on computeBalanceSheet's params. Without this, the Balance
  // Sheet silently drops accounts receivable/payable and can misstate (or
  // fail to balance) for any account that uses credit sales or purchases.
  // accountsPayable is supplier credit purchases (payablesAging) PLUS
  // unpaid general bills (billsPayable) — both are real liabilities the
  // business hasn't paid cash out for yet.
  const balanceSheet = useMemo(
    () =>
      computeBalanceSheet(
        monthlyPnL,
        inventoryValue,
        loans,
        capitalSummary,
        todayIso(),
        fixedAssets,
        receivablesAging.totalOutstanding,
        payablesAging.totalOutstanding + billsPayable.totalOutstanding,
        taxPayments,
        computeOpeningEquity(openingBalances),
        { costBasis: investmentPortfolio.costBasis, marketValue: investmentPortfolio.marketValue },
        lendingPortfolio.principalOutstanding,
        supplierCreditSummary.total,
        customerDepositSummary.total,
        accruedLiabilityAsOf(accruals, todayIso())
      ),
    [monthlyPnL, inventoryValue, loans, capitalSummary, accruals, fixedAssets, receivablesAging, payablesAging, billsPayable, taxPayments, openingBalances, investmentPortfolio, lendingPortfolio, supplierCreditSummary, customerDepositSummary]
  );
  // The figures three months back, for the balance sheet trend checks (pass 351). Only receivables and loans can be rebuilt exactly as at
  // an earlier date; stock and owners' capital are held as today's totals, so the trend checks do not use them.
  const trendAsOf = priorMonthEnd(todayIso(), 3);
  const priorTrend: TrendPrior = useMemo(
    () => ({
      accountsReceivable: computeReceivablesAging(products, sales, saleEconomics, receivablePayments, trendAsOf, receivableWriteOffs, openingBalances, customerDeposits).totalOutstanding,
      loansPayable: loans.filter((l) => l.startDate <= trendAsOf).reduce((s, l) => s + computeLoanSummary(l, trendAsOf).currentBalance, 0),
    }),
    [products, sales, saleEconomics, receivablePayments, receivableWriteOffs, openingBalances, customerDeposits, loans, trendAsOf]
  );
  const financialHealth = useMemo(
    () =>
      computeFinancialHealthRatios(
        monthlyPnL,
        balanceSheet,
        12,
        loanPortfolio.totalMonthlyPayment,
        monthlyPayroll,
        currentPortionOfLoans,
        fixedAssets,
        capitalEntries
      ),
    [monthlyPnL, balanceSheet, loanPortfolio, monthlyPayroll, currentPortionOfLoans, fixedAssets, capitalEntries]
  );
  const marketingMetrics = useMemo(
    () => computeMarketingMetrics(sales, expenses, 12),
    [sales, expenses]
  );
  const customerRetention = useMemo(
    () => computeCustomerRetention(sales, todayIso(), 3),
    [sales]
  );
  // 6 months, not the 3 used for customerRetention above: a lead pipeline
  // moves slower than repeat-purchase behavior (there's a sales cycle
  // between "created" and "decided"), so a shorter window would catch too
  // many leads still genuinely in progress and understate the real rate.
  const leadConversion = useMemo(
    () => computeLeadConversion(leads, todayIso(), 6),
    [leads]
  );
  const manualOpsSignals = useMemo(
    () => computeManualOpsSignals(auditLog, stockAdjustments, receivableWriteOffs, saleReturns, todayIso(), 3),
    [auditLog, stockAdjustments, receivableWriteOffs, saleReturns]
  );
  const supplierConcentration = useMemo(
    () => computeSupplierConcentration(purchases, 12),
    [purchases]
  );
  const customerConcentration = useMemo(
    () => computeCustomerConcentration(sales, 12),
    [sales]
  );
  const growthMetrics = useMemo(() => computeGrowthMetrics(monthlyPnL), [monthlyPnL]);
  const averageOrderValue = useMemo(() => computeAverageOrderValue(sales, 3), [sales]);
  const growthLevers = useMemo(() => computeGrowthLevers(monthlyPnL, sales, 3), [monthlyPnL, sales]);
  const revenuePerEmployee = useMemo(
    () => computeRevenuePerEmployee(monthlyPnL, employees, 12),
    [monthlyPnL, employees]
  );
  const staffUtilization = useMemo(
    () => computeStaffUtilization(timeEntries, 1),
    [timeEntries]
  );
  const cashRunway = useMemo(
    () => computeCashRunwayMonths(balanceSheet.cash, monthlyPnL, todayIso(), 3),
    [balanceSheet.cash, monthlyPnL]
  );
  // Once a day, while the owner has the app open, store a tiny health summary (lib/healthSnapshot.ts) that the operator's
  // account list reads. Best effort and silent: any failure (offline, the demo, rules not yet published) changes nothing.
  // Tried at most once per day per browser tab.
  useEffect(() => {
    if (loading || role !== "owner" || !businessId) return;
    const today = todayIso();
    const attemptKey = `${businessId}:${today}`;
    if (healthSnapshotAttempted.has(attemptKey)) return;
    healthSnapshotAttempted.add(attemptKey);
    const storeKey = `balancr.health.${businessId}`;
    try {
      if (localStorage.getItem(storeKey) === today) return;
    } catch {
      /* storage unavailable: just write */
    }
    const overdue = receivablesAging.lines.filter((l) => l.daysOverdue > 0);
    const lastFull = [...monthlyPnL].filter((m) => m.month < today.slice(0, 7)).pop();
    const snap = buildHealthSnapshot({
      today,
      overdueTotal: overdue.reduce((sum, l) => sum + l.amountOutstanding, 0),
      overdueCount: overdue.length,
      totalOutstanding: receivablesAging.totalOutstanding,
      runwayMonths: cashRunway.runwayMonths,
      lastMonth: lastFull?.month ?? null,
      lastMonthNetProfit: lastFull ? lastFull.netProfitPreTax : null,
    });
    const { db } = getFirebase();
    setDoc(doc(db, "users", businessId, "meta", "healthSnapshot"), snap)
      .then(() => {
        try {
          localStorage.setItem(storeKey, today);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, [loading, role, businessId, receivablesAging, monthlyPnL, cashRunway]);
  const avgDailyCashSales = useMemo(() => {
    const since = todayIso();
    const from = new Date(since);
    from.setUTCDate(from.getUTCDate() - 30);
    const fromIso = from.toISOString().slice(0, 10);
    const econBySale = new Map(saleEconomics.map((e) => [e.saleId, e]));
    let total = 0;
    for (const s of sales) {
      if (s.date < fromIso) continue;
      if (s.paymentMethod === "credit") continue;
      total += econBySale.get(s.id)?.revenue ?? s.qty * s.unitPrice;
    }
    return total / 30;
  }, [sales, saleEconomics]);
  const projectFinancials = useMemo(
    () => computeAllProjectFinancials(projects, projectCostSegments, purchases, expenses, sales, timeEntries),
    [projects, projectCostSegments, purchases, expenses, sales, timeEntries]
  );
  const projectPortfolio = useMemo(
    () => computeProjectPortfolioSummary(projects, projectFinancials),
    [projects, projectFinancials]
  );
  const projectBudgetAlerts = useMemo(
    () => computeProjectBudgetAlerts(projects, projectFinancials),
    [projects, projectFinancials]
  );

  // Turns one due occurrence of a recurring-invoice schedule into a real,
  // multi-item invoice — one Sale per line, all sharing a fresh invoiceId,
  // paymentMethod "credit" (a retainer invoice is billed, then collected,
  // never paid on the spot), exactly the way MultiItemInvoiceForm builds
  // one by hand. Wrapped in a transaction that first claims a
  // `recurringInvoiceRuns/{scheduleId}_{date}` lock doc, so the same
  // schedule can never generate two invoices for the same calendar day —
  // the one real risk in a client-only (no server cron) implementation of
  // this is two open tabs, or a stale page left open overnight, both
  // racing to generate the same overdue invoice. Returns the new
  // invoiceId, or null if that day's invoice for this schedule already
  // exists (the lock was already claimed).
  async function generateInvoiceForSchedule(
    bizId: string,
    schedule: RecurringInvoice,
    asOfDate: string
  ): Promise<string | null> {
    const { db } = getFirebase();
    const lockRef = doc(db, "users", bizId, "recurringInvoiceRuns", `${schedule.id}_${asOfDate}`);
    const scheduleRef = doc(db, "users", bizId, "recurringInvoices", schedule.id);
    const invoiceId = `rinv_${schedule.id.slice(-6)}_${asOfDate}_${Math.random().toString(36).slice(2, 6)}`;
    const creditTermDays = schedule.creditTermDays ?? settings.defaultCreditTermDays;
    const dueDate = addDaysToDate(asOfDate, creditTermDays);
    const total = schedule.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
    // Sales tax (VAT/GST) snapshotted onto each generated Sale, computed at
    // generation time from the current Settings — same as a hand-entered
    // invoice — so a retainer client's monthly invoice doesn't silently
    // drop the output tax. Split across lines by share of the subtotal, the
    // last line absorbing rounding, as in the multi-line invoice form.
    // Each line is taxed at its own item's rate (the shop rate unless the item sets one).
    const productForTax = new Map(products.map((pr) => [pr.id, pr]));

    try {
      await runTransaction(db, async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists()) throw new Error("ALREADY_GENERATED");

        tx.set(lockRef, {
          recurringInvoiceId: schedule.id,
          date: asOfDate,
          invoiceId,
          createdAt: Date.now(),
        });

        // Reset inside the transaction body: Firestore may retry it, and a
        // retry must not double-count what the first attempt allocated.
        for (let i = 0; i < schedule.lines.length; i++) {
          const line = schedule.lines[i];
          const lineTax = taxFor(line.qty * line.unitPrice, productForTax.get(line.productId), settings);
          const saleRef = doc(collection(db, "users", bizId, "sales"));
          const salePayload: Record<string, unknown> = {
            productId: line.productId,
            qty: line.qty,
            unitPrice: line.unitPrice,
            date: asOfDate,
            paymentMethod: "credit",
            creditTermDays,
            dueDate,
            invoiceId,
            ...(lineTax > 0.005 ? { taxAmount: lineTax } : {}),
            createdByUid: uid ?? undefined,
            createdByName: memberName ?? user?.email ?? "Recurring invoice",
            locationId: schedule.locationId || undefined,
            createdAt: Date.now(),
          };
          if (schedule.customer) salePayload.customer = schedule.customer;
          if (schedule.customerContact) salePayload.customerContact = schedule.customerContact;
          if (schedule.notes) salePayload.notes = schedule.notes;
          if (!uid) delete salePayload.createdByUid;
          tx.set(saleRef, salePayload);
        }

        // Step on from the schedule's own due date (not from today) so the cadence
        // holds: a retainer billed on the 1st stays on the 1st even if the owner only
        // opened the app on the 4th, and a month-end schedule keeps its day.
        const fromDue = /^\d{4}-\d{2}-\d{2}$/.test(schedule.nextDueDate) ? schedule.nextDueDate : asOfDate;
        const nextDueDate = catchUpNextDueDate(schedule.recurrence, fromDue, asOfDate, dayOfMonthOf(schedule.startDate));
        tx.update(scheduleRef, {
          nextDueDate,
          lastGeneratedDate: asOfDate,
          lastInvoiceId: invoiceId,
        });
      });

      logAudit(
        "recurringInvoice",
        schedule.id,
        "update",
        `Invoice generated for ${schedule.customer}: ${formatMoneyPlain(total)}`
      );
      return invoiceId;
    } catch (err) {
      if (err instanceof Error && err.message === "ALREADY_GENERATED") return null;
      throw err;
    }
  }

  // Generates the next PENDING occurrence for a due RecurringExpenseTemplate
  // — never a real Expense directly, see the RecurringExpenseOccurrence doc
  // comment in lib/types.ts for why. Lines default from the most recently
  // POSTED occurrence's actual amounts (this period usually tracks last
  // period), falling back to the template's own defaults the first time.
  // Same lock-doc pattern as generateInvoiceForSchedule above, for the same
  // cross-tab double-generation reason.
  async function generateExpenseOccurrenceForTemplate(
    bizId: string,
    template: RecurringExpenseTemplate,
    asOfDate: string
  ): Promise<string | null> {
    const { db } = getFirebase();
    const lockRef = doc(db, "users", bizId, "recurringExpenseRuns", `${template.id}_${asOfDate}`);
    const templateRef = doc(db, "users", bizId, "recurringExpenseTemplates", template.id);
    const occurrenceRef = doc(collection(db, "users", bizId, "recurringExpenseOccurrences"));

    const priorPosted = recurringExpenseOccurrences
      .filter((o) => o.templateId === template.id && o.status === "posted")
      .sort((a, b) => b.period.localeCompare(a.period))[0];
    const startingLines = (priorPosted?.lines ?? template.lines).map((l) => ({ label: l.label, amount: l.amount }));
    // v286 autopay: the occurrence posts in the same transaction instead of waiting as pending.
    const auto = isAutopay(template);
    const autoExpenseRef = doc(collection(db, "users", bizId, "expenses"));

    try {
      await runTransaction(db, async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists()) throw new Error("ALREADY_GENERATED");

        tx.set(lockRef, {
          recurringExpenseTemplateId: template.id,
          date: asOfDate,
          occurrenceId: occurrenceRef.id,
          createdAt: Date.now(),
        });
        const postedNow = Date.now();
        tx.set(occurrenceRef, {
          templateId: template.id,
          period: asOfDate,
          lines: startingLines,
          status: auto ? "posted" : "pending",
          ...(auto ? { expenseId: autoExpenseRef.id, postedAt: postedNow } : {}),
          createdAt: postedNow,
        });
        if (auto) {
          tx.set(autoExpenseRef, { ...postedExpenseFields(template, asOfDate, startingLines), autoPosted: true, createdAt: postedNow });
        }

        const fromDue = /^\d{4}-\d{2}-\d{2}$/.test(template.nextDueDate) ? template.nextDueDate : asOfDate;
        const nextDueDate = catchUpExpenseNextDueDate(template.recurrence, fromDue, asOfDate, dayOfMonthOf(template.startDate));
        tx.update(templateRef, { nextDueDate, lastGeneratedDate: asOfDate, ...(auto ? { lastExpenseId: autoExpenseRef.id } : {}) });
      });

      logAudit(
        "recurringExpenseTemplate",
        template.id,
        "update",
        `${template.name} ${auto ? "posted automatically" : "ready for review"}: ${asOfDate}`
      );
      return occurrenceRef.id;
    } catch (err) {
      if (err instanceof Error && err.message === "ALREADY_GENERATED") return null;
      throw err;
    }
  }

  function requireBusiness(): { businessId: string; uid: string } {
    if (!businessId || !uid) throw new Error("Not signed in");
    return { businessId, uid };
  }

  function requirePermission(permission: Parameters<typeof can>[1]) {
    if (!can(role, permission)) {
      throw new Error("Your role doesn't have permission to do that.");
    }
  }

  // Some actions are reachable by more than one role via different
  // permissions — e.g. logging a sale is "manage:sales" for Owner/Manager
  // but only the narrower "create:sale" for Staff (who can log one but not
  // edit/delete it after). requirePermission alone can't express "any of
  // these"; this does.
  function requireAnyPermission(permissions: Parameters<typeof can>[1][]) {
    if (!permissions.some((p) => can(role, p))) {
      throw new Error("Your role doesn't have permission to do that.");
    }
  }

  // Best-effort, app-triggered audit trail — see the AuditLogEntry doc
  // comment in lib/types.ts for exactly what this does and doesn't
  // guarantee. Fire-and-forget on purpose: a slow/failed audit write should
  // never block or fail the actual business transaction it's describing.
  function logAudit(entity: string, entityId: string, action: AuditAction, summary: string) {
    if (!businessId || !uid || !role) return;
    const { db } = getFirebase();
    addDoc(collection(db, "users", businessId, "auditLog"), {
      at: Date.now(),
      byUid: uid,
      byName: memberName ?? user?.email ?? "Unknown",
      byRole: role,
      action,
      entity,
      entityId,
      summary,
    }).catch(() => {
      /* deliberately swallowed — see comment above */
    });
  }

  // Deletes a parent record together with every child record that only
  // exists to describe it. Without this, deleting a Sale/Purchase/Expense
  // left its payments, returns, discounts and write-offs behind as
  // orphans — and those are NOT inert. computeMonthlyPnL sums
  // receivablePayments, payablePayments and billPayments straight into
  // cash flow, and receivableWriteOffs into bad debt expense, filtered
  // only by month, never by "does the parent still exist". An orphaned
  // collection therefore kept showing up as real cash coming in, forever,
  // for a sale that no longer existed; an orphaned SaleReturn with
  // restock: true kept its stock back in inventory the same way. The
  // aging tables hid this (they iterate parents, so orphans vanish from
  // view) while the P&L and cash flow quietly stayed wrong.
  //
  // One batch, so the parent and its children go together or not at all —
  // a partial failure that removed the sale but left the payments would
  // be worse than doing nothing. Children come from the already-live
  // snapshot state rather than a fresh query: this context subscribes to
  // all six collections anyway, so there's nothing a query would tell us
  // that we don't already have in memory.
  async function cascadeDelete(
    parentCol: string,
    parentId: string,
    children: { col: string; ids: string[] }[],
    // Bookings and leads whose sale link must be cleared with this delete (they go back to Done / Won, not a sale).
    unlinkBookings: string[] = [],
    unlinkLeads: string[] = []
  ) {
    const { businessId: bizId } = requireBusiness();
    const { db } = getFirebase();
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", bizId, parentCol, parentId));
    let queued = 1;
    for (const child of children) {
      for (const id of child.ids) {
        batch.delete(doc(db, "users", bizId, child.col, id));
        queued += 1;
      }
    }
    for (const id of unlinkBookings) {
      batch.update(doc(db, "users", bizId, "bookings", id), { saleId: deleteField(), updatedAt: Date.now() });
      queued += 1;
    }
    for (const id of unlinkLeads) {
      batch.update(doc(db, "users", bizId, "leads", id), { saleId: deleteField() });
      queued += 1;
    }
    // Firestore caps a batch at 500 writes. A single sale with more than
    // ~499 payments/returns/discounts against it isn't a realistic SME
    // record, but silently throwing a cryptic Firestore error if it ever
    // happened would be — so fall back to sequential deletes (parent
    // last, so a mid-way failure leaves the parent still owning its
    // remaining children rather than orphaning them).
    if (queued <= BATCH_SIZE) {
      await batch.commit();
      return;
    }
    for (const child of children) {
      for (const id of child.ids) {
        await deleteDoc(doc(db, "users", bizId, child.col, id));
      }
    }
    for (const id of unlinkBookings) {
      await updateDoc(doc(db, "users", bizId, "bookings", id), { saleId: deleteField(), updatedAt: Date.now() });
    }
    for (const id of unlinkLeads) {
      await updateDoc(doc(db, "users", bizId, "leads", id), { saleId: deleteField() });
    }
    await deleteDoc(doc(db, "users", bizId, parentCol, parentId));
  }

  async function chunkedBatchAdd<T extends Record<string, unknown>>(
    colName: string,
    rows: T[]
  ) {
    const { businessId: bizId } = requireBusiness();
    const { db } = getFirebase();
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const row of chunk) {
        const ref = doc(collection(db, "users", bizId, colName));
        batch.set(ref, { ...row, createdAt: Date.now() });
      }
      await batch.commit();
    }
  }

  const rawValue: DataContextValue = {
    loading,
    role,
    memberName,
    products,
    catalog,
    purchases,
    purchaseOrders,
    sales,
    estimates,
    leads,
    expenses,
    variableCosts,
    capitalEntries,
    taxPayments,
    employees,
    loans,
    contingencies,
    dataRequests,
    budgets,
    settings,
    members,
    myLocationScope,
    invites,
    auditLog,
    cashCounts,
    tillPayouts,
    receivablePayments,
    receivableWriteOffs,
    payablePayments,
    billPayments,
    timeEntries,
    fixedAssets,
    securities,
    investmentTxns,
    investmentPortfolio,
    lentLoans,
    lentLoanTxns,
    collectionNotes,
    lendingPortfolio,
    projects,
    projectCostSegments,
    projectMilestones,
    customers,
    suppliers,
    recurringInvoices,
    stockAdjustments,
    stockOuts,
    playbook,
    requests,
    procedures,
    complianceItems,
    incidents,
    maintenanceItems,
    kpis,
    reviews,
    risks,
    qualityChecks,
    businessLog,
    candidates,
    improvements,
    supplierAlternatives,
    contracts,
    sustainabilityEntries,
    recurringInvoiceRuns,
    orgLinks,
    obligations,
    webOrders,
    accruals,
    priceHistory,
    leaveRecords,
    supportCases,
    feedbackEntries,
    tasks,
    bookings,
    events,
    cheques,
    trips,
    memberships,
    farmBatches,
    tabs,
    shifts,
    shipments,
    rentals,
    consignments,
    workOrders,
    businessRecords,
    supplierCredits,
    supplierCreditSummary,
    customerDeposits,
    customerDepositSummary,
    reviewMarks,
    saleReturns,
    supplierReturns,
    discounts,
    recurringExpenseTemplates,
    recurringExpenseOccurrences,
    journalEntries,
    opportunities,
    bankStatementLines,
    locations,
    stockTransfers,
    openingBalances,
    locationStockLevels,
    ledgers,
    saleEconomics,
    monthlyPnL,
    inventoryValue,
    inventoryUnits,
    eoqByProduct,
    breakEven,
    capitalSummary,
    onOrderByProduct,
    openOrders,
    monthlyPayroll,
    loanPortfolio,
    balanceSheet,
    priorTrend,
    financialHealth,
    marketingMetrics,
    customerRetention,
    leadConversion,
    manualOpsSignals,
    supplierConcentration,
    customerConcentration,
    growthMetrics,
    averageOrderValue,
    growthLevers,
    revenuePerEmployee,
    staffUtilization,
    cashRunway,
    receivablesAging,
    customerCreditStatus,
    payablesAging,
    billsPayable,
    avgDailyCashSales,
    projectFinancials,
    projectPortfolio,
    projectBudgetAlerts,
    offerStats,

    addProduct: async (p) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const batch = writeBatch(db);
      const productRef = doc(collection(db, "users", bizId, "products"));
      const catalogRef = doc(db, "users", bizId, "catalog", productRef.id);
      batch.set(productRef, { ...p, createdAt: Date.now() });
      batch.set(catalogRef, {
        name: p.name, sku: p.sku, category: p.category, type: p.type, active: p.active,
        sellPrice: p.defaultSellPrice ?? null,
        wholesalePrice: p.wholesalePrice ?? null,
        priceTiers: p.priceTiers ?? null,
        warrantyMonths: p.warrantyMonths ?? null,
        taxRatePct: p.taxRatePct ?? null,
        baseUnit: p.baseUnit ?? null,
        allowFractionalQty: p.allowFractionalQty ?? false,
        packSizes: p.packSizes ?? null,
      });
      await batch.commit();
      logAudit("product", productRef.id, "create", `Product added: ${p.name}`);
      return productRef.id;
    },
    updateProduct: async (docId, p) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const batch = writeBatch(db);
      // A recipe may use sub-assemblies, but it must not lead back to itself, nor nest deeper than the planner walks.
      if (p.components !== undefined) {
        const bomOf = (id: string) => (id === docId ? p.components ?? [] : products.find((x) => x.id === id)?.components ?? []);
        const problem = bomProblem(docId, bomOf);
        if (problem?.kind === "loop") {
          const names = problem.path.map((id) => products.find((x) => x.id === id)?.name ?? id);
          throw new Error(`This recipe uses itself: ${names.join(" → ")}. Take one of those items out of the recipe.`);
        }
        if (problem?.kind === "deep") throw new Error(`Recipes can nest at most ${MAX_BOM_DEPTH} levels deep.`);
      }
      // The unit / pack / variant fields are cleared by the product form sending them as `undefined`
      // (a removed pack, an emptied unit label) — that has to be a real delete or the old value stays.
      batch.update(doc(db, "users", bizId, "products", docId), clearListedUndefined(p as Record<string, unknown>, PRODUCT_CLEARABLE_FIELDS));
      // Price history: each price that actually changes is appended in this same batch, so the record and the change succeed or fail together.
      const before = products.find((x) => x.id === docId);
      const who = { changedByUid: undefined as string | undefined, changedByName: memberName ?? user?.email ?? "Unknown" };
      for (const c of priceChangesFor(before ?? {}, p as Record<string, number | null>)) {
        batch.set(doc(collection(db, "users", bizId, "priceHistory")), stripUndefined({
          productId: docId,
          productName: before?.name ?? p.name ?? "Product",
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          changedAt: Date.now(),
          ...who,
        }));
      }
      const catalogPatch: Record<string, unknown> = {};
      if (p.name !== undefined) catalogPatch.name = p.name;
      if (p.sku !== undefined) catalogPatch.sku = p.sku;
      if (p.category !== undefined) catalogPatch.category = p.category;
      if (p.type !== undefined) catalogPatch.type = p.type;
      if (p.active !== undefined) catalogPatch.active = p.active;
      if (p.defaultSellPrice !== undefined) catalogPatch.sellPrice = p.defaultSellPrice;
      if ("baseUnit" in p) catalogPatch.baseUnit = p.baseUnit ?? null;
      if (p.allowFractionalQty !== undefined) catalogPatch.allowFractionalQty = p.allowFractionalQty;
      if ("packSizes" in p) catalogPatch.packSizes = p.packSizes ?? null;
      if ("wholesalePrice" in p) catalogPatch.wholesalePrice = p.wholesalePrice ?? null;
      if ("priceTiers" in p) catalogPatch.priceTiers = p.priceTiers ?? null;
      if ("warrantyMonths" in p) catalogPatch.warrantyMonths = p.warrantyMonths ?? null;
      if ("taxRatePct" in p) catalogPatch.taxRatePct = p.taxRatePct ?? null;
      if (Object.keys(catalogPatch).length > 0) {
        batch.update(doc(db, "users", bizId, "catalog", docId), catalogPatch);
      }
      await batch.commit();
      logAudit("product", docId, "update", `Product updated${p.name ? `: ${p.name}` : ""}`);
    },
    deleteProduct: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = products.find((pr) => pr.id === docId);
      // v279: a product with sales or purchases on record is archived, not deleted (see lib/productDelete.ts).
      const block = productDeleteBlock(docId, salesRaw, purchasesRaw);
      if (block) throw new Error(block);
      const batch = writeBatch(db);
      batch.delete(doc(db, "users", bizId, "products", docId));
      batch.delete(doc(db, "users", bizId, "catalog", docId));
      await batch.commit();
      logAudit("product", docId, "delete", `Product deleted: ${existing?.name ?? docId}`);
    },
    bulkAddProducts: async (rows) => {
      // Each imported product also gets its cost-stripped catalogue entry, exactly as addProduct writes it, or Staff
      // (who sell from the catalogue) would never see an imported item. Two writes per row, so half-size chunks.
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Up to five writes per row (the product, its catalogue entry, and up to three starting prices in the price history).
      const perChunk = Math.max(1, Math.floor(BATCH_SIZE / 5));
      for (let i = 0; i < rows.length; i += perChunk) {
        const batch = writeBatch(db);
        for (const p of rows.slice(i, i + perChunk)) {
          const productRef = doc(collection(db, "users", bizId, "products"));
          batch.set(productRef, { ...p, createdAt: Date.now() });
          // Each starting price is recorded in the price history, so an imported price has a traceable first value.
          for (const c of priceChangesFor({}, { defaultSellPrice: p.defaultSellPrice ?? null, defaultCostPrice: p.defaultCostPrice ?? null, wholesalePrice: p.wholesalePrice ?? null })) {
            batch.set(doc(collection(db, "users", bizId, "priceHistory")), stripUndefined({
              productId: productRef.id, productName: p.name, field: c.field, newValue: c.newValue,
              changedAt: Date.now(), changedByName: memberName ?? user?.email ?? "Import",
            }));
          }
          batch.set(doc(db, "users", bizId, "catalog", productRef.id), {
            name: p.name, sku: p.sku, category: p.category, type: p.type, active: p.active,
            sellPrice: p.defaultSellPrice ?? null,
            wholesalePrice: p.wholesalePrice ?? null,
            priceTiers: p.priceTiers ?? null,
            warrantyMonths: p.warrantyMonths ?? null,
            taxRatePct: p.taxRatePct ?? null,
            baseUnit: p.baseUnit ?? null,
            allowFractionalQty: p.allowFractionalQty ?? false,
            packSizes: p.packSizes ?? null,
          });
        }
        await batch.commit();
      }
    },
    bulkDiscountProducts: async (ids, discountPercent) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();

      // Compute the new price for each target up front so we know exactly
      // which ones actually changed (no price set → nothing to discount)
      // before touching Firestore.
      const targets: { id: string; name: string; oldPrice: number; newPrice: number }[] = [];
      const skippedIds: string[] = [];
      for (const id of ids) {
        const product = products.find((p) => p.id === id);
        const oldPrice = product?.defaultSellPrice;
        if (!product || !oldPrice || oldPrice <= 0) {
          skippedIds.push(id);
          continue;
        }
        // Round to cents so repeated discounts don't drift into
        // floating-point fractions of a currency unit.
        const newPrice = Math.round(oldPrice * (1 - discountPercent / 100) * 100) / 100;
        targets.push({ id, name: product.name, oldPrice, newPrice: Math.max(0, newPrice) });
      }

      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const chunk = targets.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const t of chunk) {
          batch.update(doc(db, "users", bizId, "products", t.id), { defaultSellPrice: t.newPrice });
          batch.update(doc(db, "users", bizId, "catalog", t.id), { sellPrice: t.newPrice });
        }
        await batch.commit();
      }

      if (targets.length > 0) {
        const verb = discountPercent >= 0 ? "discount" : "markup";
        logAudit(
          "product",
          targets.length === 1 ? targets[0].id : "bulk",
          "update",
          `${Math.abs(discountPercent)}% ${verb} applied to ${targets.length} item${targets.length === 1 ? "" : "s"}: ${targets
            .map((t) => t.name)
            .slice(0, 8)
            .join(", ")}${targets.length > 8 ? ", …" : ""}`
        );
      }

      return { updatedIds: targets.map((t) => t.id), skippedIds };
    },

    addPurchase: async (p) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Supplier-side mirror of addSale: a purchase bought on terms stores
      // its own dueDate at creation, so computePayablesAging never has to
      // recompute it and a later change to the default term can't silently
      // re-age purchases already on the books.
      const dueDate =
        p.paymentMethod === "credit"
          ? addDaysToDate(p.date, p.creditTermDays ?? settings.defaultCreditTermDays)
          : undefined;
      const ref = await addDoc(collection(db, "users", bizId, "purchases"), {
        ...p,
        paymentMethod: p.paymentMethod ?? "cash",
        dueDate,
        createdAt: Date.now(),
      });
      logAudit(
        "purchase",
        ref.id,
        "create",
        `Purchase: ${p.qty} × ${formatMoneyPlain(p.unitCost)}${p.paymentMethod === "credit" ? " (on credit)" : ""}`
      );
    },
    updatePurchase: async (docId, p) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const before = purchases.find((x) => x.id === docId);
      // Mirror of the guard in updateSale, for the supplier side: flipping
      // a credit purchase to paid-up-front once PayablePayments exist puts
      // the full cost into cashPurchasesThisMonth while the payments stay
      // in payableSettlements — the same cash counted twice.
      if (
        before &&
        before.paymentMethod === "credit" &&
        p.paymentMethod !== undefined &&
        p.paymentMethod !== "credit"
      ) {
        const paid = payablePayments.filter((x) => x.purchaseId === docId).length;
        if (paid > 0) {
          throw new Error(
            `This purchase already has ${paid} supplier payment${paid === 1 ? "" : "s"} recorded against it, so it can't be switched off credit — the money would be counted twice. Delete those payments first if it really was paid up front.`
          );
        }
      }
      // A supplier return snapshots this purchase's cost and tax and may have
      // settled part of its bill, so the figures it was based on can't move
      // underneath it.
      if (before) {
        const returned = supplierReturns.filter((r) => r.purchaseId === docId);
        if (returned.length > 0) {
          const changed = purchaseEditChangesReturnedFigures(before, p, locations);
          if (changed) {
            throw new Error(
              `${returned.length} supplier return${returned.length === 1 ? " is" : "s are"} recorded against this purchase, so its quantity, cost, tax, payment terms and location can't be changed. Delete the return${returned.length === 1 ? "" : "s"} first, then edit it.`
            );
          }
        }
      }
      // Supplier credit used on this bill was checked against its amount and terms.
      if (before) {
        const usedCredit = supplierCredits.filter((c) => c.kind === "applied" && c.purchaseId === docId);
        if (usedCredit.length > 0 && (purchaseEditChangesReturnedFigures(before, p, locations) || (p.paymentMethod !== undefined && p.paymentMethod !== "credit"))) {
          throw new Error(
            `Supplier credit has been used on this bill, so its quantity, cost, tax and payment terms can't be changed. Delete the credit entry on the Suppliers page first, then edit it.`
          );
        }
      }
      const patch = { ...p };
      if (p.paymentMethod === "credit" && (p.date || before?.date)) {
        patch.dueDate = addDaysToDate(
          p.date ?? before!.date,
          p.creditTermDays ?? before?.creditTermDays ?? settings.defaultCreditTermDays
        );
      }
      // Emptying the expiry/batch boxes must really remove them (an undefined is silently skipped by Firestore).
      await updateDoc(doc(db, "users", bizId, "purchases", docId), clearListedUndefined(patch as Record<string, unknown>, ["expiryDate", "batchRef"]));
      // Same before → after shape as updateSale's audit entry, so an edited
      // purchase leaves an actual trace of what changed, not just that
      // *something* did — qty/cost are the two fields that move money.
      const beforeSummary = before ? `${before.qty} × ${formatMoneyPlain(before.unitCost)}` : "?";
      const afterSummary = `${p.qty ?? before?.qty} × ${formatMoneyPlain(p.unitCost ?? before?.unitCost ?? 0)}`;
      logAudit("purchase", docId, "update", `Purchase edited: ${beforeSummary} → ${afterSummary}`);
    },
    deletePurchase: async (docId) => {
      requirePermission("delete:records");
      // Same reason as deleteSale — an orphaned PayablePayment keeps
      // counting as cash paid out in payableSettlements forever.
      const childPayments = payablePayments.filter((p) => p.purchaseId === docId).map((p) => p.id);
      // Goods sent back against this purchase mean nothing without it (and
      // would keep taking stock out and counting refunds in).
      const childSupplierReturns = supplierReturns.filter((r) => r.purchaseId === docId).map((r) => r.id);
      // Supplier credit used on this bill goes with it (the credit is put back); credit this purchase's returns
      // created can't go if it has already been spent.
      const childCreditUses = supplierCredits.filter((c) => c.kind === "applied" && c.purchaseId === docId).map((c) => c.id);
      const blocked = validateRemovals({ returnIds: childSupplierReturns, entryIds: childCreditUses }, supplierReturns, supplierCredits);
      if (blocked) throw new Error(blocked);
      await cascadeDelete("purchases", docId, [
        { col: "payablePayments", ids: childPayments },
        { col: "supplierReturns", ids: childSupplierReturns },
        { col: "supplierCredits", ids: childCreditUses },
      ]);
      logAudit(
        "purchase",
        docId,
        "delete",
        "Purchase deleted" +
          (childPayments.length > 0
            ? ` (and ${childPayments.length} linked supplier payment${childPayments.length === 1 ? "" : "s"})`
            : "") +
          (childSupplierReturns.length > 0
            ? ` (and ${childSupplierReturns.length} supplier return${childSupplierReturns.length === 1 ? "" : "s"})`
            : "")
      );
    },
    bulkAddPurchases: (rows) => chunkedBatchAdd("purchases", rows),

    addPurchaseOrder: async (po) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Above the owner's approval amount, the order waits for approval instead of being placed (lib/poApproval.ts).
      const awaiting = needsPoApproval(po.qtyOrdered, po.unitCost, settings.poApprovalAbove);
      const ref = await addDoc(collection(db, "users", bizId, "purchaseOrders"), {
        ...po,
        status: awaiting ? "awaiting_approval" : "ordered",
        createdAt: Date.now(),
      });
      logAudit("purchaseOrder", ref.id, "create", awaiting ? `Order waiting for approval: ${po.qtyOrdered} units` : `Order placed: ${po.qtyOrdered} units`);
    },
    updatePurchaseOrderApproval: async (docId, decision, note) => {
      requirePermission("manage:requests");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "purchaseOrders", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That order no longer exists.");
      const plan = decidePoApproval(snap.data() as PurchaseOrder, decision, { role: role ?? "", name: memberName ?? user?.email ?? "Unknown" }, Date.now(), note);
      if (!plan.ok) throw new Error(plan.error);
      await updateDoc(ref, plan.patch);
      logAudit("purchaseOrder", docId, "update", decision === "approved" ? "Order approved" : "Order rejected");
      if (decision === "approved") void postOpsEvent(user, businessId, "purchaseOrder.approved", docId);
    },
    updatePurchaseOrder: async (docId, po) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "purchaseOrders", docId), po);
      logAudit("purchaseOrder", docId, "update", "Order edited");
    },
    addDraftPurchaseOrders: async (orders) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      for (const o of orders) {
        const ref = await addDoc(collection(db, "users", bizId, "purchaseOrders"), {
          ...o,
          supplier: o.supplier || undefined,
          status: "draft",
          autoDrafted: true,
          orderDate: todayIso(),
          createdAt: Date.now(),
        });
        logAudit("purchaseOrder", ref.id, "create", `Draft order made for review: ${o.qtyOrdered} units`);
      }
    },
    sendDraftPurchaseOrder: async (docId) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "purchaseOrders", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That draft no longer exists.");
      const po = snap.data() as PurchaseOrder;
      if (po.status !== "draft") throw new Error("Only a draft can be sent.");
      // The same approval amount as any other order: above it, the order waits for the owner instead of being placed.
      const awaiting = needsPoApproval(po.qtyOrdered, po.unitCost, settings.poApprovalAbove);
      await updateDoc(ref, { status: awaiting ? "awaiting_approval" : "ordered" });
      logAudit("purchaseOrder", docId, "update", awaiting ? "Draft sent, waiting for approval" : "Draft sent and placed");
    },
    cancelPurchaseOrder: async (docId) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "purchaseOrders", docId), { status: "cancelled" });
      logAudit("purchaseOrder", docId, "update", "Order cancelled");
    },
    deletePurchaseOrder: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "purchaseOrders", docId));
      logAudit("purchaseOrder", docId, "delete", "Order deleted");
    },
    receivePurchaseOrder: async (docId, receipt) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const po = purchaseOrders.find((p) => p.id === docId);
      if (!po) throw new Error("Purchase order not found");

      // Input tax on what was actually received — same flat-rate
      // computation as a manual purchase (QuickStockForm), so a PO receipt
      // feeds the Tax summary identically to any other purchase.
      const receivedSubtotal = receipt.qtyReceived * receipt.receivedUnitCost;
      const receivedTax = taxFor(receivedSubtotal, products.find((pr) => pr.id === po.productId), settings);

      const batch = writeBatch(db);
      const purchaseRef = doc(collection(db, "users", bizId, "purchases"));
      batch.set(purchaseRef, {
        productId: po.productId,
        qty: receipt.qtyReceived,
        // All-in per-unit cost: the goods price plus the delivery costs spread over what arrived, so WAC, COGS and every
        // margin see what the stock really cost. Tax below stays on the goods alone, as before.
        unitCost: landedUnitCost(receipt.receivedUnitCost, receipt.qtyReceived, receipt.freightCost, receipt.customsCost, receipt.otherLandedCost),
        ...((receipt.freightCost ?? 0) + (receipt.customsCost ?? 0) + (receipt.otherLandedCost ?? 0) > 0
          ? {
              goodsUnitCost: receipt.receivedUnitCost,
              freightCost: receipt.freightCost || 0,
              customsCost: receipt.customsCost || 0,
              otherLandedCost: receipt.otherLandedCost || 0,
            }
          : {}),
        date: receipt.receivedDate,
        supplier: po.supplier ?? "",
        notes: po.notes ?? "",
        purchaseOrderId: po.id,
        taxAmount: receivedTax > 0 ? receivedTax : undefined,
        locationId: receipt.locationId || undefined,
        expiryDate: receipt.expiryDate || undefined,
        batchRef: receipt.batchRef?.trim() || undefined,
        createdAt: Date.now(),
      });
      const poRef = doc(db, "users", bizId, "purchaseOrders", docId);
      batch.update(poRef, {
        status: "received",
        receivedDate: receipt.receivedDate,
        qtyReceived: receipt.qtyReceived,
        receivedUnitCost: receipt.receivedUnitCost,
        receivingNote: receipt.receivingNote?.trim() || undefined,
      });
      await batch.commit();
      logAudit("purchaseOrder", docId, "update", `Order received: ${receipt.qtyReceived} units`);
    },
    bulkAddPurchaseOrders: (rows) => chunkedBatchAdd("purchaseOrders", rows),

    addSale: async (s) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const dueDate =
        s.paymentMethod === "credit"
          ? addDaysToDate(s.date, s.creditTermDays ?? settings.defaultCreditTermDays)
          : undefined;
      const base = {
        ...s,
        paymentMethod: s.paymentMethod ?? "cash",
        dueDate,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      };
      const ref = doc(collection(db, "users", bizId, "sales"));
      const counterRef = doc(db, "users", bizId, "meta", "invoiceCounter");
      // Tax-invoice number (v324, lib/invoiceNumber.ts). The counter and the sale are written in one transaction, so a failed save burns no number.
      if (isOfflineNow()) {
        // Offline (v326): saved now with numberPending; the pending pass gives it a number once this device is back online.
        await setDoc(ref, { ...base, numberPending: true });
      } else {
        let top = invoiceSeqFloor.current;
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(counterRef);
          const last = snap.exists() && typeof snap.data().last === "number" ? (snap.data().last as number) : 0;
          const r = assignInvoiceNos([{ invoiceId: s.invoiceId, date: s.date }], salesRaw, Math.max(last, invoiceSeqFloor.current));
          top = r.top;
          tx.set(counterRef, { last: r.top });
          tx.set(ref, { ...base, invoiceNo: r.nos[0] });
        });
        invoiceSeqFloor.current = top;
      }
      logAudit("sale", ref.id, "create", `Sale: ${s.qty} × ${formatMoneyPlain(s.unitPrice)}${s.paymentMethod === "credit" ? " (credit)" : ""}`);
    },
    addSales: async (list) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      if (list.length === 0) return;
      if (list.length > 200) throw new Error("That is too many lines for one sale.");
      // One transaction (or one batch offline), so goods and their delivery line, or every line of an invoice, are saved together or not at all.
      // createdAt steps up by a millisecond per line so the first line stays the invoice's primary line.
      const now = Date.now();
      const counterRef = doc(db, "users", bizId, "meta", "invoiceCounter");
      const refs = list.map(() => doc(collection(db, "users", bizId, "sales")));
      const rows = list.map((s) => ({ invoiceId: s.invoiceId, date: s.date }));
      const payloadFor = (s: (typeof list)[number], i: number, invoiceNo: string | undefined) => {
        const dueDate =
          s.paymentMethod === "credit"
            ? addDaysToDate(s.date, s.creditTermDays ?? settings.defaultCreditTermDays)
            : undefined;
        return {
          ...s,
          ...(invoiceNo ? { invoiceNo } : { numberPending: true }),
          paymentMethod: s.paymentMethod ?? "cash",
          dueDate,
          createdByUid: myUid,
          createdByName: memberName ?? user?.email ?? "Unknown",
          createdAt: now + i,
        };
      };
      if (isOfflineNow()) {
        // Offline (v326): saved now with numberPending; numbered once this device is back online.
        const batch = writeBatch(db);
        list.forEach((s, i) => batch.set(refs[i], payloadFor(s, i, undefined)));
        await batch.commit();
      } else {
        let top = invoiceSeqFloor.current;
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(counterRef);
          const last = snap.exists() && typeof snap.data().last === "number" ? (snap.data().last as number) : 0;
          const r = assignInvoiceNos(rows, salesRaw, Math.max(last, invoiceSeqFloor.current));
          top = r.top;
          tx.set(counterRef, { last: r.top });
          list.forEach((s, i) => tx.set(refs[i], payloadFor(s, i, r.nos[i])));
        });
        invoiceSeqFloor.current = top;
      }
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        logAudit("sale", refs[i].id, "create", `Sale: ${m.qty} × ${formatMoneyPlain(m.unitPrice)}${m.paymentMethod === "credit" ? " (credit)" : ""}`);
      }
    },
    updateSale: async (docId, s) => {
      requirePermission("delete:sales"); // editing a past sale is treated the same as delete — Owner/Manager territory, never Staff
      if (settings.issuedSalesLocked && !lockedSaleEditAllowed(s as Record<string, unknown>)) throw new Error(SALES_LOCKED_MESSAGE);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const before = sales.find((x) => x.id === docId);
      // Switching a credit sale to cash/card/bank once money has already
      // been collected against it double-counts that money: the full sale
      // amount starts landing in cashSalesRevenue for its own month while
      // every ReceivablePayment keeps landing in receivableCollections for
      // whichever month it was taken. Same for a write-off, which would
      // become bad debt on an invoice the books now claim was paid up
      // front. The collections are real records of cash that came in, so
      // the right move is to refuse the edit and let the owner decide,
      // rather than silently deleting payment history to make the flip fit.
      if (
        before &&
        (before.paymentMethod ?? "cash") === "credit" &&
        s.paymentMethod !== undefined &&
        s.paymentMethod !== "credit"
      ) {
        const collected = receivablePayments.filter((p) => p.saleId === docId).length;
        const writtenOff = receivableWriteOffs.filter((w) => w.saleId === docId).length;
        const depositUsed = customerDeposits.filter((c) => c.kind === "applied" && c.saleId === docId).length;
        if (depositUsed > 0) {
          throw new Error("A customer deposit has been used on this credit sale, so it can't be switched off credit. Delete the deposit use on the Customers page first, then edit it.");
        }
        if (collected + writtenOff > 0) {
          throw new Error(
            `This credit sale already has ${collected > 0 ? `${collected} payment${collected === 1 ? "" : "s"}` : ""}${
              collected > 0 && writtenOff > 0 ? " and " : ""
            }${writtenOff > 0 ? `${writtenOff} write-off${writtenOff === 1 ? "" : "s"}` : ""} recorded against it, so it can't be switched off credit — the money would be counted twice. Delete those records first if the sale really was paid up front.`
          );
        }
      }
      const patch = { ...s };
      if (s.paymentMethod === "credit" && (s.date || before?.date)) {
        patch.dueDate = addDaysToDate(s.date ?? before!.date, s.creditTermDays ?? before?.creditTermDays ?? settings.defaultCreditTermDays);
      }
      // Emptying the optional batch pick must really clear it (Firestore skips undefined), or an edited sale would keep a stale batch.
      await updateDoc(doc(db, "users", bizId, "sales", docId), clearListedUndefined(patch as Record<string, unknown>, ["batchPurchaseId", "serialNo", "saleChannel", "tipAmount", "promoCode", "promoOffAmount"]));
      const beforeSummary = before ? `${before.qty} × ${formatMoneyPlain(before.unitPrice)}` : "?";
      const afterSummary = `${s.qty ?? before?.qty} × ${formatMoneyPlain(s.unitPrice ?? before?.unitPrice ?? 0)}`;
      logAudit("sale", docId, "update", `Sale edited: ${beforeSummary} → ${afterSummary}`);
    },
    untagProjectRecord: async (kind, docId) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const collectionName = kind === "purchase" ? "purchases" : kind === "expense" ? "expenses" : "sales";
      await updateDoc(doc(db, "users", bizId, collectionName, docId), { projectId: deleteField() });
      logAudit(kind, docId, "update", `Untagged from project`);
    },

    deleteSale: async (docId) => {
      requirePermission("delete:sales");
      if (settings.issuedSalesLocked) throw new Error(SALES_LOCKED_MESSAGE);
      const existing = sales.find((s) => s.id === docId);
      if (existing?.invoiceNo) throw new Error("A numbered invoice cannot be deleted, because its number must stay in sequence. Correct it with a return.");
      // See cascadeDelete above — a sale's payments, write-offs, returns
      // and discounts have no meaning without it, and left behind they
      // keep distorting cash flow, bad debt and stock indefinitely.
      const childPayments = receivablePayments.filter((p) => p.saleId === docId).map((p) => p.id);
      const childWriteOffs = receivableWriteOffs.filter((w) => w.saleId === docId).map((w) => w.id);
      const childReturns = saleReturns.filter((r) => r.saleId === docId).map((r) => r.id);
      const childDiscounts = discounts.filter((d) => d.saleId === docId).map((d) => d.id);
      // A customer deposit used on this invoice goes with it (the deposit is put back on their balance).
      const childDepositUses = customerDeposits.filter((c) => c.kind === "applied" && c.saleId === docId).map((c) => c.id);
      // A booking recorded as this sale goes back to "Done, not yet a sale", so it can be recorded again if needed.
      const linkedBookings = bookings.filter((b) => b.saleId === docId).map((b) => b.id);
      const linkedLeads = leads.filter((l) => l.saleId === docId).map((l) => l.id);
      await cascadeDelete("sales", docId, [
        { col: "receivablePayments", ids: childPayments },
        { col: "receivableWriteOffs", ids: childWriteOffs },
        { col: "saleReturns", ids: childReturns },
        { col: "discounts", ids: childDiscounts },
        { col: "customerDeposits", ids: childDepositUses },
      ], linkedBookings, linkedLeads);
      const childCount =
        childPayments.length + childWriteOffs.length + childReturns.length + childDiscounts.length + childDepositUses.length +
        linkedBookings.length + linkedLeads.length;
      logAudit(
        "sale",
        docId,
        "delete",
        (existing ? `Sale deleted: ${existing.qty} × ${formatMoneyPlain(existing.unitPrice)}` : "Sale deleted") +
          (childCount > 0 ? ` (and ${childCount} linked payment/return/discount record${childCount === 1 ? "" : "s"})` : "")
      );
    },
    bulkAddSales: async (rows) => {
      requirePermission("manage:sales");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const row of chunk) {
          const ref = doc(collection(db, "users", bizId, "sales"));
          batch.set(ref, {
            ...row,
            paymentMethod: row.paymentMethod ?? "cash",
            createdByUid: myUid,
            createdByName: memberName ?? user?.email ?? "Unknown",
            createdAt: Date.now(),
          });
        }
        await batch.commit();
      }
    },

    addEstimate: async (e) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const payload = {
        ...e,
        status: "draft" as const,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      };
      const ref = await addDoc(collection(db, "users", bizId, "estimates"), payload);
      const total = e.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
      logAudit("estimate", ref.id, "create", `Estimate: ${formatMoneyPlain(total)}${e.customer ? ` for ${e.customer}` : ""}`);
    },
    updateEstimate: async (docId, e) => {
      requirePermission("manage:sales");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "estimates", docId), e);
      logAudit("estimate", docId, "update", "Estimate edited");
    },
    deleteEstimate: async (docId) => {
      requirePermission("delete:sales");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "estimates", docId));
      logAudit("estimate", docId, "delete", "Estimate deleted");
    },
    // Turns an accepted Estimate into real Sale rows — one per line, all
    // sharing a fresh invoiceId, exactly like MultiItemInvoiceForm — so
    // stock, WAC/COGS, and receivables aging all pick it up the normal way
    // from this point on. The Estimate itself just gets marked "converted"
    // with a pointer to the invoiceId it became; it's never deleted, so the
    // original offer stays on record.
    convertEstimateToInvoice: async (docId) => {
      requirePermission("manage:sales");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const estimate = estimates.find((x) => x.id === docId);
      if (!estimate) throw new Error("That estimate no longer exists");
      if (estimate.status === "converted") throw new Error("This estimate was already converted");
      if (estimate.lines.length === 0) throw new Error("This estimate has no line items to convert");
      const invoiceId = `est_${docId.slice(-6)}_${Date.now().toString(36)}`;
      const saleDate = todayIso();
      const creditTermDays = settings.defaultCreditTermDays;
      // Same dueDate computation addSale and generateInvoiceForSchedule both
      // use for a credit sale. Writing the Sale rows directly here (batch,
      // not addSale) means this has to be kept in sync by hand — without it,
      // Sale.dueDate stays undefined and every consumer that reads it
      // straight off the Sale (Invoices page's overdue flag, the printed
      // invoice's due-date line) silently treats the invoice as never
      // overdue / due immediately, while aging elsewhere falls back to
      // saleDate and starts counting it overdue right away — two different
      // wrong answers instead of the real credit-term due date.
      const dueDate = addDaysToDate(saleDate, creditTermDays);
      // Sales tax (VAT/GST): the printed estimate already shows it (see the
      // Estimates page), so the invoice it becomes has to carry the same
      // amount — otherwise the customer is quoted one total and invoiced a
      // lower one, and Statements' tax summary misses the output tax. Same
      // allocation as the multi-line invoice form: proportional to each
      // line's share of the subtotal, with the last line absorbing rounding
      // so the per-line amounts add up to the invoice's tax exactly.
      // Each line is taxed at its own item's rate (the shop rate unless the item sets one), the same as the quote showed.
      const estimateProducts = new Map(products.map((pr) => [pr.id, pr]));
      const batch = writeBatch(db);
      for (let i = 0; i < estimate.lines.length; i++) {
        const line = estimate.lines[i];
        const lineTax = taxFor(line.qty * line.unitPrice, estimateProducts.get(line.productId), settings);
        const saleRef = doc(collection(db, "users", bizId, "sales"));
        batch.set(saleRef, {
          productId: line.productId,
          qty: line.qty,
          unitPrice: line.unitPrice,
          ...(lineTax > 0.005 ? { taxAmount: lineTax } : {}),
          date: saleDate,
          customer: estimate.customer,
          customerContact: estimate.customerContact,
          notes: estimate.notes,
          paymentMethod: "credit",
          creditTermDays,
          dueDate,
          invoiceId,
          createdByUid: myUid,
          createdByName: memberName ?? user?.email ?? "Unknown",
          locationId: estimate.locationId || undefined,
          createdAt: Date.now(),
        });
      }
      batch.update(doc(db, "users", bizId, "estimates", docId), { status: "converted", convertedInvoiceId: invoiceId });
      await batch.commit();
      logAudit("estimate", docId, "update", `Converted to invoice (${estimate.lines.length} item${estimate.lines.length === 1 ? "" : "s"})`);
    },

    reviseEstimate: async (docId, e) => {
      requirePermission("manage:sales");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const original = estimates.find((x) => x.id === docId);
      if (!original) throw new Error("That estimate no longer exists");
      if (original.status === "converted") {
        throw new Error("This quote is already an invoice. Correct the invoice with a return or a credit instead, so the books stay right.");
      }
      if (original.supersededBy) throw new Error("This quote has already been revised. Revise the newest version instead.");
      if (e.lines.length === 0) throw new Error("A revised quote needs at least one line item");
      const newRef = doc(collection(db, "users", bizId, "estimates"));
      const batch = writeBatch(db);
      batch.set(newRef, {
        ...e,
        status: "draft" as const,
        revision: (original.revision ?? 1) + 1,
        revisionOf: docId,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      batch.update(doc(db, "users", bizId, "estimates", docId), { status: "revised", supersededBy: newRef.id });
      await batch.commit();
      logAudit("estimate", docId, "update", `Revised to version ${(original.revision ?? 1) + 1}; replaced by ${newRef.id}`);
      return newRef.id;
    },

    addLead: async (l) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      // contactKeys: the phone and email this lead can be matched by, so a repeat enquiry lands on it (lib/leadIntake.ts).
      const payload = {
        ...l,
        stage: "new" as const,
        contactKeys: contactKeysFor(l.contact, resolveAutomations(settings.automations).defaultCountryCode),
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      };
      const ref = await addDoc(collection(db, "users", bizId, "leads"), payload);
      logAudit("lead", ref.id, "create", `Lead: ${l.name}`);
    },
    bulkAddLeads: async (rows) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      if (rows.length === 0) return;
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const createdByName = memberName ?? user?.email ?? "Unknown";
      const now = Date.now();
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const row of rows.slice(i, i + BATCH_SIZE)) {
          batch.set(doc(collection(db, "users", bizId, "leads")), {
            ...row,
            stage: "new" as const,
            createdByUid: myUid,
            createdByName,
            createdAt: now,
          });
        }
        await batch.commit();
      }
      logAudit("lead", "import", "create", `Imported ${rows.length} lead${rows.length === 1 ? "" : "s"} from a CSV`);
    },
    updateLead: async (docId, l) => {
      requirePermission("manage:sales");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "leads", docId);
      if (l.stage !== undefined && l.stage !== "won") {
        const cur = await getDoc(ref);
        if (cur.exists()) {
          const problem = leadStageProblem(cur.data() as Lead, l.stage);
          if (problem) throw new Error(problem);
        }
      }
      // Automations (Integrations page, all off by default). Each only fills a date that is not already set, and the
      // stage change itself is what the owner made. Nothing is sent.
      const auto = resolveAutomations(settings.automations);
      const prev = leads.find((x) => x.id === docId);
      const patch: Partial<Lead> = { ...l };
      if (l.contact !== undefined) patch.contactKeys = contactKeysFor(l.contact, auto.defaultCountryCode);
      if (l.stage === "lost" && prev?.stage !== "lost" && l.revisitOn === undefined && auto.autoRevisitLostDays > 0) {
        patch.revisitOn = addDaysIso(opsToday(), auto.autoRevisitLostDays);
      }
      if (l.stage === "proposal_sent" && prev?.stage !== "proposal_sent" && !prev?.nextFollowUpDate && !l.nextFollowUpDate && auto.autoFollowUpAfterProposalDays > 0) {
        patch.nextFollowUpDate = addDaysIso(opsToday(), auto.autoFollowUpAfterProposalDays);
      }
      await updateDoc(ref, patch);
      if (patch.stage && prev && patch.stage !== prev.stage && auto.outboundWebhookUrl) {
        void postLeadStageChange(user, businessId, docId, prev.stage, patch.stage);
      }
      logAudit("lead", docId, "update", l.stage ? `Lead moved to: ${l.stage}` : "Lead edited");
    },
    logLeadContact: async (docId, patch) => {
      requirePermission("log:leadContact");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "leads", docId), patch);
      logAudit("lead", docId, "update", "Contact logged");
    },
    deleteLead: async (docId) => {
      requirePermission("delete:sales");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "leads", docId);
      const cur = await getDoc(ref);
      if (cur.exists()) {
        const problem = leadDeleteProblem(cur.data() as Lead);
        if (problem) throw new Error(problem);
      }
      await deleteDoc(ref);
      logAudit("lead", docId, "delete", "Lead deleted");
    },

    addSaleReturn: async (r) => {
      requirePermission("manage:sales");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const sale = sales.find((s) => s.id === r.saleId);
      if (!sale) throw new Error("That sale no longer exists");
      const alreadyReturned = saleReturns
        .filter((x) => x.saleId === r.saleId)
        .reduce((sum, x) => sum + x.qty, 0);
      if (alreadyReturned + r.qty > sale.qty) {
        throw new Error("Can't return more than was sold on that sale");
      }
      const ref = await addDoc(collection(db, "users", bizId, "saleReturns"), {
        ...r,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit(
        "saleReturn",
        ref.id,
        "create",
        `Return: ${r.qty} unit${r.qty === 1 ? "" : "s"}, ${formatMoneyPlain(r.refundAmount)} refunded${r.restock ? " (restocked)" : " (written off)"}`
      );
    },
    deleteSaleReturn: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = saleReturns.find((r) => r.id === docId);
      await deleteDoc(doc(db, "users", bizId, "saleReturns", docId));
      logAudit("saleReturn", docId, "delete", existing ? `Return deleted: ${existing.qty} unit(s), ${formatMoneyPlain(existing.refundAmount)}` : "Return deleted");
    },

    addSupplierReturn: async (r) => {
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const purchase = purchases.find((x) => x.id === r.purchaseId);
      if (!purchase) throw new Error("That purchase no longer exists");
      const qty = Number(r.qty);
      const creditAmount = Number(r.creditAmount);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Enter how many units are going back to the supplier");
      if (!Number.isFinite(creditAmount) || creditAmount < 0) throw new Error("The refund or credit can't be negative");
      const prior = supplierReturns.filter((x) => x.purchaseId === purchase.id);
      const alreadySentBack = prior.reduce((sum, x) => sum + x.qty, 0);
      if (alreadySentBack + qty > purchase.qty + 1e-9) {
        throw new Error(
          `Only ${Math.max(purchase.qty - alreadySentBack, 0)} unit${purchase.qty - alreadySentBack === 1 ? "" : "s"} from that purchase can still go back — ${alreadySentBack} already returned.`
        );
      }
      if (r.date < purchase.date) {
        throw new Error(`That purchase was on ${purchase.date}, so goods can't go back before it. Use that date or later.`);
      }
      const ledger = ledgers.get(purchase.productId);
      if (ledger && qty > Math.max(ledger.qtyOnHand, 0) + 1e-9) {
        throw new Error(
          `You only have ${Math.max(ledger.qtyOnHand, 0)} in stock, so ${qty} can't go back. If some of it was already sold, record a stock adjustment or a customer return first.`
        );
      }
      const locationId = r.locationId || purchase.locationId || undefined;
      if (locationId) {
        const here = locationStockLevels.find((l) => l.productId === purchase.productId && l.locationId === locationId);
        if (here && qty > Math.max(here.qtyOnHand, 0) + 1e-9) {
          throw new Error(`That location only has ${Math.max(here.qtyOnHand, 0)} in stock. Transfer stock there first, or pick the location it is in.`);
        }
      }
      const taxAmount = supplierReturnTaxFor(purchase, qty, prior);
      // A return dated before a later sale would leave that sale without stock.
      const candidate = {
        id: "new", purchaseId: purchase.id, productId: purchase.productId, qty, unitCost: purchase.unitCost, creditAmount,
        settlement: r.settlement, reason: r.reason, date: r.date, createdAt: Date.now(),
      } as SupplierReturn;
      if (
        supplierReturnCausesOversell(
          purchases.filter((x) => x.productId === purchase.productId),
          sales.filter((x) => x.productId === purchase.productId),
          saleReturns.filter((x) => x.productId === purchase.productId),
          stockAdjustments.filter((x) => x.productId === purchase.productId),
          supplierReturns.filter((x) => x.productId === purchase.productId),
          candidate,
          settings.costingMethod ?? "average"
        )
      ) {
        throw new Error("Sending these back on that date would leave a later sale without stock to cover it. Use the date they actually left, or a later one.");
      }
      if (r.settlement === "hold_credit") {
        if (!purchase.supplier?.trim()) {
          throw new Error("Name the supplier on that purchase first, so the credit can be kept against them.");
        }
        if (r.date > todayIso()) throw new Error("Credit held with a supplier can't be dated in the future.");
      }
      if (r.settlement === "reduce_payable") {
        if (purchase.paymentMethod !== "credit") {
          throw new Error("Only a purchase bought on credit has a bill to reduce. Record this one as a refund.");
        }
        const outstanding = payablesAging.lines.find((l) => l.purchaseId === purchase.id)?.amountOutstanding ?? 0;
        if (creditAmount + taxAmount > outstanding + 0.005) {
          throw new Error(
            `Only ${formatMoneyPlain(outstanding)} is still owed on that bill, but this credit is ${formatMoneyPlain(creditAmount + taxAmount)}. Record the part you were already charged for as a refund instead.`
          );
        }
      }
      const payload: Record<string, unknown> = {
        purchaseId: purchase.id,
        productId: purchase.productId,
        qty,
        unitCost: purchase.unitCost,
        creditAmount,
        settlement: r.settlement,
        reason: r.reason,
        date: r.date,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      };
      if (taxAmount > 0) payload.taxAmount = taxAmount;
      if (r.settlement === "refund") payload.refundMethod = r.refundMethod ?? "cash";
      if (purchase.supplier) payload.supplier = purchase.supplier;
      if (r.notes) payload.notes = r.notes;
      if (locationId) payload.locationId = locationId;
      const ref = await addDoc(collection(db, "users", bizId, "supplierReturns"), payload);
      const product = products.find((p) => p.id === purchase.productId);
      logAudit(
        "supplierReturn",
        ref.id,
        "create",
        `Sent back to supplier: ${qty} × ${product?.name ?? "item"}, ${formatMoneyPlain(creditAmount + taxAmount)} ${r.settlement === "refund" ? "refunded" : r.settlement === "hold_credit" ? "kept as credit with the supplier" : "off the bill"}`
      );
    },
    deleteSupplierReturn: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = supplierReturns.find((r) => r.id === docId);
      // Credit kept from this return may already have been used on a bill or refunded.
      const blocked = validateRemovals({ returnIds: [docId] }, supplierReturns, supplierCredits);
      if (blocked) throw new Error(blocked);
      await deleteDoc(doc(db, "users", bizId, "supplierReturns", docId));
      logAudit(
        "supplierReturn",
        docId,
        "delete",
        existing ? `Supplier return deleted: ${existing.qty} unit(s), ${formatMoneyPlain(existing.creditAmount)}` : "Supplier return deleted"
      );
    },

    addDiscount: async (d) => {
      requirePermission("manage:sales");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const sale = sales.find((s) => s.id === d.saleId);
      if (!sale) throw new Error("That sale no longer exists");
      const ref = await addDoc(collection(db, "users", bizId, "discounts"), {
        ...d,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("discount", ref.id, "create", `Discount: ${formatMoneyPlain(d.amount)} off`);
    },
    deleteDiscount: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = discounts.find((d) => d.id === docId);
      await deleteDoc(doc(db, "users", bizId, "discounts", docId));
      logAudit("discount", docId, "delete", existing ? `Discount deleted: ${formatMoneyPlain(existing.amount)}` : "Discount deleted");
    },

    addStockAdjustment: async (a) => {
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "stockAdjustments"), {
        ...a,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      const product = products.find((p) => p.id === a.productId);
      logAudit(
        "stockAdjustment",
        ref.id,
        "create",
        `Stock adjustment: ${product?.name ?? a.productId} ${a.qty > 0 ? "+" : ""}${a.qty} (${a.reason})`
      );
    },
    recordStockCount: async (counts, opts) => {
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const multiLocation = locations.filter((l) => l.active).length > 1;
      const locationId = multiLocation ? opts?.locationId || undefined : undefined;
      const lines = counts.map((c) => {
        const product = products.find((p) => p.id === c.productId);
        if (!product) throw new Error("An item in this count no longer exists. Reload and count again.");
        if (product.type !== "product") throw new Error(`${product.name} is a service: there is no stock to count.`);
        const system = locationId
          ? locationStockLevels.find((l) => l.productId === c.productId && l.locationId === locationId)?.qtyOnHand ?? 0
          : ledgers.get(c.productId)?.qtyOnHand ?? 0;
        return { productId: c.productId, counted: c.counted, system };
      });
      const plan = planStockCount(lines);
      if (plan.adjustments.length === 0) throw new Error("Nothing to record: every counted item matches the books.");
      const date = todayIso();
      const note = `Stock count ${date}${opts?.notes?.trim() ? `: ${opts.notes.trim()}` : ""}`;
      const batch = writeBatch(db);
      for (const a of plan.adjustments) {
        batch.set(doc(collection(db, "users", bizId, "stockAdjustments")), {
          productId: a.productId,
          qty: a.qty,
          reason: "count_correction",
          date,
          notes: note,
          ...(locationId ? { locationId } : {}),
          createdByUid: myUid,
          createdByName: memberName ?? user?.email ?? "Unknown",
          createdAt: Date.now(),
        });
      }
      await batch.commit();
      logAudit("stockAdjustment", "count", "create", `Stock count: ${plan.adjustments.length} item${plan.adjustments.length === 1 ? "" : "s"} adjusted, ${plan.matching} matched`);
      return plan.adjustments.length;
    },
    deleteStockAdjustment: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = stockAdjustments.find((a) => a.id === docId);
      await deleteDoc(doc(db, "users", bizId, "stockAdjustments", docId));
      logAudit("stockAdjustment", docId, "delete", existing ? `Adjustment deleted: ${existing.qty > 0 ? "+" : ""}${existing.qty}` : "Adjustment deleted");
    },

    addSupplierCredit: async (e) => {
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const amount = Number(e.amount);
      if (e.date > todayIso()) throw new Error("Supplier credit can't be dated in the future.");
      let billSupplier: string | undefined;
      let billOutstanding: number | undefined;
      if (e.kind === "applied") {
        const line = payablesAging.lines.find((l) => l.purchaseId === e.purchaseId);
        billSupplier = line?.supplier;
        billOutstanding = line?.amountOutstanding ?? 0;
        if (!line) throw new Error("That bill is already paid, or no longer exists.");
      }
      const problem = validateNewCreditEntry(
        { supplier: e.supplier, kind: e.kind, amount, date: e.date, purchaseId: e.purchaseId, billOutstanding, billSupplier },
        supplierReturns,
        supplierCredits
      );
      if (problem) throw new Error(problem);
      const payload: Record<string, unknown> = {
        supplier: e.supplier.trim(),
        kind: e.kind,
        amount,
        date: e.date,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      };
      if (e.kind !== "applied") payload.method = e.method ?? "cash";
      if (e.kind === "applied") payload.purchaseId = e.purchaseId;
      if (e.notes) payload.notes = e.notes;
      const ref = await addDoc(collection(db, "users", bizId, "supplierCredits"), payload);
      const verb = e.kind === "deposit" ? "paid in advance" : e.kind === "applied" ? "used on a bill" : "refunded to you";
      logAudit("supplierCredit", ref.id, "create", `Supplier credit: ${formatMoneyPlain(amount)} ${verb} (${e.supplier.trim()})`);
    },
    deleteSupplierCredit: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = supplierCredits.find((c) => c.id === docId);
      const blocked = validateRemovals({ entryIds: [docId] }, supplierReturns, supplierCredits);
      if (blocked) throw new Error(blocked);
      await deleteDoc(doc(db, "users", bizId, "supplierCredits", docId));
      logAudit("supplierCredit", docId, "delete", existing ? `Supplier credit entry deleted: ${formatMoneyPlain(existing.amount)} (${existing.kind})` : "Supplier credit entry deleted");
    },
    addCustomerDeposit: async (e) => {
      // Owner/Manager, the same trust line as supplier credit and the Firestore rules: it moves cash and the balance sheet.
      // The one exception is selling a gift card at the counter, which staff may do (create only; see firestore.rules).
      requirePermission(e.kind === "received" && e.giftCardCode ? "create:giftCard" : "manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const amount = Number(e.amount);
      if (e.date > todayIso()) throw new Error("A customer deposit can't be dated in the future.");
      let invoiceCustomer: string | undefined;
      let invoiceOutstanding: number | undefined;
      if (e.kind === "applied") {
        const line = receivablesAging.lines.find((l) => l.saleIds.includes(e.saleId ?? ""));
        const item = line?.items.find((i) => i.saleId === e.saleId);
        invoiceCustomer = line?.customer;
        invoiceOutstanding = item?.amountOutstanding ?? 0;
        if (!line || !item) throw new Error("That invoice is already paid, or no longer exists.");
      }
      // A gift card's balance may pay any customer's invoice (bearer card); every other balance must match the customer.
      const bearer = isGiftCardCustomer(e.customer, customerDeposits);
      const problem = validateNewDepositEntry(
        { customer: e.customer, kind: e.kind, amount, date: e.date, saleId: e.saleId, invoiceOutstanding, invoiceCustomer, bearer },
        customerDeposits
      );
      if (problem) throw new Error(problem);
      if (e.giftCardCode) {
        if (e.kind !== "received") throw new Error("Only the money taken for a gift card carries its code.");
        if (customerDeposits.some((c) => c.giftCardCode === e.giftCardCode)) throw new Error("That gift card code is already in use.");
      }
      const payload: Record<string, unknown> = {
        customer: e.customer.trim(),
        kind: e.kind,
        amount,
        date: e.date,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      };
      if (e.kind !== "applied") payload.method = e.method ?? "cash";
      if (e.kind === "applied") payload.saleId = e.saleId;
      if (e.giftCardCode) payload.giftCardCode = e.giftCardCode;
      if (e.notes) payload.notes = e.notes;
      const ref = await addDoc(collection(db, "users", bizId, "customerDeposits"), payload);
      const verb = e.kind === "received" ? "received in advance" : e.kind === "applied" ? "used on an invoice" : "refunded to them";
      logAudit("customerDeposit", ref.id, "create", `Customer deposit: ${formatMoneyPlain(amount)} ${verb} (${e.customer.trim()})`);
    },
    markReviewed: async (key) => {
      // Owner/Manager: looking at a large team-made entry. Not money, so not period-locked.
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      await setDoc(doc(db, "users", bizId, "reviewMarks", key), {
        checkedAt: Date.now(),
        checkedByUid: myUid,
        checkedByName: memberName ?? user?.email ?? "Unknown",
      });
      logAudit("reviewMark", key, "create", "Marked as checked");
    },
    deleteCustomerDeposit: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = customerDeposits.find((c) => c.id === docId);
      const blocked = validateDepositRemovals([docId], customerDeposits);
      if (blocked) throw new Error(blocked);
      await deleteDoc(doc(db, "users", bizId, "customerDeposits", docId));
      logAudit("customerDeposit", docId, "delete", existing ? `Customer deposit entry deleted: ${formatMoneyPlain(existing.amount)} (${existing.kind})` : "Customer deposit entry deleted");
    },
    addStockOut: async (r) => {
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "stockOuts"), {
        ...r,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      const product = products.find((p) => p.id === r.productId);
      logAudit("stockOut", ref.id, "create", `Lost sale: ${product?.name ?? r.productId} × ${r.qty} (out of stock)`);
    },
    deleteStockOut: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "stockOuts", docId));
      logAudit("stockOut", docId, "delete", "Lost sale deleted");
    },
    addPlaybookEntry: async (e) => {
      requirePermission("manage:playbook");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "playbook"), {
        ...e,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("playbook", ref.id, "create", `Playbook ${e.kind}: ${e.title}`);
    },
    updatePlaybookEntry: async (docId, e) => {
      requirePermission("manage:playbook");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // setDoc with merge would keep a cleared optional field; replace the editable fields outright instead, so an
      // end date or review schedule that was removed in the form is really removed. Who wrote it and when stay.
      const ref = doc(db, "users", bizId, "playbook", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That entry no longer exists.");
      const old = snap.data() as PlaybookEntry;
      await setDoc(ref, {
        ...e,
        createdByUid: old.createdByUid ?? null,
        createdByName: old.createdByName ?? null,
        createdAt: old.createdAt,
        updatedAt: Date.now(),
      });
      logAudit("playbook", docId, "update", `Playbook ${e.kind} edited: ${e.title}`);
    },
    deletePlaybookEntry: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "playbook", docId));
      logAudit("playbook", docId, "delete", "Playbook entry deleted");
    },
    // ---- v176 operations (lib/operations.ts). Each write loads the current record and applies the same rules the page
    // shows, refusing what they refuse. None of these posts to the books or moves stock. ----
    addRequest: async (input) => {
      requirePermission("create:request");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const problem = validateRequestInput(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "requests"), {
        ...cleanRequestInput(input),
        ...(input.kind === "payment" && input.payload ? { payload: input.payload } : {}),
        status: "pending",
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("request", ref.id, "create", `Request (${input.kind}): ${input.title}`);
    },
    updateRequestStatus: async (docId, status) => {
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "requests", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That request no longer exists.");
      const req = { id: docId, ...snap.data() } as BusinessRequest;
      const now = Date.now();
      const plan =
        status === "cancelled"
          ? cancelRequestPlan(req, myUid, now)
          : decideRequestPlan(req, status, { role: role ?? "", name: memberName ?? user?.email ?? "Unknown" }, now, settings.managerApprovalLimit, myUid);
      if (!plan.ok) throw new Error(plan.error);
      // A shift change that is approved moves the rota shift to the person taking it, in the same write as the decision, so the two
      // cannot disagree. If the shift has gone from the rota, the approval is refused rather than approved against nothing.
      if (status === "approved" && req.kind === "shift" && req.shiftId) {
        const shiftRef = doc(db, "users", bizId, "shifts", req.shiftId);
        const shiftSnap = await getDoc(shiftRef);
        if (!shiftSnap.exists()) throw new Error("That shift is no longer on the rota. Decline the request, or change the rota by hand.");
        if (req.coverEmployeeId) {
          const batch = writeBatch(db);
          batch.update(shiftRef, { employeeId: req.coverEmployeeId, employeeName: req.coverEmployeeName ?? "", note: `Swapped (request: ${req.title})` });
          batch.update(ref, plan.patch);
          await batch.commit();
          logAudit("request", docId, "update", `Shift swapped and request approved: ${req.title}`);
          return;
        }
      }
      // A supplier payment that is approved is recorded now, by the approver, as the supplier payment it was asked to be.
      if (status === "approved" && req.kind === "payment" && req.payload) {
        const { paymentType, ...pay } = req.payload as Record<string, unknown>;
        // Bill payments go to bill payments; supplier payments (the default) to supplier payments.
        await addDoc(collection(db, "users", bizId, paymentType === "bill" ? "billPayments" : "payablePayments"), {
          ...pay,
          createdByUid: req.createdByUid ?? myUid,
          createdByName: req.createdByName ?? "Unknown",
          approvedByUid: myUid,
          approvedByName: memberName ?? user?.email ?? "Unknown",
          createdAt: Date.now(),
        });
        logAudit("payablePayment", docId, "create", `Supplier payment approved by a second signer: ${req.title}`);
      }
      await updateDoc(ref, plan.patch);
      logAudit("request", docId, "update", `Request ${status}: ${req.title}`);
    },
    updateRequestReimbursed: async (docId) => {
      requirePermission("manage:requests");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "requests", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That request no longer exists.");
      const req = { id: docId, ...snap.data() } as BusinessRequest;
      const plan = reimburseClaimPlan(req, Date.now());
      if (!plan.ok) throw new Error(plan.error);
      await updateDoc(ref, plan.patch);
      logAudit("request", docId, "update", `Expense claim marked reimbursed: ${req.title}`);
    },
    deleteRequest: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "requests", docId));
      logAudit("request", docId, "delete", "Request deleted");
    },
    addProcedure: async (input) => {
      requirePermission("manage:procedures");
      const { businessId: bizId } = requireBusiness();
      const problem = validateProcedure(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "procedures"), stripUndefined({
        title: input.title.replace(/\s+/g, " ").trim(),
        body: input.body,
        version: 1,
        reviewEveryDays: input.reviewEveryDays,
        videoUrl: videoUrlOrUndefined(input.videoUrl),
        lastReviewed: input.markReviewed ? opsToday() : undefined,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      }));
      logAudit("procedure", ref.id, "create", `Procedure: ${input.title}`);
    },
    updateProcedure: async (docId, input) => {
      requirePermission("manage:procedures");
      const { businessId: bizId } = requireBusiness();
      const problem = validateProcedure(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "procedures", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That procedure no longer exists.");
      const old = snap.data() as StaffProcedure;
      // Editing the title or steps makes a new version, so the team must read it again; the acknowledgements stay and go stale.
      const version = nextVersion(old, { title: input.title, body: input.body });
      await updateDoc(ref, updateFields({
        title: input.title.replace(/\s+/g, " ").trim(),
        body: input.body,
        version,
        reviewEveryDays: input.reviewEveryDays,
        videoUrl: videoUrlOrUndefined(input.videoUrl),
        lastReviewed: input.markReviewed ? opsToday() : old.lastReviewed,
        updatedAt: Date.now(),
      }));
      logAudit("procedure", docId, "update", version !== old.version ? `Procedure ${input.title}: new version ${version}` : `Procedure edited: ${input.title}`);
    },
    updateProcedureAck: async (docId) => {
      requirePermission("ack:procedure");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "procedures", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That procedure no longer exists.");
      const proc = { id: docId, ...snap.data() } as StaffProcedure;
      const plan = acknowledgePlan(proc, { uid: myUid, name: memberName ?? user?.email ?? "Unknown", role: role ?? "" }, Date.now());
      if (!plan.ok) throw new Error(plan.error);
      await updateDoc(ref, plan.patch);
      logAudit("procedure", docId, "update", `Read: ${proc.title} (version ${proc.version})`);
    },
    deleteProcedure: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "procedures", docId));
      logAudit("procedure", docId, "delete", "Procedure deleted");
    },
    addCompliance: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateCompliance(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "compliance"), stripUndefined({
        name: input.name.trim(),
        category: input.category,
        expiresOn: input.expiresOn,
        issuedOn: input.issuedOn || undefined,
        holder: input.holder?.trim() || undefined,
        reminderDays: input.reminderDays,
        documentUrl: input.documentUrl || undefined,
        createdAt: now,
        updatedAt: now,
      }));
      logAudit("compliance", ref.id, "create", `Compliance: ${input.name}`);
    },
    updateCompliance: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateCompliance(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "compliance", docId), updateFields({
        name: input.name.trim(),
        category: input.category,
        expiresOn: input.expiresOn,
        issuedOn: input.issuedOn || undefined,
        holder: input.holder?.trim() || undefined,
        reminderDays: input.reminderDays,
        documentUrl: input.documentUrl || undefined,
        updatedAt: Date.now(),
      }));
      logAudit("compliance", docId, "update", `Compliance edited: ${input.name}`);
    },
    deleteCompliance: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "compliance", docId));
      logAudit("compliance", docId, "delete", "Compliance item deleted");
    },
    addIncident: async (input) => {
      requirePermission("create:incident");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const problem = validateIncident(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "incidents"), stripUndefined({
        kind: input.kind,
        date: input.date,
        place: input.place?.trim() || undefined,
        description: input.description.trim(),
        severity: input.severity,
        actionTaken: input.actionTaken?.trim() || undefined,
        status: "open",
        reportedByUid: myUid,
        reportedByName: memberName ?? user?.email ?? "Unknown",
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      }));
      logAudit("incident", ref.id, "create", `Incident (${input.kind}) on ${input.date}`);
      void postOpsEvent(user, businessId, "incident.opened", ref.id);
    },
    updateIncident: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateIncident(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "incidents", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That incident no longer exists.");
      const old = snap.data() as Incident;
      const closing = input.status === "closed" && old.status !== "closed";
      const reopening = input.status === "open" && old.status === "closed";
      await updateDoc(ref, updateFields({
        kind: input.kind,
        date: input.date,
        place: input.place?.trim() || undefined,
        description: input.description.trim(),
        severity: input.severity,
        actionTaken: input.actionTaken?.trim() || undefined,
        status: input.status,
        closedAt: closing ? Date.now() : reopening ? undefined : old.closedAt,
        updatedAt: Date.now(),
      }));
      logAudit("incident", docId, "update", closing ? "Incident closed" : reopening ? "Incident reopened" : "Incident edited");
    },
    deleteIncident: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "incidents", docId));
      logAudit("incident", docId, "delete", "Incident deleted");
    },
    addMaintenance: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateMaintenance(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "maintenance"), stripUndefined({
        name: input.name.trim(),
        intervalDays: input.intervalDays,
        intervalKm: input.intervalKm,
        currentKm: input.currentKm,
        log: [],
        createdAt: now,
        updatedAt: now,
      }));
      logAudit("maintenance", ref.id, "create", `Equipment: ${input.name}`);
    },
    updateMaintenance: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateMaintenance(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "maintenance", docId), updateFields({
        name: input.name.trim(),
        intervalDays: input.intervalDays,
        intervalKm: input.intervalKm,
        currentKm: input.currentKm,
        updatedAt: Date.now(),
      }));
      logAudit("maintenance", docId, "update", `Equipment edited: ${input.name}`);
    },
    logMaintenanceDone: async (docId, input) => {
      requirePermission("log:maintenance");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "maintenance", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That item no longer exists.");
      const item = { id: docId, ...snap.data() } as MaintenanceItem;
      const plan = maintenanceDonePlan(item, input, { name: memberName ?? user?.email ?? "Unknown" }, opsToday(), newOpsId());
      if (!plan.ok) throw new Error(plan.error);
      await updateDoc(ref, { ...plan.patch, updatedAt: Date.now() });
      logAudit("maintenance", docId, "update", `Service logged: ${item.name} on ${input.date}`);
    },
    deleteMaintenance: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "maintenance", docId));
      logAudit("maintenance", docId, "delete", "Equipment deleted");
    },
    addKpi: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateKpi(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "kpis"), {
        name: input.name.trim(),
        ownerName: input.ownerName?.trim() || undefined,
        decisionQuestion: input.decisionQuestion?.trim() || undefined,
        timing: input.timing === "leading" || input.timing === "lagging" ? input.timing : undefined,
        amberPct: input.amberPct,
        source: input.source,
        unit: input.unit.trim(),
        target: input.target,
        direction: input.direction,
        period: input.period,
        readings: [],
        createdAt: now,
        updatedAt: now,
      });
      logAudit("kpi", ref.id, "create", `KPI: ${input.name}`);
    },
    updateKpi: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateKpi(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "kpis", docId), {
        name: input.name.trim(),
        ownerName: input.ownerName?.trim() || undefined,
        decisionQuestion: input.decisionQuestion?.trim() || undefined,
        timing: input.timing === "leading" || input.timing === "lagging" ? input.timing : undefined,
        amberPct: input.amberPct,
        source: input.source,
        unit: input.unit.trim(),
        target: input.target,
        direction: input.direction,
        period: input.period,
        updatedAt: Date.now(),
      });
      logAudit("kpi", docId, "update", `KPI edited: ${input.name}`);
    },
    recordKpiReading: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "kpis", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That measure no longer exists.");
      const kpi = { id: docId, ...snap.data() } as KpiMeasure;
      const plan = recordKpiReadingPlan(kpi, input, newOpsId());
      if (!plan.ok) throw new Error(plan.error);
      await updateDoc(ref, { ...plan.patch, updatedAt: Date.now() });
      logAudit("kpi", docId, "update", `Figure recorded for ${kpi.name}`);
    },
    deleteKpi: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "kpis", docId));
      logAudit("kpi", docId, "delete", "KPI deleted");
    },
    addReview: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateReview(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "reviews"), stripUndefined({
        employeeId: input.employeeId,
        employeeName: input.employeeName.trim(),
        date: input.date,
        rating: input.rating,
        strengths: input.strengths?.trim() || undefined,
        improvements: input.improvements?.trim() || undefined,
        goals: cleanGoals(input.goals, newOpsId),
        nextReviewOn: input.nextReviewOn || undefined,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      }));
      logAudit("review", ref.id, "create", `Review of ${input.employeeName} on ${input.date}`);
    },
    updateReview: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateReview(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "reviews", docId), updateFields({
        employeeId: input.employeeId,
        employeeName: input.employeeName.trim(),
        date: input.date,
        rating: input.rating,
        strengths: input.strengths?.trim() || undefined,
        improvements: input.improvements?.trim() || undefined,
        goals: cleanGoals(input.goals, newOpsId),
        nextReviewOn: input.nextReviewOn || undefined,
        updatedAt: Date.now(),
      }));
      logAudit("review", docId, "update", `Review edited: ${input.employeeName}`);
    },
    deleteReview: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "reviews", docId));
      logAudit("review", docId, "delete", "Review deleted");
    },
    // ---- v177e risk and quality (lib/riskQuality.ts). Nothing here posts to the books or moves stock. ----
    addRisk: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateRisk(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "risks"), stripUndefined({
        title: input.title.trim(),
        category: input.category,
        likelihood: input.likelihood,
        impact: input.impact,
        status: input.status,
        description: input.description?.trim() || undefined,
        mitigation: input.mitigation?.trim() || undefined,
        ownerName: input.ownerName?.trim() || undefined,
        reviewOn: input.reviewOn || undefined,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      }));
      logAudit("risk", ref.id, "create", `Risk: ${input.title}`);
    },
    updateRisk: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateRisk(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "risks", docId), updateFields({
        title: input.title.trim(),
        category: input.category,
        likelihood: input.likelihood,
        impact: input.impact,
        status: input.status,
        description: input.description?.trim() || undefined,
        mitigation: input.mitigation?.trim() || undefined,
        ownerName: input.ownerName?.trim() || undefined,
        reviewOn: input.reviewOn || undefined,
        updatedAt: Date.now(),
      }));
      logAudit("risk", docId, "update", `Risk edited: ${input.title}`);
    },
    deleteRisk: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "risks", docId));
      logAudit("risk", docId, "delete", "Risk deleted");
    },
    addQualityCheck: async (input) => {
      requirePermission("log:quality");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const problem = validateQualityCheck(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "qualityChecks"), stripUndefined({
        title: input.title.trim(),
        date: input.date,
        area: input.area,
        result: input.result,
        defectsFound: input.defectsFound,
        defectNote: input.defectNote?.trim() || undefined,
        correctiveAction: input.correctiveAction?.trim() || undefined,
        actionOwner: input.actionOwner?.trim() || undefined,
        actionDueOn: input.actionDueOn || undefined,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      }));
      logAudit("quality", ref.id, "create", `Quality check (${input.result}): ${input.title}`);
    },
    updateQualityCheck: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateQualityCheck(input);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "qualityChecks", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That check no longer exists.");
      const old = snap.data() as QualityCheck;
      if (input.actionDoneOn) {
        const closing = closeActionProblem(old, input.actionDoneOn);
        if (closing) throw new Error(closing);
      }
      await updateDoc(ref, updateFields({
        title: input.title.trim(),
        date: input.date,
        area: input.area,
        result: input.result,
        defectsFound: input.defectsFound,
        defectNote: input.defectNote?.trim() || undefined,
        correctiveAction: input.correctiveAction?.trim() || undefined,
        actionOwner: input.actionOwner?.trim() || undefined,
        actionDueOn: input.actionDueOn || undefined,
        actionDoneOn: input.actionDoneOn === undefined ? old.actionDoneOn : input.actionDoneOn || undefined,
        updatedAt: Date.now(),
      }));
      logAudit("quality", docId, "update", input.actionDoneOn ? "Corrective action marked done" : `Quality check edited: ${input.title}`);
    },
    deleteQualityCheck: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "qualityChecks", docId));
      logAudit("quality", docId, "delete", "Quality check deleted");
    },
    // ---- v182 business log (lib/businessLog.ts): competitors, objectives, correspondence, inspections. Nothing here posts or moves stock. ----
    addLogEntry: async (input) => {
      requirePermission(
        input.kind === "correspondence" ? "log:correspondence"
          : input.kind === "waitlist" || input.kind === "backorder" ? "log:demand"
          : input.kind === "handover" ? "log:handover"
          : "manage:operations"
      );
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const problem = validateLogEntry(input, opsToday());
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "businessLog"), stripUndefined({
        ...logPatch(input),
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      }));
      logAudit("businessLog", ref.id, "create", `${input.kind}: ${input.title}`);
    },
    updateLogEntry: async (docId, input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateLogEntry(input, opsToday());
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "businessLog", docId), updateFields({ ...logPatch(input), updatedAt: Date.now() }));
      logAudit("businessLog", docId, "update", `${input.kind} edited: ${input.title}`);
    },
    addAccrual: async (input) => {
      requirePermission("manage:expenses");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const problem = validateAccrual({ name: input.name, amount: input.amount, category: input.category, periodMonth: input.periodMonth }, settings.booksClosedThrough);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "accruals"), stripUndefined({
        name: input.name.trim(),
        amount: Math.round(input.amount * 100) / 100,
        category: input.category,
        periodMonth: input.periodMonth,
        accrualDate: periodEnd(input.periodMonth),
        reversalDate: firstOfNextMonth(input.periodMonth),
        notes: input.notes?.trim() || undefined,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      }));
      logAudit("accrual", ref.id, "create", `Accrued ${input.amount}: ${input.name.trim()} (${input.periodMonth})`);
    },
    deleteAccrual: async (docId) => {
      requirePermission("manage:expenses");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "accruals", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That accrual no longer exists.");
      const a = snap.data() as Accrual;
      if (isPeriodClosed(a.accrualDate, settings.booksClosedThrough) || isPeriodClosed(a.reversalDate, settings.booksClosedThrough)) {
        throw new Error("That month is closed, so this accrual can't be removed.");
      }
      await deleteDoc(ref);
      logAudit("accrual", docId, "delete", `Accrual removed: ${a.name}`);
    },
    updateLogStatus: async (docId, status) => {
      requirePermission("log:demand");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "businessLog", docId), { status, updatedAt: Date.now() });
      logAudit("businessLog", docId, "update", `Status: ${status}`);
    },
    recordInspectionDone: async (docId, doneOn) => {
      requirePermission("log:quality");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "businessLog", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That inspection no longer exists.");
      const insp = snap.data() as BusinessLogEntry;
      const problem = inspectionDoneProblem(insp, doneOn, opsToday());
      if (problem) throw new Error(problem);
      await updateDoc(ref, { lastDoneOn: doneOn, updatedAt: Date.now() });
      logAudit("businessLog", docId, "update", `Inspection done: ${insp.title} on ${doneOn}`);
    },
    deleteLogEntry: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "businessLog", docId));
      logAudit("businessLog", docId, "delete", "Log entry deleted");
    },
    // ---- v183 web orders (lib/webOrders.ts). The owner matches lines and confirms; recording the sales is done by addSale (above). ----
    addImprovement: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateImprovement({ title: input.title, owner: input.owner, dueDate: input.dueDate, source: input.source });
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "improvements"), stripUndefined({
        title: input.title.trim(), source: input.source, owner: input.owner.trim(), dueDate: input.dueDate, status: "open", notes: input.notes?.trim() || undefined,
      }));
      logAudit("improvement", ref.id, "create", `Improvement: ${input.title.trim()} (owner ${input.owner.trim()}, by ${input.dueDate})`);
    },
    setImprovementStatus: async (docId, status) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "improvements", docId), stripUndefined({ status, doneOn: status === "done" ? todayIso() : undefined }));
      logAudit("improvement", docId, "update", `Improvement ${status}`);
    },
    deleteImprovement: async (docId) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "improvements", docId));
      logAudit("improvement", docId, "delete", "Improvement removed");
    },
    addAlternative: async (input) => {
      requirePermission("manage:suppliers");
      const { businessId: bizId } = requireBusiness();
      const problem = validateAlternative({ productId: input.productId, alternative: input.alternative, quoteUnitCost: input.quoteUnitCost });
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "supplierAlternatives"), stripUndefined({
        productId: input.productId, currentSupplier: input.currentSupplier.trim(), alternative: input.alternative.trim(), quoteUnitCost: input.quoteUnitCost, status: "considering", notes: input.notes?.trim() || undefined,
      }));
      logAudit("supplierAlternative", ref.id, "create", `Alternative supplier considered: ${input.alternative.trim()}`);
    },
    setAlternativeStatus: async (docId, status) => {
      requirePermission("manage:suppliers");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "supplierAlternatives", docId), { status });
      logAudit("supplierAlternative", docId, "update", `Alternative ${status}`);
    },
    deleteAlternative: async (docId) => {
      requirePermission("manage:suppliers");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "supplierAlternatives", docId));
      logAudit("supplierAlternative", docId, "delete", "Alternative removed");
    },
    addContract: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateContract({ title: input.title, counterparty: input.counterparty, kind: input.kind, startDate: input.startDate, endDate: input.endDate });
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "contracts"), stripUndefined({ ...input, title: input.title.trim(), counterparty: input.counterparty.trim(), createdAt: Date.now() }));
      logAudit("contract", ref.id, "create", `Contract: ${input.title.trim()} with ${input.counterparty.trim()}`);
    },
    updateContract: async (docId, patch) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // An empty field is deleted from the record (not left as it was), so "make it open-ended" really clears the end date.
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) data[k] = v === undefined ? deleteField() : v;
      await updateDoc(doc(db, "users", bizId, "contracts", docId), data);
      logAudit("contract", docId, "update", "Contract changed");
    },
    deleteContract: async (docId) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "contracts", docId));
      logAudit("contract", docId, "delete", "Contract removed from the register");
    },
    addSustainabilityEntry: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateEntry({ date: input.date, category: input.category, amount: input.amount });
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "sustainabilityEntries"), stripUndefined({ ...input, createdAt: Date.now() }));
      logAudit("sustainability", ref.id, "create", `${input.category}: ${input.amount} on ${input.date}`);
    },
    deleteSustainabilityEntry: async (docId) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "sustainabilityEntries", docId));
      logAudit("sustainability", docId, "delete", "Sustainability entry removed");
    },
    setOrgLink: async (memberId, link) => {
      requirePermission("manage:team");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await setDoc(doc(db, "users", bizId, "orgLinks", memberId), stripUndefined({ reportsToId: link.reportsToId || undefined, deputyId: link.deputyId || undefined }));
      logAudit("orgLink", memberId, "update", "Reporting line or deputy changed");
    },
    addObligation: async (input) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const problem = validateObligation({ name: input.name, dueDate: input.dueDate, repeat: input.repeat });
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "obligations"), stripUndefined({
        name: input.name.trim(), dueDate: input.dueDate, repeat: input.repeat, notes: input.notes?.trim() || undefined, timesDone: 0,
      }));
      logAudit("obligation", ref.id, "create", `Deadline: ${input.name.trim()} (${input.dueDate})`);
    },
    completeObligation: async (docId, doneOn) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "obligations", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That deadline no longer exists.");
      const current = { id: docId, ...snap.data() } as Obligation;
      const moved = completeObligation(current, doneOn);
      await updateDoc(ref, stripUndefined({ dueDate: moved.dueDate, lastDoneOn: moved.lastDoneOn, timesDone: moved.timesDone }));
      logAudit("obligation", docId, "update", `${current.name}: done ${doneOn}, next due ${moved.dueDate}`);
    },
    deleteObligation: async (docId) => {
      requirePermission("manage:operations");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "obligations", docId));
      logAudit("obligation", docId, "delete", "Deadline removed");
    },
    addCandidate: async (input) => {
      requirePermission("manage:team");
      const { businessId: bizId } = requireBusiness();
      const problem = validateCandidate({ name: input.name, role: input.role, appliedOn: input.appliedOn }, todayIso());
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "candidates"), stripUndefined({
        name: input.name.trim(),
        role: input.role.trim(),
        source: input.source?.trim() || undefined,
        contact: input.contact?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        stage: "applied",
        stageDates: { applied: input.appliedOn },
        createdAt: Date.now(),
      }));
      logAudit("candidate", ref.id, "create", `Applied: ${input.name.trim()} for ${input.role.trim()}`);
    },
    moveCandidate: async (docId, to, onboardingStarted) => {
      requirePermission("manage:team");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "candidates", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That candidate no longer exists.");
      const current = { id: docId, ...snap.data() } as Candidate;
      if (to === "hired" && current.stage !== "hired") {
        const problem = hireProblem(current, todayIso());
        if (problem) throw new Error(problem);
      }
      const moved = moveStage(current, to, todayIso());
      const patch: Record<string, unknown> = { stage: moved.stage, stageDates: moved.stageDates };
      if (typeof onboardingStarted === "boolean") patch.onboardingStarted = onboardingStarted;
      await updateDoc(ref, patch);
      logAudit("candidate", docId, "update", `${current.name}: ${STAGE_LABEL[to]}`);
    },
    updateCandidateChecks: async (docId, checks) => {
      requirePermission("manage:team");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "candidates", docId), { checks: stripUndefined({ ...checks }) });
      logAudit("candidate", docId, "update", "Pre-hire checks recorded");
    },
    updateWebOrder: async (docId, patch) => {
      requirePermission("manage:sales");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "webOrders", docId), updateFields({
        ...patch,
        ...(patch.status && patch.status !== "new" ? { decidedAt: patch.decidedAt ?? Date.now(), decidedByName: patch.decidedByName ?? memberName ?? user?.email ?? "Unknown" } : {}),
      }));
      logAudit("webOrder", docId, "update", patch.status ? `Web order ${patch.status}` : "Web order lines matched");
    },
    deleteWebOrder: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "webOrders", docId));
      logAudit("webOrder", docId, "delete", "Web order deleted");
    },
    addSupportCase: async (c) => {
      requirePermission("manage:support");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "supportCases"), {
        ...c,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("support", ref.id, "create", `Support case opened: ${c.customerName}, ${c.subject}`);
    },
    updateSupportCase: async (docId, c) => {
      requirePermission("manage:support");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Replace the editable fields outright (a cleared resolution or a reopened case must really lose its old fields);
      // who opened it and when stay.
      const ref = doc(db, "users", bizId, "supportCases", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That case no longer exists.");
      const old = snap.data() as SupportCase;
      await setDoc(ref, {
        ...c,
        createdByUid: old.createdByUid ?? null,
        createdByName: old.createdByName ?? null,
        createdAt: old.createdAt,
        updatedAt: Date.now(),
      });
      logAudit("support", docId, "update", `Support case ${c.status === "resolved" ? "resolved" : "edited"}: ${c.customerName}, ${c.subject}`);
    },
    deleteSupportCase: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "supportCases", docId));
      logAudit("support", docId, "delete", "Support case deleted");
    },
    addFeedbackEntry: async (f) => {
      requirePermission("manage:support");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "feedback"), {
        ...f,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("feedback", ref.id, "create", `Customer feedback logged: ${f.customerName}, ${f.score}/10`);
    },
    updateFeedbackEntry: async (docId, f) => {
      requirePermission("manage:support");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Replace the editable fields outright (a removed comment must really go); who logged it and when stay.
      const ref = doc(db, "users", bizId, "feedback", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That feedback entry no longer exists.");
      const old = snap.data() as FeedbackEntry;
      await setDoc(ref, {
        ...f,
        createdByUid: old.createdByUid ?? null,
        createdByName: old.createdByName ?? null,
        createdAt: old.createdAt,
        updatedAt: Date.now(),
      });
      logAudit("feedback", docId, "update", `Customer feedback edited: ${f.customerName}, ${f.score}/10`);
    },
    setFeedbackTestimonial: async (docId, t) => {
      requirePermission("manage:support");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "feedback", docId), {
        testimonial: t ? { approved: true, quote: t.quote, displayName: t.displayName, approvedAt: Date.now() } : deleteField(),
      });
      logAudit("feedback", docId, "update", t ? "Testimonial approved for the website" : "Testimonial removed from the website");
    },
    deleteFeedbackEntry: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "feedback", docId));
      logAudit("feedback", docId, "delete", "Customer feedback deleted");
    },
    addBusinessTask: async (t) => {
      requirePermission("manage:tasks");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "tasks"), {
        ...t,
        status: "open",
        doneOn: null,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("task", ref.id, "create", `Task handed to ${t.assigneeName}: ${t.title}`);
    },
    updateBusinessTask: async (docId, t) => {
      requirePermission("manage:tasks");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Replace the editable fields outright; who set it, when, and whether it is done stay as they were.
      const ref = doc(db, "users", bizId, "tasks", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That task no longer exists.");
      const old = snap.data() as BusinessTask;
      await setDoc(ref, {
        ...t,
        status: old.status,
        doneOn: old.doneOn ?? null,
        createdByUid: old.createdByUid ?? null,
        createdByName: old.createdByName ?? null,
        createdAt: old.createdAt,
        updatedAt: Date.now(),
      });
      logAudit("task", docId, "update", `Task edited: ${t.title}`);
    },
    setBusinessTaskDone: async (docId, done, today) => {
      requirePermission("manage:tasks");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "tasks", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That task no longer exists.");
      await updateDoc(ref, { status: done ? "done" : "open", doneOn: done ? today : null, updatedAt: Date.now() });
      logAudit("task", docId, "update", done ? "Task marked done" : "Task reopened");
    },
    deleteBusinessTask: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "tasks", docId));
      logAudit("task", docId, "delete", "Task deleted");
    },
    addTab: async (table) => {
      // Taking an order is what staff do, so it needs the same permission as a sale.
      requirePermission("create:sale");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const problem = validateTabName(table, tabs.filter((t) => t.status === "open").map((t) => t.table));
      if (problem) throw new Error(problem);
      const ref = await addDoc(collection(db, "users", bizId, "tabs"), {
        table: cleanTabName(table),
        status: "open",
        lines: [],
        openedOn: todayIso(),
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      return ref.id;
    },
    updateTabLines: async (docId, lines: TabLine[]) => {
      requirePermission("create:sale");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = tabs.find((t) => t.id === docId);
      if (!existing || existing.status !== "open") throw new Error("That tab is already closed.");
      await updateDoc(doc(db, "users", bizId, "tabs", docId), { lines });
    },
    setTabTickets: async (docId, tickets) => {
      // Sending to the kitchen and moving a ticket along the board. Writes nothing to the books.
      requirePermission("create:sale");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = tabs.find((t) => t.id === docId);
      if (!existing || existing.status !== "open") throw new Error("That tab is already closed.");
      await updateDoc(doc(db, "users", bizId, "tabs", docId), { tickets });
    },
    payTabPart: async (docId, pick, o) => {
      // Pays for some items on an open tab. Those items are written as sales in one batch and taken off the tab; the rest stays
      // open, and the tab closes only when nothing is left on it. Same sales as closing the whole tab, so tax and stock match.
      requirePermission("create:sale");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const tab = tabs.find((t) => t.id === docId);
      if (!tab || tab.status !== "open") throw new Error("That tab is already closed.");
      const plan = partPaymentPlan(tab.lines, pick);
      if (plan.error) throw new Error(plan.error);
      const { sales: lines, error } = closingSales({ table: tab.table, lines: plan.paid }, o, settings);
      if (error || !lines) throw new Error(error ?? "These items can't be paid yet.");
      const batch = writeBatch(db);
      const now = Date.now();
      lines.forEach((s, i) => {
        const dueDate = s.paymentMethod === "credit" ? addDaysToDate(s.date, settings.defaultCreditTermDays) : undefined;
        batch.set(doc(collection(db, "users", bizId, "sales")), {
          ...s,
          paymentMethod: s.paymentMethod,
          dueDate,
          createdByUid: myUid,
          createdByName: memberName ?? user?.email ?? "Unknown",
          createdAt: now + i,
        });
      });
      if (plan.remaining.length === 0) {
        batch.update(doc(db, "users", bizId, "tabs", docId), { lines: [], status: "closed", closedOn: o.date, paidBy: o.paymentMethod });
      } else {
        batch.update(doc(db, "users", bizId, "tabs", docId), { lines: plan.remaining });
      }
      await batch.commit();
      logAudit(
        "tab",
        docId,
        "update",
        `Part of tab paid: ${tab.table}, ${formatMoneyPlain(tabTotal(plan.paid))}${plan.remaining.length === 0 ? ", tab closed" : ", the rest stays open"}`
      );
    },
    closeTab: async (docId, o) => {
      // Writes the sales and closes the tab in one batch, so a tab is never half paid. Goes through the period lock by date.
      requirePermission("create:sale");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const tab = tabs.find((t) => t.id === docId);
      if (!tab || tab.status !== "open") throw new Error("That tab is already closed.");
      const { sales: lines, error } = closingSales(tab, o, settings);
      if (error || !lines) throw new Error(error ?? "This tab can't be closed yet.");
      const batch = writeBatch(db);
      const now = Date.now();
      lines.forEach((s, i) => {
        const dueDate = s.paymentMethod === "credit" ? addDaysToDate(s.date, settings.defaultCreditTermDays) : undefined;
        batch.set(doc(collection(db, "users", bizId, "sales")), {
          ...s,
          paymentMethod: s.paymentMethod,
          dueDate,
          createdByUid: myUid,
          createdByName: memberName ?? user?.email ?? "Unknown",
          createdAt: now + i,
        });
      });
      batch.update(doc(db, "users", bizId, "tabs", docId), { status: "closed", closedOn: o.date, paidBy: o.paymentMethod });
      await batch.commit();
      logAudit("tab", docId, "update", `Tab closed: ${tab.table}, ${formatMoneyPlain(tabTotal(tab.lines))} (${lines.length} sale lines)`);
    },
    deleteTab: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const tab = tabs.find((t) => t.id === docId);
      if (tab && tab.status === "closed") throw new Error("A closed tab is part of the sales record, so it can't be deleted.");
      await deleteDoc(doc(db, "users", bizId, "tabs", docId));
      logAudit("tab", docId, "delete", `Tab deleted: ${tab?.table ?? docId}`);
    },
    addShift: async (i) => {
      requirePermission("manage:rota");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const problem = validateShift(i);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      await addDoc(collection(db, "users", bizId, "shifts"), {
        ...i,
        location: i.location || undefined,
        note: i.note || undefined,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("shift", i.employeeId, "create", `Shift: ${i.employeeName}, ${i.date} ${i.start}–${i.end}`);
    },
    updateShift: async (docId, i) => {
      requirePermission("manage:rota");
      const { businessId: bizId } = requireBusiness();
      const problem = validateShift(i);
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "shifts", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That shift no longer exists.");
      const old = snap.data() as ShiftEntry;
      await setDoc(ref, {
        ...i,
        location: i.location || null,
        note: i.note || null,
        createdByUid: old.createdByUid ?? null,
        createdByName: old.createdByName ?? null,
        createdAt: old.createdAt,
      });
      logAudit("shift", docId, "update", `Shift changed: ${i.employeeName}, ${i.date} ${i.start}–${i.end}`);
    },
    deleteShift: async (docId) => {
      requirePermission("manage:rota");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const old = shifts.find((s) => s.id === docId);
      await deleteDoc(doc(db, "users", bizId, "shifts", docId));
      logAudit("shift", docId, "delete", `Shift removed: ${old?.employeeName ?? docId}${old ? `, ${old.date} ${old.start}–${old.end}` : ""}`);
    },
    addShiftsForWeek: async (inputs) => {
      // One batch, so copying a week lands whole or not at all.
      requirePermission("manage:rota");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      for (const i of inputs) {
        const problem = validateShift(i);
        if (problem) throw new Error(problem);
      }
      const { db } = getFirebase();
      const batch = writeBatch(db);
      const now = Date.now();
      inputs.forEach((i, n) => {
        batch.set(doc(collection(db, "users", bizId, "shifts")), {
          ...i,
          location: i.location || undefined,
          note: i.note || undefined,
          createdByUid: myUid,
          createdByName: memberName ?? user?.email ?? "Unknown",
          createdAt: now + n,
        });
      });
      await batch.commit();
      logAudit("shift", "week", "create", `${inputs.length} shifts added`);
    },
    addEvent: async (e) => {
      requirePermission("manage:bookings");
      const problem = validateEventInput(e);
      if (problem) throw new Error(problem);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "events"), {
        ...e,
        ...(e.notes?.trim() ? { notes: e.notes.trim() } : {}),
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("event", ref.id, "create", `Event added: ${e.name} on ${e.date}`);
      return ref.id;
    },
    updateEvent: async (docId, e) => {
      requirePermission("manage:bookings");
      const problem = validateEventInput(e);
      if (problem) throw new Error(problem);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "events", docId), { ...e, notes: e.notes?.trim() || deleteField(), updatedAt: Date.now() });
      logAudit("event", docId, "update", `Event changed: ${e.name} on ${e.date}`);
    },
    deleteEvent: async (docId) => {
      requirePermission("manage:bookings");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ev = events.find((x) => x.id === docId);
      const problem = eventDeleteProblem(docId, sales);
      if (problem) throw new Error(problem);
      await deleteDoc(doc(db, "users", bizId, "events", docId));
      logAudit("event", docId, "delete", `Event deleted: ${ev?.name ?? docId}`);
    },
    addCheque: async (c) => {
      requirePermission("manage:collections");
      const problem = validateChequeInput(c);
      if (problem) throw new Error(problem);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "cheques"), {
        direction: c.direction,
        number: c.number.trim(),
        party: c.party.trim(),
        ...(c.bank?.trim() ? { bank: c.bank.trim() } : {}),
        amount: Math.round(c.amount * 100) / 100,
        chequeDate: c.chequeDate,
        entryDate: c.entryDate,
        status: c.status,
        ...(c.statusDate ? { statusDate: c.statusDate } : {}),
        ...(c.status === "returned" && c.returnReason?.trim() ? { returnReason: c.returnReason.trim() } : {}),
        ...(c.bankCharge !== undefined && c.bankCharge > 0 ? { bankCharge: Math.round(c.bankCharge * 100) / 100 } : {}),
        ...(c.saleId ? { saleId: c.saleId } : {}),
        ...(c.notes?.trim() ? { notes: c.notes.trim() } : {}),
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("cheque", ref.id, "create", `Cheque ${c.direction}: ${c.number.trim()} ${c.direction === "received" ? "from" : "to"} ${c.party.trim()}`);
      return ref.id;
    },
    updateCheque: async (docId, c) => {
      requirePermission("manage:collections");
      const problem = validateChequeInput(c);
      if (problem) throw new Error(problem);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "cheques", docId), {
        direction: c.direction,
        number: c.number.trim(),
        party: c.party.trim(),
        bank: c.bank?.trim() || deleteField(),
        amount: Math.round(c.amount * 100) / 100,
        chequeDate: c.chequeDate,
        entryDate: c.entryDate,
        status: c.status,
        statusDate: c.statusDate || deleteField(),
        returnReason: c.status === "returned" && c.returnReason?.trim() ? c.returnReason.trim() : deleteField(),
        bankCharge: c.bankCharge !== undefined && c.bankCharge > 0 ? Math.round(c.bankCharge * 100) / 100 : deleteField(),
        saleId: c.saleId || deleteField(),
        notes: c.notes?.trim() || deleteField(),
        updatedAt: Date.now(),
      });
      logAudit("cheque", docId, "update", `Cheque changed: ${c.number.trim()}`);
    },
    setChequeStatus: async (docId, to, opts) => {
      requirePermission("manage:collections");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const current = cheques.find((x) => x.id === docId);
      if (!current) throw new Error("That cheque could not be found.");
      const problem = transitionProblem(current, to, opts.date);
      if (problem) throw new Error(problem);
      if (to === "returned" && !(opts.returnReason ?? "").trim()) throw new Error("Enter the reason the bank gave for returning it.");
      if (opts.bankCharge !== undefined && (!Number.isFinite(opts.bankCharge) || opts.bankCharge < 0)) throw new Error("The bank charge cannot be negative.");
      await updateDoc(doc(db, "users", bizId, "cheques", docId), {
        status: to,
        statusDate: opts.date,
        returnReason: to === "returned" ? (opts.returnReason ?? "").trim().slice(0, 200) : deleteField(),
        bankCharge: to === "returned" && opts.bankCharge !== undefined && opts.bankCharge > 0 ? Math.round(opts.bankCharge * 100) / 100 : deleteField(),
        updatedAt: Date.now(),
      });
      logAudit("cheque", docId, "update", `Cheque ${current.number} marked ${to}`);
    },
    deleteCheque: async (docId) => {
      requirePermission("manage:collections");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const current = cheques.find((x) => x.id === docId);
      const problem = current ? chequeDeleteProblem(current) : null;
      if (problem) throw new Error(problem);
      await deleteDoc(doc(db, "users", bizId, "cheques", docId));
      logAudit("cheque", docId, "delete", `Cheque deleted: ${current?.number ?? docId}`);
    },
    addTrip: async (t) => {
      requirePermission("manage:collections");
      const problem = validateTripInput(t);
      if (problem) throw new Error(problem);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "mileage"), {
        ...cleanTrip(t),
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("trip", ref.id, "create", `Trip logged: ${t.vehicle.trim()} ${tripKm(t)} km on ${t.date}`);
      return ref.id;
    },
    updateTrip: async (docId, t) => {
      requirePermission("manage:collections");
      const problem = validateTripInput(t);
      if (problem) throw new Error(problem);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const c = cleanTrip(t);
      await updateDoc(doc(db, "users", bizId, "mileage", docId), {
        ...c,
        from: c.from ?? deleteField(),
        to: c.to ?? deleteField(),
        startOdometer: c.startOdometer ?? deleteField(),
        endOdometer: c.endOdometer ?? deleteField(),
        ratePerKm: c.ratePerKm ?? deleteField(),
        notes: c.notes ?? deleteField(),
        updatedAt: Date.now(),
      });
      logAudit("trip", docId, "update", `Trip changed: ${t.vehicle.trim()} on ${t.date}`);
    },
    deleteTrip: async (docId) => {
      requirePermission("manage:collections");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const current = trips.find((x) => x.id === docId);
      await deleteDoc(doc(db, "users", bizId, "mileage", docId));
      logAudit("trip", docId, "delete", `Trip deleted: ${current ? `${current.vehicle} on ${current.date}` : docId}`);
    },
    addMembership: async (m) => {
      requirePermission("manage:bookings");
      const problem = validateMembershipInput(m);
      if (problem) throw new Error(problem);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "memberships"), {
        customer: m.customer.trim(),
        plan: m.plan.trim(),
        hours: m.hours,
        startDate: m.startDate,
        endDate: m.endDate,
        ...(m.notes?.trim() ? { notes: m.notes.trim() } : {}),
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("membership", ref.id, "create", `Membership added: ${m.customer.trim()}, ${m.hours} h, ${m.startDate} to ${m.endDate}`);
      return ref.id;
    },
    updateMembership: async (docId, m) => {
      requirePermission("manage:bookings");
      const problem = validateMembershipInput(m);
      if (problem) throw new Error(problem);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Cutting the hours or dates below what bookings already use would leave them uncovered, so refuse it.
      const covered = bookings.filter((b) => b.membershipId === docId && b.status !== "cancelled" && b.status !== "no_show");
      const usedHours = covered.reduce((n, b) => n + b.durationMin / 60, 0);
      if (usedHours > m.hours + 1e-9) throw new Error(`Bookings already use ${Math.round(usedHours * 100) / 100} hours of this membership. It cannot hold fewer.`);
      const outside = covered.find((b) => b.date < m.startDate || b.date > m.endDate);
      if (outside) throw new Error(`A booking on ${outside.date} is covered by this membership, so the dates must include it.`);
      await updateDoc(doc(db, "users", bizId, "memberships", docId), {
        customer: m.customer.trim(),
        plan: m.plan.trim(),
        hours: m.hours,
        startDate: m.startDate,
        endDate: m.endDate,
        notes: m.notes?.trim() || deleteField(),
        updatedAt: Date.now(),
      });
      logAudit("membership", docId, "update", `Membership changed: ${m.customer.trim()}`);
    },
    deleteMembership: async (docId) => {
      requirePermission("manage:bookings");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const problem = membershipDeleteProblem({ id: docId }, bookings);
      if (problem) throw new Error(problem);
      const cur = memberships.find((x) => x.id === docId);
      await deleteDoc(doc(db, "users", bizId, "memberships", docId));
      logAudit("membership", docId, "delete", `Membership deleted: ${cur ? cur.customer : docId}`);
    },
    addFarmBatch: async (b) => {
      requirePermission("manage:bookings");
      const problem = validateBatchInput(b);
      if (problem) throw new Error(problem);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const num = (v: number | undefined, k: string) => (v !== undefined && Number.isFinite(v) ? { [k]: v } : {});
      const ref = await addDoc(collection(db, "users", bizId, "farmBatches"), {
        name: b.name.trim(), species: b.species.trim(),
        ...(b.unitLabel?.trim() ? { unitLabel: b.unitLabel.trim().slice(0, 20) } : {}),
        ...(b.location?.trim() ? { location: b.location.trim().slice(0, 80) } : {}),
        startDate: b.startDate, startCount: b.startCount, startAvgWeightG: b.startAvgWeightG, status: b.status,
        ...num(b.tempMinC, "tempMinC"), ...num(b.tempMaxC, "tempMaxC"), ...num(b.oxygenMinMgL, "oxygenMinMgL"),
        ...num(b.phMin, "phMin"), ...num(b.phMax, "phMax"), ...num(b.ammoniaMaxMgL, "ammoniaMaxMgL"),
        ...(b.notes?.trim() ? { notes: b.notes.trim().slice(0, 300) } : {}),
        entries: [],
        createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown", createdAt: now, updatedAt: now,
      });
      logAudit("farmBatch", ref.id, "create", `Batch started: ${b.name.trim()}, ${b.startCount} ${b.species.trim()}`);
      return ref.id;
    },
    updateFarmBatch: async (docId, b) => {
      requirePermission("manage:bookings");
      const problem = validateBatchInput(b);
      if (problem) throw new Error(problem);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const old = farmBatches.find((x) => x.id === docId);
      if (!old) throw new Error("That batch could not be found.");
      // Changing the stocking count must not leave fewer alive than have been lost or harvested.
      const alive = livePopulation(old) - old.startCount + b.startCount;
      if (alive < 0) throw new Error("Losses and harvests already recorded are more than that many. Raise the starting count.");
      if (old.entries.some((e) => e.date < b.startDate)) throw new Error("An entry is dated before that stocking date.");
      const keep = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : deleteField());
      await updateDoc(doc(db, "users", bizId, "farmBatches", docId), {
        name: b.name.trim(), species: b.species.trim(), unitLabel: b.unitLabel?.trim() || deleteField(), location: b.location?.trim() || deleteField(),
        startDate: b.startDate, startCount: b.startCount, startAvgWeightG: b.startAvgWeightG, status: b.status,
        tempMinC: keep(b.tempMinC), tempMaxC: keep(b.tempMaxC), oxygenMinMgL: keep(b.oxygenMinMgL), phMin: keep(b.phMin), phMax: keep(b.phMax), ammoniaMaxMgL: keep(b.ammoniaMaxMgL),
        notes: b.notes?.trim() || deleteField(), updatedAt: Date.now(),
      });
      logAudit("farmBatch", docId, "update", `Batch changed: ${b.name.trim()}`);
    },
    deleteFarmBatch: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const cur = farmBatches.find((x) => x.id === docId);
      if (cur && cur.entries.some((e) => e.kind === "harvest")) throw new Error("This batch has a harvest recorded, so it can't be deleted. Close it instead.");
      await deleteDoc(doc(db, "users", bizId, "farmBatches", docId));
      logAudit("farmBatch", docId, "delete", `Batch deleted: ${cur?.name ?? docId}`);
    },
    // One transaction, so two people logging at the same moment cannot overwrite each other's entry or both remove the last animals.
    addFarmEntry: async (batchId, e) => {
      requirePermission("manage:bookings");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "farmBatches", batchId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("That batch no longer exists.");
        const b = { id: snap.id, ...snap.data() } as FarmBatch;
        if (b.status !== "active") throw new Error("This batch is closed. Reopen it to add entries.");
        const problem = validateEntryInput(e, b, todayIso());
        if (problem) throw new Error(problem);
        const entry = cleanEntry(e, `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
        tx.update(ref, { entries: [...b.entries, entry], updatedAt: Date.now() });
      });
      logAudit("farmBatch", batchId, "update", `Batch entry: ${e.kind} on ${e.date}`);
    },
    deleteFarmEntry: async (batchId, entryId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "farmBatches", batchId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("That batch no longer exists.");
        const b = { id: snap.id, ...snap.data() } as FarmBatch;
        const rest = b.entries.filter((x) => x.id !== entryId);
        // Removing a transfer-in could leave more recorded losses than animals.
        const raw = b.startCount + rest.filter((x) => x.kind === "transfer_in").reduce((n, x) => n + (x.count ?? 0), 0)
          - rest.filter((x) => x.kind === "mortality" || x.kind === "cull" || x.kind === "harvest").reduce((n, x) => n + (x.count ?? 0), 0);
        if (raw < 0) throw new Error("Removing that entry would leave more losses than animals. Remove the later losses first.");
        tx.update(ref, { entries: rest, updatedAt: Date.now() });
      });
      logAudit("farmBatch", batchId, "update", "Batch entry removed");
    },
    addBooking: async (b) => {
      requirePermission("manage:bookings");
      // Staff cannot read memberships (so cannot check one); a booking they edit keeps its link, and the owner or manager checks it.
      if (b.membershipId && role !== "staff") {
        const cover = membershipCoverProblem(memberships.find((m) => m.id === b.membershipId), { customerName: b.customerName, date: b.date, durationMin: b.durationMin, status: b.status }, bookings);
        if (cover) throw new Error(cover);
      }
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "bookings"), {
        ...b,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("booking", ref.id, "create", `Booking added: ${b.customerName}, ${b.service} on ${b.date} ${b.startTime}`);
    },
    updateBooking: async (docId, b) => {
      requirePermission("manage:bookings");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "bookings", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That booking no longer exists.");
      const old = snap.data() as Booking;
      // Staff cannot read memberships (so cannot check one); a booking they edit keeps its link, and the owner or manager checks it.
      if (b.membershipId && role !== "staff") {
        const cover = membershipCoverProblem(memberships.find((m) => m.id === b.membershipId), { id: docId, customerName: b.customerName, date: b.date, durationMin: b.durationMin, status: b.status }, bookings);
        if (cover) throw new Error(cover);
      }
      const statusProblem = bookingStatusProblem(old, b.status);
      if (statusProblem) throw new Error(statusProblem);
      await setDoc(ref, {
        ...b,
        // A sale recorded from this booking stays linked, whatever the form sends.
        ...(old.saleId ? { saleId: old.saleId } : {}),
        createdByUid: old.createdByUid ?? null,
        createdByName: old.createdByName ?? null,
        createdAt: old.createdAt,
        updatedAt: Date.now(),
      });
      logAudit("booking", docId, "update", `Booking edited: ${b.customerName}, ${b.status}`);
    },
    recordBookingSale: async (bookingId, sale) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      requirePermission("manage:bookings");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const bookingRef = doc(db, "users", bizId, "bookings", bookingId);
      const saleRef = doc(collection(db, "users", bizId, "sales"));
      const now = Date.now();
      const who = memberName ?? user?.email ?? "Unknown";
      // One transaction: a booking can get one sale, even if two people press the button at the same moment.
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists()) throw new Error("That booking no longer exists.");
        const b = snap.data() as Booking;
        if (b.saleId) throw new Error("A sale is already recorded for this booking.");
        if (b.membershipId) throw new Error("A membership covers this booking, so there is no sale to record. The money was recorded when the membership was sold.");
        if (b.status !== "done") throw new Error("Mark the booking Done first. A sale is recorded once the service has been given.");
        tx.set(saleRef, {
          ...sale,
          paymentMethod: sale.paymentMethod ?? "cash",
          createdByUid: myUid,
          createdByName: who,
          createdAt: now,
        });
        tx.update(bookingRef, { saleId: saleRef.id, updatedAt: now });
      });
      logAudit("sale", saleRef.id, "create", `Sale from booking: ${sale.qty} × ${formatMoneyPlain(sale.unitPrice)}`);
      logAudit("booking", bookingId, "update", "Sale recorded from booking");
      return saleRef.id;
    },
    recordLeadSale: async (leadId, sale) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const leadRef = doc(db, "users", bizId, "leads", leadId);
      const saleRef = doc(collection(db, "users", bizId, "sales"));
      const now = Date.now();
      const who = memberName ?? user?.email ?? "Unknown";
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(leadRef);
        if (!snap.exists()) throw new Error("That lead no longer exists.");
        const l = snap.data() as Lead;
        const problem = leadSaleProblem(l);
        if (problem) throw new Error(problem);
        tx.set(saleRef, {
          ...sale,
          paymentMethod: sale.paymentMethod ?? "cash",
          createdByUid: myUid,
          createdByName: who,
          createdAt: now,
        });
        tx.update(leadRef, { saleId: saleRef.id });
      });
      logAudit("sale", saleRef.id, "create", `Sale from won lead: ${sale.qty} × ${formatMoneyPlain(sale.unitPrice)}`);
      logAudit("lead", leadId, "update", "Sale recorded from won lead");
      return saleRef.id;
    },
    addShipment: async (sh) => {
      requirePermission("manage:shipments");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const now = Date.now();
      const ref = await addDoc(collection(db, "users", bizId, "shipments"), {
        ...sh,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
        updatedAt: now,
      });
      logAudit("shipment", ref.id, "create", `Shipment added: ${sh.reference}, ${sh.stage}`);
    },
    updateShipment: async (docId, sh) => {
      requirePermission("manage:shipments");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "shipments", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That shipment no longer exists.");
      const old = snap.data() as Shipment;
      await setDoc(ref, {
        ...sh,
        createdByUid: old.createdByUid ?? null,
        createdByName: old.createdByName ?? null,
        createdAt: old.createdAt,
        updatedAt: Date.now(),
      });
      logAudit("shipment", docId, "update", `Shipment edited: ${sh.reference}, ${sh.stage}`);
    },
    deleteShipment: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "shipments", docId));
      logAudit("shipment", docId, "delete", "Shipment deleted");
    },
    addWorkOrder: async (w) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const problem = validateWorkOrder(w);
      if (problem) throw new Error(problem);
      const ref = doc(collection(db, "users", bizId, "workOrders"));
      const number = nextWorkOrderNumber(workOrders);
      const clean = {
        ...w,
        item: w.item.trim(),
        problem: w.problem?.trim() || undefined,
        customer: w.customer?.trim() || undefined,
        customerContact: w.customerContact?.trim() || undefined,
        notes: w.notes?.trim() || undefined,
        dueDate: w.dueDate || undefined,
      };
      await setDoc(ref, { ...clean, number, status: "open", createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown", createdAt: Date.now() });
      logAudit("workOrder", ref.id, "create", `${number} · ${clean.item}`);
    },
    updateWorkOrder: async (id, patch) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const current = workOrders.find((o) => o.id === id);
      if (!current) throw new Error("That job no longer exists.");
      if (patch.status && patch.status !== current.status && !canMove(current.status, patch.status)) {
        throw new Error("A job can't go from there to that status. Collected and cancelled jobs can't be reopened.");
      }
      if (current.estimateId && patch.lines) throw new Error("This job already has an estimate. Change the estimate instead.");
      const next = { ...patch, updatedAt: Date.now() };
      await updateDoc(doc(db, "users", bizId, "workOrders", id), next as Record<string, unknown>);
      logAudit("workOrder", id, "update", patch.status ? `${current.number} is now ${patch.status.replace("_", " ")}` : `${current.number} updated`);
    },
    makeEstimateFromWorkOrder: async (id) => {
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const order = workOrders.find((o) => o.id === id);
      if (!order) throw new Error("That job no longer exists.");
      if (order.estimateId) throw new Error("This job already has an estimate.");
      if (order.status === "cancelled") throw new Error("A cancelled job can't be turned into an estimate.");
      if (order.lines.length === 0) throw new Error("Add the labour and parts to the job first.");
      const estRef = doc(collection(db, "users", bizId, "estimates"));
      const now = Date.now();
      const batch = writeBatch(db);
      batch.set(estRef, {
        date: todayIso(),
        customer: order.customer,
        customerContact: order.customerContact,
        lines: estimateLinesFromJob(order),
        notes: `Work order ${order.number}: ${order.item}`,
        status: "draft",
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: now,
      });
      batch.update(doc(db, "users", bizId, "workOrders", id), { estimateId: estRef.id, updatedAt: now });
      await batch.commit();
      logAudit("workOrder", id, "update", `Estimate made from ${order.number}`);
    },
    deleteWorkOrder: async (id) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "workOrders", id));
      logAudit("workOrder", id, "delete", "Job deleted");
    },
    addConsignmentEntry: async (e) => {
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const problem = validateConsignment(e, consignments);
      if (problem) throw new Error(problem);
      const ref = doc(collection(db, "users", bizId, "consignments"));
      const clean = {
        ...e,
        partner: e.partner.trim(),
        productName: e.productName?.trim() || undefined,
        note: e.note?.trim() || undefined,
      };
      await setDoc(ref, { ...clean, createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown", createdAt: Date.now() });
      logAudit("consignment", ref.id, "create", `${clean.kind} · ${clean.partner}`);
    },
    deleteConsignmentEntry: async (id) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "consignments", id));
      logAudit("consignment", id, "delete", "Consignment entry deleted");
    },
    addElectronicsRecord: async (r) => {
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const problem = validateElectronics(r);
      if (problem) throw new Error(problem);
      const ref = doc(collection(db, "users", bizId, "businessRecords"));
      const label =
        r.kind === "licence" ? r.name.trim()
        : r.kind === "project" ? "R&D · " + r.name.trim()
        : r.kind === "tradein" ? "Trade-in · " + r.device.trim()
        : "Price drop · " + r.product.trim();
      const clean = { ...r, note: r.note?.trim() || undefined } as ElectronicsInput;
      if (clean.kind === "licence") clean.name = clean.name.trim();
      if (clean.kind === "tradein") clean.device = clean.device.trim();
      if (clean.kind === "pricedrop") clean.product = clean.product.trim();
      await setDoc(ref, { ...clean, createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown", createdAt: Date.now() });
      logAudit("businessRecord", ref.id, "create", label);
    },
    updateElectronicsStatus: async (id, status) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const rec = businessRecords.find((x) => x.id === id);
      if (!rec || rec.kind === "licence") throw new Error("Only trade-ins and price-drop claims have a status to change.");
      const allowed = rec.kind === "tradein" ? TRADE_IN_STATUSES : rec.kind === "project" ? PROJECT_STATUSES : PRICE_DROP_STATUSES;
      if (!(allowed as string[]).includes(status)) throw new Error("That status doesn't apply to this record.");
      await updateDoc(doc(db, "users", bizId, "businessRecords", id), { status });
      logAudit("businessRecord", id, "update", "Status set to " + status);
    },
    deleteElectronicsRecord: async (id) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "businessRecords", id));
      logAudit("businessRecord", id, "delete", "Licence, trade-in or price-drop record deleted");
    },
    addRental: async (r) => {
      requirePermission("manage:rentals");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const problem = validateRentalInput(r);
      if (problem) throw new Error(problem);
      const clean = cleanRentalInput(r);
      const now = Date.now();
      const by = { createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown" };
      const batch = writeBatch(db);
      const rentalRef = doc(collection(db, "users", bizId, "rentals"));
      let depositEntryId: string | undefined;
      if (clean.deposit) {
        // Taken today, so it is dated like any cash that came in today. The out date itself may be later (a booking ahead).
        const depRef = doc(collection(db, "users", bizId, "customerDeposits"));
        depositEntryId = depRef.id;
        batch.set(depRef, { customer: clean.customer, kind: "received", amount: clean.deposit, date: todayIso(), method: "cash", notes: `Rental deposit: ${clean.item}`, ...by, createdAt: now });
      }
      batch.set(rentalRef, { ...clean, ...(depositEntryId ? { depositEntryId } : {}), ...by, createdAt: now, updatedAt: now });
      await batch.commit();
      logAudit("rental", rentalRef.id, "create", `Rented out: ${clean.item} to ${clean.customer}`);
    },
    updateRental: async (docId, r) => {
      requirePermission("manage:rentals");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "rentals", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That rental no longer exists.");
      const old = snap.data() as Rental;
      if (old.returnedDate) throw new Error("A rental that has come back can't be edited. Its charge is already in the sales.");
      const problem = validateRentalInput(r);
      if (problem) throw new Error(problem);
      const clean = cleanRentalInput(r);
      if ((clean.deposit ?? 0) !== (old.deposit ?? 0)) {
        throw new Error("The deposit can't be changed once it is taken. Delete this rental and add it again to change the deposit.");
      }
      await setDoc(ref, {
        ...clean,
        ...(old.depositEntryId ? { depositEntryId: old.depositEntryId } : {}),
        createdByUid: old.createdByUid ?? null,
        createdByName: old.createdByName ?? null,
        createdAt: old.createdAt,
        updatedAt: Date.now(),
      });
      logAudit("rental", docId, "update", `Rental edited: ${clean.item}`);
    },
    deleteRental: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "rentals", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That rental no longer exists.");
      const old = snap.data() as Rental;
      if (old.returnedDate) throw new Error("A rental that has come back can't be deleted. Its charge is already in the sales.");
      const batch = writeBatch(db);
      if (old.depositEntryId) {
        const blocked = validateDepositRemovals([old.depositEntryId], customerDeposits);
        if (blocked) throw new Error(blocked);
        batch.delete(doc(db, "users", bizId, "customerDeposits", old.depositEntryId));
      }
      batch.delete(ref);
      await batch.commit();
      logAudit("rental", docId, "delete", `Rental deleted: ${old.item}`);
    },
    returnRental: async (docId, input) => {
      // One batch: the rental is marked back, the rent (and any damage) is posted as sales, and any refund is recorded, so a
      // return is either complete or not written at all.
      requirePermission("manage:rentals");
      requireAnyPermission(["manage:sales", "create:sale"]);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "rentals", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("That rental no longer exists.");
      const old = { id: docId, ...snap.data() } as Rental;
      if (old.returnedDate) throw new Error("This rental is already back.");
      const problem = validateReturnInput(old, input, todayIso());
      if (problem) throw new Error(problem);
      const charge = rentalCharge(old, input.returnedDate);
      const days = rentalDays(old.outDate, input.returnedDate);
      const late = lateDays(old, input.returnedDate);
      const damage = Math.round(Math.max(0, Number(input.damageCharge) || 0) * 100) / 100;
      const refund = Math.round(Math.max(0, Number(input.depositRefund) || 0) * 100) / 100;
      const method = input.paymentMethod ?? "cash";
      const note = input.damageNotes?.trim() ?? "";
      if (refund > 0) {
        const refundProblem = validateNewDepositEntry({ customer: old.customer, kind: "refunded", amount: refund, date: input.returnedDate }, customerDeposits);
        if (refundProblem) throw new Error(refundProblem);
      }
      const now = Date.now();
      const by = { createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown" };
      const batch = writeBatch(db);
      const saleBase = {
        customer: old.customer,
        ...(old.customerContact ? { customerContact: old.customerContact } : {}),
        date: input.returnedDate,
        paymentMethod: method,
        ...by,
      };
      const rentTax = deliveryTaxFor(charge, settings);
      batch.set(doc(collection(db, "users", bizId, "sales")), {
        ...saleBase,
        productId: old.incomeProductId,
        qty: days,
        unitPrice: old.dailyRate,
        notes: `Rent: ${old.item}, out ${old.outDate}, back ${input.returnedDate}${late > 0 ? ` (${late} day${late === 1 ? "" : "s"} past due)` : ""}`,
        ...(rentTax > 0 ? { taxAmount: rentTax } : {}),
        createdAt: now,
      });
      if (damage > 0) {
        const damageTax = deliveryTaxFor(damage, settings);
        batch.set(doc(collection(db, "users", bizId, "sales")), {
          ...saleBase,
          productId: old.incomeProductId,
          qty: 1,
          unitPrice: damage,
          notes: `Damage: ${old.item}${note ? ` · ${note}` : ""}`,
          ...(damageTax > 0 ? { taxAmount: damageTax } : {}),
          createdAt: now + 1,
        });
      }
      if (refund > 0) {
        batch.set(doc(collection(db, "users", bizId, "customerDeposits")), {
          customer: old.customer,
          kind: "refunded",
          amount: refund,
          date: input.returnedDate,
          method,
          notes: `Deposit back: ${old.item}`,
          ...by,
          createdAt: now,
        });
      }
      batch.update(ref, {
        returnedDate: input.returnedDate,
        charged: charge,
        ...(damage > 0 ? { damageCharge: damage } : {}),
        ...(note ? { damageNotes: note.slice(0, MAX_RENTAL_NOTES) } : {}),
        ...(refund > 0 ? { depositRefunded: Math.round(((old.depositRefunded ?? 0) + refund) * 100) / 100 } : {}),
        updatedAt: now,
      });
      await batch.commit();
      logAudit(
        "rental",
        docId,
        "update",
        `Returned: ${old.item}, rent ${formatMoneyPlain(charge)}${damage > 0 ? `, damage ${formatMoneyPlain(damage)}` : ""}${refund > 0 ? `, deposit refunded ${formatMoneyPlain(refund)}` : ""}`
      );
    },
    deleteBooking: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "bookings", docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const problem = bookingDeleteProblem(snap.data() as Booking);
        if (problem) throw new Error(problem);
      }
      await deleteDoc(ref);
      logAudit("booking", docId, "delete", "Booking deleted");
    },
    addLeaveRecord: async (r) => {
      requirePermission("manage:employees");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "leaveRecords"), {
        ...r,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("leave", ref.id, "create", `Leave logged: ${r.employeeName}, ${r.days} day${r.days === 1 ? "" : "s"} from ${r.from}`);
    },
    deleteLeaveRecord: async (docId) => {
      requirePermission("manage:employees");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "leaveRecords", docId));
      logAudit("leave", docId, "delete", "Leave record deleted");
    },

    addLocation: async (l) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "locations"), {
        ...l,
        active: true,
        isDefault: false,
        createdAt: Date.now(),
      });
      logAudit("location", ref.id, "create", `Location added: ${l.name}`);
    },
    updateLocation: async (docId, l) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // The default Location can be renamed but never deactivated — every
      // legacy (locationId-less) transaction resolves to it (see
      // resolveLocationId), so turning it off would silently orphan all of
      // a business's pre-multi-location history.
      const existing = locations.find((x) => x.id === docId);
      if (existing?.isDefault && l.active === false) {
        throw new Error("The default location can't be deactivated — historical records without a location depend on it.");
      }
      await updateDoc(doc(db, "users", bizId, "locations", docId), l);
      logAudit("location", docId, "update", l.name ? `Location renamed to ${l.name}` : "Location updated");
    },
    // Hard-deletes a Location — for a branch that was added by mistake and
    // never actually used. Deliberately narrow: the default Location can't
    // be removed (legacy locationId-less records resolve to it — see
    // resolveLocationId), and any Location with even one real transaction
    // against it is blocked rather than deleted, since that would silently
    // orphan the locationId on every Sale/Purchase/Estimate/adjustment/
    // return/transfer/recurring schedule that points at it. "Deactivate"
    // (updateLocation) remains the right move for a branch that closed
    // after real activity; this is only for the empty, never-used case.
    deleteLocation: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = locations.find((x) => x.id === docId);
      if (!existing) return;
      if (existing.isDefault) {
        throw new Error("The default location can't be deleted — historical records without a location depend on it.");
      }
      const inUse =
        sales.some((s) => s.locationId === docId) ||
        purchases.some((p) => p.locationId === docId) ||
        estimates.some((e) => e.locationId === docId) ||
        stockAdjustments.some((a) => a.locationId === docId) ||
        saleReturns.some((r) => r.locationId === docId) ||
        supplierReturns.some((r) => r.locationId === docId) ||
        recurringInvoices.some((r) => r.locationId === docId) ||
        stockTransfers.some((t) => t.fromLocationId === docId || t.toLocationId === docId);
      if (inUse) {
        throw new Error(
          "This location has transactions recorded against it, so it can't be deleted. Mark it Inactive instead."
        );
      }
      await deleteDoc(doc(db, "users", bizId, "locations", docId));
      logAudit("location", docId, "delete", `Location deleted: ${existing.name}`);
    },

    // Moves qty of a product from one Location to another. Never touches
    // revenue, COGS, or WAC — see StockTransfer in lib/types.ts. Blocks an
    // obviously-broken transfer (same source/destination, non-positive qty)
    // but deliberately does NOT block overdrawing a location's stock below
    // zero, matching the existing "allowed to oversell, surfaced in UI"
    // philosophy the WAC engine already uses for sales.
    // Opening balances — see OpeningBalance in lib/types.ts. Deliberately add +
    // delete only (no edit): the amount feeds owner's capital on the Balance
    // Sheet, so changing one in place would quietly rewrite equity. A wrong one
    // is deleted and re-entered, which leaves a plain audit trail.
    addOpeningBalance: async (o) => {
      requirePermission("manage:products");
      if (o.kind !== "receivable" && o.kind !== "payable") throw new Error("Choose owed to you or owed by you.");
      if (!(o.amount > 0) || !Number.isFinite(o.amount)) throw new Error("Amount must be greater than zero.");
      if (!o.party?.trim()) throw new Error(o.kind === "receivable" ? "Enter the customer's name." : "Enter the supplier's name.");
      if (!o.date) throw new Error("Enter the date you started using the app.");
      if (o.date > todayIso()) throw new Error("The opening date can't be in the future.");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const clean: Record<string, unknown> = {
        kind: o.kind,
        party: o.party.trim(),
        amount: o.amount,
        date: o.date,
        dueDate: o.dueDate || o.date,
      };
      if (o.contact?.trim()) clean.contact = o.contact.trim();
      if (o.note?.trim()) clean.note = o.note.trim();
      const ref = await addDoc(collection(db, "users", bizId, "openingBalances"), {
        ...clean,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit(
        "openingBalance",
        ref.id,
        "create",
        `Opening balance (${o.kind === "receivable" ? "owed to you" : "you owe"}): ${o.party.trim()} ${formatMoneyPlain(o.amount)}`
      );
    },
    deleteOpeningBalance: async (docId) => {
      requirePermission("delete:records");
      const before = openingBalances.find((x) => x.id === docId);
      // Same reason as deleteSale/deletePurchase: an orphaned payment keeps
      // counting as cash in or out forever. Collections/supplier payments and
      // write-offs keyed to this opening balance go with it.
      const childReceivable = receivablePayments.filter((p) => p.saleId === docId).map((p) => p.id);
      const childWriteOffs = receivableWriteOffs.filter((w) => w.saleId === docId).map((w) => w.id);
      const childPayable = payablePayments.filter((p) => p.purchaseId === docId).map((p) => p.id);
      // Supplier credit used on an opening-balance payable goes with it (the credit is put back). Left behind, it
      // would keep reducing the credit held while the bill it settled no longer exists.
      const childCreditUses = supplierCredits.filter((c) => c.kind === "applied" && c.purchaseId === docId).map((c) => c.id);
      // A customer deposit used on an opening-balance receivable goes with it (the deposit is put back).
      const childDepositUses = customerDeposits.filter((c) => c.kind === "applied" && c.saleId === docId).map((c) => c.id);
      await cascadeDelete("openingBalances", docId, [
        { col: "receivablePayments", ids: childReceivable },
        { col: "receivableWriteOffs", ids: childWriteOffs },
        { col: "payablePayments", ids: childPayable },
        { col: "supplierCredits", ids: childCreditUses },
        { col: "customerDeposits", ids: childDepositUses },
      ]);
      const kids = childReceivable.length + childWriteOffs.length + childPayable.length + childCreditUses.length + childDepositUses.length;
      logAudit(
        "openingBalance",
        docId,
        "delete",
        `Opening balance deleted${before ? `: ${before.party} ${formatMoneyPlain(before.amount)}` : ""}` +
          (kids > 0 ? ` (and ${kids} payment${kids === 1 ? "" : "s"}/write-off${kids === 1 ? "" : "s"} against it)` : "")
      );
    },
    addStockTransfer: async (t) => {
      requirePermission("manage:products");
      if (t.fromLocationId === t.toLocationId) {
        throw new Error("Source and destination locations must be different.");
      }
      if (!(t.qty > 0)) {
        throw new Error("Transfer quantity must be greater than zero.");
      }
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "stockTransfers"), {
        ...t,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      const product = products.find((p) => p.id === t.productId);
      const fromName = locations.find((x) => x.id === t.fromLocationId)?.name ?? t.fromLocationId;
      const toName = locations.find((x) => x.id === t.toLocationId)?.name ?? t.toLocationId;
      logAudit(
        "stockTransfer",
        ref.id,
        "create",
        `Stock transfer: ${t.qty} × ${product?.name ?? t.productId} from ${fromName} to ${toName}`
      );
    },

    addRecurringExpenseTemplate: async (t) => {
      requirePermission("manage:expenses");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "recurringExpenseTemplates"), {
        ...t,
        nextDueDate: t.startDate,
        createdAt: Date.now(),
      });
      logAudit(
        "recurringExpenseTemplate",
        ref.id,
        "create",
        `Recurring expense: ${t.name}, ${formatMoneyPlain(t.lines.reduce((s, l) => s + l.amount, 0))}/${t.recurrence}`
      );
    },
    updateRecurringExpenseTemplate: async (id, t) => {
      requirePermission("manage:expenses");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "recurringExpenseTemplates", id), t);
      logAudit("recurringExpenseTemplate", id, "update", `Recurring expense edited`);
    },
    deleteRecurringExpenseTemplate: async (id) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = recurringExpenseTemplates.find((x) => x.id === id);
      await deleteDoc(doc(db, "users", bizId, "recurringExpenseTemplates", id));
      logAudit("recurringExpenseTemplate", id, "delete", existing ? `Recurring expense deleted: ${existing.name}` : "Recurring expense deleted");
    },
    updateExpenseOccurrenceLines: async (id, lines) => {
      requirePermission("manage:expenses");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = recurringExpenseOccurrences.find((o) => o.id === id);
      if (!existing) throw new Error("That occurrence no longer exists");
      if (existing.status !== "pending") throw new Error("Already posted — edit the Expense itself instead");
      await updateDoc(doc(db, "users", bizId, "recurringExpenseOccurrences", id), { lines });
    },
    postExpenseOccurrence: async (id) => {
      requirePermission("manage:expenses");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const occurrence = recurringExpenseOccurrences.find((o) => o.id === id);
      if (!occurrence) throw new Error("That occurrence no longer exists");
      if (occurrence.status !== "pending") throw new Error("Already posted");
      const template = recurringExpenseTemplates.find((t) => t.id === occurrence.templateId);
      if (!template) throw new Error("The recurring expense this belongs to was deleted");
      const total = occurrence.lines.reduce((sum, l) => sum + l.amount, 0);

      const expenseRef = doc(collection(db, "users", bizId, "expenses"));
      const occurrenceRef = doc(db, "users", bizId, "recurringExpenseOccurrences", id);
      const templateRef = doc(db, "users", bizId, "recurringExpenseTemplates", template.id);
      const postedAt = Date.now();

      await runTransaction(db, async (tx) => {
        tx.set(expenseRef, {
          name: template.name,
          amount: total,
          category: template.category,
          kind: "expense",
          isRecurring: false, // a real, discrete, dated entry — not a projected one
          recurrence: "none",
          startDate: occurrence.period,
          breakdown: occurrence.lines,
          createdAt: postedAt,
        });
        tx.update(occurrenceRef, { status: "posted", expenseId: expenseRef.id, postedAt });
        tx.update(templateRef, { lastExpenseId: expenseRef.id });
      });

      logAudit("expense", expenseRef.id, "create", `${template.name} posted for ${occurrence.period}: ${formatMoneyPlain(total)}`);
    },
    discardExpenseOccurrence: async (id) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = recurringExpenseOccurrences.find((o) => o.id === id);
      if (existing?.status === "posted") throw new Error("Already posted — delete the Expense itself instead");
      await deleteDoc(doc(db, "users", bizId, "recurringExpenseOccurrences", id));
      logAudit("recurringExpenseTemplate", existing?.templateId ?? id, "delete", `Occurrence discarded for ${existing?.period ?? "?"}`);
    },

    fulfillOffer: async (productId, opts) => {
      requirePermission("manage:sales");
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const product = products.find((p) => p.id === productId);
      if (!product) throw new Error("Offer not found");
      const qty = opts.qty && opts.qty > 0 ? opts.qty : 1;
      const recipeLines = product.recipeLines ?? [];
      const recipeCostPerUnit = recipeLines.reduce((sum, l) => sum + l.amount, 0);
      const sellPrice = product.defaultSellPrice ?? 0;
      const { db } = getFirebase();
      const batch = writeBatch(db);

      // One aggregate cost entry per fulfillment (qty × the recipe's total
      // per-unit cost), not one Purchase per recipe line — a Purchase's qty
      // has to mean "units actually delivered" for the WAC engine above to
      // stay correct; splitting the recipe into several qty-N purchases
      // would multiply qtyOnHand by the number of lines. The line-by-line
      // breakdown is preserved in the Purchase's notes instead, so it's
      // still fully auditable.
      if (recipeLines.length > 0) {
        const purchaseRef = doc(collection(db, "users", bizId, "purchases"));
        const breakdown = recipeLines.map((l) => `${l.label}: ${formatMoneyPlain(l.amount)}`).join(", ");
        batch.set(purchaseRef, {
          productId,
          qty,
          unitCost: recipeCostPerUnit,
          date: opts.date,
          supplier: "Offer fulfillment",
          notes: `Recipe — ${breakdown}`,
          createdAt: Date.now(),
        });
      }

      const saleRef = doc(collection(db, "users", bizId, "sales"));
      const paymentMethod = opts.paymentMethod ?? "cash";
      const salePayload: Record<string, unknown> = {
        productId,
        qty,
        unitPrice: sellPrice,
        date: opts.date,
        paymentMethod,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      };
      if (opts.customer) salePayload.customer = opts.customer;
      if (opts.customerContact) salePayload.customerContact = opts.customerContact;
      if (opts.notes) salePayload.notes = opts.notes;
      if (paymentMethod === "credit") {
        const creditTermDays = opts.creditTermDays ?? settings.defaultCreditTermDays;
        salePayload.creditTermDays = creditTermDays;
        salePayload.dueDate = addDaysToDate(opts.date, creditTermDays);
      }
      // Sales tax on the offer's price, same snapshot as a hand-entered sale.
      const fulfillTax = taxFor(sellPrice * qty, product, settings);
      if (fulfillTax > 0.005) salePayload.taxAmount = fulfillTax;
      batch.set(saleRef, salePayload);

      await batch.commit();
      logAudit(
        "product",
        productId,
        "update",
        `Offer fulfilled: ${product.name} × ${qty} — ${formatMoneyPlain(sellPrice * qty)} sold, ${formatMoneyPlain(recipeCostPerUnit * qty)} cost logged`
      );
    },

    // See the `components` doc comment on Product in lib/types.ts and the
    // recordProduction type comment above for the full reasoning. Mirrors
    // fulfillOffer just above almost exactly (one batch, one Purchase for
    // the qty actually produced, notes carry the full breakdown) — the
    // difference is components are consumed via StockAdjustment
    // (reason: "production_use") instead of a Sale being created, since
    // nothing here is being sold to a customer.
    recordProduction: async (finishedProductId, opts) => {
      requirePermission("manage:products");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const product = products.find((p) => p.id === finishedProductId);
      if (!product) throw new Error("Product not found");
      const components = product.components ?? [];
      if (components.length === 0) throw new Error("This product has no bill of materials set up yet");
      const qty = opts.qty > 0 ? opts.qty : 1;
      const scrap = normalizeScrap(opts.scrapQty);
      const { db } = getFirebase();
      const batch = writeBatch(db);
      const createdByName = memberName ?? user?.email ?? "Unknown";

      // Each component's cost is valued at ITS current WAC (from the
      // already-computed `ledgers`, same source every other cost preview
      // in this app reads from) — the standard "cost what it's actually
      // worth right now" rule, same as a Sale's COGS.
      let componentCostTotal = 0;
      const breakdownParts: string[] = [];
      for (const c of components) {
        const componentProduct = products.find((p) => p.id === c.componentProductId);
        const qtyConsumed = componentQty(c.qtyPerUnit, qty, scrap);
        // Valued by the business's costing method: its average cost, or (batch costing) the batches this would really
        // draw from. The stock adjustment below is then valued identically by the ledger, so the finished good goes in
        // at exactly what the components came out at.
        const wac = consumptionUnitCost(settings.costingMethod ?? "average", ledgers.get(c.componentProductId)?.wac ?? 0, c.componentProductId, qtyConsumed, opts.date, { purchases, sales, saleReturns, stockAdjustments, supplierReturns });
        const amount = qtyConsumed * wac;
        componentCostTotal += amount;
        breakdownParts.push(
          `${componentProduct?.name ?? c.componentProductId}: ${qtyConsumed} × ${formatMoneyPlain(wac)} = ${formatMoneyPlain(amount)}`
        );

        const adjustmentRef = doc(collection(db, "users", bizId, "stockAdjustments"));
        batch.set(adjustmentRef, {
          productId: c.componentProductId,
          qty: -qtyConsumed,
          reason: "production_use",
          date: opts.date,
          notes: `Used to produce ${qty} × ${product.name}${scrap > 0 ? ` (plus ${scrap} scrapped)` : ""}`,
          createdByUid: myUid,
          createdByName,
          locationId: opts.locationId || undefined,
          createdAt: Date.now(),
        });
      }

      const laborTotal = (opts.laborOrOverheadPerUnit ?? 0) * qty;
      const unitCost = unitCostOfRun(componentCostTotal, opts.laborOrOverheadPerUnit ?? 0, qty);

      const purchaseRef = doc(collection(db, "users", bizId, "purchases"));
      const notesParts = [`Bill of materials — ${breakdownParts.join(", ")}`];
      if (laborTotal > 0) notesParts.push(`Labor/overhead: ${formatMoneyPlain(laborTotal)}`);
      if (scrap > 0) notesParts.push(`Scrapped in the run: ${scrap}`);
      if (opts.notes) notesParts.push(opts.notes);
      batch.set(purchaseRef, {
        productId: finishedProductId,
        qty,
        unitCost,
        date: opts.date,
        supplier: PRODUCTION_SUPPLIER_LABEL,
        notes: notesParts.join(". "),
        locationId: opts.locationId || undefined,
        createdAt: Date.now(),
      });

      await batch.commit();
      logAudit(
        "product",
        finishedProductId,
        "update",
        `Production run: ${qty} × ${product.name} — ${formatMoneyPlain(unitCost * qty)} total cost (${formatMoneyPlain(unitCost)}/unit)`
      );
    },

    addExpense: async (e) => {
      requirePermission("manage:expenses");
      const { businessId: bizId, uid } = requireBusiness();
      // v286: a manager's one-off expenses in a calendar month cannot go over the owner's limit (lib/spendLimit.ts).
      if (role === "manager" && !e.isRecurring && e.kind !== "revenue") {
        const problem = spendLimitProblem({
          role,
          amount: e.amount,
          spentThisMonth: spentByPersonInMonth(expenses, uid, (e.startDate || "").slice(0, 7)),
          limit: settings.managerMonthlySpendLimit,
        });
        if (problem) throw new Error(problem);
      }
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "expenses"), {
        ...e,
        createdByUid: uid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("expense", ref.id, "create", `Expense: ${e.name}, ${formatMoneyPlain(e.amount)}`);
    },
    updateExpense: async (docId, e) => {
      requirePermission("manage:expenses");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const before = expenses.find((x) => x.id === docId);
      // Same double-count shape as the credit guards on sales/purchases,
      // one level down. An unpaid bill's cash impact lives entirely in its
      // BillPayments (expenseCashTotalForMonth deliberately contributes 0
      // for it). Marking it "paid" makes the full amount cash in its own
      // month while the payments stay in billSettlements; turning it into
      // a recurring expense is worse still, since a recurring expense is
      // counted as cash in *every* active month. Either way the payments
      // already on record are how this bill actually got paid — a bill
      // becomes settled by recording payments that cover it, not by
      // flipping the flag, so refuse rather than quietly corrupt cash flow.
      if (before && before.kind === "expense" && before.paymentStatus === "unpaid") {
        const flippingToPaid = e.paymentStatus !== undefined && e.paymentStatus !== "unpaid";
        const flippingToRecurring = e.isRecurring === true && !before.isRecurring;
        if (flippingToPaid || flippingToRecurring) {
          const paid = billPayments.filter((p) => p.expenseId === docId).length;
          if (paid > 0) {
            throw new Error(
              flippingToRecurring
                ? `This bill has ${paid} payment${paid === 1 ? "" : "s"} recorded against it, so it can't be turned into a recurring expense — the same money would be counted twice. Delete those payments first.`
                : `This bill has ${paid} payment${paid === 1 ? "" : "s"} recorded against it, so it can't be marked paid directly — the same money would be counted twice. Record a payment for the remaining balance instead, and it'll clear itself once it's fully covered.`
            );
          }
        }
      }
      // The Expenses form always sends projectId/locationId, as undefined
      // when the person picked "not part of a project" / "shared overhead".
      // Firestore is initialised with ignoreUndefinedProperties, which just
      // drops an undefined field from the update — so without this, taking a
      // tag OFF an expense would save "successfully" and leave the old tag in
      // place, silently keeping a branch's cost on that branch (or a job's
      // cost on that job). An explicit undefined on these two tag fields
      // therefore means "clear it".
      // The same holds for the other optional fields the form empties (end date, reclaimable tax, payee, status, due
      // date, importance): see EXPENSE_CLEARABLE_FIELDS.
      const patch = clearListedUndefined(e, EXPENSE_CLEARABLE_FIELDS);
      await updateDoc(doc(db, "users", bizId, "expenses", docId), patch);
      logAudit(
        "expense",
        docId,
        "update",
        `Expense edited: ${before?.name ?? "?"} ${formatMoneyPlain(before?.amount ?? 0)} → ${formatMoneyPlain(e.amount ?? before?.amount ?? 0)}`
      );
    },
    deleteExpense: async (docId) => {
      requirePermission("delete:records");
      const existing = expenses.find((x) => x.id === docId);
      // Same reason as deleteSale — an orphaned BillPayment keeps counting
      // as cash paid out in billSettlements forever.
      const childPayments = billPayments.filter((p) => p.expenseId === docId).map((p) => p.id);
      await cascadeDelete("expenses", docId, [{ col: "billPayments", ids: childPayments }]);
      logAudit(
        "expense",
        docId,
        "delete",
        (existing ? `Expense deleted: ${existing.name}` : "Expense deleted") +
          (childPayments.length > 0
            ? ` (and ${childPayments.length} linked bill payment${childPayments.length === 1 ? "" : "s"})`
            : "")
      );
    },
    bulkAddExpenses: (rows) => chunkedBatchAdd("expenses", rows),

    addVariableCost: async (v) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await addDoc(collection(db, "users", bizId, "variableCosts"), { ...v, createdAt: Date.now() });
    },
    updateVariableCost: async (docId, v) => {
      requirePermission("manage:products");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "variableCosts", docId), v);
    },
    deleteVariableCost: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "variableCosts", docId));
    },

    addCapitalEntry: async (c) => {
      requirePermission("manage:capital");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "capitalEntries"), { ...c, createdAt: Date.now() });
      logAudit("capitalEntry", ref.id, "create", `${c.kind}: ${formatMoneyPlain(c.amount)}`);
    },
    addCapitalEntries: async (entries) => {
      requirePermission("manage:capital");
      if (entries.length === 0) return;
      if (entries.length > 200) throw new Error("Too many entries to save at once.");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const batch = writeBatch(db);
      const now = Date.now();
      let total = 0;
      for (const e of entries) {
        batch.set(doc(collection(db, "users", bizId, "capitalEntries")), { ...e, createdAt: now });
        total += e.amount;
      }
      // One write for the whole payout, so a dropped connection can never leave half the investors paid.
      await batch.commit();
      logAudit("capitalEntry", "batch", "create", `Investor entries: ${entries.length} saved, ${formatMoneyPlain(total)} in total`);
    },
    updateCapitalEntry: async (docId, c) => {
      requirePermission("manage:capital");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "capitalEntries", docId), c);
      logAudit("capitalEntry", docId, "update", "Capital entry edited");
    },
    deleteCapitalEntry: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "capitalEntries", docId));
      logAudit("capitalEntry", docId, "delete", "Capital entry deleted");
    },

    addTaxPayment: async (t) => {
      requirePermission("manage:tax");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "taxPayments"), { ...t, createdAt: Date.now() });
      logAudit("taxPayment", ref.id, "create", `Tax remittance: ${formatMoneyPlain(t.amount)}`);
    },
    updateTaxPayment: async (docId, t) => {
      requirePermission("manage:tax");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "taxPayments", docId), t);
      logAudit("taxPayment", docId, "update", "Tax remittance edited");
    },
    deleteTaxPayment: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "taxPayments", docId));
      logAudit("taxPayment", docId, "delete", "Tax remittance deleted");
    },

    addCustomer: async (c) => {
      requirePermission("create:customer");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "customers"), {
        ...c,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("customer", ref.id, "create", `Customer added: ${c.name}`);
    },
    updateCustomer: async (docId, c) => {
      requirePermission("manage:customers");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // The edit form sends every field, so a blank box arrives as `undefined`
      // and must actually clear the stored value (credit limit, phone, notes…).
      await updateDoc(doc(db, "users", bizId, "customers", docId), clearUndefinedFields(c));
      logAudit("customer", docId, "update", `Customer edited${c.name ? `: ${c.name}` : ""}`);
    },
    deleteCustomer: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = customers.find((cust) => cust.id === docId);
      await deleteDoc(doc(db, "users", bizId, "customers", docId));
      logAudit("customer", docId, "delete", existing ? `Customer removed: ${existing.name}` : "Customer removed");
    },

    addSupplier: async (s) => {
      requirePermission("manage:suppliers");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "suppliers"), {
        ...s,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("supplier", ref.id, "create", `Supplier added: ${s.name}`);
    },
    updateSupplier: async (docId, s) => {
      requirePermission("manage:suppliers");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "suppliers", docId), clearUndefinedFields(s));
      logAudit("supplier", docId, "update", `Supplier edited${s.name ? `: ${s.name}` : ""}`);
    },
    deleteSupplier: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = suppliers.find((sup) => sup.id === docId);
      await deleteDoc(doc(db, "users", bizId, "suppliers", docId));
      logAudit("supplier", docId, "delete", existing ? `Supplier removed: ${existing.name}` : "Supplier removed");
    },

    addRecurringInvoice: async (r) => {
      requirePermission("manage:sales");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const payload: Record<string, unknown> = {
        customer: r.customer,
        lines: r.lines,
        recurrence: r.recurrence,
        startDate: r.startDate,
        active: r.active,
        nextDueDate: r.nextDueDate,
        createdAt: Date.now(),
      };
      if (r.customerContact) payload.customerContact = r.customerContact;
      if (r.creditTermDays) payload.creditTermDays = r.creditTermDays;
      if (r.endDate) payload.endDate = r.endDate;
      if (r.notes) payload.notes = r.notes;
      const ref = await addDoc(collection(db, "users", bizId, "recurringInvoices"), payload);
      logAudit(
        "recurringInvoice",
        ref.id,
        "create",
        `Recurring invoice scheduled: ${r.customer}, ${r.recurrence}`
      );
    },
    updateRecurringInvoice: async (docId, r) => {
      requirePermission("manage:sales");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "recurringInvoices", docId), r);
      const before = recurringInvoices.find((x) => x.id === docId);
      logAudit(
        "recurringInvoice",
        docId,
        "update",
        r.active === false
          ? `Recurring invoice paused${before ? `: ${before.customer}` : ""}`
          : r.active === true
          ? `Recurring invoice resumed${before ? `: ${before.customer}` : ""}`
          : `Recurring invoice edited${before ? `: ${before.customer}` : ""}`
      );
    },
    deleteRecurringInvoice: async (docId) => {
      requirePermission("delete:sales");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = recurringInvoices.find((x) => x.id === docId);
      await deleteDoc(doc(db, "users", bizId, "recurringInvoices", docId));
      logAudit(
        "recurringInvoice",
        docId,
        "delete",
        existing ? `Recurring invoice removed: ${existing.customer}` : "Recurring invoice removed"
      );
    },
    generateRecurringInvoiceNow: async (docId) => {
      requirePermission("manage:sales");
      const { businessId: bizId } = requireBusiness();
      const schedule = recurringInvoices.find((r) => r.id === docId);
      if (!schedule) throw new Error("Recurring invoice schedule not found");
      return generateInvoiceForSchedule(bizId, schedule, todayIso());
    },

    addEmployee: async (e) => {
      requirePermission("manage:employees");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const batch = writeBatch(db);
      const employeeRef = doc(collection(db, "users", bizId, "employees"));
      const expenseRef = doc(collection(db, "users", bizId, "expenses"));
      batch.set(employeeRef, { ...e, linkedExpenseId: expenseRef.id, createdAt: Date.now() });
      batch.set(expenseRef, {
        name: `Payroll — ${e.name}`,
        amount: employerCostPerPeriod(e.payRate, e.epfEtfApplicable),
        category: "Payroll & labor",
        kind: "expense",
        isRecurring: true,
        recurrence: e.payFrequency,
        startDate: e.startDate,
        endDate: e.active ? undefined : e.endDate,
        employeeId: employeeRef.id,
        createdAt: Date.now(),
      });
      await batch.commit();
      logAudit("employee", employeeRef.id, "create", `Employee added: ${e.name}`);
    },
    updateEmployee: async (docId, e) => {
      requirePermission("manage:employees");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = employees.find((emp) => emp.id === docId);
      const employeeRef = doc(db, "users", bizId, "employees", docId);
      const batch = writeBatch(db);
      // Re-activating sends endDate as undefined; turn that into a real delete so the employee is active again.
      batch.update(employeeRef, clearListedUndefined(e, ["endDate"]));

      if (existing?.linkedExpenseId) {
        const merged = { ...existing, ...e };
        const expenseRef = doc(db, "users", bizId, "expenses", existing.linkedExpenseId);
        batch.update(expenseRef, {
          name: `Payroll — ${merged.name}`,
          amount: employerCostPerPeriod(merged.payRate, merged.epfEtfApplicable),
          recurrence: merged.payFrequency,
          startDate: merged.startDate,
          // A real delete when active: `undefined` is ignored by Firestore, which left a re-activated employee's
          // payroll expense still ending on the old date (so their pay silently stopped being counted).
          endDate: merged.active ? deleteField() : merged.endDate ?? todayIso(),
        });
      }
      await batch.commit();
      logAudit("employee", docId, "update", `Employee edited${e.name ? `: ${e.name}` : ""}`);
    },
    deleteEmployee: async (docId) => {
      requirePermission("manage:employees");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = employees.find((emp) => emp.id === docId);
      const batch = writeBatch(db);
      batch.delete(doc(db, "users", bizId, "employees", docId));
      if (existing?.linkedExpenseId) {
        batch.delete(doc(db, "users", bizId, "expenses", existing.linkedExpenseId));
      }
      await batch.commit();
      logAudit("employee", docId, "delete", existing ? `Employee removed: ${existing.name}` : "Employee removed");
    },

    addJournalEntry: async (j) => {
      requirePermission("manage:journal");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "journalEntries"), {
        ...j,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("journalEntry", ref.id, "create", `Lesson logged: ${j.date}`);
    },
    updateJournalEntry: async (docId, j) => {
      requirePermission("manage:journal");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "journalEntries", docId), j);
      logAudit("journalEntry", docId, "update", "Journal entry edited");
    },
    deleteJournalEntry: async (docId) => {
      requirePermission("manage:journal");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "journalEntries", docId));
      logAudit("journalEntry", docId, "delete", "Journal entry deleted");
    },

    addOpportunity: async (o) => {
      requirePermission("manage:opportunities");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "opportunities"), { ...o, createdAt: Date.now() });
      logAudit("opportunity", ref.id, "create", `Opportunity added: ${o.name}`);
    },
    updateOpportunity: async (docId, o) => {
      requirePermission("manage:opportunities");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "opportunities", docId), o);
      logAudit("opportunity", docId, "update", `Opportunity edited${o.name ? `: ${o.name}` : ""}`);
    },
    deleteOpportunity: async (docId) => {
      requirePermission("manage:opportunities");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = opportunities.find((op) => op.id === docId);
      await deleteDoc(doc(db, "users", bizId, "opportunities", docId));
      logAudit("opportunity", docId, "delete", existing ? `Opportunity removed: ${existing.name}` : "Opportunity removed");
    },

    addBankStatementLine: async (l) => {
      requirePermission("manage:reconciliation");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "bankStatementLines"), { ...l, createdAt: Date.now() });
      logAudit("bankStatementLine", ref.id, "create", `Bank line added: ${l.description || l.date}`);
    },
    updateBankStatementLine: async (docId, l) => {
      requirePermission("manage:reconciliation");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Stamp the reviewer whenever the review status changes; clear it when a line is put back.
      const reviewStamp =
        l.status === "matched" || l.status === "ignored"
          ? { reviewedByName: memberName ?? user?.email ?? "Unknown", reviewedAt: Date.now() }
          : l.status === "unmatched"
          ? { reviewedByName: deleteField(), reviewedAt: deleteField() }
          : {};
      await updateDoc(doc(db, "users", bizId, "bankStatementLines", docId), { ...l, ...reviewStamp });
      logAudit("bankStatementLine", docId, "update", l.status ? `Bank line marked ${l.status}` : "Bank line edited");
    },
    deleteBankStatementLine: async (docId) => {
      requirePermission("manage:reconciliation");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "bankStatementLines", docId));
      logAudit("bankStatementLine", docId, "delete", "Bank line removed");
    },
    bulkAddBankStatementLines: async (rows) => {
      requirePermission("manage:reconciliation");
      await chunkedBatchAdd("bankStatementLines", rows.map((r) => ({ ...r, status: "unmatched" as const })));
    },

    addLoan: async (l) => {
      requirePermission("manage:loans");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "loans"), { ...l, createdAt: Date.now() });
      logAudit("loan", ref.id, "create", `Loan added: ${l.name}, ${formatMoneyPlain(l.principal)}`);
    },
    updateLoan: async (docId, l) => {
      requirePermission("manage:loans");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "loans", docId), l);
      logAudit("loan", docId, "update", "Loan edited");
    },
    deleteLoan: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "loans", docId));
      logAudit("loan", docId, "delete", "Loan deleted");
    },
    bulkAddLoans: (rows) => chunkedBatchAdd("loans", rows),

    addContingency: async (c) => {
      requirePermission("manage:loans");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "contingencies"), { ...c, createdAt: Date.now() });
      logAudit("contingency", ref.id, "create", `Contingent item added: ${c.description}, ${formatMoneyPlain(c.amount)}`);
    },
    updateContingency: async (docId, c) => {
      requirePermission("manage:loans");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "contingencies", docId), c);
      logAudit("contingency", docId, "update", c.status === "settled" ? "Contingent item settled" : "Contingent item edited");
    },
    addDataRequest: async (r) => {
      requirePermission("manage:loans");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "dataRequests"), { ...r, createdAt: Date.now() });
      logAudit("dataRequest", ref.id, "create", `Personal data request logged from ${r.name}`);
    },
    updateDataRequest: async (docId, r) => {
      requirePermission("manage:loans");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "dataRequests", docId), r);
      logAudit("dataRequest", docId, "update", r.status === "done" ? "Personal data request closed" : "Personal data request edited");
    },
    deleteDataRequest: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "dataRequests", docId));
      logAudit("dataRequest", docId, "delete", "Personal data request deleted");
    },
    deleteContingency: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "contingencies", docId));
      logAudit("contingency", docId, "delete", "Contingent item deleted");
    },

    recordEquityRaise: async ({ equity, capitalEntry }) => {
      requirePermission("manage:settings");
      if (capitalEntry) requirePermission("manage:capital");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const batch = writeBatch(db);
      // merge: the settings doc may not exist yet for a brand-new business.
      batch.set(doc(db, "users", bizId, "meta", "settings"), { equity }, { merge: true });
      if (capitalEntry) batch.set(doc(collection(db, "users", bizId, "capitalEntries")), { ...capitalEntry, createdAt: Date.now() });
      await batch.commit();
      logAudit("settings", "equity", "update", capitalEntry ? `Equity raise recorded: ${formatMoneyPlain(capitalEntry.amount)}` : "Equity raise recorded (no cash entry)");
    },

    recordShareholderDividend: async ({ dividend, capitalEntry }) => {
      requirePermission("manage:settings");
      requirePermission("manage:capital");
      const { businessId: bizId } = requireBusiness();
      if (isPeriodClosed(dividend.date, settings.booksClosedThrough)) {
        throw new Error("Your books are closed for that date. Reopen the books first, or pay the dividend on a later date.");
      }
      const equity = settings.equity ?? { holders: [] };
      const pct = dividend.withholdingPct ?? 0;
      // Checked again here, not only on screen: the split is only as good as the profit it comes out of.
      const cumulativeProfit = monthlyPnL.reduce((s, m) => s + (m.netProfitAfterTax || 0), 0);
      const problems = validateDividend({
        amount: dividend.amount,
        date: dividend.date,
        holders: equity.holders,
        distributable: distributableProfit(cumulativeProfit, profitPaidOut(capitalEntries, equity.dividends ?? [])),
        withholdingPct: pct,
      });
      if (problems.length) throw new Error(problems.join(" "));
      const { db } = getFirebase();
      const batch = writeBatch(db);
      const entryRef = doc(collection(db, "users", bizId, "capitalEntries"));
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      // Tax withheld and net per person are worked out here and stored with the dividend, so the statements never recompute them.
      const allocations = withholdingSplit(dividendAllocations(dividend.amount, equity.holders), pct);
      const withheld = Math.round(allocations.reduce((s, a) => s + a.withheld, 0) * 100) / 100;
      // No undefined fields: Firestore refuses them in a set().
      const record: ShareholderDividend = { id, date: dividend.date, amount: dividend.amount, withholdingPct: pct, withheld, capitalEntryId: entryRef.id, allocations, ...(dividend.note?.trim() ? { note: dividend.note.trim() } : {}) };
      batch.set(doc(db, "users", bizId, "meta", "settings"), { equity: { ...equity, dividends: [...(equity.dividends ?? []), record] } }, { merge: true });
      batch.set(entryRef, { ...capitalEntry, createdAt: Date.now() });
      await batch.commit();
      logAudit("settings", "equity", "update", `Shareholder dividend declared: ${formatMoneyPlain(dividend.amount)} to ${allocations.length} shareholder(s), ${dividend.date}${pct > 0 ? `, ${formatMoneyPlain(withheld)} tax withheld at ${pct}%` : ""}`);
    },

    deleteShareholderDividend: async (dividendId) => {
      requirePermission("manage:settings");
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const equity = settings.equity ?? { holders: [] };
      const found = (equity.dividends ?? []).find((d) => d.id === dividendId);
      if (!found) throw new Error("That dividend is not on the record.");
      if (isPeriodClosed(found.date, settings.booksClosedThrough)) {
        throw new Error("Your books are closed for that date. Reopen the books first, then delete the dividend.");
      }
      const { db } = getFirebase();
      const batch = writeBatch(db);
      batch.set(doc(db, "users", bizId, "meta", "settings"), { equity: { ...equity, dividends: (equity.dividends ?? []).filter((d) => d.id !== dividendId) } }, { merge: true });
      if (found.capitalEntryId) batch.delete(doc(db, "users", bizId, "capitalEntries", found.capitalEntryId));
      await batch.commit();
      logAudit("settings", "equity", "delete", `Shareholder dividend deleted: ${formatMoneyPlain(found.amount)} (${found.date})`);
    },
    updateSettings: async (s) => {
      requirePermission("manage:settings");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "meta", "settings");
      // Costing method: every past figure is derived, so switching restates all of history. Refused while any period is
      // closed (reopen the books first), and always written to the audit log.
      const costingChange = s.costingMethod !== undefined && s.costingMethod !== (settings.costingMethod ?? "average");
      if (costingChange && normalizeClosedThrough(settings.booksClosedThrough)) {
        throw new Error("Your books are closed through a date, and changing how cost of goods is worked out restates past profit. Reopen the books first (Settings → Books), change it, then close them again.");
      }
      const snap = await getDoc(ref);
      if (snap.exists()) await updateDoc(ref, s);
      else await setDoc(ref, { ...DEFAULT_SETTINGS, ...s });
      // Accounting policy changes (pass 350): each one is written to the audit log, so the owner can see it and the red flag can count it.
      for (const c of policyChanges(settings as unknown as Record<string, unknown>, s as unknown as Record<string, unknown>)) {
        logAudit(POLICY_ENTITY, c.key, "update", policySummary(c));
      }
      if (costingChange) {
        logAudit(POLICY_ENTITY, "costingMethod", "update", `Cost of goods method changed to ${s.costingMethod === "batch" ? "each batch's own cost" : "average cost"} (restates past profit and stock value)`);
      }
    },

    // Its own method (rather than another field in updateSettings) so the
    // lock can only ever change through validation + an audit-log entry, and
    // so the general Settings form — which saves many fields at once — can
    // never reopen the books as a side effect.
    setBooksClosedThrough: async (date) => {
      requirePermission("manage:settings");
      const { businessId: bizId } = requireBusiness();
      const problem = validateBooksClosedThrough(date, todayIso());
      if (problem) throw new Error(problem);
      const { db } = getFirebase();
      const previous = normalizeClosedThrough(settings.booksClosedThrough);
      // merge: the settings doc may not exist yet for a brand-new business.
      await setDoc(
        doc(db, "users", bizId, "meta", "settings"),
        { booksClosedThrough: date ?? deleteField() },
        { merge: true }
      );
      logAudit(
        "settings",
        "booksClosedThrough",
        "update",
        date
          ? `Books closed through ${formatIsoLong(date)}${previous ? ` (was ${formatIsoLong(previous)})` : ""}`
          : `Books reopened (were closed through ${previous ? formatIsoLong(previous) : "no date"})`
      );
    },

    saveBudget: async (month, target) => {
      requirePermission("manage:budgets");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = doc(db, "users", bizId, "meta", "budgets");
      // set+merge rather than update: the doc may not exist yet for a
      // business that's never set a budget before, and update() throws on
      // a missing doc where set(..., {merge:true}) just creates it.
      await setDoc(ref, { [month]: target }, { merge: true });
      logAudit("budget", month, "update", `Budget set for ${month}`);
    },

    createInvite: async (email, name, inviteRole) => {
      requirePermission("manage:team");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "invites"), {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role: inviteRole,
        status: "pending",
        invitedBy: myUid,
        invitedByName: memberName ?? user?.email ?? "Owner",
        createdAt: Date.now(),
      });
      logAudit("invite", ref.id, "create", `Invited ${email} as ${inviteRole}`);
      return ref.id;
    },
    revokeInvite: async (id) => {
      requirePermission("manage:team");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "invites", id), { status: "revoked" });
      logAudit("invite", id, "update", "Invite revoked");
    },
    changeMemberRole: async (memberUid, newRole) => {
      requirePermission("manage:team");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "members", memberUid), { role: newRole });
      logAudit("member", memberUid, "update", `Role changed to ${newRole}`);
    },
    setMemberActive: async (memberUid, active) => {
      requirePermission("manage:team");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "members", memberUid), { active });
      logAudit("member", memberUid, "update", active ? "Member reactivated" : "Member deactivated");
    },
    setMemberLocations: async (memberUid, locationIds) => {
      requirePermission("manage:team");
      const { businessId: bizId } = requireBusiness();
      const target = members.find((m) => m.id === memberUid);
      if (target?.role === "owner") throw new Error("The owner can always see every location.");
      const { db } = getFirebase();
      const clean = [...new Set(locationIds.map((id) => id.trim()).filter(Boolean))].slice(0, 50);
      await updateDoc(doc(db, "users", bizId, "members", memberUid), { locationIds: clean });
      logAudit("member", memberUid, "update", clean.length ? `Work locations set to ${clean.length}` : "Work locations set to every location");
    },
    updateOwnProfile: async (patch) => {
      const { businessId: bizId, uid: myUid } = requireBusiness();
      if (role !== "owner") throw new Error("Only the owner can edit this account's profile.");
      const { db } = getFirebase();
      const clean: { name?: string; email?: string } = {};
      if (patch.name !== undefined) clean.name = patch.name.trim();
      if (patch.email !== undefined) clean.email = patch.email.trim().toLowerCase();
      if (!Object.keys(clean).length) return;
      await updateDoc(doc(db, "users", bizId, "members", myUid), clean);
      logAudit("member", myUid, "update", "Account profile updated");
    },

    addCashCount: async ({ date, openingFloat, countedCash, notes }) => {
      requirePermission("create:cashCount");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      // Expected cash is snapshotted right now, from cash-collected sales
      // and cash-paid expenses/purchases dated on the covered day — see the
      // CashCount doc comment in lib/types.ts for why this is never
      // recomputed later. `sales`/`purchases`/`expenses` are already
      // scoped by role upstream (Staff's `sales` only ever contains their
      // own — see the Firestore query in the subscription effect above),
      // so no further filtering by who's submitting the count is needed
      // here. One real limitation worth knowing: because Staff has no
      // visibility into `purchases`/`expenses`, a cash count they submit
      // can't account for petty cash spent out of the till on something
      // like a delivery fee — that will show as an unexplained shortfall
      // even though nothing was actually taken. Owner/Manager counts don't
      // have this gap, since they see the full picture.
      const econBySale = new Map(saleEconomics.map((e) => [e.saleId, e]));
      const cashSalesToday = sales
        .filter((s) => s.date === date && (s.paymentMethod ?? "cash") !== "credit")
        .reduce((sum, s) => sum + (econBySale.get(s.id)?.revenue ?? s.qty * s.unitPrice), 0);
      const receivableCashToday = receivablePayments
        .filter((p) => p.date === date && p.method === "cash")
        .reduce((sum, p) => sum + p.amount, 0);
      // Credit purchases don't take cash out of the till on the purchase
      // date (that happens later, when the supplier is actually paid — see
      // payableCashOutToday below); only cash-paid purchases do.
      const purchaseCashOutToday = purchases
        .filter((p) => p.date === date && (p.paymentMethod ?? "cash") !== "credit")
        .reduce((sum, p) => sum + p.qty * p.unitCost, 0);
      const payableCashOutToday = payablePayments
        .filter((p) => p.date === date && p.method === "cash")
        .reduce((sum, p) => sum + p.amount, 0);
      // Expense.kind can be "revenue" (extra income logged the same way as
      // a bill, e.g. interest earned) — that adds cash, it doesn't take it
      // out, so it must not be lumped in as an outflow alongside real
      // expenses.
      const expenseCashToday = expenses
        .filter((e) => e.startDate === date)
        .reduce((sum, e) => sum + (e.kind === "revenue" ? -e.amount : e.amount), 0);
      const cashOutToday = purchaseCashOutToday + payableCashOutToday + expenseCashToday;
      // A supplier refunding you in cash puts that cash in the till (goods + the tax that went back with them).
      const supplierRefundCashToday = supplierReturns
        .filter((r) => r.date === date && r.settlement === "refund" && (r.refundMethod ?? "cash") === "cash")
        .reduce((sum, r) => sum + r.creditAmount + (r.taxAmount ?? 0), 0);
      // Supplier credit paid or returned in cash goes through the till too: a deposit paid out, a credit refund in.
      const creditDepositCashToday = supplierCredits
        .filter((c) => c.date === date && c.kind === "deposit" && (c.method ?? "cash") === "cash")
        .reduce((sum, c) => sum + c.amount, 0);
      const creditRefundCashToday = supplierCredits
        .filter((c) => c.date === date && c.kind === "refunded" && (c.method ?? "cash") === "cash")
        .reduce((sum, c) => sum + c.amount, 0);
      // Cash taken out of the till for a small spend and not yet booked as an expense (v292). A booked payout is already in
      // cashOutToday through its expense, so it is left out here: the expected figure is the same whether or not it was booked.
      const tillPayoutsOut = unrecordedTillOutflow(tillPayouts, date);
      const expectedCash = openingFloat + cashSalesToday + receivableCashToday + supplierRefundCashToday + creditRefundCashToday - cashOutToday - creditDepositCashToday - tillPayoutsOut;
      const variance = countedCash - expectedCash;

      const ref = await addDoc(collection(db, "users", bizId, "cashCounts"), {
        date,
        openingFloat,
        expectedCash,
        countedCash,
        variance,
        tillPayoutsOut,
        notes: notes || undefined,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("cashCount", ref.id, "create", `Cash count ${date}: variance ${formatMoneyPlain(variance)}`);
    },

    // Till payouts (v292). Any active role writes one down; a count subtracts it until it is booked as an expense (lib/tillPayouts.ts).
    addTillPayout: async (p) => {
      requirePermission("create:tillPayout");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const checked = validateTillPayout(p);
      if (!checked.ok) throw new Error(checked.error);
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "tillPayouts"), {
        ...checked.value,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("tillPayout", ref.id, "create", `Till payout: ${checked.value.reason}, ${formatMoneyPlain(checked.value.amount)}`);
    },
    // Owner or Manager books a till payout as a one-off expense. The expense and the link back to it are written in one batch,
    // so a payout is never recorded twice and never drops out of a count without its expense.
    recordTillPayoutAsExpense: async (p, category) => {
      requirePermission("manage:expenses");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      if (p.expenseId) throw new Error("This till payout is already recorded as an expense");
      const cat = String(category ?? "").trim();
      if (!cat) throw new Error("Pick a category for the expense");
      const e = expenseFromTillPayout(p, cat);
      // Same monthly limit a manager's own one-off expenses have (see addExpense above).
      if (role === "manager") {
        const problem = spendLimitProblem({
          role,
          amount: e.amount,
          spentThisMonth: spentByPersonInMonth(expenses, myUid, e.startDate.slice(0, 7)),
          limit: settings.managerMonthlySpendLimit,
        });
        if (problem) throw new Error(problem);
      }
      const { db } = getFirebase();
      const batch = writeBatch(db);
      const expenseRef = doc(collection(db, "users", bizId, "expenses"));
      batch.set(expenseRef, { ...e, createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown", createdAt: Date.now() });
      batch.update(doc(db, "users", bizId, "tillPayouts", p.id), { expenseId: expenseRef.id });
      await batch.commit();
      logAudit("expense", expenseRef.id, "create", `Expense from till payout: ${e.name}, ${formatMoneyPlain(e.amount)}`);
    },
    // Owner only, like the cash count corrections below.
    deleteTillPayout: async (docId) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "tillPayouts", docId));
      logAudit("tillPayout", docId, "delete", "Till payout deleted");
    },

    // Deliberately Owner-only, and deliberately not exposed to Staff even
    // for their own counts — the whole anti-theft value of a cash count is
    // that whoever counted the till can't quietly correct it afterward
    // (see the addCashCount comment above, and the copy on the Cash Count
    // page). This exists purely so an Owner can fix a genuine slip — a typo
    // in the counted amount, the wrong date picked — without deleting and
    // losing the record entirely. expectedCash/variance are recomputed from
    // the edited fields so they stay consistent with what's actually saved.
    updateCashCount: async (docId, patch) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const existing = cashCounts.find((c) => c.id === docId);
      if (!existing) throw new Error("Cash count not found");
      const openingFloat = patch.openingFloat ?? existing.openingFloat;
      const countedCash = patch.countedCash ?? existing.countedCash;
      // expectedCash itself isn't recomputed here (it's a point-in-time
      // snapshot of cash sales/payments/outflows as of when it was
      // originally saved — see the CashCount doc comment in lib/types.ts);
      // only variance is re-derived, against the corrected counted amount.
      const recomputedVariance = countedCash - existing.expectedCash;
      await updateDoc(doc(db, "users", bizId, "cashCounts", docId), {
        ...(patch.date !== undefined ? { date: patch.date } : {}),
        ...(patch.openingFloat !== undefined ? { openingFloat } : {}),
        ...(patch.countedCash !== undefined ? { countedCash, variance: recomputedVariance } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes || undefined } : {}),
      });
      logAudit("cashCount", docId, "update", `Cash count corrected (was variance ${formatMoneyPlain(existing.variance)})`);
    },
    deleteCashCount: async (docId) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "cashCounts", docId));
      logAudit("cashCount", docId, "delete", "Cash count deleted");
    },

    addReceivablePayment: async (p) => {
      requirePermission("create:receivablePayment");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      // "Collected by" is for the Owner/Manager logging what a field officer brought in. A staff login's own
      // payments are, by definition, collected by them, so it can't name somebody else.
      const { collectedByUid, collectedByName, ...rest } = p;
      const collector = role !== "staff" && collectedByUid?.trim() ? { collectedByUid: collectedByUid.trim(), ...(collectedByName?.trim() ? { collectedByName: collectedByName.trim() } : {}) } : {};
      const ref = await addDoc(collection(db, "users", bizId, "receivablePayments"), {
        ...rest,
        ...collector,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("receivablePayment", ref.id, "create", `Payment collected: ${formatMoneyPlain(p.amount)}`);
      // v284b: tell the business webhook the invoice's new status now (best effort; the daily read is the backstop).
      void postOpsEvent(user, businessId, "payment.received", ref.id);
      // v319: when this payment makes its invoice fully paid, AutoLeads hears of it (the server checks and signs; it never blocks the payment).
      void postAutoLeadsPayment(user, businessId, ref.id);
    },
    // Owner-only, same reasoning as updateCashCount: Staff (and Manager) can
    // record a payment, but only the Owner can go back and fix a mis-keyed
    // amount, date, or method on one afterward.
    updateReceivablePayment: async (docId, patch) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "receivablePayments", docId), patch);
      logAudit("receivablePayment", docId, "update", "Payment corrected");
    },
    deleteReceivablePayment: async (docId) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "receivablePayments", docId));
      logAudit("receivablePayment", docId, "delete", "Payment deleted");
    },

    addReceivableWriteOff: async (w) => {
      requirePermission("manage:writeOffs");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "receivableWriteOffs"), {
        ...w,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("receivableWriteOff", ref.id, "create", `Bad debt written off: ${formatMoneyPlain(w.amount)}`);
    },
    updateReceivableWriteOff: async (docId, patch) => {
      requirePermission("manage:writeOffs");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "receivableWriteOffs", docId), patch);
      logAudit("receivableWriteOff", docId, "update", "Write-off corrected");
    },
    deleteReceivableWriteOff: async (docId) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "receivableWriteOffs", docId));
      logAudit("receivableWriteOff", docId, "delete", "Write-off reversed");
    },

    addPayablePayment: async (p) => {
      requirePermission("create:receivablePayment");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "payablePayments"), {
        ...p,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("payablePayment", ref.id, "create", `Supplier payment: ${formatMoneyPlain(p.amount)}`);
    },
    updatePayablePayment: async (docId, patch) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "payablePayments", docId), patch);
      logAudit("payablePayment", docId, "update", "Supplier payment corrected");
    },
    deletePayablePayment: async (docId) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "payablePayments", docId));
      logAudit("payablePayment", docId, "delete", "Supplier payment deleted");
    },

    addBillPayment: async (p) => {
      requirePermission("manage:expenses");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "billPayments"), {
        ...p,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("billPayment", ref.id, "create", `Bill payment: ${formatMoneyPlain(p.amount)}`);
    },
    updateBillPayment: async (docId, patch) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "billPayments", docId), patch);
      logAudit("billPayment", docId, "update", "Bill payment corrected");
    },
    deleteBillPayment: async (docId) => {
      requirePermission("correct:ledgerEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "billPayments", docId));
      logAudit("billPayment", docId, "delete", "Bill payment deleted");
    },

    addFixedAsset: async (a) => {
      requirePermission("manage:fixedAssets");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "fixedAssets"), {
        ...a,
        createdAt: Date.now(),
      });
      logAudit("fixedAsset", ref.id, "create", `Asset added: ${a.name}`);
    },

    updateFixedAsset: async (id, a) => {
      requirePermission("manage:fixedAssets");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // The form sends these as `undefined` when the person empties a field or un-ticks "Sold or scrapped". Firestore
      // ignores undefined, so without a real delete the old value stayed (a sold asset could not be un-sold, a cleared
      // salvage value came back).
      const patch = clearListedUndefined(a, ["salvageValue", "reducingRatePct", "notes", "disposalDate", "disposalAmount", "appreciationPct"]);
      // Depreciation method and useful life (pass 350): a change alters every later depreciation charge, so it is written to the audit log.
      const before = fixedAssetsRaw.find((x) => x.id === id);
      if (before) {
        if (a.depreciationMethod !== undefined && a.depreciationMethod !== (before.depreciationMethod ?? "straight_line")) {
          logAudit(POLICY_ENTITY, id, "update", `Depreciation method for ${before.name} changed from ${depreciationMethodLabel(before.depreciationMethod)} to ${depreciationMethodLabel(a.depreciationMethod)}`);
        }
        if (a.usefulLifeMonths !== undefined && a.usefulLifeMonths !== before.usefulLifeMonths) {
          logAudit(POLICY_ENTITY, id, "update", `Useful life for ${before.name} changed from ${before.usefulLifeMonths} to ${a.usefulLifeMonths} months`);
        }
      }
      await updateDoc(doc(db, "users", bizId, "fixedAssets", id), patch);
      logAudit("fixedAsset", id, "update", `Asset updated`);
    },

    addSecurity: async (s) => {
      requirePermission("manage:investments");
      const name = s.name.trim();
      if (!name) throw new Error("Give the investment a name.");
      if (s.currentPrice != null && !(Number.isFinite(s.currentPrice) && s.currentPrice >= 0)) throw new Error("The price can't be negative.");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "securities"), { ...s, name, createdAt: Date.now() });
      logAudit("security", ref.id, "create", `Investment added: ${name}`);
      return ref.id;
    },

    updateSecurity: async (id, s) => {
      requirePermission("manage:investments");
      if (s.name != null && !s.name.trim()) throw new Error("Give the investment a name.");
      if (s.currentPrice != null && !(Number.isFinite(s.currentPrice) && s.currentPrice >= 0)) throw new Error("The price can't be negative.");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "securities", id), s);
      logAudit("security", id, "update", s.currentPrice != null ? `Price updated to ${formatMoneyPlain(s.currentPrice)}` : "Investment updated");
    },

    deleteSecurity: async (id) => {
      requirePermission("manage:investments");
      if (investmentTxns.some((t) => t.securityId === id)) {
        throw new Error("This investment has trades or income recorded against it. Delete those first, so the books stay correct.");
      }
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "securities", id));
      logAudit("security", id, "delete", "Investment deleted");
    },

    addInvestmentTxn: async (t) => {
      requirePermission("manage:investments");
      const sec = securities.find((x) => x.id === t.securityId);
      if (!sec) throw new Error("Pick the investment this belongs to.");
      if (!t.date || t.date > todayIso()) throw new Error("The date can't be in the future.");
      if (!(Number.isFinite(t.amount) && t.amount > 0)) throw new Error("Enter an amount above zero.");
      if (t.fees != null && !(Number.isFinite(t.fees) && t.fees >= 0)) throw new Error("Fees can't be negative.");
      if (t.kind !== "income" && !(Number.isFinite(t.units) && (t.units as number) > 0)) throw new Error("Enter how many units.");
      if (t.kind === "sell") {
        const probe: InvestmentTxn = { ...t, id: "__new__", createdAt: Number.MAX_SAFE_INTEGER };
        if (findOversell([...investmentTxns, probe])) {
          throw new Error(`You don't hold that many units of ${sec.name} on that date.`);
        }
      }
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "investmentTxns"), { ...t, createdAt: Date.now() });
      const what = t.kind === "buy" ? "Bought" : t.kind === "sell" ? "Sold" : "Income from";
      logAudit("investmentTxn", ref.id, "create", `${what} ${sec.name}: ${formatMoneyPlain(t.amount)}`);
    },

    deleteInvestmentTxn: async (id) => {
      requirePermission("manage:investments");
      if (findOversell(investmentTxns.filter((t) => t.id !== id))) {
        throw new Error("A later sale depends on this purchase. Delete that sale first.");
      }
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "investmentTxns", id));
      logAudit("investmentTxn", id, "delete", "Investment entry deleted");
    },

    // Money lent out (lib/lending.ts). Owner only, like investments: these decide where the business's cash sits.
    addLentLoan: async (l) => {
      requirePermission("manage:investments");
      const borrower = l.borrower.trim();
      const bad = validateLentLoanTerms({ ...l, borrower }, todayIso());
      if (bad) throw new Error(bad);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const clean: Record<string, unknown> = { ...l, borrower, createdAt: Date.now() };
      if (!l.purpose?.trim()) delete clean.purpose; else clean.purpose = l.purpose.trim();
      if (!l.notes?.trim()) delete clean.notes;
      // The borrower record: blank text is "not given", never stored as an empty string.
      for (const k of ["customerId", "borrowerContact", "guarantorName", "guarantorContact", "collateral", "collectorUid", "collectorName"]) {
        const v = clean[k];
        if (typeof v !== "string" || !v.trim()) delete clean[k]; else clean[k] = v.trim();
      }
      const ref = await addDoc(collection(db, "users", bizId, "lentLoans"), clean);
      logAudit("lentLoan", ref.id, "create", `Money lent to ${borrower}: ${formatMoneyPlain(l.principal)} at ${l.annualInterestRatePct}%`);
      return ref.id;
    },

    updateLentLoan: async (id, l) => {
      requirePermission("manage:investments");
      const cur = lentLoans.find((x) => x.id === id);
      if (!cur) throw new Error("That loan no longer exists.");
      const next = { ...cur, ...l, borrower: (l.borrower ?? cur.borrower).trim() };
      const bad = validateLentLoanTerms(next, todayIso());
      if (bad) throw new Error(bad);
      // Changing the terms re-works the interest on every repayment already recorded, so the result must still
      // leave each of those repayments within what was owed on its date.
      const mine = lentLoanTxns.filter((t) => t.loanId === id);
      for (const t of mine) {
        const others = mine.filter((x) => x.id !== t.id);
        const why = validateLentTxn(next, others, { kind: t.kind, date: t.date, amount: t.amount }, todayIso());
        if (why) throw new Error("These terms don't fit the repayments already recorded. " + why);
      }
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // The edit form always sends every field, so an emptied "purpose" or "notes" arrives as undefined and has to
      // become a real delete, or the old text silently stays while the screen says "saved".
      await updateDoc(doc(db, "users", bizId, "lentLoans", id), clearUndefinedFields({ ...l, ...(l.borrower != null ? { borrower: next.borrower } : {}) }));
      logAudit("lentLoan", id, "update", `Loan to ${next.borrower} edited`);
    },

    deleteLentLoan: async (id) => {
      requirePermission("manage:investments");
      if (lentLoanTxns.some((t) => t.loanId === id)) {
        throw new Error("This loan has repayments or a write-off recorded against it. Delete those first, so the books stay correct.");
      }
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const who = lentLoans.find((x) => x.id === id)?.borrower ?? "";
      await deleteDoc(doc(db, "users", bizId, "lentLoans", id));
      // The loan's collections diary has no other home, so it goes with it rather than lingering as orphans.
      await Promise.all(
        collectionNotes
          .filter((n) => n.subjectKind === "lent_loan" && n.subjectKey === id)
          .map((n) => deleteDoc(doc(db, "users", bizId, "collectionNotes", n.id)).catch(() => undefined))
      );
      logAudit("lentLoan", id, "delete", `Loan to ${who} deleted`);
    },

    addLentLoanTxn: async (t) => {
      requirePermission("manage:investments");
      const loan = lentLoans.find((x) => x.id === t.loanId);
      if (!loan) throw new Error("Pick the loan this belongs to.");
      const why = validateLentTxn(loan, lentLoanTxns.filter((x) => x.loanId === loan.id), { kind: t.kind, date: t.date, amount: t.amount }, todayIso());
      if (why) throw new Error(why);
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const clean: Record<string, unknown> = { ...t, createdAt: Date.now() };
      if (!t.notes?.trim()) delete clean.notes;
      // "Collected by" only means something on money coming in.
      if (t.kind !== "repayment" || !t.collectedByUid?.trim()) { delete clean.collectedByUid; delete clean.collectedByName; }
      const ref = await addDoc(collection(db, "users", bizId, "lentLoanTxns"), clean);
      logAudit("lentLoanTxn", ref.id, "create", `${t.kind === "repayment" ? "Repayment from" : "Wrote off part of loan to"} ${loan.borrower}: ${formatMoneyPlain(t.amount)}`);
    },

    deleteLentLoanTxn: async (id) => {
      requirePermission("manage:investments");
      const t = lentLoanTxns.find((x) => x.id === id);
      if (!t) throw new Error("That entry no longer exists.");
      const loan = lentLoans.find((x) => x.id === t.loanId);
      // Taking an entry out must not leave a later one larger than what was then owed.
      if (loan) {
        const rest = lentLoanTxns.filter((x) => x.loanId === t.loanId && x.id !== id);
        for (const later of rest.filter((x) => x.date >= t.date)) {
          const why = validateLentTxn(loan, rest.filter((x) => x.id !== later.id), { kind: later.kind, date: later.date, amount: later.amount }, todayIso());
          if (why) throw new Error("A later entry depends on this one. Delete that later entry first. (" + why + ")");
        }
      }
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "lentLoanTxns", id));
      logAudit("lentLoanTxn", id, "delete", "Loan entry deleted");
    },

    // The collections diary (lib/collections.ts). Owner and Manager write it; only the Owner deletes a line.
    addCollectionNote: async (n) => {
      requirePermission("manage:collections");
      const label = n.subjectLabel.trim();
      const key = n.subjectKind === "customer" ? customerKey(n.subjectKey || label) : n.subjectKey;
      if (!key || !label) throw new Error("Say who this contact was with.");
      if (n.subjectKind === "lent_loan" && !lentLoans.some((l) => l.id === key)) throw new Error("That loan no longer exists.");
      const bad = validateCollectionNote(n, todayIso());
      if (bad) throw new Error(bad);
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const clean: Record<string, unknown> = {
        subjectKind: n.subjectKind, subjectKey: key, subjectLabel: label, date: n.date, channel: n.channel, outcome: n.outcome,
        createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown", createdAt: Date.now(),
      };
      if (n.note?.trim()) clean.note = n.note.trim().slice(0, 500);
      if (n.promisedDate) clean.promisedDate = n.promisedDate;
      if (n.promisedAmount != null && n.promisedAmount > 0) clean.promisedAmount = Math.round(n.promisedAmount * 100) / 100;
      if (n.nextFollowUpDate) clean.nextFollowUpDate = n.nextFollowUpDate;
      const ref = await addDoc(collection(db, "users", bizId, "collectionNotes"), clean);
      logAudit("collectionNote", ref.id, "create", `Collections contact with ${label}`);
    },

    deleteCollectionNote: async (id) => {
      requirePermission("delete:records");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "collectionNotes", id));
      logAudit("collectionNote", id, "delete", "Collections diary line deleted");
    },

    deleteFixedAsset: async (id) => {
      requirePermission("manage:fixedAssets");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "fixedAssets", id));
      logAudit("fixedAsset", id, "delete", `Asset deleted`);
    },

    addProject: async (p) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "projects"), {
        ...p,
        createdAt: Date.now(),
      });
      logAudit("project", ref.id, "create", `Project added: ${p.name} (${formatMoneyPlain(p.quotedPrice)})`);
    },

    updateProject: async (id, p) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "projects", id), p);
      logAudit("project", id, "update", `Project updated`);
    },

    // Deleting a project leaves its cost segments and any tagged
    // Purchases/Expenses/Sales alone — those records still exist and still
    // affect inventory/P&L exactly as before, they just lose their project
    // attribution. This mirrors how deleting a Product doesn't retroactively
    // rewrite past Purchases/Sales.
    deleteProject: async (id) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "projects", id));
      logAudit("project", id, "delete", `Project deleted`);
    },

    addProjectCostSegment: async (s) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "projectCostSegments"), {
        ...s,
        createdAt: Date.now(),
      });
      logAudit("projectCostSegment", ref.id, "create", `Cost added: ${s.label} (${formatMoneyPlain(s.amount)})`);
    },

    updateProjectCostSegment: async (id, s) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "projectCostSegments", id), s);
      logAudit("projectCostSegment", id, "update", `Cost segment updated`);
    },

    deleteProjectCostSegment: async (id) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "projectCostSegments", id));
      logAudit("projectCostSegment", id, "delete", `Cost segment deleted`);
    },

    addProjectMilestone: async (m) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "projectMilestones"), {
        ...m,
        createdAt: Date.now(),
      });
      logAudit("projectMilestone", ref.id, "create", `Milestone added: ${m.label} (${formatMoneyPlain(m.amount)})`);
    },

    // Records a project billing milestone in the books. One Sale (qty 1) of a service item, tagged to the project and
    // the client, dated today, taxed at the item's rate; a milestone already marked paid also gets its payment, so the
    // sale is not left sitting in money owed. Everything is written in one batch together with the milestone's link, so
    // it is saved whole or not at all. Never auto-called: only the owner's tap.
    // Bills the late charge accrued on an overdue invoice (lib/lateFees.ts). The amount is worked out here from the live
    // receivable and the Settings terms, less what earlier charges already billed on that invoice, so a stale screen or a
    // double tap can never bill the same days twice. One credit sale of a service item, tagged with the invoice's key.
    recordLateFee: async (lineKey, productId) => {
      requirePermission("manage:sales");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const line = receivablesAging.lines.find((l) => lateFeeKeyFor(l) === lineKey);
      if (!line) throw new Error("That invoice is no longer open");
      if (line.isOpeningBalance) throw new Error("A late charge can't be billed on an opening balance");
      if (line.saleIds.some((id) => sales.find((x) => x.id === id)?.lateFeeForKey)) throw new Error("A late charge can't be billed on a late charge");
      const product = products.find((x) => x.id === productId);
      if (!product) throw new Error("Pick the service the late charge is billed as");
      if (product.type !== "service") throw new Error("Pick a service item: goods would be taken out of stock");
      const due = lateFeeStillDue(lateChargeFor(line, settings), lateFeeBilledFor(sales, lineKey));
      if (due <= 0) throw new Error("There is no late charge left to bill on this invoice");
      const tax = taxFor(due, product, settings);
      const saleDate = todayIso();
      const creditTermDays = settings.defaultCreditTermDays;
      await addDoc(collection(db, "users", bizId, "sales"), {
        productId: product.id,
        qty: 1,
        unitPrice: due,
        ...(tax > 0.005 ? { taxAmount: tax } : {}),
        date: saleDate,
        ...(line.customer ? { customer: line.customer } : {}),
        ...(line.customerContact ? { customerContact: line.customerContact } : {}),
        notes: `Late charge on ${line.productName} (due ${line.dueDate})`,
        paymentMethod: "credit",
        creditTermDays,
        dueDate: addDaysToDate(saleDate, creditTermDays),
        invoiceId: `lf_${Date.now().toString(36)}`,
        lateFeeForKey: lineKey,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("sale", lineKey, "create", `Billed late charge ${formatMoneyPlain(due)} to ${line.customer || "customer"}`);
    },

    recordMilestoneAsSale: async (milestoneId, opts) => {
      requirePermission("manage:sales");
      requirePermission("manage:projects");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const milestone = projectMilestones.find((x) => x.id === milestoneId);
      if (!milestone) throw new Error("That milestone no longer exists");
      if (milestoneAlreadyRecorded(milestone)) throw new Error("This milestone is already recorded as a sale");
      const project = projects.find((x) => x.id === milestone.projectId);
      if (!project) throw new Error("That project no longer exists");
      const product = products.find((x) => x.id === opts.productId);
      if (!product) throw new Error("Pick the service this milestone is for");
      if (product.type !== "service") throw new Error("Pick a service item: goods would be taken out of stock");
      const amounts = milestoneSaleAmounts(milestone.amount, opts.amountIncludesTax, taxRatePctFor(product, settings));
      if (!amounts) throw new Error("This milestone has no amount to record");
      const saleDate = todayIso();
      const invoiceId = `ms_${milestoneId.slice(-6)}_${Date.now().toString(36)}`;
      const paid = milestone.status === "paid";
      const creditTermDays = settings.defaultCreditTermDays;
      const who = { createdByUid: myUid, createdByName: memberName ?? user?.email ?? "Unknown" };
      const batch = writeBatch(db);
      const saleRef = doc(collection(db, "users", bizId, "sales"));
      batch.set(saleRef, {
        productId: product.id,
        qty: 1,
        unitPrice: amounts.net,
        ...(amounts.tax > 0.005 ? { taxAmount: amounts.tax } : {}),
        date: saleDate,
        ...(project.client ? { customer: project.client } : {}),
        notes: `${project.name}: ${milestone.label}`,
        paymentMethod: "credit",
        creditTermDays,
        dueDate: addDaysToDate(saleDate, creditTermDays),
        invoiceId,
        projectId: project.id,
        ...who,
        createdAt: Date.now(),
      });
      if (paid) {
        const payRef = doc(collection(db, "users", bizId, "receivablePayments"));
        batch.set(payRef, {
          saleId: saleRef.id,
          amount: amounts.total,
          date: saleDate,
          method: opts.paymentMethod ?? "bank_transfer",
          note: `Milestone: ${milestone.label}`,
          ...who,
          createdAt: Date.now(),
        });
      }
      batch.update(doc(db, "users", bizId, "projectMilestones", milestoneId), {
        saleInvoiceId: invoiceId,
        ...(milestone.status === "pending" ? { status: "invoiced", invoicedDate: saleDate } : {}),
      });
      await batch.commit();
      logAudit(
        "projectMilestone",
        milestoneId,
        "update",
        `Recorded in the books: ${milestone.label}, ${formatMoneyPlain(amounts.total)}${paid ? " (paid)" : " (owed)"}`
      );
    },

    updateProjectMilestone: async (id, m) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "projectMilestones", id), m);
      logAudit(
        "projectMilestone",
        id,
        "update",
        m.status ? `Milestone marked ${m.status}` : "Milestone updated"
      );
    },

    deleteProjectMilestone: async (id) => {
      requirePermission("manage:projects");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "projectMilestones", id));
      logAudit("projectMilestone", id, "delete", `Milestone deleted`);
    },

    clockIn: async (jobLabel, opts) => {
      requirePermission("create:timeEntry");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "timeEntries"), {
        memberUid: myUid,
        memberName: memberName ?? user?.email ?? "Unknown",
        jobLabel,
        billable: opts?.billable ?? true,
        ...(opts?.hourlyRate != null ? { hourlyRate: opts.hourlyRate } : {}),
        ...(opts?.projectId ? { projectId: opts.projectId } : {}),
        clockIn: Date.now(),
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("timeEntry", ref.id, "create", `Clocked in: ${jobLabel}`);
    },
    clockOut: async (id) => {
      requirePermission("create:timeEntry");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      // Firestore rules only allow the creator's own update to touch the
      // `clockOut` field, and only once — see the timeEntries block in
      // firestore.rules. This is intentionally the one field a Staff
      // member can ever change after saving, same as a cash count is
      // create-only: no going back to edit the hours themselves.
      await updateDoc(doc(db, "users", bizId, "timeEntries", id), { clockOut: Date.now() });
      logAudit("timeEntry", id, "update", "Clocked out");
    },
    addTimeEntry: async (e) => {
      // Backfilling or logging on someone else's behalf is an Owner/Manager
      // action — a Staff member can only ever create their own via clockIn.
      requirePermission("manage:timeEntries");
      const { businessId: bizId, uid: myUid } = requireBusiness();
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, "users", bizId, "timeEntries"), {
        ...e,
        createdByUid: myUid,
        createdByName: memberName ?? user?.email ?? "Unknown",
        createdAt: Date.now(),
      });
      logAudit("timeEntry", ref.id, "create", `Time entry added for ${e.memberName}: ${e.jobLabel}`);
    },
    updateTimeEntry: async (id, e) => {
      requirePermission("manage:timeEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", bizId, "timeEntries", id), e);
      logAudit("timeEntry", id, "update", "Time entry corrected");
    },
    deleteTimeEntry: async (id) => {
      requirePermission("manage:timeEntries");
      const { businessId: bizId } = requireBusiness();
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", bizId, "timeEntries", id));
      logAudit("timeEntry", id, "delete", "Time entry deleted");
    },
  };

  // Every dated write goes through the period lock (lib/periodLock.ts). The
  // table of which methods/dates are covered lives in lib/periodGuards.ts.
  const value = withPeriodGuards(
    rawValue,
    () => normalizeClosedThrough(settings.booksClosedThrough),
    () => ({
      sales,
      purchases,
      expenses,
      accruals,
      tillPayouts,
      receivablePayments,
      receivableWriteOffs,
      payablePayments,
      billPayments,
      saleReturns,
      supplierReturns,
      supplierCredits,
      customerDeposits,
      rentals,
      consignments,
      businessRecords,
      discounts,
      stockAdjustments,
      capitalEntries,
      investmentTxns,
      lentLoans,
      lentLoanTxns,
      taxPayments,
      recurringExpenseOccurrences,
      openingBalances,
      shareholderDividends: settings.equity?.dividends ?? [],
    })
  );

  // Stable identity (v246): every function is handed out once, as a wrapper that calls the latest version, so it never changes identity. The value
  // object is only replaced when one of its data fields changes, so screens re-render when their data changes, not on every provider render.
  const latestValue = useRef(value);
  latestValue.current = value;
  const stableFns = useRef<Record<string, (...args: unknown[]) => unknown>>({});
  const stableOut = useRef<Record<string, unknown> | null>(null);
  const builtOut: Record<string, unknown> = {};
  for (const k of Object.keys(value) as (keyof typeof value)[]) {
    const v = value[k];
    if (typeof v === "function") {
      if (!stableFns.current[k as string]) {
        stableFns.current[k as string] = (...args: unknown[]) => (latestValue.current[k] as unknown as (...a: unknown[]) => unknown)(...args);
      }
      builtOut[k as string] = stableFns.current[k as string];
    } else {
      builtOut[k as string] = v;
    }
  }
  if (!shallowSame(stableOut.current, builtOut)) stableOut.current = builtOut;
  const current = stableOut.current as unknown as DataContextValue;

  // Accountant = view-only: every mutation is replaced by a clear refusal (lib/readOnlyGuard.ts). Wrapped once per value, not on every render.
  const finalValue = useMemo(() => (role === "accountant" ? withReadOnly(current) : current), [role, current]);

  return <DataContext.Provider value={finalValue}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

function addDaysToDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// A currency-agnostic, symbol-free number format for audit-log summaries —
// the audit log is a plain trail of what happened, not a formatted report,
// so it doesn't need Settings.currency threaded all the way down into this
// module just to write "4,500" instead of "Rs 4,500".
function formatMoneyPlain(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}