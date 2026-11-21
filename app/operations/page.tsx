"use client";

// Operations (v176): requests and approvals, procedures the team must read, the compliance register, incidents, equipment
// servicing, KPIs with targets, and performance reviews. Which tabs you see depends on your role (lib/operations.ts tabsForRole).
// None of it posts to the books or moves stock.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { PageHeader, TableCardSkeleton } from "@/components/ui";
import { OPERATIONS_TABS, visibleTabs, type OperationsTab } from "@/lib/operations";
import RequestsPanel from "@/components/ops/RequestsPanel";
import ProceduresPanel from "@/components/ops/ProceduresPanel";
import { CompliancePanel, EquipmentPanel, IncidentsPanel, KpisPanel, ReviewsPanel } from "@/components/ops/RecordsPanels";
import { QualityPanel, RisksPanel } from "@/components/ops/RiskQualityPanels";
import BusinessLogPanel from "@/components/ops/BusinessLogPanels";
import WebOrdersPanel from "@/components/ops/WebOrdersPanel";
import EscalationsPanel from "@/components/ops/EscalationsPanel";
import CapacityPanel from "@/components/ops/CapacityPanel";
import ReviewPackPanel from "@/components/ops/ReviewPackPanel";
import CoveragePanel from "@/components/ops/CoveragePanel";
import SupplierPerformancePanel from "@/components/ops/SupplierPerformancePanel";
import LeaverPanel from "@/components/ops/LeaverPanel";
import SalesTeamPanel from "@/components/ops/SalesTeamPanel";
import CycleCountPanel from "@/components/ops/CycleCountPanel";
import StarterSetPanel from "@/components/ops/StarterSetPanel";
import StockPrioritiesPanel from "@/components/ops/StockPrioritiesPanel";
import MonthClosePanel from "@/components/ops/MonthClosePanel";
import CostVariancePanel from "@/components/ops/CostVariancePanel";
import RoyaltyPanel from "@/components/ops/RoyaltyPanel";
import RoyaltyInbox from "@/components/ops/RoyaltyInbox";
import AppraisalPanel from "@/components/ops/AppraisalPanel";
import FinanceChoicesPanel from "@/components/ops/FinanceChoicesPanel";
import OrderPricePanel from "@/components/ops/OrderPricePanel";
import SourcingRiskPanel from "@/components/ops/SourcingRiskPanel";
import CycleTimePanel from "@/components/ops/CycleTimePanel";
import RecruitingPanel from "@/components/ops/RecruitingPanel";
import TaxSetAsidePanel from "@/components/ops/TaxSetAsidePanel";
import ExitRecordsPanel from "@/components/ops/ExitRecordsPanel";
import ObligationsPanel from "@/components/ops/ObligationsPanel";
import SuccessionPanel from "@/components/ops/SuccessionPanel";
import FeedbackLoopsPanel from "@/components/ops/FeedbackLoopsPanel";
import ScenarioPlanPanel from "@/components/ops/ScenarioPlanPanel";
import ComplexityPanel from "@/components/ops/ComplexityPanel";
import MarketRatesPanel from "@/components/ops/MarketRatesPanel";
import DeliveryRunPanel from "@/components/ops/DeliveryRunPanel";
import GroupPanel from "@/components/ops/GroupPanel";
import ContractsPanel from "@/components/ops/ContractsPanel";
import ProfitSplitPanel from "@/components/ops/ProfitSplitPanel";
import SustainabilityPanel from "@/components/ops/SustainabilityPanel";
import PartnerRevenuePanel from "@/components/ops/PartnerRevenuePanel";
import CustomerProfitPanel from "@/components/ops/CustomerProfitPanel";
import SystemCheckPanel from "@/components/ops/SystemCheckPanel";
import TrialBalancePanel from "@/components/ops/TrialBalancePanel";
import JournalPanel from "@/components/ops/JournalPanel";
import ContractorSharePanel from "@/components/ops/ContractorSharePanel";
import YearEndPanel from "@/components/ops/YearEndPanel";

