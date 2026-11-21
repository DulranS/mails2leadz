"use client";

import { formatCampaignSpend, formatPromoCodes, parseCampaignSpend, parsePromoCodes } from "@/lib/promoCodes";
import { parseCustomerFieldLabels } from "@/lib/customerFields";
import { isValidTin } from "@/lib/invoiceNumber";
import { MAX_LATE_FEE_MONTHLY_PCT } from "@/lib/lateFees";
import { useRef, useState } from "react";
import { useData } from "@/contexts/DataContext";
import MarketingCostRecorder from "@/components/MarketingCostRecorder";
import { useAuth } from "@/contexts/AuthContext";
import { useRequireRole } from "@/lib/roleGuard";
import { Button, Card, Checkbox, Field, Input, Label, PageHeader, Select, Tabs, Textarea } from "@/components/ui";
import { cleanOfferContext, MAX_OFFER_CONTEXT } from "@/lib/aiDraft";
import { CURRENCIES } from "@/lib/fx";
import PlanCard from "@/components/PlanCard";
import ConnectionsCard from "@/components/ConnectionsCard";
import PrinterSetup from "@/components/PrinterSetup";
import AdSpendImport from "@/components/AdSpendImport";
import CloseBooksCard from "@/components/CloseBooksCard";
import MenuTailoring from "@/components/MenuTailoring";
import DeliveryChargeSetup from "@/components/DeliveryChargeSetup";
import { uploadBusinessLogo, removeBusinessLogo } from "@/lib/logoUpload";
import MfaCard from "@/components/MfaCard";

// Firebase Auth error codes are technical (auth/invalid-credential,
// auth/requires-recent-login) — map the ones a user can actually hit here
// to plain language instead of surfacing the raw code.
function describeAuthError(message: string): string {
  if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) {
    return "Current password is incorrect.";
  }
  if (message.includes("auth/email-already-in-use")) {
    return "That email is already in use by another account.";
  }
  if (message.includes("auth/invalid-email")) {
    return "That doesn't look like a valid email address.";
  }
  if (message.includes("auth/weak-password")) {
    return "That password is too weak — use at least 6 characters.";
  }
  if (message.includes("auth/requires-recent-login")) {
    return "For security, please sign out and back in, then try again.";
  }
  if (message.includes("auth/too-many-requests")) {
    return "Too many attempts — please wait a moment and try again.";
  }
  return message;
}