export default function OperationsPage() {
  const { role } = useAuth();
  const { loading, settings } = useData();
  const allowed = useMemo(() => visibleTabs(role, settings.businessKind, settings.showAllScreens), [role, settings.businessKind, settings.showAllScreens]);
  const [tab, setTab] = useState<OperationsTab | null>(null);

  // Open on the first tab this role may see, and move off a tab the role may not see.
  useEffect(() => {
    if (allowed.length === 0) return;
    if (!tab || !allowed.includes(tab)) setTab(allowed[0]);
  }, [allowed, tab]);

  if (loading) {
    return (
      <>
        <PageHeader title="Operations" />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  if (allowed.length === 0) {
    return (
      <>
        <PageHeader title="Operations" />
        <p className="text-sm text-muted">Operations is not open to your role.</p>
      </>
    );
  }

  const shown = OPERATIONS_TABS.filter((t) => allowed.includes(t.key));

  return (
    <>
      <PageHeader title="Operations" />
      <p className="text-sm text-muted mb-4 max-w-2xl">
        The running of the business beyond the money: who has approved what, the procedures everyone follows, what expires and when,
        what went wrong, what needs servicing, the numbers that show whether you are on course, and how people are doing.
        Nothing here posts to the books or moves stock.
      </p>
      <div className="flex flex-wrap gap-2 mb-5">
        {shown.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3.5 py-1.5 text-xs min-h-[36px] ${
              tab === t.key ? "border-amber-soft text-fg" : "border-line text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "requests" && <RequestsPanel />}
      {tab === "procedures" && <ProceduresPanel />}
      {tab === "compliance" && <CompliancePanel />}
      {tab === "incidents" && <IncidentsPanel />}
      {tab === "equipment" && <EquipmentPanel />}
      {tab === "kpis" && <KpisPanel />}
      {tab === "reviews" && <ReviewsPanel />}
      {tab === "risks" && <RisksPanel />}
      {tab === "quality" && <QualityPanel />}
      {tab === "competitors" && <BusinessLogPanel kind="competitor" />}
      {tab === "objectives" && <BusinessLogPanel kind="objective" />}
      {tab === "correspondence" && <BusinessLogPanel kind="correspondence" />}
      {tab === "inspections" && <BusinessLogPanel kind="inspection" />}
      {tab === "partners" && <BusinessLogPanel kind="partner" />}
      {tab === "webOrders" && <WebOrdersPanel />}
      {tab === "waitlist" && <BusinessLogPanel kind="waitlist" />}
      {tab === "backorders" && <BusinessLogPanel kind="backorder" />}
      {tab === "decisions" && <BusinessLogPanel kind="decision" />}
      {tab === "handover" && <BusinessLogPanel kind="handover" />}
      {tab === "escalations" && <EscalationsPanel />}
      {tab === "responsibilities" && <BusinessLogPanel kind="responsibility" />}
      {tab === "capacity" && <CapacityPanel />}
      {tab === "review" && <ReviewPackPanel />}
      {tab === "coverage" && <CoveragePanel />}
      {tab === "suppliers" && <SupplierPerformancePanel />}
      {tab === "leavers" && <LeaverPanel />}
      {tab === "salesteam" && <SalesTeamPanel />}
      {tab === "cyclecounts" && <CycleCountPanel />}
      {tab === "starter" && <StarterSetPanel />}
      {tab === "priorities" && <StockPrioritiesPanel />}
      {tab === "close" && <MonthClosePanel />}
      {tab === "costvariance" && <CostVariancePanel />}
      {tab === "royalties" && <RoyaltyPanel />}
      {tab === "royaltyinbox" && <RoyaltyInbox />}
      {tab === "appraisal" && <AppraisalPanel />}
      {tab === "choices" && <FinanceChoicesPanel />}
      {tab === "pricecheck" && <OrderPricePanel />}
      {tab === "sourcing" && <SourcingRiskPanel />}
      {tab === "cycletime" && <CycleTimePanel />}
      {tab === "recruiting" && <RecruitingPanel />}
      {tab === "taxsetaside" && <TaxSetAsidePanel />}
      {tab === "exitrecords" && <ExitRecordsPanel />}
      {tab === "obligations" && <ObligationsPanel />}
      {tab === "succession" && <SuccessionPanel />}
      {tab === "loops" && <FeedbackLoopsPanel />}
      {tab === "scenarios" && <ScenarioPlanPanel />}
      {tab === "complexity" && <ComplexityPanel />}
      {tab === "marketrates" && <MarketRatesPanel />}
      {tab === "deliveryrun" && <DeliveryRunPanel />}
      {tab === "group" && <GroupPanel />}
      {tab === "contracts" && <ContractsPanel />}
      {tab === "profitsplit" && <ProfitSplitPanel />}
      {tab === "sustainability" && <SustainabilityPanel />}
      {tab === "partnerrevenue" && <PartnerRevenuePanel />}
      {tab === "customerprofit" && <CustomerProfitPanel />}
      {tab === "systemcheck" && <SystemCheckPanel />}
      {tab === "trialbalance" && <TrialBalancePanel />}
      {tab === "journal" && <JournalPanel />}
      {tab === "contractorshare" && <ContractorSharePanel />}
      {tab === "yearend" && <YearEndPanel />}
    </>
  );
}