export default function SettingsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner"]);
  const { settings, updateSettings, updateOwnProfile } = useData();
  const { user, businessId, memberName, changeEmail, changePassword } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [taxRatePct, setTaxRatePct] = useState(settings.taxRatePct.toString());
  const [costingMethod, setCostingMethod] = useState<"average" | "batch">(settings.costingMethod ?? "average");
  const [salesTaxEnabled, setSalesTaxEnabled] = useState(settings.salesTaxEnabled ?? false);
  const [salesTaxRatePct, setSalesTaxRatePct] = useState((settings.salesTaxRatePct ?? 0).toString());
  const [salesTaxLabel, setSalesTaxLabel] = useState(settings.salesTaxLabel ?? "Tax");
  const [currency, setCurrency] = useState(settings.currency);
  const [businessName, setBusinessName] = useState(settings.businessName ?? "");
  const [offerContext, setOfferContext] = useState(settings.offerContext ?? "");
  const [businessAddress, setBusinessAddress] = useState(settings.businessAddress ?? "");
  const [businessPhone, setBusinessPhone] = useState(settings.businessPhone ?? "");
  const [taxIdNumber, setTaxIdNumber] = useState(settings.taxIdNumber ?? "");
  const [vatRegistrationNo, setVatRegistrationNo] = useState(settings.vatRegistrationNo ?? "");
  const [issuedSalesLocked, setIssuedSalesLocked] = useState(settings.issuedSalesLocked ?? false);
  const [paymentInstructions, setPaymentInstructions] = useState(settings.paymentInstructions ?? "");
  const [autoReminders, setAutoReminders] = useState(settings.autoReminders ?? false);
  const [customerMessages, setCustomerMessages] = useState((settings as { customerMessages?: boolean }).customerMessages ?? false);
  const [reviewRequests, setReviewRequests] = useState((settings as { reviewRequests?: boolean }).reviewRequests ?? false);
  const [weeklyNumbers, setWeeklyNumbers] = useState((settings as { weeklyNumbers?: boolean }).weeklyNumbers ?? false);
  const [reportEmail, setReportEmail] = useState((settings as { reportEmail?: string }).reportEmail ?? "");
  const [secondSignOffAbove, setSecondSignOffAbove] = useState((settings as { secondSignOffAbove?: number }).secondSignOffAbove?.toString() ?? "");
  const [managerMonthlySpendLimit, setManagerMonthlySpendLimit] = useState(settings.managerMonthlySpendLimit?.toString() ?? "");
  const [bonusSharePct, setBonusSharePct] = useState(settings.bonusSharePct?.toString() ?? "");
  const [bonusMinProfit, setBonusMinProfit] = useState(settings.bonusMinProfit?.toString() ?? "");
  const [reminderEveryDays, setReminderEveryDays] = useState(String(settings.reminderEveryDays ?? 7));
  const [replyToEmail, setReplyToEmail] = useState(settings.replyToEmail ?? "");
  const [smsReminders, setSmsReminders] = useState(settings.smsReminders ?? false);
  const [forecastMonths, setForecastMonths] = useState(settings.forecastMonths.toString());
  const [defaultOrderingCost, setDefaultOrderingCost] = useState(settings.defaultOrderingCost.toString());
  const [defaultHoldingCostPct, setDefaultHoldingCostPct] = useState(settings.defaultHoldingCostPct.toString());
  const [defaultLeadTimeDays, setDefaultLeadTimeDays] = useState(settings.defaultLeadTimeDays.toString());
  const [defaultSafetyStockDays, setDefaultSafetyStockDays] = useState((settings.defaultSafetyStockDays ?? 0).toString());
  const [monthlyOwnerDraw, setMonthlyOwnerDraw] = useState(settings.monthlyOwnerDraw?.toString() ?? "");
  const [defaultCreditTermDays, setDefaultCreditTermDays] = useState(settings.defaultCreditTermDays.toString());
  const [promoText, setPromoText] = useState(formatPromoCodes(settings.promoCodes));
  const [promoError, setPromoError] = useState<string | null>(null);
  const [campaignText, setCampaignText] = useState(formatCampaignSpend(settings.campaignSpend));
  const [lastAdSpend, setLastAdSpend] = useState<{ spend: Record<string, number>; period: { from: string; to: string } } | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [customerFieldsText, setCustomerFieldsText] = useState((settings.customerFieldLabels ?? []).join(", "));
  const [customerFieldsError, setCustomerFieldsError] = useState<string | null>(null);
  const [tinError, setTinError] = useState<string | null>(null);
  const [lateFeeMonthlyPct, setLateFeeMonthlyPct] = useState((settings.lateFeeMonthlyPct ?? 0) > 0 ? String(settings.lateFeeMonthlyPct) : "");
  const [lateFeeGraceDays, setLateFeeGraceDays] = useState((settings.lateFeeGraceDays ?? 0) > 0 ? String(settings.lateFeeGraceDays) : "");
  const [reviewAbove, setReviewAbove] = useState((settings.reviewAbove ?? 0) > 0 ? String(settings.reviewAbove) : "");
  const [loyaltyEvery, setLoyaltyEvery] = useState((settings.loyaltyEvery ?? 0) > 0 ? String(settings.loyaltyEvery) : "");
  const [creditReviewThreshold, setCreditReviewThreshold] = useState(settings.creditReviewThreshold.toString());
  const [rentAmount, setRentAmount] = useState(settings.rentAmount.toString());
  const [rentDueDayOfMonth, setRentDueDayOfMonth] = useState(settings.rentDueDayOfMonth.toString());
  const [defaultOpeningFloat, setDefaultOpeningFloat] = useState(settings.defaultOpeningFloat.toString());
  const [profitFirstEnabled, setProfitFirstEnabled] = useState(settings.profitFirstEnabled ?? false);
  const [targetNetMarginPct, setTargetNetMarginPct] = useState(settings.targetNetMarginPct ? settings.targetNetMarginPct.toString() : "");
  const [profitFirstProfitPct, setProfitFirstProfitPct] = useState((settings.profitFirstProfitPct ?? 5).toString());
  const [profitFirstOwnerPayPct, setProfitFirstOwnerPayPct] = useState(
    (settings.profitFirstOwnerPayPct ?? 50).toString()
  );
  const [profitFirstTaxPct, setProfitFirstTaxPct] = useState((settings.profitFirstTaxPct ?? 15).toString());
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"general" | "operations" | "menu" | "account">(() => {
    // Lets a link (e.g. components/AccountBanner.tsx's trial/renewal
    // notice) land straight on a specific tab instead of always opening
    // to "general" and making the owner click again. Read once,
    // client-side only, via plain window.location rather than
    // next/navigation's useSearchParams, which would force this
    // already-fully-client page into a Suspense boundary it otherwise has
    // no reason to need.
    if (typeof window === "undefined") return "general";
    const requested = new URLSearchParams(window.location.search).get("tab");
    return requested === "operations" || requested === "menu" || requested === "account" ? requested : "general";
  });

  // Account — name, email, password. Split into three independent forms
  // since email/password need the current password re-entered and name
  // doesn't; bundling them would make an unrelated field block a save.
  const [accountName, setAccountName] = useState(memberName ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState("");

  const [newEmail, setNewEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  async function handleNameSave(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    if (!accountName.trim()) {
      setNameError("Name can't be empty.");
      return;
    }
    setNameBusy(true);
    try {
      await updateOwnProfile({ name: accountName });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Couldn't update name.");
    } finally {
      setNameBusy(false);
    }
  }

  async function handleEmailSave(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (!emailPassword) {
      setEmailError("Enter your current password to confirm this change.");
      return;
    }
    setEmailBusy(true);
    try {
      await changeEmail(trimmed, emailPassword);
      await updateOwnProfile({ email: trimmed });
      setEmailPassword("");
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 2500);
    } catch (err) {
      setEmailError(err instanceof Error ? describeAuthError(err.message) : "Couldn't update email.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    if (!currentPassword) {
      setPasswordError("Enter your current password to confirm this change.");
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (err) {
      setPasswordError(err instanceof Error ? describeAuthError(err.message) : "Couldn't update password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const promo = parsePromoCodes(promoText);
    if (promo.error) {
      setPromoError(promo.error);
      return;
    }
    setPromoError(null);
    const campaign = parseCampaignSpend(campaignText);
    if (campaign.error) {
      setCampaignError(campaign.error);
      return;
    }
    setCampaignError(null);
    const fields = parseCustomerFieldLabels(customerFieldsText);
    if (fields.error) {
      setCustomerFieldsError(fields.error);
      return;
    }
    setCustomerFieldsError(null);
    if (taxIdNumber.trim() && !isValidTin(taxIdNumber)) {
      setTinError("A Sri Lankan TIN is nine digits. Check the number and save again. Nothing was saved.");
      return;
    }
    setTinError(null);
    setBusy(true);
    await updateSettings({
      taxRatePct: Number(taxRatePct),
      costingMethod,
      salesTaxEnabled,
      salesTaxRatePct: Number(salesTaxRatePct) || 0,
      salesTaxLabel: salesTaxLabel.trim() || "Tax",
      currency,
      businessName: businessName.trim() || undefined,
      offerContext: cleanOfferContext(offerContext), // blank is saved as blank (undefined would leave the old text in place)
      businessAddress: businessAddress.trim() || undefined,
      businessPhone: businessPhone.trim() || undefined,
      taxIdNumber: taxIdNumber.trim(), // "" clears it; undefined would keep the old value
      vatRegistrationNo: vatRegistrationNo.trim(),
      issuedSalesLocked,
      paymentInstructions: paymentInstructions.trim(), // "" clears it
      autoReminders,
      customerMessages,
      reviewRequests,
      weeklyNumbers,
      reportEmail: reportEmail.trim() || undefined,
      secondSignOffAbove: secondSignOffAbove.trim() ? Number(secondSignOffAbove) : undefined,
      managerMonthlySpendLimit: managerMonthlySpendLimit.trim() && Number.isFinite(Number(managerMonthlySpendLimit)) ? Math.max(0, Number(managerMonthlySpendLimit)) : undefined,
      bonusSharePct: bonusSharePct.trim() && Number.isFinite(Number(bonusSharePct)) ? Math.min(100, Math.max(0, Number(bonusSharePct))) : undefined,
      bonusMinProfit: bonusMinProfit.trim() && Number.isFinite(Number(bonusMinProfit)) ? Math.max(0, Number(bonusMinProfit)) : undefined,
      reminderEveryDays: Math.min(60, Math.max(1, Math.floor(Number(reminderEveryDays) || 7))),
      replyToEmail: replyToEmail.trim(),
      smsReminders: autoReminders && smsReminders,
      forecastMonths: Number(forecastMonths),
      defaultOrderingCost: Number(defaultOrderingCost),
      defaultHoldingCostPct: Number(defaultHoldingCostPct),
      defaultLeadTimeDays: Number(defaultLeadTimeDays),
      defaultSafetyStockDays: Math.max(0, Number(defaultSafetyStockDays) || 0),
      monthlyOwnerDraw: monthlyOwnerDraw ? Number(monthlyOwnerDraw) : undefined,
      defaultCreditTermDays: Number(defaultCreditTermDays) || 90,
      promoCodes: promo.codes,
      campaignSpend: campaign.spend,
      customerFieldLabels: fields.labels,
      lateFeeMonthlyPct: Math.min(MAX_LATE_FEE_MONTHLY_PCT, Math.max(0, Number(lateFeeMonthlyPct) || 0)),
      lateFeeGraceDays: Math.max(0, Math.floor(Number(lateFeeGraceDays) || 0)),
      reviewAbove: Math.max(0, Number(reviewAbove) || 0),
      loyaltyEvery: Math.max(0, Number(loyaltyEvery) || 0),
      creditReviewThreshold: Number(creditReviewThreshold) || 0,
      rentAmount: Number(rentAmount) || 0,
      rentDueDayOfMonth: Math.min(28, Math.max(1, Number(rentDueDayOfMonth) || 1)),
      defaultOpeningFloat: Number(defaultOpeningFloat) || 0,
      profitFirstEnabled,
      targetNetMarginPct: Math.min(100, Math.max(0, Number(targetNetMarginPct) || 0)),
      profitFirstProfitPct: Math.min(100, Math.max(0, Number(profitFirstProfitPct) || 0)),
      profitFirstOwnerPayPct: Math.min(100, Math.max(0, Number(profitFirstOwnerPayPct) || 0)),
      profitFirstTaxPct: Math.min(100, Math.max(0, Number(profitFirstTaxPct) || 0)),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleLogoSelect(file: File) {
    if (!businessId) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const url = await uploadBusinessLogo(businessId, file);
      await updateSettings({ logoUrl: url });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Couldn't upload that image — try a smaller file.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleLogoRemove() {
    if (!businessId) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      await removeBusinessLogo(businessId);
      await updateSettings({ logoUrl: undefined });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Couldn't remove the logo — try again.");
    } finally {
      setLogoBusy(false);
    }
  }

  if (guardLoading || !allowed) return null;

  return (
    <>
      <PageHeader title="Settings" />

      <Tabs
        tabs={[
          { key: "general", label: "General" },
          { key: "operations", label: "Operations" },
          { key: "menu", label: "Menu" },
          { key: "account", label: "Account" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab !== "account" && tab !== "menu" && (
      <Card className="max-w-md">
        <form onSubmit={handleSave} className="space-y-4">
          {tab === "general" && (
            <>
              <Field>
                <Label>Tax rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={taxRatePct}
                  onChange={(e) => setTaxRatePct(e.target.value)}
                />
                <div className="text-xs text-muted mt-1.5">Applied to positive pre-tax net profit each month.</div>
              </Field>
              <Field>
                <Label>How cost of goods is worked out</Label>
                <Select value={costingMethod} onChange={(e) => setCostingMethod(e.target.value as "average" | "batch")}>
                  <option value="average">Average cost (the usual choice)</option>
                  <option value="batch">Each batch&apos;s own cost</option>
                </Select>
                <div className="text-xs text-muted mt-1.5">
                  Average cost blends everything you bought into one cost per item. &quot;Each batch&quot; costs every sale at the batch it came from
                  (the one you pick on the sale form, otherwise the one that expires soonest, otherwise the oldest delivery), so when prices
                  move between deliveries, profit follows the batch actually sold. Choose it for goods that expire or whose buying price changes a lot.
                </div>
                {costingMethod !== (settings.costingMethod ?? "average") && (
                  <div className="text-xs text-amber-soft mt-1.5">
                    Changing this restates every past month&apos;s profit and your stock value, not just new sales. It cannot be done while your books are
                    closed, and it is recorded in the audit log. Pick one and keep it.
                  </div>
                )}
              </Field>
              <Field>
                <div className="flex items-center gap-2">
                  <Checkbox id="salesTaxEnabled" checked={salesTaxEnabled} onCheckedChange={setSalesTaxEnabled} />
                  <label htmlFor="salesTaxEnabled" className="text-sm cursor-pointer">
                    Charge sales tax (VAT/GST) on sales
                  </label>
                </div>
                <div className="text-xs text-muted mt-1.5">
                  A separate thing from the income tax rate above — this is added to what a customer pays, shown as its own line on receipts and invoices.
                </div>
              </Field>
              {salesTaxEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field>
                    <Label>Sales tax rate (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={salesTaxRatePct}
                      onChange={(e) => setSalesTaxRatePct(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label>What to call it</Label>
                    <Input
                      value={salesTaxLabel}
                      onChange={(e) => setSalesTaxLabel(e.target.value)}
                      placeholder="e.g. VAT, GST, Sales Tax"
                    />
                  </Field>
                </div>
              )}
              <DeliveryChargeSetup />
              <Field>
                <Label>Business name (optional)</Label>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Perera Auto Works"
                />
                <div className="text-xs text-muted mt-1.5">
                  Shown as the letterhead on printed project quotes and invoices. Leave blank to print without one.
                </div>
              </Field>
              <Field>
                <Label>TIN (optional)</Label>
                <Input value={taxIdNumber} onChange={(e) => setTaxIdNumber(e.target.value)} placeholder="Your Inland Revenue TIN" maxLength={40} />
                {tinError && <div className="text-[11px] mt-1 text-bad">{tinError}</div>}
                <div className="text-xs text-muted mt-1.5">Printed under the business name. Balancr does not check it against the IRD.</div>
              </Field>
              <Field>
                <Label>VAT registration number (optional)</Label>
                <Input value={vatRegistrationNo} onChange={(e) => setVatRegistrationNo(e.target.value)} placeholder="Only if you are VAT-registered" maxLength={40} />
              </Field>
              <Field>
                <Label>How customers pay (optional)</Label>
                <Textarea
                  rows={3}
                  maxLength={500}
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  placeholder="e.g. Bank: ... · Account name: ... · Account no: ... · Quote the invoice number"
                />
                <div className="text-xs text-muted mt-1.5">Shown on the invoice link you send a customer. Balancr does not connect to a bank or take payments.</div>
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={customerMessages} onChange={(e) => setCustomerMessages(e.target.checked)} />
                <span>
                  <span className="font-medium">Send customers routine messages.</span> Off unless you turn it on: a booking confirmation and a reminder the day before, a quote follow-up, a thank-you after a job, and a welcome after a first order. Texts only in your quiet hours. Customers who ask not to be messaged get none of these, except the confirmation and reminder for a booking they made.
                </span>
              </label>
              <Field>
                <Label>Supplier payments above this need a second signer (blank = none)</Label>
                <Input inputMode="decimal" value={secondSignOffAbove} onChange={(e) => setSecondSignOffAbove(e.target.value)} />
                <div className="text-xs text-muted mt-1">The person who records the payment cannot approve it. Approval is in the requests list.</div>
              </Field>
              <Field>
                <Label>Managers&apos; spending limit per month (blank = none)</Label>
                <Input inputMode="decimal" value={managerMonthlySpendLimit} onChange={(e) => setManagerMonthlySpendLimit(e.target.value)} />
                <div className="text-xs text-muted mt-1">A manager&apos;s one-off expenses in a calendar month cannot go over this. The owner is not limited. Recurring costs are not counted.</div>
              </Field>
              <Field>
                <Label>Results bonus: share of profit above the minimum, in percent (blank = no pool)</Label>
                <Input inputMode="decimal" value={bonusSharePct} onChange={(e) => setBonusSharePct(e.target.value)} />
                <div className="text-xs text-muted mt-1">From 0 to 100. The pool is shared by pay rate on the Employees page. Calculation only: nothing is paid or booked.</div>
              </Field>
              <Field>
                <Label>Results bonus: profit a month must reach before any pool (blank = 0)</Label>
                <Input inputMode="decimal" value={bonusMinProfit} onChange={(e) => setBonusMinProfit(e.target.value)} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={weeklyNumbers} onChange={(e) => setWeeklyNumbers(e.target.checked)} />
                <span>
                  <span className="font-medium">Email me my week every Monday.</span> Sales, expenses and what is left between them for the week that just ended. Off unless you turn it on.
                </span>
              </label>
              <Field>
                <Label>Address for the weekly numbers</Label>
                <Input type="email" value={reportEmail} onChange={(e) => setReportEmail(e.target.value)} placeholder="you@example.com" />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={reviewRequests} onChange={(e) => setReviewRequests(e.target.checked)} />
                <span>
                  <span className="font-medium">Ask happy customers for a review.</span> Off unless you turn it on. Sent three to five days after a job, only to customers who have agreed to marketing.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={autoReminders} onChange={(e) => setAutoReminders(e.target.checked)} />
                <span>
                  <span className="font-medium">Send overdue reminders by email.</span> Off unless you turn it on. Each customer with an overdue invoice and an email address gets one reminder with the invoice link, at most once per interval below. Sent from the Balancr address.
                </span>
              </label>
              <Field>
                <Label>Days between reminders</Label>
                <Input type="number" min={1} max={60} value={reminderEveryDays} onChange={(e) => setReminderEveryDays(e.target.value)} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={smsReminders} disabled={!autoReminders} onChange={(e) => setSmsReminders(e.target.checked)} />
                <span>
                  <span className="font-medium">Also send a text message (SMS).</span> Used for a customer who has a Sri Lankan mobile number on the sale but no email address,
                  or whose email could not be sent. At most one reminder per invoice per interval, never an email and a text together. Needs the SMS service set up on the
                  server (Notify.lk); each text costs a few rupees from that account. Only works while email reminders above are on.
                </span>
              </label>
              <Field>
                <Label>Reply-to email (optional)</Label>
                <Input value={replyToEmail} onChange={(e) => setReplyToEmail(e.target.value)} placeholder="Where customers should reply" maxLength={200} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={issuedSalesLocked} onChange={(e) => setIssuedSalesLocked(e.target.checked)} />
                <span>
                  <span className="font-medium">Lock issued sales.</span> Once on, no sale can be edited or deleted, old ones included; only its project and note can change.
                  A mistake is corrected by a return or a credit, so both stay on record. Recommended once you are VAT-registered.
                </span>
              </label>
              <Field>
                <Label>What we sell (optional)</Label>
                <Textarea
                  rows={3}
                  maxLength={MAX_OFFER_CONTEXT}
                  value={offerContext}
                  onChange={(e) => setOfferContext(e.target.value)}
                  placeholder="e.g. We install and repair home plumbing in Colombo: fixed-price quotes, same-week visits, 12-month workmanship cover."
                />
                <div className="text-xs text-muted mt-1.5">
                  Two or three plain sentences: what you sell, to whom, and why it is worth buying. Used only to write the &quot;Write with AI&quot; drafts on Leads. It is sent to the AI provider with each draft and is never shown to customers. {offerContext.length}/{MAX_OFFER_CONTEXT}
                </div>
              </Field>
              {businessName.trim() && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field>
                    <Label>Business address (optional)</Label>
                    <Input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} />
                  </Field>
                  <Field>
                    <Label>Business phone (optional)</Label>
                    <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} />
                  </Field>
                </div>
              )}
              {businessName.trim() && (
                <Field>
                  <Label>Logo (optional)</Label>
                  <div className="flex items-center gap-3">
                    {settings.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={settings.logoUrl}
                        alt="Business logo"
                        className="w-12 h-12 object-contain rounded border border-line bg-panel2"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded border border-dashed border-line shrink-0" />
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoSelect(file);
                        e.target.value = "";
                      }}
                    />
                    <Button type="button" variant="ghost" disabled={logoBusy} onClick={() => logoInputRef.current?.click()}>
                      {logoBusy ? "Uploading…" : settings.logoUrl ? "Replace" : "Upload logo"}
                    </Button>
                    {settings.logoUrl && (
                      <Button type="button" variant="ghost" disabled={logoBusy} onClick={handleLogoRemove}>
                        Remove
                      </Button>
                    )}
                  </div>
                  {logoError && <div className="text-xs text-bad mt-1.5">{logoError}</div>}
                  <div className="text-xs text-muted mt-1.5">
                    Shown next to the letterhead on printed project quotes and invoices.
                  </div>
                </Field>
              )}
              <Field>
                <Label>Base currency (used for all reports)</Label>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <div className="text-xs text-muted mt-1.5">
                  Every report and total is shown in this currency. A specific sale or purchase can still be entered
                  in a different currency with its own exchange rate — it gets converted to this one automatically.
                </div>
              </Field>
              <Field>
                <Label>Forecast horizon (months)</Label>
                <Input
                  type="number"
                  min="1"
                  max="12"
                  value={forecastMonths}
                  onChange={(e) => setForecastMonths(e.target.value)}
                />
                <div className="text-xs text-muted mt-1.5">How far the dashboard trend line projects forward.</div>
              </Field>
            </>
          )}

          {tab === "operations" && (
            <>
          <div className="pt-1">
            <div className="text-xs font-medium text-muted mb-3">
              EOQ / reorder planning defaults — used for any product that doesn&apos;t set its own
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field>
                <Label>Ordering cost</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={defaultOrderingCost}
                  onChange={(e) => setDefaultOrderingCost(e.target.value)}
                />
              </Field>
              <Field>
                <Label>Holding cost %/yr</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={defaultHoldingCostPct}
                  onChange={(e) => setDefaultHoldingCostPct(e.target.value)}
                />
              </Field>
              <Field>
                <Label>Lead time (days)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={defaultLeadTimeDays}
                  onChange={(e) => setDefaultLeadTimeDays(e.target.value)}
                />
              </Field>
              <Field>
                <Label>Safety buffer (days)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={defaultSafetyStockDays}
                  onChange={(e) => setDefaultSafetyStockDays(e.target.value)}
                />
                <div className="text-xs text-muted mt-1.5">Extra days of stock held on top of lead time. 0 = none.</div>
              </Field>
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <div className="text-xs font-medium text-muted mb-1">Your own labor cost (optional)</div>
            <div className="text-xs text-muted mb-3">
              What would you pay someone else to do your job? This doesn&apos;t create a real transaction or change
              any of the financial statements — it just powers a separate &quot;true profitability&quot; figure on
              the Dashboard, so the business looking profitable isn&apos;t secretly built on nobody paying you for
              the hours you put in.
            </div>
            <Field>
              <Label>Imputed owner pay / month</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={monthlyOwnerDraw}
                onChange={(e) => setMonthlyOwnerDraw(e.target.value)}
                placeholder="e.g. 150000"
              />
            </Field>
          </div>

          <div className="border-t border-line pt-4">
            <div className="text-xs font-medium text-muted mb-1">Credit sales</div>
            <div className="text-xs text-muted mb-3">
              Defaults used when you mark a sale as &quot;credit&quot; — money owed to you rather than collected on the spot.
            </div>
            <Field>
              <Label>Extra customer details (optional)</Label>
              <Input value={customerFieldsText} onChange={(e) => setCustomerFieldsText(e.target.value)} placeholder="Vehicle number, Birthday" />
              <div className={`text-[11px] mt-1 ${customerFieldsError ? "text-bad" : "text-muted"}`}>
                {customerFieldsError ?? "Up to four names, separated by commas. Each customer then has a box for each one. Information only."}
              </div>
            </Field>
            <Field>
              <Label>Promo campaign spend (optional)</Label>
              <Input value={campaignText} onChange={(e) => setCampaignText(e.target.value)} placeholder="SAVE10:5000, WELCOME:1200" />
              <div className={`text-[11px] mt-1 ${campaignError ? "text-bad" : "text-muted"}`}>
                {campaignError ?? "What each promo code cost you, to compare with the sales it brought in. A comparison only: it is not added to your expenses or profit."}
              </div>
              <AdSpendImport
                codes={Object.keys(parsePromoCodes(promoText).codes)}
                onImport={(spend, _summary, period) => {
                  setLastAdSpend({ spend, period });
                  setCampaignText(formatCampaignSpend({ ...parseCampaignSpend(campaignText).spend, ...spend }));
                  setCampaignError(null);
                }}
              />
              <AdSpendImport
                endpoint="/api/ads/google-spend"
                sourceName="Google Ads"
                codes={Object.keys(parsePromoCodes(promoText).codes)}
                onImport={(spend, _summary, period) => {
                  setLastAdSpend({ spend, period });
                  setCampaignText(formatCampaignSpend({ ...parseCampaignSpend(campaignText).spend, ...spend }));
                  setCampaignError(null);
                }}
              />
            </Field>
            {lastAdSpend && <MarketingCostRecorder spend={lastAdSpend.spend} period={lastAdSpend.period} />}
            <Field>
              <Label>Promo codes (optional)</Label>
              <Input value={promoText} onChange={(e) => setPromoText(e.target.value)} placeholder="SAVE10:10, WELCOME:5" />
              <div className={`text-[11px] mt-1 ${promoError ? "text-bad" : "text-muted"}`}>
                {promoError ?? "Code:percent off, separated by commas. On a sale in your shop currency, typing a code fills in the lower price. Nothing else changes."}
              </div>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <Label>Default credit term (days)</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={defaultCreditTermDays}
                  onChange={(e) => setDefaultCreditTermDays(e.target.value)}
                />
              </Field>
              <Field>
                <Label>Flag credit sales above</Label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={creditReviewThreshold}
                  onChange={(e) => setCreditReviewThreshold(e.target.value)}
                />
              </Field>
            </div>
            <div className="text-xs font-medium text-muted mt-4 mb-1">Team entries to check, and loyalty points (optional)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <Label>Ask me to check a discount, expense, return or refund a team member makes over</Label>
                <Input type="number" min="0" step="0.01" value={reviewAbove} onChange={(e) => setReviewAbove(e.target.value)} placeholder="Off" />
              </Field>
              <Field>
                <Label>Loyalty: one point for every amount a customer spends with you</Label>
                <Input type="number" min="0" step="0.01" value={loyaltyEvery} onChange={(e) => setLoyaltyEvery(e.target.value)} placeholder="Off" />
              </Field>
            </div>
            <div className="text-xs font-medium text-muted mt-4 mb-1">Late payment charge (optional)</div>
            <div className="text-xs text-muted mb-3">
              Only if it is part of the terms you agreed with your customers. When set, an overdue invoice shows the charge that has built up and your
              WhatsApp reminder mentions it. It is a prompt for you: nothing is added to what a customer owes or to your books unless you bill it yourself.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <Label>Charge per month overdue (%)</Label>
                <Input type="number" min="0" max={MAX_LATE_FEE_MONTHLY_PCT} step="0.1" value={lateFeeMonthlyPct} onChange={(e) => setLateFeeMonthlyPct(e.target.value)} placeholder="Off" />
              </Field>
              <Field>
                <Label>Grace period after the due date (days)</Label>
                <Input type="number" min="0" step="1" value={lateFeeGraceDays} onChange={(e) => setLateFeeGraceDays(e.target.value)} placeholder="0" />
              </Field>
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <div className="text-xs font-medium text-muted mb-1">Rent &amp; cash</div>
            <div className="text-xs text-muted mb-3">
              Powers the Cash Flow page&apos;s &quot;can you make rent&quot; projection and the default opening float on a new cash
              count.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field>
                <Label>Rent / month</Label>
                <Input type="number" min="0" step="1" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} />
              </Field>
              <Field>
                <Label>Due day of month</Label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  step="1"
                  value={rentDueDayOfMonth}
                  onChange={(e) => setRentDueDayOfMonth(e.target.value)}
                />
              </Field>
              <Field>
                <Label>Default opening float</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={defaultOpeningFloat}
                  onChange={(e) => setDefaultOpeningFloat(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <div className="text-xs font-medium text-muted mb-1">Profit margin target (optional)</div>
            <div className="text-xs text-muted mb-3">
              The net profit margin you are aiming for, as a percentage of revenue. The Dashboard then shows each recent month&apos;s actual
              margin against it and warns when you have missed it two months running. Leave empty for no target. It changes nothing in your books.
            </div>
            <Field>
              <Label>Net margin target (%)</Label>
              <Input type="number" min="0" max="100" step="0.5" value={targetNetMarginPct} onChange={(e) => setTargetNetMarginPct(e.target.value)} placeholder="e.g. 15" />
            </Field>
          </div>

          <div className="border-t border-line pt-4">
            <div className="text-xs font-medium text-muted mb-1">Profit First-style allocation (optional)</div>
            <div className="text-xs text-muted mb-3">
              A cash-management guide, not a real transaction: turn it on and the Dashboard shows how this
              month&apos;s actual cash collected splits into Profit / Owner&apos;s Pay / Tax targets, with whatever&apos;s
              left as what&apos;s really available to run on. Nothing here moves money or touches your books.
            </div>
            <Field>
              <div className="flex items-center gap-2">
                <Checkbox id="profitFirstEnabled" checked={profitFirstEnabled} onCheckedChange={setProfitFirstEnabled} />
                <label htmlFor="profitFirstEnabled" className="text-sm cursor-pointer">
                  Show Profit First allocation on the Dashboard
                </label>
              </div>
            </Field>
            {profitFirstEnabled && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field>
                    <Label>Profit %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={profitFirstProfitPct}
                      onChange={(e) => setProfitFirstProfitPct(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label>Owner&apos;s pay %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={profitFirstOwnerPayPct}
                      onChange={(e) => setProfitFirstOwnerPayPct(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <Label>Tax %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={profitFirstTaxPct}
                      onChange={(e) => setProfitFirstTaxPct(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="text-xs text-muted mt-2">
                  {(() => {
                    const opex = Math.max(
                      0,
                      100 - (Number(profitFirstProfitPct) || 0) - (Number(profitFirstOwnerPayPct) || 0) - (Number(profitFirstTaxPct) || 0)
                    );
                    const overCommitted =
                      (Number(profitFirstProfitPct) || 0) + (Number(profitFirstOwnerPayPct) || 0) + (Number(profitFirstTaxPct) || 0) >= 100;
                    return overCommitted
                      ? "These three already add up to 100% or more — Opex would show as 0%, meaning the targets aren't all achievable at once."
                      : `Opex gets the remaining ${opex}% automatically — it isn't its own setting.`;
                  })()}
                </div>
              </>
            )}
          </div>
            </>
          )}

          {(tab === "general" || tab === "operations") && (
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save settings"}
              </Button>
              {saved && <span className="text-xs text-good">Saved</span>}
            </div>
          )}
        </form>
      </Card>
      )}

      {tab === "operations" && <CloseBooksCard />}
      {tab === "menu" && <MenuTailoring />}

      {tab === "account" && (
      <Card className="max-w-md">
        <div className="text-sm font-medium mb-4">Account</div>

        <form onSubmit={handleNameSave} className="space-y-3 pb-4 border-b border-line">
          <Field>
            <Label>Your name</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </Field>
          {nameError && <div className="text-xs text-bad">{nameError}</div>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={nameBusy}>
              {nameBusy ? "Saving…" : "Save name"}
            </Button>
            {nameSaved && <span className="text-xs text-good">Saved</span>}
          </div>
        </form>

        <form onSubmit={handleEmailSave} className="space-y-3 py-4 border-b border-line">
          <Field>
            <Label>Email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </Field>
          <Field>
            <Label>Current password</Label>
            <Input
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Confirm it's you"
            />
          </Field>
          {emailError && <div className="text-xs text-bad">{emailError}</div>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={emailBusy}>
              {emailBusy ? "Saving…" : "Save email"}
            </Button>
            {emailSaved && <span className="text-xs text-good">Saved</span>}
          </div>
        </form>

        <form onSubmit={handlePasswordSave} className="space-y-3 pt-4">
          <Field>
            <Label>Current password</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <Label>New password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field>
              <Label>Confirm new password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>
          </div>
          {passwordError && <div className="text-xs text-bad">{passwordError}</div>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={passwordBusy}>
              {passwordBusy ? "Saving…" : "Save password"}
            </Button>
            {passwordSaved && <span className="text-xs text-good">Saved</span>}
          </div>
        </form>
      </Card>
      )}

      {tab === "account" && <PlanCard />}

      {tab === "account" && <ConnectionsCard />}

      {tab === "account" && <PrinterSetup />}

      {tab === "account" && <MfaCard />}

      <Card className="max-w-md">
        <div className="text-sm font-medium mb-1">Legal</div>
        <div className="text-xs text-muted mb-3">
          Privacy policy and terms of service for this business, shown to your team and any
          invited members.
        </div>
        <a href="/legal" target="_blank" rel="noreferrer" className="text-sm text-info hover:underline">
          View / edit privacy policy &amp; terms →
        </a>
      </Card>
    </>
  );
}
