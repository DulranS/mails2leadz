## v340 - build fix: unescaped apostrophes
- Fixed react/no-unescaped-entities in five files: app/customers/page.tsx, components/BankFeedCard.tsx, components/CapitalisedDevCard.tsx, components/HmrcCard.tsx, components/PosDaysCard.tsx. Each apostrophe in JSX text is now &apos; (renders identically).
- Checked with a JSX text scanner (no unescaped quote, > or } in any JSX text across the repo: 0). Lint itself could not run in the build sandbox.

## v339
- Verifier fix: scripts/verify-tax-sites.ts now allow-lists lib/policyLog.ts. The accounting policy audit names the sales tax rate setting in its log only; it reads no rate. verify-tax-sites: 20 checks pass.

## v338 - shareholders' equity trend checked

- **Added.** "Shareholders' equity falling": the equity movement over the last three months, from profit plus owner money in, less owner money out. It excludes unrealised investment gains, which are not dated. Flagged when it is negative.
- **Still not measured.** Total assets. Stock and the market value of investments are held only as today's totals, so an earlier figure would be a guess.
- **Tests.** scripts/verify-balance-trend.ts (23 checks). Parser-only pass over all 1,111 TypeScript files: no syntax errors.

## v337 - build fix; balance sheet trend checks; WHT citation corrected

- **Fixed (build).** Components/ops/ProfitSplitPanel.tsx had a stray comma before relatedPartyExtra, so "npm run build" failed with "Expression expected". Fixed; a parser-only pass over all 1,111 TypeScript files finds no syntax errors. verify-related-policy now checks the corrected call.
- **Added.** Two balance sheet checks from the owner's five questions, measured against the figures three months back: receivables growing faster than sales (over 10 points), and borrowing rising fast (over 20%, or any new borrowing from nothing). Receivables and loans are rebuilt as at that date; they are the only figures the app can date exactly.
- **Not measured, on purpose.** Total assets and shareholders' equity. Stock and owners' capital are held only as today's totals, so an earlier figure would be a guess. The checks say so.
- **Corrected.** lib/payTax.ts no longer cites notice SEC/PN/IT/2026/02 as verified. The notice number and its section 10.3 could not be verified; the whole-payment reading rests on one secondary source. Marked provisional until IRD confirms.
- **Tests.** scripts/verify-balance-trend.ts (19 checks). Also passing: verify-related-policy, verify-red-flags-nonop, verify-indirect-cash, verify-journal-window, verify-statement-linkage (29/29), verify-income-metrics.

## v336 - related-party sales and purchases; accounting policy changes in the audit log

- **Related parties (added).** A customer or supplier can be marked "Related party" (a family member, a company the owner controls, a director), like tax-exempt. The Profit split red flags show the share of sales and of purchases with them over the last twelve months, flagged over 10% (rule of thumb). Matched by name, ignoring case and extra spaces.
- **Accounting policy changes (added).** A change to income tax rate, sales tax charged or sales tax rate is written to the audit log under "accounting policy", with the old and new values. The cost-of-goods method change is written under the same entity (it was under settings).
- **Red flag: frequent policy changes.** Flagged at two or more in a year. The audit log is loaded for the last 1,000 entries.
- **Figures.** Sales and purchases are valued at quantity times price, before discounts and tax. The share is a rule of thumb, not a related-party disclosure under any standard.
- **Depreciation (added).** A change to an asset's depreciation method or useful life is written to the audit log under "accounting policy", with the old and new values, and counts toward the policy-change red flag.
- **Verifier.** scripts/verify-related-policy.ts (31 checks). Related verifiers pass: customer and supplier statements, backup coverage, period lock, statement linkage, indirect cash bridge, income metrics, red flags and AI business health.

## v335 - profit to operating cash (indirect), reconciled to the Cash account

- **Added.** The accounting journal page shows a bridge for the range: profit, less gains and losses that are not cash, plus depreciation, plus each working-capital line, giving operating cash. Then investing and financing cash, and the change in the Cash account. It shows whether it reconciles.
- **How it works.** It is built from the journal's own lines (lib/journalWindow.ts, indirectCashBridge). Every entry balances, so the three sections must add up to the Cash movement. Any gap is shown as unexplained, not hidden.
- **Disposals.** Accumulated depreciation released on disposal goes to investing, and the non-cash gain or loss is taken out of operating and added back in investing. Checked with a disposal case.
- **Verifier.** scripts/verify-indirect-cash.ts (17 checks). The worked example is checked by hand: operating cash 15, investing -50, financing 1,460, Cash movement 1,425.
- **Still open.** Nothing in the bridge needs new data. It covers the range the page is set to, not a monthly statement.
- **Related verifiers still pass.** Journal window, cash split, statement linkage, period lock and statement print.

## v334 - income statement shows EBIT and EBITDA; red flags measured for one-off gains and stock build-up

- **Income statement (added).** Operating profit (EBIT) is a line under depreciation, and EBITDA is shown beneath it. Same formula as the Health page (contribution margin less operating expenses and depreciation). Pure helper: lib/incomeMetrics.ts.
- **Red flag: one-off gains covering an operating loss (measured).** It was "not measured". Now flagged when the last three months were an operating loss that disposal gains, investment income or lending interest cover. Bad debts on money lent out count as a cost. lib/redFlags.ts; the profit split panel passes the figures.
- **Red flag: stock building up (added).** Flagged when stock on hand is over 90 days of the last three months' cost of sales (a rule of thumb, shown beside the result).
- **Still open.** Receivables are already checked. Two items from the earlier red-flag list need data the app does not record: a frequent accounting policy change log, and a related-party tag on transactions. Stock history by month is not kept, so a stock trend is not measured.
- **Verifiers.** scripts/verify-income-metrics.ts (7 checks) and scripts/verify-red-flags-nonop.ts (14 checks) pass. Statement linkage, statement print, AI business health, concentration risk, contingent, purchasing power and period lock still pass.

## v333 - research gaps resolved from primary notices; personal data requests; receipt cleanup

- **SSCL (changed).** The threshold is now LKR 9 million in a quarter, or LKR 36 million over four consecutive quarters, from 1 July 2026 (KPMG on the Social Security Contribution Levy (Amendment) Act No. 10 of 2026, s.4(1)(d)). Registration is due within 15 days. The SSCL panel tests both figures; before, it tested the annual figure only and passed a zero quarter. The earlier "dropped" report concerned the VAT threshold, which VAT Amendment Act No. 14 of 2026 keeps at LKR 60m. Checked by scripts/verify-sscl.ts (all pass).
- **Revised invoice format (date settled).** Effective 1 October 2026 (Gazette Extraordinary 2500/106, 6 August 2026, via KPMG). That date has passed, so the format applies now. The comment in lib/invoiceNumber.ts is corrected. Whether an earlier format is still allowed is for the IRD to confirm.
- **Withholding tax (confirmed, no change to the calculation).** The notice (IRD SEC/PN/IT/2026/02, section 10.3, under s.85(1C)) applies 5% to a monthly payment over LKR 100,000 to resident individuals in listed professions, not to all services. lib/payTax.ts already follows this. The open point is whether 5% covers the whole monthly payment or only the part over LKR 100,000; the code uses the whole payment, and the adviser should confirm.
- **Cash payment limit (date confirmed).** Effective 8 May 2023 (KPMG on the Inland Revenue Act amendments). The flag in lib/cashPayments.ts is unchanged.
- **Personal data requests (new).** A register on the Support page: see, correct, erase or withdraw consent. The deadline is the earlier of 21 working days and one calendar month from receipt, the same rule as the AutoLeads register. Stored in the dataRequests collection with rules matching the books. Nothing is sent to the person. lib/dataRequests.ts; scripts/verify-data-requests.ts (all pass).
- **Receipt cleanup.** When a receipt is unlinked or replaced, the old file is deleted after the expense saves, so a failed save never loses it.
- **Backup and period lock.** The contingencies and dataRequests collections are in the full backup payload and the restore allow-list. The memo writes are classified as exempt from the period lock, with reasons.
- **Verifiers.** All 363 verifier scripts were run. 345 pass. The 18 that fail cannot load firebase-admin, firebase/firestore or papaparse in this sandbox; they are not logic failures.
- **Still open, outside code.** PDPA Part IV (s.27 consent and opt-out) commencement and the final DPA breach rules; the EPF and ETF return file layouts; the profession list for withholding (the owner marks it); the IRD confirmation of the whole-payment question; the sandbox packages for the 18 blocked verifiers.

## v332 - receipt photos and PDFs on expenses; research checks

- **Added.** An expense can carry a receipt: a photo (JPG, PNG or WebP) or a PDF, up to 5 MB. The file is stored under receipts/{business}/{random id} in Firebase Storage. The expense shows "View receipt" and can unlink it. Only the owner or a manager can attach one, matching who can write expenses.
- **Where.** lib/receipts.ts (type and size check, storage path), lib/receiptUpload.ts (upload and unlink), storage.rules (a receipts block with the same type and size limits, owner or active manager to write, members to read), lib/types.ts (receiptUrl, receiptPath), app/expenses/page.tsx (the form field and upload before save).
- **Checked before building.** Balancr already has OCR scanning for expenses, purchase-order approval, budgets, cash-flow runway, bank-statement reconciliation, roles, EPF and ETF due dates, and the cash-payment flag. Those were not rebuilt.
- **Not done.** Receipts are not deleted from storage when unlinked, so the file stays until cleaned up by hand. Expense receipts only. Purchases and bills have no receipt field yet.
- **Tests.** scripts/verify-receipts.ts (all checks pass). Storage rules and the upload need a browser and a live Firebase check; not run here.
- **Open, outside code.** Approval for supplier bills and payments (purchase orders already have it). Blocked by the team's decision on who approves what, not by the code.

## v331 - VAT threshold source confirmed; SSCL conflict flagged

- **Checked, VAT registration threshold stays at LKR 60 million a year (LKR 15 million a quarter).** KPMG's summary of the Value Added Tax Amendment Act No. 14 of 2026 says "LKR 60 Mn per year maintained" and "foregoing the proposal to reduce the threshold to LKR 36 Mn". The code already used 60 million. Only the source note changed (it now cites the Act, not the earlier secondary report).
- **Open conflict, SSCL threshold.** A Hiru News report (23 June 2026) says the plan to lower the VAT and SSCL threshold was dropped. An ABMagazine article (July 2026) says the SSCL threshold is LKR 36 million from 1 July 2026. The code keeps 36 million for SSCL on purpose, because it warns earlier. Confirm with the IRD. Not changed.
- **Checked, statutory payroll.** EPF (employee 8%, employer 12%), ETF (employer 3%) and APIT are in lib/payslip.ts, lib/payTax.ts and lib/epf-due.ts. No change needed.
- **Open, outside code.** The SSCL threshold (above). Everything else in the open list in v328 to v330 is unchanged.

## v330 - net worth labelled; purchasing power of cash (what-if)

- **Added, net worth.** The balance sheet line "Total equity" now reads "Total equity (net worth)", with a glossary definition: total assets minus total liabilities, what the owners would be left with. The figure is unchanged.
- **Added, purchasing power.** A what-if memo under the balance sheet. The owner types an expected inflation rate and a period, and it shows what today's cash on hand is worth in today's money, and how much inflation takes. The rate is not saved and is not an official figure. Pure functions in lib/purchasingPower.ts (valueInTodaysMoney, costInFuture, inflationLoss), compounded at (1 + rate) ^ (months / 12).
- **Glossary.** "net worth" and "purchasing power" added to lib/glossary.ts.
- **Verified.** scripts/verify-purchasing-power.ts (22 checks). Re-ran verify-contingent, verify-cash-payments and verify-buyer-address: all pass.
- **Open, outside code.** No inflation rate is stored for the business, so the figure depends on the owner's own assumption each time. An official Sri Lankan CCPI series would need a source and a decision on which one to use.

## v329 - contingent liabilities and commitments (memo on the balance sheet)

- **Added.** A register for things that could cost the business money but are not owed yet: guarantees given, claims or lawsuits, disputed tax, and commitments to pay later. Each item has a type, the most it could cost, the date it arose, an optional other party and note. Items can be marked settled (kept for the record) or deleted by the owner.
- **Not in totals, by design.** The balance sheet shows an open-exposure memo beneath the statement. Liabilities and equity are unchanged. An item is booked as a liability only when the outflow is probable and measurable (the IAS 37 / SLFRS 137 approach), and that call stays with the owner or adviser.
- **Where.** lib/contingent.ts (cleaning, open total, sort), a new Firestore collection contingencies with the same rules as loans (readable by whoever reads the books; written by owner or manager; deleted by owner only, never in the public demo), contexts/DataContext.tsx (listener, add, update, delete, audit log), and app/statements/page.tsx (the memo card). Verified by scripts/verify-contingent.ts (36 checks).
- **Open, outside code.** Whether a given item has crossed from contingent to recognised is a judgement for the adviser. The app records it; it does not decide it.

## v328 - buyer's address printed on tax invoices

- **Added.** The buyer's address (already held on the customer record) is printed under "Bill to" on both invoice templates, with the TIN. VAT Act s.20(2)(b) requires the purchaser's name, address and registration number. Before this, the address was saved but never printed.
- **Where.** lib/print.ts (both builders and printReceivableInvoice), lib/invoiceNumber.ts (addressForCustomer), and the sales, invoices and receivables screens. Verified by scripts/verify-buyer-address.ts.
- **Checked against the sources.** Section 67 of the VAT Act is not the tax-invoice section; the required particulars are in s.20(2) of the consolidated VAT Act No. 14 of 2002. The revised format annexure (Gazette 2481/22) lists the same particulars: supplier TIN, name and address; purchaser TIN, name and address; serial; issue and supply dates; description; quantity; value excluding VAT; VAT; total. Balancr prints all of these. The revised format applies from 1 July 2026 (KPMG, April 2026).
- **Open, outside code.** The annexure's example serial uses a hyphen (26JULBR03-1) while its pattern uses an underscore. Balancr follows the pattern. Confirm with the IRD.

## v327 - large cash purchases flagged; sources checked; two notes corrected

- **Added, large cash purchases (lib/cashPayments.ts).** Under the Inland Revenue Act as amended (KPMG notice, June 2026, item 2; the rule dates from 8 May 2023), a payment of LKR 500,000 or more made in cash cannot be deducted as an expense. The purchases screen now lists such purchases for the current year of assessment (from 1 April), by single purchase or same supplier on the same day. It is a FLAG for checking; the tax figures are not changed. Approximation: "related series" is read as same supplier, same day. Only cash is flagged. Verified: scripts/verify-cash-payments.ts.
- **Corrected, VAT invoice format date.** v324 said the format was in force now. The DIR notice postpones it to 1 July 2026; a later date (1 October 2026, Gazette 2500/106) could not be confirmed. Comments and this changelog are corrected. The code is unchanged.
- **Checked, withholding tax on services (5% over LKR 100,000).** A summary of circular SEC/2026/E/04 says the 5% applies to the full amount. The circular's own text was not accessible. The code already applies it to the whole payment, so no code change.
- **Checked, Inland Revenue (Amendment) Act No. 11 of 2026.** Its changes: 5% WHT extended to more professions from 3 June 2026; capital gains rates 15% (individuals) and 30% (trusts, NGOs) from 3 June 2026; 100% enhanced capital allowance over USD 250,000 from 1 April 2026; quarterly instalments based on the prior year (no effective date); interest waiver to 2 December 2026. Balancr does not compute capital gains tax, capital allowances or instalments, so there is nothing to update. It does not change VAT, invoices or APIT rates.
- **Not built, and why.** Capital gains tax, enhanced capital allowance and quarterly instalments are not modelled in Balancr. Adding them is a new tax feature, not a fix to an existing figure.

# Changelog — final audit pass

## v326

- **Closed, the duplicate-number gap for offline sales.** A sale saved offline is now stored with numberPending and no number. When the device is back online, a pass takes the next numbers from the shared counter in one transaction, and re-reads each sale first, so a sale numbered on another device is skipped. Two devices offline at once can no longer give one invoice two numbers, and staff can save offline (their sales are numbered when they are back online). Their pending sales print the legacy ref until numbered. The earlier "staff must be online" rule is gone.
- **Closed, the date of supply.** The sale forms take an optional "Date of supply". Invoices print it; blank means the invoice date. Estimates are unchanged.
- **Added, backup of the invoice counter.** The counter is carried in full-backup.json (the highest number in use) and restored by scripts/restore-from-backup.mjs, which only moves it forward, so a restored business does not reuse numbers.
- **Added, glossary entries** for the terms in the attached images that were missing: contingent liability, short-term, current, long-term and non-current liability, systematic and unsystematic risk, interest rate risk, purchasing power risk, quantitative tightening, capital work-in-progress, TIN, date of supply and tax invoice.
- **Changed, two verifier pins, both to match the new rule.** verify-batch-ledger now expects two whitelist clauses on the sales rule (the issued-sales lock, and the narrow clause that only lets an operating member give a pending sale its number). verify-backup-coverage treats the counter as a meta document that is backed up.
- **Verified.** All 339 verifiers that can load pass. 18 can't load (firebase, firebase-admin, papaparse not installed here).
- **Still open, and not closable with code here.**
  - Sales from before v324 have no number and are not renumbered (deliberate: the customer holds copies).
  - Sri Lankan rates (APIT, WHT, EPF, ETF) need the IRD's tables.
  - Live integrations need keys and accounts.
  - The 18 verifiers need the packages installed.

## v325

- **Added, buyer TIN on customers.** A "Buyer's TIN" field on the customer form takes nine digits and refuses anything else (nothing is saved until it is fixed). It prints under "Bill to" on the invoice when the customer has a valid TIN. Looked up by customer name (lib/invoiceNumber.ts, tinForCustomer). Invoices, the sales page and both receivables pages pass it through.
- **Added, date of supply on invoices.** Both invoice templates print "Date of invoice" and "Date of supply". The estimate is unchanged.
  - Partly closed: the app has no separate supply date on a sale yet, so the two dates print the same day. A supply date that differs (for example, a later delivery) needs a field on the sale form. Not built.
- **Confirmed, VAT breakdown.** The printed invoice already shows the value excluding VAT, the tax line (labelled with the business's sales tax label) and the total including VAT.
- **Confirmed, expense approvals.** Spend requests and expense claims have a manager limit (lib/operations.ts). verify-operations passes 150 of 150.
- **Confirmed, purchase currency.** Purchases store currency and exchange rate (lib/types.ts, lib/fx.ts). verify-fx passes.
- **Verified.** scripts/verify-invoice-numbering.ts, all checks pass, including the TIN lookup and the wiring pins. Related print, customer, statement and thermal-print verifiers pass.
- **Still open.**
  - Date of supply that differs from the invoice date (see above).
  - Two owners offline can issue the same number. Detected, not prevented.
  - Packages not installed here (firebase, firebase-admin, papaparse), so 18 verifiers can't load.
  - Sri Lankan rates (APIT, WHT, EPF, ETF) need the IRD's tables.
  - Live integrations need keys and accounts.

## v324

- **Changed, tax-invoice numbers in the required format (lib/invoiceNumber.ts).** Numbers are now YYMMM_QQQQ_XXXXX, for example 26NOV_1_00001: year, month, a branch code (1 by default), then a five-digit serial that carries on across months. Replaces the v321 INV-000001 style, which was not in the required format. Sources: Gazette 2481/22 (27 Mar 2026) and the KPMG summary of the revised format. The effective date is NOT settled. The DIR notice postpones it to 1 July 2026 (KPMG, March 2026). A later KPMG note refers to Gazette 2500/106 moving it to 1 October 2026; that could not be confirmed. Check the current date with the IRD before relying on it. (v327 correction: v324 said it was in force now, which the sources do not show.)
- **Added, one counter for all staff and owners (users/{biz}/meta/invoiceCounter).** The counter and the sale are written in one transaction, so a failed save burns no number. Staff can now number their own sales (v321 left them unnumbered). Rules only let the counter go up.
  - Offline, owners and managers still save and get a number from the sales on their device. Two owners offline at once can still issue the same number; findDuplicateInvoiceNos reports it. Not prevented.
  - Offline, staff cannot save a sale: a number needs a connection. The message says so.
- **Added, numbered invoices cannot be deleted.** The delete rule and deleteSale both refuse them, so a number cannot be left unused. Correct a numbered invoice with a return. This closes the gap from deleted invoices, for invoices made after v324.
- **Added, TAX INVOICE title.** Printed for VAT-registered businesses (VAT registration number set). Others still print "Invoice".
- **Added, TIN check.** Settings refuse a TIN that is not nine digits, with a message; nothing is saved until it is fixed.
- **Verified.** scripts/verify-invoice-numbering.ts, all checks pass, including the format, TIN rules and wiring pins in rules, DataContext, print and settings. About 60 related verifiers pass. verify-demo-guardrails cannot load (firebase-admin is not installed here).
- **Still open.**
  - Two offline owners can still duplicate a number (see above).
  - Buyer TIN on customers is not yet collected. The format asks for it on tax invoices; a customer field and its form are needed.
  - Date of supply is printed as the invoice date; the sale has no separate supply date field.
  - Sri Lankan VAT rates and the three-line VAT breakdown are not yet printed in that layout.
  - Expense approvals and purchase-currency checks were not done in this pass.
  - The v321 INV-000001 numbers, if any were issued, are not in the required format and are shown as legacy refs.

## v323

- **Added, CAPM and the dividend model on the profit-split screen.** Six new inputs: risk-free rate, beta, equity risk premium, latest dividend per share, dividend growth and payout ratio. The screen shows the CAPM cost of equity, the dividend-model value per share and the implied P/E.
  - A typed-in cost of equity still wins. When none is typed, the CAPM figure feeds the WACC.
  - Saved in the profit-split settings (lib/types.ts). Existing settings load unchanged.
  - Verified: the profit-split, WACC, per-share, ratio, ROIC and solvency verifiers all pass (11 scripts), along with scripts/verify-equity-valuation.ts.
- **Checked, time value of money is already in the code.** computeFutureValue and computeFutureValueOfSeries (lib/calculations.ts) cover future value; presentValue and npv (lib/capitalBudget.ts) cover present value.
- **Still open.** Staff-created sales have no invoice number; deleted invoices leave gaps with no void reference; two devices offline can issue the same number; approvals for expenses are not checked; the s.67 invoice field list is not verified; 18 verifiers can't load in this sandbox.

## v322

- **Added, CAPM cost of equity (lib/equityValuation.ts).** Cost of equity = risk-free rate + beta × equity risk premium. All three are owner-set; the app holds no market data.
- **Added, dividend discount model (Gordon growth).** Value per share = next year's dividend ÷ (required return − growth). Null when the required return is not above growth.
- **Added, implied P/E from the dividend model.** Payout × (1 + growth) ÷ (required return − growth).
  - Verified: scripts/verify-equity-valuation.ts, all checks pass, including worked numbers (CAPM 15.2%; Gordon 105; P/E 5.25). The module is kept apart from lib/valuation.ts (the v260 EBITDA valuation), which is unchanged.
- **Open, not surfaced in the UI.** The functions are pure and tested, but the profit-split panel has no inputs for risk-free rate, beta, premium, or payout, so no owner can use them yet. The WACC still takes a typed-in cost of equity.
- **Open, no market data.** The app has no source for beta or the risk-free rate; the owner must supply them.

## v321

- **Added, sequential invoice numbers (lib/invoiceNumber.ts).** Each new invoice made by an owner or manager gets INV-000001, INV-000002 and so on, with no skipped numbers from allocation. A multi-line invoice (including goods plus delivery) shares one number, and a later save of the same invoice keeps it. The number is shown on the printed invoice, the statement and the invoices list.
  - Older invoices keep their legacy refs (INV-XXXXXX from the record ID). They are not renumbered, because the customer already holds copies.
  - Allocation reads the invoice numbers already on the device, so it works offline and needs no transaction.
  - Verified: scripts/verify-invoice-numbering.ts, 34 checks pass. The print and statement verifiers (opening balances, payment reminders, share links) still pass.
- **Open, staff-created sales have no invoice number.** Staff see only their own sales (the listener filters on createdByUid), so a number worked out from their list could repeat one an owner already issued. They are saved without a number and print the legacy ref. Closing this needs a shared counter in Firestore, a rules change, and an online-or-refuse rule for offline sales. Not built.
- **Open, gaps from deleted invoices.** Deleting an invoice leaves its number unused. Nothing issues a credit note or void reference in its place yet. lib/invoiceNumber.ts has findNumberingGaps so the owner can see them.
- **Open, two devices offline at once can allocate the same number.** findDuplicateInvoiceNos reports it. It does not prevent it.
- **Not verified, the tax-invoice field list.** The Sri Lankan s.67 mandatory-field list was not checked against the IRD text in this pass. The VAT registration number already prints (v319 and earlier).
- **Not type-checked against the full project.** The sandbox lacks firebase and react types, so the type check cascades into thousands of unrelated errors. The changed files were checked for syntax and logic only through the verifier.

## v320

- **Added, APIT on payslips (employment income, Sri Lanka).** Each person can be taxed by the 2026/27 bands: relief of LKR 1,800,000 a year, then 6%, 18%, 24%, 30% and 36%. The monthly figure is the annual tax on the month's pay repeated for twelve months, divided by twelve. Checked against both printed examples in the source (LKR 8,000 at 250,000 a month, LKR 18,500 at 300,000). `lib/payTax.ts`, `scripts/verify-pay-tax.ts` (32 checks).
  - Sources: the br.lk APIT guide (19 Oct 2026) and the CMA Sri Lanka rate schedule agree on the bands. The IRD's own DIR tables are the authority; confirm them before live payroll. The 2026 amendment act did not change APIT rates (KPMG, June 2026).
  - Not modelled: the year-end adjustment for pay that changes during the year, and the EPF treatment for APIT (taken as gross pay here; confirm with IRD).
- **Added, 5% withholding on service payments (IRD notice SEC/PN/IT/2026/02, section 10.3).** A person marked "5% withholding" is withheld 5% of the payment when their monthly payment is over LKR 100,000 (strictly). The owner marks who is covered, since the notice lists the professions.
  - Whole payment, from a secondary source (v327). A summary of IRD circular SEC/2026/E/04 (8 June 2026) says the 5% applies to the full amount once the monthly payment exceeds LKR 100,000 (Regfollower). The circular's own text was not accessible. The code already applies it to the whole payment.
  - Not built: the remittance deadline and the payment record for the tax withheld. The notice does not give a deadline in the text read here.
- **Added, the tax method on each person (Employees).** Flat % (the old behaviour, unchanged for existing records), APIT, or 5% withholding. The list shows the method, and take-home uses it. CSV export and import carry the method; anything unknown or missing stays flat.
- **Fixed, the payslip label.** An APIT or withholding line says what it is, instead of "Tax (x%)".
- **Changed, the POS vendor profile check** still cannot load in this sandbox (it needs `papaparse`, which is not installed). It is not verified here.
- **Checks.** 354 `scripts/verify-*.ts` run, 0 failures. 18 cannot load because packages are missing (listed in v319). The new employee CSV round-trip is not covered by a passing test here; `verify-csv-import-*` are among the 18.
- **Type check.** Changed files show no new real-risk codes; the usual missing-React-types noise remains.
- **Added, cash split by activity and the multi-year operating check (analyst check 4).** Each cash movement is put in operating, investing or financing by the account on the other side. The split adds up to the balance-sheet cash movement (checked). The journal page shows the last three years' operating cash and whether it is positive in each. This is an approximation: an entry that mixes activities (a loan repayment with interest, say) goes to one class as a whole. `lib/journalWindow.ts`, `scripts/verify-cash-split.ts` (8 checks).
- **Added, working-capital check on the Accounting journal (the analyst's "are receivables or stock consuming cash?" check).** The balances card says how much cash the range tied up in receivables and stock, or released. `workingCapitalTiedUp` in `lib/journalWindow.ts`, 4 checks in `scripts/verify-journal-window.ts`.
- **Philosophy coverage (from the attached finance notes).** Already in Balancr: cash conversion cycle, DSO/DIO/DPO, the 13-week forecast, debt-service cover, current ratio, EBITDA, free cash flow, CFO against net profit, working capital, interest cover, debt to equity, reconciliation, month-end lock, depreciation, capex, and the operating/investing/financing split. Partly in Balancr: the four analyst checks. Checks 1 and 2 (cash against profit, free cash flow) are on the Health page; check 3 (working capital) is now on the Accounting journal (v320). Check 4 (positive operating cash across several years) is now built from the journal, for the last three calendar years (the Accounting journal page).

## v319

- **Added, derived accounting journal and trial balance (Money menu, `/accounting-journal`).** Every entry is built from the records, with equal debits and credits. Nothing is stored. `lib/journal.ts`, `lib/journalMapping.ts`, `lib/accruals.ts`.
- **Added, balances at the end of a date range.** Balance-sheet accounts now carry forward from before the range (opening, movement, closing). Profit accounts start the range at zero. A derived year-end close moves profit into Retained earnings, and the closing balance sheet is checked to net to zero. Before this, a balance-sheet account showed only the range's own movement. `lib/journalWindow.ts`, `scripts/verify-journal-window.ts` (14 checks).
- **Added, accrued costs.** Month-end accruals are posted in their month and reversed the next. They feed the journal, the reconciliation and the expense view. `scripts/verify-accruals.ts` (22).
- **Added, order cycle time and promise tracking (Operations).** Web orders record a start, a finish, a promised date and a customer address. Only the owner and manager write them. `lib/orderCycle.ts`, `components/ops/CycleTimePanel.tsx`, `scripts/verify-order-cycle.ts` (26), `verify-cycle-time.ts` (9).
- **Added, capacity view over 14 days** (`useCapacity(14)`), already used by Operations, Agenda, Events and Offers. `verify-capacity.ts` (13).
- **Added, route planning for delivery runs** through Google's Distance Matrix, using `GOOGLE_MAPS_KEY`. Without the key it says so and does not guess. `lib/routePlan.ts`, `app/api/routes/plan`, `verify-route-plan.ts` (27).
- **Added, POS vendor column profiles.** A saved column layout per till vendor, checked before import. `lib/posVendorProfile.ts`. Its check, `verify-pos-vendor-profile.ts`, cannot load in this sandbox (missing `papaparse`), so this one is not verified yet.
- **Added, POS sales decisions shown on the POS days card.** A POS sale posts once, the till check never posts it again, an import with an unknown product is refused as a whole, and duplicate products are merged by hand.
- **Added, bank feed through Plaid (Integrations).** Link, exchange and sync routes, with the access token sealed on the server. The page shows "not configured" until the Plaid keys are set. `lib/bankFeed.ts`, `lib/bankFeedServer.ts`, `lib/plaidClient.ts`, `app/api/bank-feed/*`, `scripts/verify-bank-feed.ts` (44).
- **Added, HMRC Making Tax Digital quarterly update (Integrations, owner only).** The quarter is read from the books. Sending is refused before any call unless `HMRC_SUBMIT_ENABLED` is "true", the owner has confirmed the figures, and the business is connected. The status route returns a yes or no for the NINO, never the value. `lib/hmrcMtd.ts`, `lib/hmrcClient.ts`, `lib/hmrcServer.ts`, `app/api/hmrc/*`, `scripts/verify-hmrc-mtd.ts` (58). Live submission needs HMRC approval.
- **Added, paid invoices sent to AutoLeads.** A signed `invoice.paid` event (HMAC-SHA256 over timestamp and body, with the shared secret on the server). Skipped, with a stated reason, when no AutoLeads user is saved. `lib/autoleads-events.ts`, `app/api/autoleads/invoice-paid`, `scripts/verify-autoleads-events.ts` (34).
- **Added, two-step sign-in (Settings, Account tab).** Firebase TOTP: set up an authenticator app with a key or QR code, confirm with a six-digit code, remove it later. Turning it on needs the multi-factor setting switched on in the Firebase console. Until then the card says so. `components/MfaCard.tsx`, `lib/mfa.ts`, `scripts/verify-mfa.ts` (15 checks, helpers and wiring). The Firebase calls were not type-checked here, since the Firebase packages are not in this sandbox.
- **Fixed, the HMRC status route.** Its response line held the NINO check next to the response call. It now computes a yes or no first. Behaviour is unchanged.
- **Fixed, the route-guard check.** It now recognises `requireFeedOwner`, which wraps the owner check, and lists the HMRC return route as a public route that is checked by its one-time state (`stateRef.delete()` before the code exchange, expiry checked).
- **Changed, web order rule (owner and manager only).** It now also lets the owner or manager write `startedAt`, `finishedAt`, `promisedDate` and `customerAddress`, for cycle time and promise tracking. Clients still cannot create a web order or change these fields. `verify-web-orders` and `verify-delivery-promise` pins were updated to match and still pass.
- **Changed, AutoLeads is now an implemented integration provider**, because the invoice route reads its settings on the server. `verify-integrations-keyed` (40) passes.
- **Checks.** All 353 `scripts/verify-*.ts` run with no failures. Eighteen cannot load because their packages are not installed in this sandbox (`firebase-admin`, `firebase/firestore` or `papaparse`): verify-ai-turn-refund, verify-ai-usage-metering, verify-batch-import, verify-catalog-mirror-fields, verify-credit-limit, verify-cron-health, verify-csv-import-dates, verify-csv-import-numbers, verify-demo-guardrails, verify-email-abuse, verify-env-defaults, verify-pos-compatibility, verify-pos-vendor-profile, verify-product-csv-fields, verify-quote-revision, verify-royalty, verify-spending-review, verify-system-check. They need a run where the packages are installed.
- **Not built, and why.** Live Plaid, HMRC, Xero/QuickBooks, Google Maps and GA4 calls need provider accounts and keys. The Firebase MFA switch is a console setting. HMRC production needs HMRC approval. Legal items (privacy notice wording, processor contracts, the PDPA breach procedure) need sign-off.

## v318

- **Added, SSCL registration check (Tax tab, Sri Lanka).** Sales over the last 12 months are compared with the SSCL threshold of LKR 36 million a year, with the same 80% warning as VAT. Information only. Source: ABMagazine, July 2026, which gives the threshold but not its year. Confirm with the IRD before relying on it. `SSCL_LK` in `lib/vatThreshold.ts`.
- **VAT threshold unchanged.** The VAT figure stays at LKR 60 million (VAT's cut to LKR 36 million was dropped, per the source in the VAT rule). An October 2025 note that said 36 million from April 2026 is out of date.
- **Fixed, the 80% warning could show for a sale just under 80%.** The status compared rounded percentages, so LKR 28,799,999 of LKR 36 million showed as 80.00% and "approaching". It now compares the unrounded ratio. This also corrects the VAT check at the edge (no VAT figure changes, only the warning at the exact 80% boundary).
- **Checked, already built (no change):** the sales-drop exception (`salesDropException`, exceptions.ts); key-person cover and the reporting-line check (`lib/succession.ts`); bank statement import (`lib/bankImport.ts`); till payouts shown in the cash count (`lib/tillPayouts.ts`); a POS sale with an unknown product is refused with a line-by-line list, and nothing is posted, by design (the POS route).
- **Checks.** `scripts/verify-sscl.ts` (13 checks, new). `scripts/verify-vat-threshold.ts` (12) and `scripts/verify-vat-uk.ts` still pass. Type check of the changed files: no new real-risk codes. The `children is missing` lines come from the sandbox's missing React types and appear in the v315 baseline too.
- **Not closed here (blocked, not code):** automatic bank feeds (needs an aggregator account and keys; statement import covers the manual route); double-entry journal and month-end accruals (these change every figure in the books and need a migration plan before they are built); event-based sync with AutoLeads (needs an AutoLeads endpoint and a shared secret); MFA sign-in (needs the Firebase Identity Platform setting); HMRC quarterly filing for UK MTD (needs HMRC software approval); POS vendor export mapping (needs a sample export from the vendor).
- **Not run.** No browser check of the Tax tab. The sandbox has no node_modules, so no next build and no lint.

## v317

- **Added, POS days on the Sales page (read only).** Under the till day check, a card lists the last 60 days that have a saved till check (users/{id}/pos_recon): till total and count, Balancr total and count, the difference, and Matched or Mismatch. Owner and manager only, through GET /api/sales/pos-days. It writes nothing and changes no sale. Amounts use the business currency through formatMoney.
- **Stale note corrected (no code change).** Commission tiers are built (lib/commissionTiers.ts, v239). The "not built" line in the v239 entry is out of date.
- **Checks.** verify-pos-days.ts (4 checks) passes. verify-ops-events.ts (15) and verify-payment-events.ts (8) still pass.
- **Type check.** Counts for TS2741, TS2322 and TS2339 are the same as the v315 baseline, so no new real-risk errors. Those three codes were already in the baseline from the missing React types. The new messages are the usual noise (TS7026, TS7006, TS7031).
- **Not run.** No browser look at the card and no live Firestore read. The sandbox has no node_modules, so no next build and no lint.

## v316

- **Closed, staff payments sent as events (v285 limit).** A staff login can now trigger the `payment.received` event for a payment it recorded. The route re-reads the payment and sends the invoice's status from the invoice's own totals, so no cost or margin is sent. Every other event (incidents, purchase order approvals) is still refused for staff. Decision taken without asking: the webhook is a status signal, not a record export, so letting staff trigger the one status event is the smaller trust step, and the daily sync remains as the fallback.
- **Changed, `requireAiContext`.** Takes an optional role list. Without it, the rule is the same as before (owner and manager), so every other route is unchanged.
- **Stale notes corrected (no code change).** These earlier "not built" lines are out of date: dual sign-off above a limit (v283, v284); part deliveries (v277); the won-deal queue (v281); the year-end close (v276).
- **Checks.** verify-ops-events.ts (15, three of them new or changed); verify-payment-events.ts (8). Type check of the two changed files: only the known "implicit any" noise from packages not installed here.

## v315

Closes the in-code gaps left open by the older notes (v53, v54, v65, v312).

- **Closed, purchase CSV import (v65 gap).** Two optional columns: `expiryDate` (a real calendar date, read the same way as the other dates) and `batchRef` (the supplier's batch or lot). Blank cells are left out, and a file without the columns imports exactly as before. The purchases CSV export writes the same two columns, so an export imports back unchanged.
- **Closed, sales CSV batch column (v54 note).** The sales export has a `batchRef` column: the batch of the delivery picked for that sale, blank when none was picked. The sales import takes `batchRef` too. It must name a delivery of the same product, received on or before the sale date, and the label must be on one delivery of that product only. Otherwise the row is reported and nothing is imported. The POS import does not check it, so its files are unchanged. The backup and the accountant pack carry the column.
- **Closed, batch pick on the multi-item invoice (v54 note).** Each product line has the same "Which batch?" picker as the single sale form. The picker rule moved to `lib/batchLedger.ts` (`batchPickChoices`) and both forms use it. The pick is saved on that line's sale, memo only as before. Staff see no picker.
- **Closed, health page dividend payout (v312 "Open").** A dividend recorded before the cap table existed has no share split. While one falls in the trailing 12 months, the payout shows "No share count" with a note instead of a figure. The payout formula is unchanged everywhere else. `dividendsWithoutShares` in `lib/equity-ratios.ts`.
- **Already closed, checked in code, no change.** PO receiving asks for the expiry date and batch (v65). The delivery-charge line on a sale (v54, `lib/delivery.ts`). The safety buffer on reorder alerts (v53, `defaultSafetyStockDays`).
- **Left as decided:** batch-level costing, true per-batch stock tracking, card payment, customer deposits as a liability, seasonal forecasting, multi-rate tax, bank feeds, e-filing, staff logins for loan records, TAM/SAM/SOM, ROAS, price-to-book, dividend yield, lease-vs-buy. None was touched.
- **Numbers:** no existing record or total changes. A sales file that names a batch, under batch costing, is costed at that batch, the same as a sale picked by hand.
- **Checks run:** `scripts/verify-batch-import.ts` (new, 41 checks) passes. `scripts/verify-equity-ratios.ts` passes with 6 more checks. The full set of 341 verifier scripts: 331 pass, and the same 11 fail before and after the change because `firebase` and `firebase-admin` are not installed in this sandbox. The CSV verifiers were run with a test-only `papaparse` stub kept outside the project, because `papaparse` is not installed here. Type check: no new real-risk errors. Counts for TS2741, TS2322 and TS2339 are unchanged from before the edits. The new messages are JSX typing noise (TS7026, and three TS7006 inside JSX callbacks) from the missing React types in this sandbox.
- **Not run:** no browser click-through of the invoice picker, the sales and purchase import pages, or the health card. No live Firestore writes. No `next build` and no lint, because the sandbox has no `node_modules`.

## v314

- Ratios on the health page: payables turnover (cost of sales ÷ trade payables), capital gearing (equity ÷ borrowings), fixed-charge cover ((EBIT + rent) ÷ (interest + rent), rent taken from expenses named rent or lease), Altman Z'' for private firms (with safe, grey and distress zones), and EPS growth at today's share count (net profit growth, so it is only exact if shares have not changed).
- Models page (/models, in the Money menu): a 12-month integrated projection that checks the balance sheet every month; a divestiture model (gain or loss, tax, cash kept, profit change, price over unit profit); and an accretion or dilution model for buying a business part-paid in shares.
- Decided, not built: price to earnings and price to book, because a private SME has no market price. Dividend yield stays out for the same reason.
- Simplifications, stated on the page: tax has no loss carry-forward; the projection has no seasonality; other assets and liabilities are folded into receivables and payables; capital gearing counts all borrowings as fixed-cost funds.
- Check: verify-models (37 checks) pass. Existing verifiers for reference ratios, scorecard, valuation, POS, equity ratios, capitalised development, admin accounts, WACC and EPF/ETF still pass. The Models page and health stats are type-checked, not run in a browser.

## v313

- Check a till day (Sales page). Owner or manager types the till's day total and sale count for a date. POST /api/sales/reconcile-day compares them with the sales that came from the till for that date (createdByUid pos), using the same rule as the till's signed check. The result (matched or mismatch, difference) is kept at users/{id}/pos_recon/{date}, with checkedBy owner. Nothing in the sales changes.
- The posted-sales summary is now one shared function (summarisePostedPos) used by both the till's signed route and the owner's check.
- Check: verify-pos-ingest now 41 checks. The route and card are not run here.
- Open: the same composite index as before (sales: date, createdByUid).

## v312

- Health page: two equity ratios. Book value per share = net assets ÷ shares in issue (shares from the cap table). Dividend payout = dividends recorded as paid ÷ net profit over the same trailing 12 months; no figure in a loss year. Pure module lib/equity-ratios.ts.
- Admin accounts always get the standard daily AI cap (100 a day), even if the business's own limit is set to 0 (unlimited). Admin accounts run on the operator's key, so they should not be unlimited. Other accounts are unchanged.
- Not built, by decision: price-to-book (a private SME has no market price); fixed-charge cover (the formula needs lease expense, and the model has no lease input yet, so it would be interest cover in disguise).
- Check: verify-equity-ratios (10 checks). The AI cap was checked directly with aiLimitsFor. The health page is not run here.
- Open: the health page reads dividends from the equity settings; dividends recorded before the cap table existed will show a payout with no share count.

## v311

- Daily POS reconciliation. POST /api/pos/{businessId}/reconcile takes a signed day total (date, expectedTotal, expectedTransactions) from the till's end-of-day figure. Balancr sums the POS sales it has posted for that date, compares amount (to the cent) and transaction count, and records matched or mismatch at users/{businessId}/pos_recon/{date}. A mismatch is kept, not silently ignored.
- Assumption: expectedTotal is compared with qty x unitPrice as stored on the sales. If the till reports tax-inclusive totals, send the same basis Balancr stores, or the day will show a mismatch.
- Check: verify-pos-ingest now 39 checks, including reconciliation. The route is not run here.
- Open: the reconcile query needs a Firestore composite index on sales (date, createdByUid). Firestore will print a link to create it on first use.

## v310

- POS sales now post into the books. POST /api/pos/{businessId}/sales takes signed sales lines (txId, date, product name or SKU, qty, unitPrice, paymentMethod cash/card/bank_transfer). Each line goes through the same importer as the sales CSV, so names, dates and amounts are checked the same way. All or nothing: a bad line stops the whole request. A line already posted (same txId) is skipped, so retries are safe.
- Replaces the daily-totals endpoint from v309.
- Sales carry posRef (the POS transaction id).
- Check: verify-pos-ingest (31 checks). The route itself is not run here.
- Open: an unknown product name makes the whole request fail, so a new item must exist in the catalogue first. No vendor mapping yet; the vendor's export has to be mapped to the line shape.

## v309

- POS infrastructure: POST /api/pos/{businessId}/daily accepts one signed sales summary per day (HMAC-SHA256 over "timestamp.body", five-minute window, constant-time compare). Re-sending a day replaces it. Stored as users/{businessId}/pos_daily/{date}. It does not post to the ledger yet.
- Admin panel: "POS key" per account creates the signing key, shown once. The kept copy is sealed under BALANCR_ENC_KEY. Creating a new key stops the old one.
- Check: verify-pos-ingest (14 checks).
- Not built: a screen to view POS days, and posting them to the books. Those need a decision on how POS sales map to the ledger.

## v308

- Admin panel: tick accounts and mark them as admin accounts (bulk). Admin accounts are never billed or locked by a trial or renewal; suspension still applies. Remove admin status the same way. Demo accounts are not affected.
- Admin panel: save the operator's DeepSeek key here instead of on Vercel. It is encrypted under BALANCR_ENC_KEY and never shown back in full. Used only by admin accounts and AI_OPERATOR_BUSINESS_IDS.
- Health page: eight more ratios from the 40-ratio reference (operating cash flow ratio, cash flow to net profit, cash return on assets, interest burden, cash interest cover, EBITDA cover, retained earnings ratio, fixed asset turnover).
- The AI key rule is in lib/aiKeyRule.ts (pure) so it can be checked offline.
- Checks: verify-admin-account (9), verify-reference-ratios (13).

## v307

- Health page: "What if development costs were capitalised?" card, off by default. It shows profit and the intangible asset if development spend were spread over a useful life of 1 to 10 years. View only: the books are not changed. Figures are before tax. Your accountant must confirm the IAS 38 or FRS 102 criteria before any use.
- Glossary: capitalised development cost.
- Check: verify-capitalised-dev (13 checks, pass).

## v306

- Fix: the v305 build failed because the new valuation functions overwrote lib/valuation.ts, which the profit-split panel and the cost valuation check still need. lib/valuation.ts is restored to its original exports. The new functions (EV from multiple, equity value, NAV, DCF) now live in lib/business-valuation.ts, used by the valuation card and its check.

## v305

- Admin panel: a "Set password" control on each business's Manage card. It sets the owner's password directly (minimum 8 characters), so the sign-in link is no longer needed. The route checks the admin passcode and never logs the password.
- Health page: a quick scorecard for the trailing 12 months (gross margin, SG&A, R&D, depreciation, interest, net margin, cash against debt, debt-to-equity, capex), with targets shown per row. R&D is counted from expense categories that say R&D, research or development.
- Health page: a "What the business is worth" card with EBITDA, revenue and DCF estimates, equity value after loans and cash, and net asset value. Assumptions are typed on the page and not saved.
- Glossary: cost types (direct, indirect, operating, non-operating, controllable, opportunity, sunk, marginal, standard, actual, product, period, semi-variable), SG&A, R&D, EBITDA, enterprise value, equity value, net asset value, DCF, EBITDA and revenue multiples, capex, depreciation, WACC, return on capital employed.
- Checks: verify-set-password, verify-scorecard, verify-valuation added (all pass).

## v304: financial health ratios checked and corrected

- Checked the seven ratios against the code: current ratio, debt to equity, gross margin, operating margin, interest coverage, cash conversion cycle, return on invested capital. All seven are on screen.
- Debt to equity on the health page was total liabilities divided by equity, under the same label as the loans measure used elsewhere (ops panel, red flags). The health page now shows loans on the books divided by equity (the standard measure), and shows liabilities to equity on its own line.
- lib/wacc.ts (new): WACC estimated from the books. Weights are loans and equity on the books; cost of debt is interest paid, annualised, over the loans; the tax shield applies. The cost of equity is not in the books, so the owner sets it. No WACC without it, or with zero or negative equity.
- ProfitSplitPanel: a "Cost of equity" field sets the WACC. The ROIC spread is measured against the WACC when set; otherwise against the cost of capital typed in, as before.
- Checks: scripts/verify-wacc.ts (9 checks) passes; scripts/verify-epf-due.ts still passes.

## v303: EPF/ETF holidays, ETF deadline and surcharges (closes the last EPF/ETF gap)

- lib/lk-holidays.ts (new): the 2026 Sri Lanka public, bank, mercantile and poya holidays from the government desk calendar (documents.gov.lk, "Subject to Variation"), with the EFC circular 17 of 2026 amendment (Day following Vesak moved to 31 May 2026).
- lib/epf-due.ts: the due date is now the last working day of the following month, skipping weekends and listed holidays (epf.lk and etfb.lk: "last working day of the following month"). The ETF deadline is the same day. epfDueInfo reports whether a holiday calendar covered the year.
- Late-payment surcharge bands (lateSurchargeRate, lateSurchargeAmount): 5% up to 10 days late, 15% to a month, 20% to 3 months, 30% to 6, 40% to 12, 50% over 12. The sources give months; the day cut-offs approximate them. One rate applies to the whole contribution: the sources do not say otherwise.
- lateReturnPenalty: the ETF late-return penalty, 1% of the contribution for each completed month or part (etfb.lk, Section 37A).
- components/EpfDueNote.tsx: shows the holiday-aware due date, the surcharge so far when overdue, and a warning when the year has no holiday calendar loaded.
- Open by nature: a 2027 holiday calendar must be added to lib/lk-holidays.ts when it is gazetted. Until then the date skips weekends only and the note says so.
- Checks: scripts/verify-epf-due.ts (26 checks) passes.

## v302: EPF/ETF due date (close-out of the partly closed gaps)

- lib/epf-due.ts: the due date for contributions on a pay month (the last weekday of the following month; epf.lk, checked 17 Nov 2026). The employees page shows a line under the EPF/ETF payable, with the days left, and flags it when overdue.
- Not included: public holidays (the real date can be earlier), the ETF deadline (not verified), and surcharge rules.
- Checks: scripts/verify-epf-due.ts (7 checks) passes.

## v301: build fix (use this release, not v300)

- app/statements/page.tsx: the VAT and MTD cards were two sibling elements in one JSX branch, which does not compile. They are now wrapped in a fragment. Found by a parse check of every .ts and .tsx file.

## v300: UK MTD income flag (last gaps from the research)

- New lib/mtd.ts: Making Tax Digital for Income Tax thresholds (£50k from 6 Apr 2026, £30k from 6 Apr 2027, £20k from 6 Apr 2028; GOV.UK, checked 17 Nov 2026). The statements page shows a card for UK businesses: below the threshold is definite (sales stand in for income), above it is advice.
- Checks: scripts/verify-mtd.ts (11 checks) passes.
- Not checked: the card in a browser; the qualifying-income basis (other income such as property is not counted).

## v299: UK VAT registration check (gap closed from the research)

- The VAT registration card now follows the business currency: LKR uses the Sri Lanka rule (LKR 60m over 12 months or LKR 15m in a quarter), GBP uses the UK rule (£90,000 over any rolling 12 months, no quarterly test, source GOV.UK, checked 17 Nov 2026). Other currencies get no check.
- Checks: scripts/verify-vat-uk.ts (9 checks) and scripts/verify-vat-threshold.ts (12 checks) pass.
- Not checked: the card in a browser; HMRC's own deregistration rule (not sourced, not added).

## v298: email failures visible; operator AI keys for the owner only

- Trial confirmation emails: the result of each send is now recorded (platform/emailHealth). The admin Automation card shows the last trial confirmation as sent or failed, with the reason in plain words. A send that Resend refuses is no longer invisible.
- The sender onboarding@resend.dev (Resend's test address) is flagged in the admin card: Resend delivers it only to the Resend login email, so visitors get nothing. Fix: verify a domain at resend.com/domains and set TRIAL_NOTIFICATION_FROM_EMAIL to an address on it.
- TRIAL_EMAIL_DOMAINS is optional (a code default, listed blank in .env.local.example). Left unset, only Gmail addresses can request a trial.
- Sign-in links: the admin "Send sign-in link" says how long the link lasts. Without a signing secret it is a Firebase link valid about one hour, and the admin is told so. If no link can be made at all, the admin sees the error instead of an empty link.
- AI keys: the operator DeepSeek key now serves only the businesses listed in AI_OPERATOR_BUSINESS_IDS (the owner and their team). The public demo no longer uses it; a demo business that should show AI must be listed there.
- Checks: verify-quote-revision (AI key rule) updated for the demo change. The pure key rule was run without Firebase imports: 6 checks pass. The tsx verify script could not run here (firebase-admin not installed in this sandbox).
- Not checked here: live Resend delivery, the live sign-in link, the admin panel in a browser.

## v297: build fix (use this release, not v296)

- **Fixed.** v296 failed to build. The red-flags module from v295 overwrote lib/redFlags.ts, the module the Operations page already uses, so one call passed two arguments where one was expected. v297 restores that module exactly as it was in v294 and reverts the v295 health-page card.
- **Checked.** A whole-app type check found no argument-count or missing-name errors. The remaining messages are the known missing-typings artifacts. The verification sweep of the scripts that can run here passes.

## v296: till payouts registered with the period lock and the full backup

- **Fixed (found in a full re-check).** Till payouts, added in v292, were missing from three places. (1) Deleting one was not guarded by the books-closed date, so a closed month could still change. (2) The full backup (full-backup.json) did not include them, so a restore would lose every till payout. (3) The restore script did not accept the collection.
- **Changed.** Deletes are dated like the other dated records. The full backup and the restore script include tillPayouts.
- **v295 withdrawn.** The red-flags card added in v295 duplicated the existing red-flag checks on the Operations page (lib/redFlags.ts, used by ProfitSplitPanel), and its new module overwrote that file, which broke the build. v295 is reverted: the health page and lib/redFlags.ts are back to their v294 state.
- **Checks.** verify-period-lock, verify-backup-coverage and verify-till-payouts all pass. The full verification sweep of the 312 scripts that can run here passes; 16 need firebase-admin, which is not installed in this sandbox.

## v294: outside-service keys are encrypted when stored

- **Built.** Keys entered on the Integrations page (PayHere merchant secret, AI key, email and SMS keys, lead API key and the rest) are encrypted with AES-256-GCM before they are stored. The page saves through a server route, so the browser never writes a key to the database. The page shows only the last four characters of a saved key.
- **Who reads them.** Every server route that uses a saved key opens it on the server first: the payment routes, the public invoice page, the lead API check, the AI key, the royalty and SMS senders, and the connection test.
- **Setup needed.** Set BALANCR_ENC_KEY on the server (64 hex characters, openssl rand -hex 32) before any owner saves a key. Without it, saving a key is refused with a clear message, and a stored encrypted key is not read, so that service shows as not set up.
- **Existing keys.** Keys saved before this version are plain text and keep working. They are encrypted the next time the owner saves that service.
- **Checks.** verify-secret-box.ts (41 checks): encrypt and open, a wrong or tampered key fails, plain-text keys still read, saving refuses without a key, and the readers and page are wired to the encrypted path. Existing integration checks still pass.
- **Not checked here.** A live save and read against Firestore, and the Integrations page in a browser. No live deployment is available in this sandbox.

## v293: landing page describes till payouts

- **Landing page.** The "Made for the person running the shop" paragraph now says cash taken out for a delivery or an errand is written down so the count still balances. Copy matches what v292 built.
- **Checks.** verify-landing-copy.ts gains a check for the till payouts line.

## v292: till payouts (cash taken out of the till)

- **Built.** A cash count used to show an unexplained shortfall whenever cash was taken from the till for a small spend (a delivery fee, an errand). Now the person who takes it writes it down on the Cash count page: date, amount, what it was for. Any active role can do this, so Staff can account for their own small spends.
- **Counts.** A count takes off the payouts for its date that are not yet booked as an expense, and records the total on the count (tillPayoutsOut). Staff counts use their own payouts, the same as their own sales.
- **Booking as an expense (Owner and Manager).** One click creates a one-off paid expense on the payout's date, with a category suggested from the reason. The expense and the link back to it are written in one batch. Booking does not change the expected cash figure: the payout drops out of the count and the expense is counted instead. A manager's booking is held to the same monthly spend limit as their own expenses. The period lock covers both writing a payout and booking it.
- **Rules.** A payout cannot be created already linked to an expense (that would drop it from the count). After booking, only the link can change, and only for an owner or manager. Only the owner can delete a payout.
- **Not built.** Cash purchases and expenses paid from the till by someone other than the person counting are still not visible to Staff counts, as before. Record them as till payouts if Staff should account for them. A tax payable account and remittance are still out of scope.
- Verify: scripts/verify-till-payouts.ts (26 checks: validation, the expected figure with and without booking, the expense it becomes, and the wiring in the rules, permissions, period lock, data context and cash count page). Also re-run and passing: verify-period-lock, verify-statement-linkage (29), verify-dividend-tax (31), verify-vat-threshold (12). Type check: the changed files show only the known React and Firebase typing artifacts; no firebase types are installed here, so this is not a clean type check. Not run against a live Firebase project; the rules need deploying and testing there.

## v291: statement linkage check, VAT registration check

- **Statement linkage, now tested.** verify-statement-linkage.ts runs the same pipeline as the books check on worked records: stock bought and sold (cash and credit), a credit sale collected, paid and unpaid expenses, owner capital, a loan drawn, and a repayment inside a closed month. For each, the journal's Cash account, the balance sheet's cash, and the cash flow statement's net change agree, the loans line matches the journal, and the balance sheet balances. Future-dated repayments do not show as actual cash (the statements are cut at today's month, and the journal at the as-of date). 29 checks.
- **VAT registration check (Sri Lanka), new.** The Tax tab shows taxable sales over the last 12 months and over the best 3-month stretch, against LKR 60 million a year and LKR 15 million in a quarter. It says "approaching" from 80% and "over" when a threshold is exceeded. It is information only and is shown only for businesses in LKR. The thresholds are in lib/vatThreshold.ts with their source and the date checked. The 2026 cut to LKR 36 million was dropped in June 2026, so the existing thresholds apply. 12 checks.
- **Not built.** Dividend withholding rates: the current Sri Lankan rate could not be confirmed from the sources available, so the rate stays owner-entered (no default). A quarter test uses the best 3-month stretch rather than calendar quarters; it warns earlier, not later.
- Verify: 310 scripts pass; 16 are blocked on a missing package (papaparse), as before.

## v290: dividend tax withholding

- **Built.** Each shareholder dividend takes a withholding rate, entered by the owner as a percentage from 0 to 100 with up to 2 decimals (0 or blank = none). The tax is worked out per person in whole cents, so tax plus net always equals what that person was allocated. The company pays the gross amount; the withheld part is the tax to pay over, and the rest is what the person receives. Each dividend stores its rate, its total tax, and each person's tax and net. Statements show dividends before tax, tax withheld, and received after tax; both CSV exports carry the tax and net; the dividend history shows each person's tax and net.
- **Not built, on purpose.** Balancr does not choose the rate: the rate depends on your country and on each person, and one rate applies to everyone on a dividend. It does not pay the tax over, and it does not record a tax payable account; "Tax withheld on record" is a total you pay yourself. The profit check still uses accounting profit only, and the gross amount is what is checked against it.
- **Old dividends.** Dividends declared before v290 have no tax fields and read as "no tax withheld": nothing is changed.
- Verify: verify-dividend-tax.ts (31). Existing dividend, board, investment-class and guard verifies still pass. Changed: lib/shareholderDividends.ts, lib/types.ts, contexts/DataContext.tsx (recordShareholderDividend takes the rate and validates it on the server), components/ShareholderDividends.tsx.

## v289: shareholder dividends, board and advisors, investment classes

- **Board and advisors.** Each board or advisory meeting is recorded: date, who attended, agenda, what was decided, key risks, and actions with an owner and a due date. Open actions are followed to done, overdue ones are marked, and a board pack downloads as plain text (the month's revenue, profit, cash, runway, the latest meeting, and every open action). Owner only, on the profitability page under "Board and advisors". Nothing is sent from Balancr. Limits: the pack's numbers are the month's profit and cash at the moment it is made; meetings are stored on the settings record, which suits a small board, not a long meeting archive.
- **Investment classes.** The investment map's groups are now separate classes: retirement and government schemes (PPF, EPF, NPS, NSC), commodities, alternative investments (AIFs, private equity, InvITs, structured products), and cash and liquid. Existing records keep their class; the labels now list the instruments each class covers. Classes are a choice, not a tax treatment.
- Verify: verify-board-meetings.ts (16), verify-investment-classes.ts (38). Changed: lib/types.ts, lib/investments.ts, app/profitability/page.tsx, lib/periodGuards.ts (dividend rules registered with the closed-books lock), contexts/DataContext.tsx.

## v289 (shareholder dividends, detail)

- **Built.** Dividends to the people on the cap table, split by shares to the cent. Each dividend checks against profit not yet paid out (cumulative profit after tax, less pool dividends and shareholder dividends already paid), and is refused if it is more. Each declaration writes the cash as a capital withdrawal in the same batch, so the record and the cash cannot disagree. Deleting a dividend removes both. A statement per person: ownership, money put in through equity rounds (matched by name), dividends received, and received as a % of money put in. A person who has left the cap table keeps their record. Two CSV exports: statements and the dividend ledger. Owner only, on the profitability page under "Shareholder dividends and statements".
- **Why.** Investors and private equity partners need to see what they have been paid, and the business needs a check that it does not pay out profit it has not made. Pool dividends (one investment) and the cap-table planner already existed; this covers the company as a whole.
- **Limits.** Checks against accounting profit only, not against your country's distributable-reserves or dividend tax rules, and no tax is worked out. Profit is counted from the first recorded month, so opening balances from before Balancr are not included. Balancr records the payment; it does not send money. A dividend's allocations are fixed when it is declared; to change one, delete and declare it again.
- **Checks.** verify-shareholder-dividends.ts (19). Added: lib/shareholderDividends.ts, components/ShareholderDividends.tsx. Changed: lib/types.ts (ShareholderDividend, EquityPlan.dividends), contexts/DataContext.tsx (recordShareholderDividend, deleteShareholderDividend), app/profitability/page.tsx.

## v288: time and value, a drawn org chart, D2C channel

- **Built.** A time and value card on the Employees page: hours worked (billable split out), labour from clock entries, profit after tax per hour worked, recurring share of revenue, and hours per person. The organisation is drawn as a chart: boxes with the reports hanging below on a line. Direct to consumer (D2C) is a sales channel preset.
- **Why.** These numbers show when the business trades hours for money and when revenue repeats (memberships, subscriptions, retainers) without new hours sold.
- **Limits.** Labour from clock entries is a cost view and is separate from payroll, which is booked as expenses; the two must not be added. Clock entries longer than 24 hours are capped at 24. A running entry counts nothing until it is closed. D2C is a channel only; there is no separate price tier, as before.
- **Checks.** verify-time-value.ts (10). Changed: lib/salesChannels.ts, components/ops/SuccessionPanel.tsx, app/employees/page.tsx.

## v287: results bonus screen

## v287: results bonus screen

- **Built.** The results bonus pool has a card on the Employees page: pick a month, see the profit after tax, the pool, and each active person's share by pay rate. The share and the minimum are set in Settings. Nothing is booked or paid.
- **Limits.** The pool is calculated from the profit after tax in the monthly P&L. Booking a bonus is still a manual expense, as with commission.
- **Checks.** verify-bonus-pool.ts (8). Changed: lib/types.ts, app/settings/page.tsx, app/employees/page.tsx.

## v286: operations gaps closed (autopay bills, manager spending limit, results bonus, SOP videos, new-hire training)

- **Built.** A regular weekly day off per person (Employees page). A shift set on that day is flagged on the rota, like a shift on leave. Recurring bills can post themselves when due (autopay switch on the template). Managers have a monthly spending limit on one-off expenses (set in Settings). Written procedures can link to a recorded video (https only). A new hire gets a read-and-confirm task for each procedure not yet read at its current version. A results bonus pool (a share of profit above a minimum, split by weight) is calculated in lib/bonusPool.ts.
- **Already in place, checked.** Second signer on bill and supplier payments (v283, v284). Purchase order approval above an amount (v183b). Tiered commission on sales target and profit basis (v239). Written procedures with versions and acknowledgements. New-hire checklist (onboarding tasks). Hiring pipeline from applied to hired (lib/recruiting.ts).
- **Limits.** Autopay posts when an owner or manager has the app open on or after the due date; there is no server-side scheduler for it. Autopay copies the last posted amounts, so a changed bill is corrected by editing the expense. The spending limit blocks the entry and tells the manager to ask the owner; it does not route it to a request. The bonus pool is a calculation only: nothing is booked or shown on a screen yet. Video links are stored, not checked for playback. The rota flags a shift on a regular day off but does not stop it being saved.
- **Checks.** verify-autopay.ts, verify-spend-limit.ts, verify-bonus-pool.ts, verify-procedure-training.ts, verify-weekly-off.ts.
- **Files.** lib/recurringAutopay.ts, lib/spendLimit.ts, lib/bonusPool.ts, lib/procedureTraining.ts, lib/weeklyOff.ts. Changed: lib/types.ts, lib/operations.ts, contexts/DataContext.tsx, components/RecurringExpenses.tsx, components/ops/ProceduresPanel.tsx, app/settings/page.tsx, app/employees/page.tsx.

## v285: payment events, and event-based sync closed

- **Built.** Recording a payment against an invoice sends the invoice's new status (paid or overdue) to the business webhook as it happens. The server works the status out from the invoice's own totals. Lead stage changes, incidents and purchase order approvals were already event-based.
- **Limit.** Payments recorded by a staff login are sent by the daily sync, not as events (the event route is for the owner or a manager).
- **Checks.** verify-payment-events.ts (8); verify-ops-events.ts updated to three events (13). AutoLeads pass 294: full chain 1,113 checks, production build.
- **Files.** lib/invoiceEvents.ts, scripts/verify-payment-events.ts. Changed: lib/opsEvents.ts, contexts/DataContext.tsx (payment write), app/api/webhooks/ops-event/route.ts, scripts/verify-ops-events.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v284: second signer on bill payments

- **Built.** Bill payments above the limit go to a second signer, the same as supplier payments. An approved bill payment is written to bill payments.
- **Still open, in scope.** Event-based sync between Balancr and AutoLeads (spec item 12). The sync runs once a day, which is the scheduled fallback the spec allows; the event-driven push is not built.
- **Checks.** verify-second-signoff.ts (21).
## v283: second signer on supplier payments

- **Built.** A supplier payment above a limit set in Settings is sent to the requests list instead of being posted. An owner, or a manager within their limit, approves it, and the payment is recorded then. The person who recorded it cannot approve it. The approver's name is kept on the payment.
- **Not yet.** Bill payments and expense payments are not routed through the second signer.
- **Checks.** verify-second-signoff.ts (19).
- **Files.** lib/secondSignOff.ts, scripts/verify-second-signoff.ts. Changed: lib/operations.ts, lib/types.ts, contexts/DataContext.tsx, components/RecordPayablePaymentForm.tsx, components/ops/RequestsPanel.tsx, app/settings/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v282: weekly numbers for the owner

- **Built.** A Monday email to the owner: the previous week's sales, expenses and what is left (stated as not the accounting profit). Off by default, with a report address in Settings. Scheduled daily; checks for Monday itself.
- **Found in the 25-item list, not built.** Dual sign-off on payments above a limit (a second approver). Nothing enforces it yet; this is the next control to build.
- **Checks.** verify-weekly-numbers.ts (10).
## v281: home page brought up to date; won-deal queue confirmed

- **Home page.** A card now describes part deliveries, invoicing per delivery, contractor and talent shares, the trial balance and journal, and the year-end close. The wording check requires it and keeps the statements the app cannot back (no bank feed, no tax filing, no payroll service).
- **Correction.** Earlier notes said there was no queue of won deals. There is one: won leads appear in the Won section of Leads and are recorded as a sale only when you confirm. A won lead records one unit at the price charged; a multi-unit or multi-product deal is recorded as a normal sale.
- **Checks.** verify-home-wording.ts (9).
## v280: delete a whole business (platform admin)

- **Built.** A platform-admin **Delete** button on the admin list, and a route that removes one business's full tree (users/{businessId} and everything under it). Requires the admin passcode and the business ID typed exactly. Nothing else is touched.
- **Why admin-only.** Deleting a business is permanent; shop owners should not be able to do it by accident. The owner screens still have no delete.
- **Limits.** The admin list may show the business until refreshed; people in it may still sign in until removed.
- **Checks.** verify-admin-delete.ts (7).
- **Files.** app/api/admin/businesses/[businessId]/delete/route.ts, scripts/verify-admin-delete.ts. Changed: app/admin/new-business/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts, CHANGELOG.md.
## v279: a product with history cannot be deleted

- **Built.** Deleting a product that has sales or purchases on record is refused, with the counts and an instruction to archive it. This is the cause of the missing-stock problem found on the real backup. Confirmation texts on the products screen now say so.
- **Checks.** verify-product-delete.ts (6).
- **Files.** lib/productDelete.ts, scripts/verify-product-delete.ts. Changed: contexts/DataContext.tsx (deleteProduct), app/products/page.tsx (confirmation text), USER-MANUAL.md, CHANGELOG.md.
## v278: invoicing per delivery (opt-in per order)

- **Built.** A web order can be set, at confirmation, to record its sales as each part is delivered. Each delivery bills only what it adds, under its own invoice number (order-D1, -D2 ...). The goods leave stock on delivery. "Delivered today" bills everything not yet billed. Orders without the setting keep confirmation-time sales, unchanged.
- **Why opt-in.** Recording sales at delivery is the right accounting for part deliveries, but changing every order would move revenue and stock for existing orders and drop sales for shops that do not track delivery.
- **Checks.** verify-delivery-invoicing.ts (10). The data layer's order update now accepts the three new order fields.
- **Files.** lib/partialDelivery.ts (deliveryPosts), scripts/verify-delivery-invoicing.ts. Changed: lib/types.ts, components/ops/WebOrdersPanel.tsx, components/ops/DeliveryRunPanel.tsx, contexts/DataContext.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v277: part deliveries on web orders

- **Built.** Each product on an order records how much has been delivered; a delivery can't exceed what is left; the order is dated as delivered only when every product is complete. The delivery run shows the remaining quantity per product and a record box. "Delivered today" completes the whole order and keeps its meaning.
- **Not yet.** Invoicing per delivery: invoices still bill the whole order. Stated on the screen and in the manual.
- **Checks.** verify-part-delivery.ts (13).
- **Files.** lib/partialDelivery.ts, scripts/verify-part-delivery.ts. Changed: lib/types.ts (order line), components/ops/DeliveryRunPanel.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v276: year-end close

- **Built.** A year-end close on the existing monthly lock (booksClosedThrough). It runs only when the months before December are closed, the balance sheet and trial balance balance, the journal reconciliation is confirmed, and the owner confirms. Locks through 31 December; never moves a lock back. Owner-only tab.
- **Chosen next.** Partial deliveries on orders (touches orders, stock and invoices together; scheduled as the next build).
- **Checks.** verify-year-close.ts (12).
- **Files.** lib/yearClose.ts, components/ops/YearEndPanel.tsx, scripts/verify-year-close.ts. Changed: lib/operations.ts, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v275: contractor and talent shares

- **Built.** A product can name the contractor or talent who earns a share of its sales, and the share in percent. A report on the Operations page shows what each earned for the months chosen, with unassigned revenue and invalid shares reported. Names are matched ignoring case and spacing.
- **Not yet.** Returns are not netted off; amounts are not deducted from profit or posted to the journal. Stated on the screen and in the manual.
- **Checks.** verify-contractor-share.ts (10). The full suite and build are below.
- **Files.** lib/contractorShare.ts, components/ops/ContractorSharePanel.tsx, scripts/verify-contractor-share.ts. Changed: lib/types.ts (product fields), app/products/page.tsx (product form), lib/operations.ts, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v274: disposals in the journal, and a sync log

- **Disposals.** Selling or writing off a fixed asset is posted: cash in, accumulated depreciation cleared, cost removed, gain or loss. Checks: verify-disposals.ts (6).
- **Sync log.** Each AutoLeads stage change and invoice read is recorded (action, record, outcome, time) through a helper that never blocks the call. Checks: verify-sync-log.ts (6). Note: an invoice read now writes one log entry.
- **Already present, checked against the spec.** Debit and credit notes exist as supplier returns and customer returns.
- **Still open, in scope.** A queue of won deals waiting for owner confirmation; event-based sync (today it is daily); partial fulfilment on orders; an explicit year-end close.
## v273: stock that was dropping out of the books, found by a real run

- **Found on a real backup.** The backup of the test business did not balance. Purchases referred to eight products, but the products list held one. The stock ledgers were built only from the products list, so the stock for the other seven vanished from the balance sheet (5,669,500 on that backup). Deleting a product that still had history would do the same.
- **Fixed.** Stock, sales and returns for a product missing from the list are now counted. Products that exist are unchanged. Test: verify-orphan-stock.ts (4 checks).
- **Journal cost of sales** now uses the app's own cost for each sale, so the journal and the balance sheet work from the same figure.
- **Real run.** scripts/run-backup-reconciliation.ts runs the app's own calculations on a backup and prints each reconciliation line. On the uploaded backup after the fix: balance sheet balances; journal balances; cash reconciles (2,514,500); inventory reconciles (14,700).
- **Grouping check** updated to the intended behaviour (missing-product stock counted): 303 of 303.
- **Full suite:** 301 passing; the two failures predate this work (catalogue mirror fields, demo guardrails).
## v272: the journal mapped further, and reconciled to the balance sheet

- **Mapped.** Receivable and payable payments; stock purchases with freight, customs and other landed costs, and input tax; cost of goods sold on product sales; loan drawdowns and each repayment split into interest and principal on the balance sheet's own annuity schedule; fixed-asset purchases and monthly depreciation through the same function the balance sheet uses.
- **Reconciled.** Cash, receivables, inventory, payables, loans payable, sales tax payable and fixed assets (net book value), each compared with the balance sheet. A difference is shown with its amount.
- **Not mapped yet.** Disposals of fixed assets, sales and purchase returns, customer deposits and supplier credit, prepaid expenses.
- **Checks.** verify-journal-mapping.ts (14); verify-journal.ts updated (14).
- **Not verified here.** Whether each reconciled line matches your own balance sheet: that needs your real data, and the screen shows any difference.
- **Files.** lib/journalMapping.ts, scripts/verify-journal-mapping.ts. Changed: lib/journalFromRecords.ts, components/ops/JournalPanel.tsx, scripts/verify-journal.ts, USER-MANUAL.md, CHANGELOG.md.
## v271: double-entry journal (built as a view on the records)

- **Journal engine.** Entries refused unless their debits equal their credits, their date is a real calendar date, and each line is one debit or one credit.
- **Mapping.** Credit and cash sales (with tax), paid and unpaid expenses, capital entries (investment, reinvestment, withdrawals), with outside investors' pool money in its own account.
- **Not mapped yet.** Receivable and payable payments, stock purchases, loans drawn and repaid, depreciation. Listed on the screen, not guessed.
- **Why a view.** Changing how the stored ledger posts would risk the live books; the journal is derived from the records instead and changes none of them.
- **Checks.** verify-journal.ts (14).
- **Files.** lib/journal.ts, lib/journalFromRecords.ts, components/ops/JournalPanel.tsx, scripts/verify-journal.ts. Changed: lib/operations.ts, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v270: trial balance and accounting terms

- **Trial balance.** Every balance on the balance sheet in its debit or credit column, with totals, a debits-equal-credits check, and a reconciliation to the balance sheet. Post-closing: income and cost accounts already closed into retained earnings. Owner and manager, read only.
- **Accounting terms.** Mapped in the manual to what the app does: equation, revenue and expense, capital and drawings, accruals and depreciation as adjusting entries, closing into retained earnings. Prepaid expenses are not split out as an asset.
- **Not built.** A double-entry journal (every transaction posted as a debit and a matching credit). The app records each transaction once and builds the statements from those records. A journal is a change to the ledger itself.
- **Checks.** verify-trial-balance.ts (9).
- **Files.** lib/trialBalance.ts, components/ops/TrialBalancePanel.tsx, scripts/verify-trial-balance.ts. Changed: lib/operations.ts, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v269: open connections as keys, and the Hobby plan

- **Connections.** E-signature, review replies, market prices and distance routing added to the Integrations catalogue as key-entry services: provider name for your records, a masked key, a status. Entering a key does not start a feature until a provider is chosen and its code path is written; nothing is sent or changed automatically.
- **Hobby plan.** Scheduled jobs: Balancr 2, AutoLeads 8, within the 100-job limit, each once a day. Serverless time limits within 60 seconds.
- **Not added, per your instruction.** The bank feed.
- **Checks.** verify-open-connections.ts; verify-integrations.ts still passes 28 of 28.
- **Files.** lib/integrations.ts, scripts/verify-open-connections.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v268: accounting formulas and warning signs

- **Formulas added** from the sheets: proprietary ratio, receivables turnover and average collection period, payables turnover and average payment period, P/V ratio, operating ratio, margin on selling price, markup on cost. Shown on the profit split screen. Turnover ratios use period-end balances (stated).
- **Warning signs** from the guides: each checked against the figures held, shown as flag, OK, or not measured. Not measured where the app keeps no history or record (intangibles, non-operating income, payables trend, operating cash flow, which is on the cash flow screen).
- **Checks.** verify-ratio-formulas.ts (10), verify-red-flags.ts (13). Existing ratio checks still pass.
- **Already present** from the sheets: gross and net profit, working capital, COGS, sales and purchases, returns, depreciation (straight-line and reducing balance), average inventory, drawings, ROCE, ROE, current and quick ratios, debt to equity, interest cover, inventory turnover, asset turnover, EBIT, EPS, break-even, margin of safety, contribution, markup.
- **Files.** lib/ratioFormulas.ts, lib/redFlags.ts, scripts/verify-ratio-formulas.ts, scripts/verify-red-flags.ts. Changed: components/ops/ProfitSplitPanel.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v267: return ratios, and the free-plan fit

- **Ratios.** Return on equity (profit after tax over equity) and return on capital employed (operating profit over total assets less current liabilities), on the profit split screen. Current liabilities are treated as everything except loans, stated in the manual.
- **Free plan.** AutoLeads: every serverless time limit cut from 300 to 60 seconds (the free plan's ceiling), and internal deadlines shortened to fit. Balancr: the customer-message job is scheduled once a day; all Balancr limits are already at or under 60.
- **Checks.** verify-ratios.ts (8). AutoLeads' sync and Balancr tests still pass.
- **Not built, and why.** Investment-type catalogue, cash-versus-stocks risk, and the marketing and sales frameworks in the pictures: personal investing and sales or marketing, outside the business app.
- **Open, and what closes them.** Bank feed, e-signature, review posting, market prices and distance routing: each needs an account or key. Windowing: waits for real volume (the trigger is built). Return direction of the AutoLeads sync: a live test.
## v266: the Balancr home page and pipeline checked

- **Opportunities.** The screen is an idea-scoring tool (upside, options, longevity, capital, time to profit, friction), not a sales pipeline. Renamed "Opportunity scoring (ideas)" and moved from Buy & sell to Overview. Its checks and the hidable-pages list follow.
- **Home page.** Added "Keep the customers who pay" (customer profit and routine messages). Added "Campaigns and sales outreach": those live in AutoLeads, and Balancr sends it leads and reads invoice status once a day. The wording check covers both.
- **Leads.** Stages checked against the sync; no change needed.
- **Files.** components/AppShell.tsx, lib/navOrder.ts, lib/navPrefs.ts, app/page.tsx, scripts/verify-contracts-nav.ts, scripts/verify-home-wording.ts, USER-MANUAL.md, CHANGELOG.md.
## v265: customer messages, sidebar order, windowing trigger

- **Customer messages.** Six routine messages worked out from the records: booking confirmation (within the hour), booking reminder (a day ahead), quote follow-up (three to seven days), thank-you (within a day of completion), welcome (first order, within a day), and review request (three to five days after a job, promotional, off by default). Each event is sent once; service messages stop for customers who asked not to be messaged, except their own booking; promotional messages need marketing consent. Daily job on the same gate as the overdue-reminder job: quiet hours, a cap of 100 per run, a send log. Settings switches for both. Already present and unchanged: overdue invoice reminders by email and text.
- **Construction.** Subcontractors, retention, milestones, cost segments and time were already present; milestones can be invoiced as they are reached (progress billing), with an invoiced date.
- **Sidebar.** Screens reordered so the daily ones come first and selling and retention sit together. Same screens, same groups.
- **Windowing trigger.** The System check shows "Windowing is due" at 5,000 documents in a session or 2,000 in one collection. The backup supplied is a test business of 110 records, so no windowing is built.
- **Fixed during checks.** The limits checker's phrase for the windowing note; the test's starting values were typed too narrowly; the opt-out rule was checked against the design, not the wording.
- **Checks.** verify-customer-messages.ts (18), verify-customer-job.ts (9), verify-load-budget.ts (7), and the ordering and navigation checks still pass.
- **Not built, and why.** Birthday messages, win-back campaigns, DM and comment auto-replies, lead reply timing and missed-call text-back: marketing, sales or telephony, which belong to the sales and marketing platform or need a phone connection. Referral asks after five stars: reputation marketing; the referral field is recorded, but no automatic ask.
- **Files.** lib/customerMessages.ts, app/api/cron/customer-messages/route.ts, lib/loadBudget.ts, scripts/verify-customer-messages.ts, scripts/verify-customer-job.ts, scripts/verify-load-budget.ts. Changed: lib/types.ts (refusal flag, settings switches), app/settings/page.tsx, lib/navOrder.ts, components/ops/SystemCheckPanel.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts, CHANGELOG.md.
## v265: windowing trigger

- **Sizing.** The one backup provided is a test business with 110 records (sales 15, purchases 12, audit log 72). The audit log is already capped at 1,000 entries when loaded, and no money figure depends on it. The volume a real business reaches is still unknown, so windowing is not built.
- **Trigger.** The System check shows "Windowing is due" once a session has received 5,000 documents, or one collection alone 2,000. Below that nothing is shown.
- **Checks.** verify-load-budget.ts (7 checks).
- **Files.** lib/loadBudget.ts, scripts/verify-load-budget.ts. Changed: components/ops/SystemCheckPanel.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v264: measuring the system (System check)

- **Gap found.** Efficiency was unmeasured. The data layer opens about 105 live listeners and reads whole collections, so cost and speed on a real account were a guess.
- **Built.** Every live listener goes through a tracked wrapper that counts the documents each delivery carries and when. The owner's System check screen shows listeners, documents delivered, deliveries, first-data time, and the largest sources, with a fresh-count button.
- **Not built, and why.** Windowing the high-volume collections to a date range. The balance sheet, retained earnings, asset values and loan balances depend on the full history, so a window would show wrong totals. It needs opening balances per period, designed from these measurements first.
- **Checks.** verify-system-check.ts (9 checks).
- **Files.** lib/loadStats.ts, components/ops/SystemCheckPanel.tsx, scripts/verify-system-check.ts. Changed: contexts/DataContext.tsx (every listener tracked), lib/operations.ts (owner tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v263: synced with AutoLeads

- **Gap found.** AutoLeads already had a client for Balancr (send deals as leads, pull inbound leads, read invoice status, receive stage changes), but Balancr did not serve several of its calls, a pushed deal did not keep the Balancr lead id, and nothing ran the sync.
- **Balancr.** Single-lead route (read; move stage to a real lead stage; no creation). Invoice status route (read only; paid when the payments cover the sales under that invoice, overdue past the due date, open otherwise).
- **Ownership.** Balancr decides won and lost; AutoLeads decides the outreach stages before that. Written up in SYNC.md.
- **Checks.** verify-invoice-status.ts (7), verify-lead-item-route.ts (5). AutoLeads: tests/balancr-sync.test.mjs (10) and the existing balancr test (4).
- **Files.** lib/invoiceStatus.ts, app/api/v1/businesses/[businessId]/leads/item/[leadId]/route.ts, app/api/v1/businesses/[businessId]/invoices/item/[invoiceId]/route.ts, SYNC.md. Changed: USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v262: customer profit, cash waterfall, and the assistant's context

- **Customer profit.** Per customer: revenue less the cost of goods, refunds and discounts; worst first; flags for loses money, returns a lot, thin margin, healthy. Operations tab, owner and manager.
- **Cash waterfall.** EBITDA less interest and tax, less loan principal repaid (from each loan's schedule), less reinvestment and take-home recorded, then shared between named partners. Shortfall shown, not split. Profit split screen.
- **Assistant context.** Catalogue items carry their usual price, whether they are an offer or bundle, and their reorder level. Live stock is not sent (not stored on the product). The app description now covers the modules added since it was written.
- **Checks.** verify-customer-profit-waterfall.ts (14 checks), verify-assistant-context.ts (6 checks).
- **Not built, out of scope.** Traffic, click-through and bounce rates, paid acquisition, cost per lead, funnel stages, creative, follow-up sequences: these belong to the sales and marketing platform. Upsell is not measured separately; repeat purchase and lifetime value are.
- **Files.** lib/customerProfit.ts, lib/cashWaterfall.ts, components/ops/CustomerProfitPanel.tsx, scripts/verify-customer-profit-waterfall.ts, scripts/verify-assistant-context.ts. Changed: components/ops/ProfitSplitPanel.tsx, lib/operations.ts, app/operations/page.tsx, lib/types.ts, lib/firebaseAdmin.ts, lib/aiPrompts.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v261: per-share figures

- **Gap closed.** Where a business has shareholders, earnings per share and value per share were not shown. The owner now enters the shares in issue (or the fully diluted count), and the profit split screen shows earnings per share, value per share from the chosen valuation, and the price-to-earnings ratio that valuation implies.
- **Not built, by design.** A share price, market capitalisation and supply and demand for shares: a private business has no exchange price, so these have no meaning in the app.
- **Checks.** verify-per-share.ts (8 checks; 1m profit over 1m shares is 1.00 per share; 4.50 per share implies a P/E of 4.5).
- **Files.** lib/perShare.ts, scripts/verify-per-share.ts. Changed: components/ops/ProfitSplitPanel.tsx, lib/types.ts (share count), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v260: cost behaviour, and value at an earnings multiple

- **Gaps closed.** Costs were not classified as fixed, variable or semi-variable, and the business could not see what it might be worth on earnings (the funding and buyout question in the notes). Founders' and investors' shares were already covered by the investor pool.
- **Cost behaviour.** Each of the ten expense categories has a default behaviour. The profit split screen shows the split for the chosen months; a monthly recurring cost counts in every month from its start.
- **Value.** Trailing EBITDA (profit before tax, interest and depreciation added back), times an owner-entered multiple, giving the business's value and the owners' share after loans and cash.
- **Checks.** verify-cost-valuation.ts (10 checks; 6,000 fixed of 9,000 is 66.7%; 1m of EBITDA at 5 times, less 800k loans plus 300k cash, is 4.5m for the owners).
- **Files.** lib/costBehaviour.ts, lib/valuation.ts, scripts/verify-cost-valuation.ts. Changed: components/ops/ProfitSplitPanel.tsx, lib/types.ts (multiple), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v259: partner revenue

- **Gap closed.** Partners were recorded, but not linked to revenue, so partner performance could not be measured. The customer's existing "referred by" field now feeds a partner revenue screen: each partner's referred customers, their revenue and share of total, with the unattributed remainder shown.
- **Matching.** Referrer names match ignoring case and extra spaces; a different spelling does not match and is not guessed.
- **Checks.** verify-partner-revenue.ts (9 checks; 5,000 of 10,500 is 47.6%).
- **Files.** lib/partnerRevenue.ts, components/ops/PartnerRevenuePanel.tsx, scripts/verify-partner-revenue.ts. Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v258: recurring revenue share

- **Gap closed.** The notes set a target of 65–75% of revenue from recurring work. The business could not see that share: recurring schedules existed, but nothing reported how much revenue they produced.
- **Measure.** Sales raised by a recurring run (linked through the generation log) over total revenue for the chosen months, against a target. Shown on the profit split screen.
- **Checks.** verify-recurring-share.ts (8 checks; 3,000 of 5,000 is 60%).
- **Files.** lib/recurringShare.ts, scripts/verify-recurring-share.ts. Changed: contexts/DataContext.tsx (reads the generation log), components/ops/ProfitSplitPanel.tsx, lib/types.ts (target), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v257: sustainability, write-downs, solvency and value

- **Sustainability and community log (v255).** Monthly record of electricity, water, fuel, waste and recycling, emissions as entered, local spend, donations and volunteer hours; recycling rate; targets as ceilings or amounts to reach. Gap found: no tracking existed beyond product eco tags and a permit reminder. Checks: 15.
- **Write-downs (v256).** Impairment of a fixed asset, dated, capped at what the asset is worth that day, charged in its month as a non-cash expense, reducing book value under both depreciation methods. Gap found: no recorded impairment (only guidance text). Checks: 15.
- **Solvency and value (v257).** Equity ratio, debt to equity, interest cover, and book enterprise value, beside the return on capital. Gap found: none of these existed. Checks: 10.
- **Checked against the pictures.** Finance terms (cash vs profit, free cash flow, revenue vs bookings, deferred revenue, EBIT and EBITDA, gross and contribution margin, NPV and IRR, budget and forecast, CAPEX and OPEX, depreciation and amortisation) are covered. Market cap and sale-price valuation are not built: they need a market price for shares or a buyer, which a private business does not have in the app.
- **Files.** lib/sustainability.ts, components/ops/SustainabilityPanel.tsx, lib/impairment.ts, lib/solvency.ts, scripts/verify-sustainability.ts, scripts/verify-impairment.ts, scripts/verify-solvency.ts. Changed: lib/types.ts, lib/calculations.ts (impairments in book value), app/assets/page.tsx, components/ops/ProfitSplitPanel.tsx, contexts/DataContext.tsx, firestore.rules, lib/backupPayload.ts, scripts/restore-from-backup.mjs, lib/operations.ts, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v254: interest rate stress on variable-rate loans

- **Gap closed.** Loans carried one fixed rate, so a rate rise could not be tested. A loan can now be marked variable. The scenario screen shows, for each variable loan, the balance still owed, the repayment now, and the extra cost of a 1, 2 or 3 point rise per month and per year.
- **Also in this release.** Return on invested capital (v253), with the value verdict against the owner's cost of capital.
- **Checks.** verify-rate-stress.ts (12 checks; 100,000 at 12% over 12 months repays 8,884.88 a month).
- **Files.** lib/rateStress.ts, scripts/verify-rate-stress.ts. Changed: lib/types.ts (variable flag), app/loans/page.tsx (the checkbox), components/ops/ScenarioPlanPanel.tsx (the stress card), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v253: return on invested capital, against the cost of capital

- **Gap closed.** ROIC was the one measure in the capital allocation list the app did not calculate. Free cash flow, WACC, NPV, IRR, staged investment, stress testing, concentration, reserves, seasonality, post-investment review and ranking by return were already present.
- **Measure.** Operating profit (pre-tax profit plus interest) after tax, over equity plus loans less cash. Shown on the profit split screen with a cost of capital the owner enters, and a verdict: creates value, destroys value, or break-even.
- **Checks.** verify-roic.ts (12 checks, worked numbers: 1,020 after tax on 8,000 gives 12.75%).
- **Files.** lib/roic.ts, scripts/verify-roic.ts. Changed: components/ops/ProfitSplitPanel.tsx, lib/types.ts (cost of capital), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v252: profit split (where the revenue goes)

- **Gap closed.** The notes' profit waterfall (revenue, gross, net, reinvestment, take-home) was partly covered: owner withdrawals and reserves were tracked, but not shown as one view against targets.
- **Screen.** Owner-only Profit split tab: revenue, gross and net profit with their shares; reinvestment and take-home actuals from the capital entries (investor pool returns excluded), each against a target; the status (covered, short by how much, loss, or not set). Targets saved to the settings.
- **Checks.** verify-profit-split.ts (15 checks), using the figures from the notes (25m revenue, 30% gross, 10% net, 8% reinvested, 2% taken home).
- **Files.** lib/profitSplit.ts, components/ops/ProfitSplitPanel.tsx, scripts/verify-profit-split.ts. Changed: lib/operations.ts (owner-only tab), app/operations/page.tsx, lib/types.ts (targets), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v251: bank rules and groups in different currencies

- **Bank rules.** Rules on the reconciliation page: ignore a line, or match it to an entry by label. Matches only where exactly one entry fits (label, amount within one unit, date within three days); anything else is left for review. Rules only mark lines; each mark is stamped with its maker. Rules stored in the business settings.
- **Multi-currency groups.** The group chooses a reporting currency and enters dated rates for each other currency. Each business is converted before adding; transfers entered in the reporting currency; a missing rate stops the group and is named.
- **Checks.** verify-bank-rules.ts (13 checks); verify-consolidation.ts extended to 17 checks with worked conversion numbers (10 USD at 300 becomes 3,000).
- **Fixed during checks.** A memo with incomplete inputs (linter); an optional value that the type-check could not prove (rates).
- **Limits.** Rates are entered, not fetched; rules do not read a bank feed.
- **Files.** lib/bankRules.ts, components/ops/BankRulesPanel.tsx, lib/consolidation.ts, components/ops/GroupPanel.tsx, app/reconciliation/page.tsx, lib/types.ts, scripts/verify-bank-rules.ts. Changed: scripts/verify-consolidation.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v250: healthcare business type

- **Added.** "Clinic, pharmacy or care service" as the twelfth kind of business: starter measures (appointments kept, medicines out of stock), areas of responsibility, and a check-in procedure. Screens that do not fit (kitchen, tabs, farm, consignment, electronics, gift cards, rentals in the menu; royalties, royalty inbox, delivery run, priorities, backorders on the operations screens) are hidden for this type.
- **Limit.** Operational records only; no clinical records or prescribing.
- **Files.** lib/starterSets.ts, lib/navOrder.ts, lib/operations.ts, scripts/verify-starter-sets.ts and scripts/verify-business-types.ts (counts to twelve, healthcare included), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v249: contracts, and a tidier menu

- **Contract register.** Contracts with the other party, kind, start and end, notice period and yearly value. Renewal decisions shown first (within 60 days, after notice); ended contracts flagged; "make it open-ended" really clears the end date (the update deletes the field).
- **Menu.** Opportunities moved to Buy & sell beside Leads and Estimates; Jobs, Projects and the two loan screens renamed to say what they are; niche screens (kitchen, tabs, farm, consignment, electronics, and others) hidden for the types of business that do not use them, with "show every screen" overriding.
- **Checked against the list.** Already present: leave, timesheets, expense claims and reimbursement, payslips and payroll runs, purchase orders, stock counts, recipes, insurance expiries. Not built: VAT/GST filing (by design), e-signature (needs a provider key), marketing campaigns and social or website management (outside this app's scope), and custom report builder (reports and CSV exist).
- **Files.** lib/contracts.ts, components/ops/ContractsPanel.tsx, scripts/verify-contracts-nav.ts (19 checks). Changed: lib/navOrder.ts (niche screens, order), components/AppShell.tsx (labels, group, filter), contexts/DataContext.tsx, firestore.rules, lib/operations.ts, lib/backupPayload.ts, scripts/restore-from-backup.mjs, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v248: group consolidation for businesses one login runs

- **Gap closed.** One account per business meant no group view, and transfers between your own businesses could be counted twice.
- **Design.** Each business publishes its last 24 months of summary (revenue, cost of sales, costs and tax, net profit) while an owner or manager has it open. The group view (owner only) adds the chosen businesses together by month, and takes transfers between them out of revenue and cost, leaving the profit unchanged. Transfers are not posted to any business's own books.
- **Checks.** Group members must share a currency, at least two, transfers must be real and between members, and a transfer cannot be to the same business.
- **Limits.** Businesses under different logins cannot be grouped; no currency conversion; figures are as last published.
- **Files.** lib/consolidation.ts, lib/groupSnapshot.ts, components/ops/GroupPanel.tsx, components/ops/GroupSnapshotSync.tsx, scripts/verify-consolidation.ts (11 checks), scripts/verify-group-snapshot.ts (8 checks). Changed: firestore.rules (three records), lib/operations.ts (owner-only list, tab), components/AppShell.tsx (publisher), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v247: screens in a consistent order

- **Gap found.** Screens within a group showed in the order they were added to the code: Invoices and Bills after Cheques and Mileage, Farm batches and Memberships at the end of Buy & sell, Team access in the middle of Team. The finder ranked ties alphabetically, which did not match the sidebar.
- **Order.** One explicit order per group (lib/navOrder.ts). Groups keep their order. The sidebar, the finder and the quick jump all use it. A screen not in the order goes last in its group, by name.
- **Finder.** Equal matches keep the sidebar order, not alphabetical.
- **Files.** lib/navOrder.ts, scripts/verify-nav-order.ts (12 checks). Changed: components/AppShell.tsx, lib/screenSearch.ts, scripts/verify-screen-search.ts (unchanged expectations), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v246: fewer re-renders (efficiency)

- **Stable data value.** Every function in the data context is handed out once, as a wrapper that calls the latest version, so its identity never changes. The context value is replaced only when one of its data fields changes. The view-only accountant wrapper is applied once per value, not on every render.
- **Batched loading.** Live listeners report in as they arrive; their reports are merged into one update per turn of the event loop, and an update that changes nothing causes no render. Start-up no longer renders the app once per collection.
- **Helpers.** lib/renderGuards.ts (shallowSame, mergeFlags), with scripts/verify-render-guards.ts (8 checks).
- **Limit.** Derived values inside the data context that are not memoised still change identity on each render, so some re-renders remain; splitting the context by area is the next step. Speed has not been measured in a browser.
## v245: quick jump to any screen (usability)

- **Screen finder.** Ctrl+K (Cmd+K on a Mac), or / when not typing, opens a finder over the screens the person can see. Names starting with the letters rank first, then words, then letters inside names, then groups. Arrow keys, Enter and Esc work as expected.
- **Fixed during checks.** The finder's hooks ran after an early return, which the linter caught; moved above it, so they run on every render.
- **Files.** lib/screenSearch.ts, components/AppShell.tsx, scripts/verify-screen-search.ts (11 checks). Changed: USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not changed.** The public landing page, which is marketing, beyond what is already there.
## v244: customer addresses for delivery runs

- **Address.** An optional customer address on each order from the shop; shown on the run sheet; stops within an area listed in address order.
- **Not built.** Distance-based routing: needs a maps key and located addresses.
- **Files.** lib/webOrders.ts, lib/types.ts, lib/deliveryRun.ts, app/api/v1/businesses/[businessId]/orders/route.ts, components/ops/DeliveryRunPanel.tsx, scripts/verify-delivery-run.ts (14 checks). Changed: USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v243: automatic draft orders, and likely invoice matches

- **Draft orders.** A draft status for orders. Once a day, when the buying list is opened and the option is on, each due, costed item with no open order becomes a draft for review. Sending a draft applies the approval amount; discarding cancels it.
- **Likely matches.** Purchases with no order show the received order they most likely came from (same supplier, product and quantity). Suggestion only; linking stays manual.
- **Not built, and why.** Route planning by distance: orders carry no customer address. Bank feed, live sales pull, market price feed and review posting need external connections this app cannot make from here. Tax filing is excluded by design.
- **Files.** lib/autoDraft.ts, scripts/verify-auto-draft.ts (11 checks). Changed: lib/types.ts, lib/invoiceMatch.ts (suggestions), components/BuyingListCard.tsx, app/purchase-orders/page.tsx, contexts/DataContext.tsx, components/ops/CostVariancePanel.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v242: scope confirmed; policies and product retirement added

- **Scope.** Operations, management and supply chain, with finance, people, technology, legal and administration as the support functions. Customer-facing marketing and sales are outside this app.
- **Gaps closed.** Workplace policies (leave, conduct and safety, data handling) as acknowledged procedures in the starter set; a retirement procedure for products and services, using the existing active flag and the dead-stock advice.
- **Covered by existing features.** Business continuity (risk register, continuity category), supplier failure (sourcing risk), key-person cover (succession), and the flows: value, money, resources and information, through the calendar, KPIs, decisions, reviews and the month-end close.
- **Known limits (partial, not missing).** A product lifecycle status beyond active or inactive; a headcount forecast beyond the capacity view; internal communication beyond the shift handover and decisions log.
- **Files.** lib/starterSets.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v241: more business types, and screens that fit the type

- **Business types.** Four added to the seven: hire or rental, trades or construction, membership, and consultancy or billed time. Each with starting measures, areas of responsibility and procedures.
- **Screens.** For owners and managers, screens that do not fit the type are hidden (for example the stock count and royalty screens for a services business). Core screens are never hidden. Staff keep their screens. "Show every operations screen" in Starter setup restores all screens for any type.
- **Fixed during checks.** A membership measure had no unit, which the measure rule refuses; given one. The type rule first also hid screens from staff; limited to owners and managers.
- **Files.** lib/starterSets.ts, lib/operations.ts (visibleTabs), app/operations/page.tsx, components/ops/StarterSetPanel.tsx, lib/types.ts, scripts/verify-business-types.ts (28 checks). Changed: scripts/verify-starter-sets.ts (kind count to eleven), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v240: easier packages and productized offers, and the home page checked

- **Productizing.** Four starting shapes for a new offer (single service, package of sessions, monthly retainer, product bundle). A suggested price from the delivery cost and a target margin, with one tap to use it. The margin and profit per delivery shown as the price is typed.
- **Home page.** The description and title now include operations as well as accounting; one feature card describes the built operations features (deadlines, deliveries by driver and area, supplier dependence, hiring checks). Statements the app cannot back (no bank feed, no tax filing, no payroll service) are unchanged.
- **Files.** lib/productize.ts, scripts/verify-productize.ts (9 checks), scripts/verify-home-wording.ts (6 checks). Changed: app/offers/page.tsx, app/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v239: buying-side market rates, commission tiers, and automatic operations measures

- **Buying side.** Optional market cost per product (source and check date); the Market rates tab compares what is paid with the market and flags paying 10% or more above it.
- **Commission tiers.** Optional tiers per employee: share of monthly target and rate. The highest tier reached sets the month's rate; a single rate applies without tiers or a target. Validated; the commission line reports the share achieved and the tier used. Existing single-rate commissions are unchanged (checked).
- **Automatic operations measures.** Six figures from existing records (customer and supplier on-time, staff turnover, overdue filings, overdue changes, time to hire), selectable as a KPI source; empty where nothing is measured.
- **Files.** lib/commissionTiers.ts, lib/opsMeasures.ts, scripts/verify-commission-tiers.ts (14 checks), scripts/verify-ops-measures.ts (10 checks). Changed: lib/commission.ts, lib/types.ts, lib/operations.ts (KPI source and validation), lib/salesMeasures.ts (type), lib/marketRates.ts (buy side), components/ops/MarketRatesPanel.tsx, components/ops/RecordsPanels.tsx (KPI screen), app/products/page.tsx, app/employees/page.tsx, components/PayslipCard.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not changed.** The public landing page (marketing) and the in-app sales pipeline, which belong to the sales and marketing platform.
## v238: delivery run sheet for distribution, and the manufacturing and commission check

- **Checked.** Manufacturing (bills of materials, scrap, labour, buildable quantity, batches and expiry), distribution (locations, transfers, shipments, landed cost, reorder, consignment), and sales commissions (percentage of sales or profit, returns and discounts taken back) are in place.
- **Gap closed.** No delivery run existed for customer deliveries. Orders now take a driver and an area; the Delivery run tab lists what is due by a day, grouped by driver and area, with overdue and unassigned stops, prints as a sheet, and records each delivery.
- **Not built.** Commission tiers (rate rising with target achieved), and route planning or vehicle tracking.
- **Files.** lib/deliveryRun.ts, components/ops/DeliveryRunPanel.tsx, scripts/verify-delivery-run.ts (9 checks). Changed: lib/types.ts (order fields), contexts/DataContext.tsx (driver and area), firestore.rules (two fields), scripts/verify-web-orders.ts (updated to the new field list), lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v237: optional market rates on products and services

- **Field.** An optional market rate, its source, and the day it was checked, on any product or service. The check date is set automatically when the figure changes.
- **Comparison.** Your price against the market: the gap in percent, above, below or level (within 2%), flagged at 10% or more, and a figure older than 90 days marked to check again. Items with a market figure but no price are counted.
- **Files.** lib/marketRates.ts, components/ops/MarketRatesPanel.tsx, scripts/verify-market-rates.ts (11 checks). Changed: lib/types.ts (product fields), app/products/page.tsx (form), lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v236: financial complexity, defined and measured

- **Definition.** Complexity is the cost of carrying items that earn little: products under 1% of revenue, suppliers under 1% of spend, and monthly recurring costs under 0.2% of monthly revenue. Three or fewer is simple; more than ten is complex.
- **Review.** Each item is listed with its figures, weakest first. Reads the records; changes nothing.
- **Files.** lib/complexity.ts, components/ops/ComplexityPanel.tsx, scripts/verify-complexity.ts (9 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Principles check.** Every item in the ten-principles list now has a built measure or a covered mechanism, named in the manual.
## v235: dashboard focus and probability-weighted scenarios (CFO principles, checked against the code)

- **Gap found.** KPIs had no leading or lagging label, and the dashboard had no size check (five to seven). Forecasts were single-path, with no probability-weighted set of scenarios and no largest-customer loss.
- **Dashboard focus.** Measures can be labelled leading or lagging. The Measures screen counts them, says whether the set is five to seven, and flags a set with no leading or no lagging measure.
- **Scenario plan.** Scenarios with chances that must total 100%; each gives monthly profit from the books' revenue and margin; the expected profit, the chance of a loss, break-even revenue, and operating leverage. A scenario can lose the largest customer, whose share is taken from twelve months of sales.
- **Files.** lib/kpiFocus.ts, lib/scenarioPlan.ts, components/ops/ScenarioPlanPanel.tsx, scripts/verify-kpi-focus.ts (12 checks), scripts/verify-scenario-plan.ts (15 checks). Changed: lib/operations.ts (KPI timing, tab), lib/types.ts, contexts/DataContext.tsx (timing kept), components/ops/RecordsPanels.tsx (form, focus card), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Covered already (checked).** Contribution margin and lifetime value, break-even and fixed costs, the 13-week cash map, working capital, budget variance, early warnings, capacity, NPV for investments, and the downside bands.
- **Not built.** A measure of financial complexity, which is not something the books record; and membership fee plans, which are covered by recurring invoices and subscriptions rather than a separate membership type.
## v234: the two feedback loops (product iteration and supply chain)

- **Gap closed.** Customer feedback stopped at the feedback: nothing turned it into a change with an owner and a day. And a product bought from one supplier had no recorded alternative.
- **Improvements.** A complaint or idea becomes a change with an owner and a day (at least eight characters for the title); overdue changes are flagged; the customer loop shows how many customer ideas were done.
- **Alternative suppliers.** Single-source products are listed with their alternatives, each compared on price with what is paid now; a rejected alternative does not count as cover; the status moves through considering, trial, approved, rejected.
- **Permissions and rules.** Improvements under operations; alternatives under suppliers. Owner and manager to write; removal by the owner alone. Included in the backup and restore.
- **Fixed during checks.** A three-character title minimum let "Fix it" through; raised to eight.
- **Files.** lib/feedbackLoops.ts, components/ops/FeedbackLoopsPanel.tsx, scripts/verify-feedback-loops.ts (17 checks). Changed: contexts/DataContext.tsx, lib/operations.ts (tab), firestore.rules, lib/backupPayload.ts, scripts/restore-from-backup.mjs, scripts/verify-period-lock.ts (classified as non-money), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v233: succession and the organisation (people, operations and management)

- **Gap closed.** No organisation chart or succession view existed: reporting lines and deputies were not recorded, and a key person's absence was not visible.
- **Organisation.** Reporting line and named deputy per team member; the tree is drawn from them. Loops are found and reported, not followed forever.
- **Key people.** Flagged when the only qualified person for a procedure (exactly one acknowledgement of the current version), or when they lead three or more people, with no deputy named. Naming a deputy clears it; an inactive deputy does not count.
- **Permissions and rules.** Owner and manager; stored under their own rule and included in the backup and restore.
- **Fixed during checks.** A procedure shared by two people was counted as a single point of failure for both. Now only a procedure with exactly one qualified person counts.
- **Files.** lib/succession.ts, components/ops/SuccessionPanel.tsx, scripts/verify-succession.ts (12 checks). Changed: contexts/DataContext.tsx, lib/operations.ts (tab), firestore.rules, lib/backupPayload.ts, scripts/restore-from-backup.mjs, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v232: obligations calendar (corporate governance and regulatory compliance, operations side)

- **Gap found.** Statutory filings and recurring returns had no calendar; a missed filing carries penalties and nothing said when one was due.
- **Calendar.** Deadlines with a next due day and a rhythm (once, monthly, quarterly, yearly). Marking done rolls a repeating deadline to its next due day from the one met; month ends are kept; overdue and due-within-14-days are shown first.
- **Permissions and rules.** Owner and manager; removal by the owner alone. Included in the backup and restore.
- **Files.** lib/obligations.ts, components/ops/ObligationsPanel.tsx, scripts/verify-obligations.ts (16 checks). Changed: contexts/DataContext.tsx, lib/operations.ts (tab), lib/readOnlyGuard.ts (complete prefix), lib/backupPayload.ts, scripts/restore-from-backup.mjs, firestore.rules, scripts/verify-period-lock.ts (classified as non-money), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not built.** Key-person succession and an organisation chart (who reports to whom, and who covers for whom), which need reporting lines on employees.
## v231: pre-hire checks, exit records and tax set-aside (operations gaps from the framework)

- **Pre-hire checks.** Reference and right-to-work checks recorded per candidate (dates only, never ID numbers). A hire is refused until both are recorded on a day that has come, in the data layer as well as on the screen.
- **Exit records.** Exit interview date and notes, severance or final settlement, and how it was worked out, on the employee record. Owner only: the tab is hidden from managers, and the employee record was already owner-only in the rules. Severance is entered, not calculated.
- **Tax set-aside.** Income tax at the business's rate on the year's profit, less tax paid this year, with a cash check. Losses owe nothing. An estimate.
- **Files.** lib/taxSetAside.ts, components/ops/TaxSetAsidePanel.tsx, components/ops/ExitRecordsPanel.tsx, scripts/verify-ops-gaps.ts (18 checks). Changed: lib/recruiting.ts (checks, hire gate), contexts/DataContext.tsx, lib/types.ts (exit fields), lib/operations.ts (tabs, owner-only rule), components/ops/RecruitingPanel.tsx, app/operations/page.tsx, scripts/verify-period-lock.ts (classified as people records), USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not built.** Severance calculation (depends on the country's rules, so the figure is entered), and a job board connection (an external service).
## v230: recruiting pipeline (people, operations and management)

- **Gap found.** Recruiting had no record at all: onboarding started only after a hire, and nothing tracked the hiring itself.
- **Pipeline.** Candidates per role through applied, interview, offer, hired, or not taken forward. Each stage dated the first time it is reached; a hired or closed candidate is not moved back.
- **Measures.** Count at each stage, average time to hire (applied to hired), candidates waiting 14 days or more in one stage, and hires whose onboarding has not started.
- **Permissions and rules.** Owner and manager only; the owner alone may delete a candidate. Included in the backup and restore.
- **Files.** lib/recruiting.ts, components/ops/RecruitingPanel.tsx, scripts/verify-recruiting.ts (19 checks). Changed: contexts/DataContext.tsx, lib/backupPayload.ts, scripts/restore-from-backup.mjs, firestore.rules, lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not built.** Two-factor sign-in, which is a setting on the sign-in service rather than code in this app.
## v229: promised delivery to customers, measured (the decision)

- **Decision.** Record the promised delivery day on web orders (optional, sent by the shop), and the delivered day when the owner records it. Measured against the promise, with overdue orders listed. Chosen over a field on every sale because web orders are where goods leave the operation's control.
- **Intake.** Order API accepts an optional promisedDate, checked as a real day; stored with the order.
- **Owner.** "Mark delivered today" on confirmed orders; the security rule allows only that one new field.
- **Cycle time.** Customer section: on-time and late counts, average buffer, and overdue orders with days overdue.
- **Files.** lib/deliveryPromise.ts, scripts/verify-delivery-promise.ts (13 checks). Changed: lib/webOrders.ts, the orders route, lib/types.ts, contexts/DataContext.tsx, firestore.rules, components/ops/WebOrdersPanel.tsx, components/ops/CycleTimePanel.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v228: cycle time and promises kept (outbound and inbound feedback, from recorded dates)

- **Supplier cycle.** Average days from order to receipt, average lateness against the promised day, and how many receipts were late, per supplier.
- **Project promises.** Duration from start to completion, the buffer against the promised end (negative = missed), kept and missed counts, and the average buffer.
- **Files.** lib/cycleTime.ts, components/ops/CycleTimePanel.tsx, scripts/verify-cycle-time.ts (9 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not recorded.** Promised delivery dates for goods sold to customers. The app holds no such date on a sale or web order, so it is not measured. Adding one is a data decision, not a calculation.
## v227: sourcing risk (inbound resilience, checked against the operations framework)

- **Gap found.** The framework's first requirement, diversified sourcing, was not measured. The app mentioned supplier dependence in commentary only.
- **Sourcing risk.** Spend by supplier over twelve months, the share each takes (50% or more flagged), and the products bought from one supplier only. Products with no supplier recorded are shown separately, not counted as single-sourced.
- **Files.** lib/sourcingRisk.ts, components/ops/SourcingRiskPanel.tsx, scripts/verify-sourcing-risk.ts (11 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not built.** A cycle-time measure for how long a job takes end to end, and promised-delivery buffers for customers. Both are operational measures that need recorded start and finish times the app does not yet hold.
## v226: quantity pricing check (a gap found and closed)

- **Gap found.** The app had no way to price a bulk deal ("10 or more at 5% off") or to see what it does to the margin. Offers have one fixed price, and the only discounts are promo codes.
- **Quantity pricing.** Tiers by quantity, the deepest tier reached, the discounted unit price and total, the margin left in money and percentage, and a flag when it falls below the margin floor the business sets. Records nothing.
- **Files.** lib/bulkPricing.ts, components/ops/OrderPricePanel.tsx, scripts/verify-bulk-pricing.ts (10 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not verified.** Whether an offer can sit beside other items on one invoice. Estimates hold several lines, but the offer-on-invoice path has not been checked.
## v225: thousands separators on amounts, and POS matching checked

- **Separators.** Amount fields (number, decimal and numeric entry) show thousands separators as typed; the screen still receives the plain number, so no parsing changes. Four digits and more are grouped; decimals, a trailing point and minus signs are kept. A field that is not an amount can opt out with noCommas.
- **POS.** The existing import matches export column names to the sales fields. Checked against six common layouts. Added the missing names: Toast's "Business Date", Lightspeed's "Count" (and "items sold", "number sold"), and "sales date" and "receipt date".
- **Files.** lib/numberFormat.ts, scripts/verify-number-format.ts (13 checks), scripts/verify-pos-compatibility.ts (20 checks). Changed: components/ui.tsx (shared input), lib/posImport.ts (aliases), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v224: staged-project estimates from the business's own history

- **Estimates.** The chance of a rise, and the average rise and fall, read from the last months of revenue (at least six, with both rises and falls). Offered on the staged-project card with a button to use them; the owner can still change them.
- **Files.** lib/decisionTree.ts (estimateFromHistory), components/ops/FinanceChoicesPanel.tsx, scripts/verify-history-estimates.ts (6 checks). Changed: USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Still not built.** A model where several uncertain factors move together; that is a larger model, and it is left out on purpose.
## v223: staged investments with the choice to stop

- **Staged project.** An up-or-down tree over several stages, with the choice at each stage to continue or stop for a salvage value. Shows the value with that choice, the committed value, and what the choice is worth; says when stopping now is better. Checked against hand-worked cases and the rule that the choice is never negative.
- **Files.** lib/decisionTree.ts, scripts/verify-decision-tree.ts (8 checks). Changed: components/ops/FinanceChoicesPanel.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Still not built.** Several uncertain factors moving together (a tree of more than one factor), and fitting the chances to past data. The chances and factors are typed in as estimates.
## v222: loan offers and the option to wait (corporate finance decisions)

- **Loan offers.** Each offer's monthly repayment, total cost, real annual cost (with the upfront fee counted), and whether the repayment fits the money to spare; offers ranked by total cost.
- **Option to wait.** Invest now or wait a year, with the value of waiting when the project may go badly and be dropped; recommends waiting only when that is worth more.
- **Files.** lib/financeChoices.ts, components/ops/FinanceChoicesPanel.tsx, scripts/verify-finance-choices.ts (14 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Still not built.** A full decision-tree model with several stages of uncertainty; this covers one decision with one uncertainty, as a single year.
## v221: investment appraisal (corporate finance decisions)

- **Appraisal.** Net present value, IRR, payback, discounted-payback basis, profitability index and equivalent yearly value for each project, at a risk-adjusted discount rate. Shown only; nothing saved or spent.
- **Capital rationing.** With a budget, projects are funded by profitability index while the money lasts; a project that does not fit is skipped, not split; value-destroying projects are never funded.
- **Real rates.** The nominal rate converted to a real rate with expected inflation (Fisher).
- **Terminal-value share.** The share of value resting on the distant future, flagged above 75%.
- **Post-investment review.** Actual cash against forecast, year by year, with the running difference and whether the project is behind.
- **Files.** lib/capitalBudget.ts, components/ops/AppraisalPanel.tsx, scripts/verify-capital-budget.ts (20 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not built.** Real options (valuing the option to delay or expand), which needs a decision-tree model rather than the cash-flow lines used here; and a loan-options comparison beyond the existing APR figures.
## v220: one royalty key per site (closes the shared-key gap)

- **Per-site keys.** Head office makes a key for each site it trusts. The key is shown once; only its SHA-256 hash is stored. A site's statements are accepted only with its own active key, checked in constant time against its hash.
- **Revoke and re-key.** Revoking a site stops its statements at once; a new key replaces the old one for that site.
- **Removed.** The shared inbox key and the allow-list. The shared key is no longer offered on the Integrations page.
- **Files.** lib/royaltyInbox.ts (hashing rules, site id check), app/api/v1/businesses/[businessId]/royalty/statement/route.ts, components/ops/RoyaltyInbox.tsx, lib/integrations.ts, firestore.rules, scripts/verify-royalty-inbox.ts (19 checks), USER-MANUAL.md.
## v219: royalties to head office, both ends

- **Head office.** Royalty inbox: a key for the sites and the list of sites allowed to send. Statements wait as pending; confirming books the income once per site and month; declining books nothing.
- **Site.** Send to head office from the Royalties tab. The site's id is set from its sign-in; its connection is read on the server; a repeat send is a no-op.
- **Receiving route** checks head office's own key in constant time and the site's place on its list; statements are stored once as pending.
- **Rules.** Statements are created by the server only; head office can change only a statement's status and the income it booked.
- **Limit (stated).** The key is shared between head office and its sites. A site that has the key could post for another allowed site, so keep the key private and regenerate it when a site leaves.
- **Files.** lib/royaltyInbox.ts, app/api/v1/businesses/[businessId]/royalty/statement/route.ts, app/api/royalty/send/route.ts, components/ops/RoyaltyInbox.tsx, scripts/verify-royalty-inbox.ts (16 checks). Changed: lib/integrations.ts (two providers), components/ops/RoyaltyPanel.tsx, lib/operations.ts, app/operations/page.tsx, firestore.rules, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v218: royalty statement file for head office

- **Statement.** Each month's royalty can be downloaded as a CSV: one row per paying site, with the period, site, sales, royalty rate, royalty due and currency, in plain column names. Built with the spreadsheet-safe CSV builder, so a site name that starts like a formula cannot run when opened.
- **Scope.** Sales and marketing features are not extended. Only shared operations and management measures (cash, margins, stock, KPIs) are in scope for new work. Sales features already built are kept as they are.
- **Files.** lib/royalty.ts (royaltyStatementRows), components/ops/RoyaltyPanel.tsx (download), scripts/verify-royalty.ts (16 checks).
## v218: royalty statement file (for head office)

- **Statement.** The royalty tab downloads the month's statement as CSV: one row per paying site, with plain column names, built with the app's spreadsheet-safe CSV builder.
- **Files.** lib/royalty.ts (royaltyStatementRows), components/ops/RoyaltyPanel.tsx, scripts/verify-royalty.ts (16 checks), USER-MANUAL.md.
## v217: franchise royalties (operations and management)

- **Royalties.** A royalty rate per location (0 to 100%), the month's royalty worked out from that location's recorded sales (sales with no location count against the main location, closed sites pay nothing), and one press records each site's royalty as an overhead cost for the month, dated the last day. A site already recorded for the month is skipped.
- **Files.** lib/royalty.ts, components/ops/RoyaltyPanel.tsx, scripts/verify-royalty.ts (12 checks). Changed: lib/types.ts (rates setting), lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Scope note.** This records the cost in the books of the business that holds the record; it does not invoice or pay head office. A second business entity receiving the royalty as income would be a separate platform-level link.
## v216: packages, and the service blueprint (operations and management)

- **Prepaid service packages.** Confirmed: a package is a membership (hours bank with start and end, lapsing, drawn down by bookings). Documented how to sell a package of sessions.
- **Service blueprint.** A services starter procedure with a fixed structure: customer steps, staff steps behind them, systems, failure points, evidence.
- **Process map.** Documented that editing the procedure edits its flow; diagram code can be edited externally.
- **Files.** lib/starterSets.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Still not built.** A franchise royalty between a head office and its sites.
## v215: workarounds for the two partial gaps, and scheduling without a platform timer

- **Process map.** Each procedure's numbered steps can be shown as a flow, with diagram-tool code to copy for a styled chart (no outside service needed to see the flow).
- **New products and services.** Standard launch procedure in the starter set; the approval is recorded as a decision with an owner and a day.
- **Scheduling.** A GitHub Actions file calls the daily job every day, for a host without its own timer. Needs two repository secrets (CRON_SECRET, SITE_URL).
- **Files.** lib/processMap.ts, components/ops/ProcessFlow.tsx, .github/workflows/daily-job.yml, scripts/verify-workarounds.ts (11 checks). Changed: components/ops/ProceduresPanel.tsx, lib/starterSets.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Removed a check that could never fail** (one with a trailing `|| true`), so every check in the suite can fail.
## v213b: every outside service is a key away, and only read services are offered

- **Audit.** Six catalogue entries were offered but nothing read their keys: bank feed, card payments, SMS (the server's settings were used instead of the business's), exchange rates (needs no key at all), accounting software and calendar (both need an authorisation step the app does not have), and online shop (orders arrive through the lead API key instead).
- **Removed from the catalogue.** Bank feed, card payments, accounting software, calendar, online shop and exchange rates. Nothing reads them, so none is offered.
- **SMS now uses the business's own entry.** It takes the Notify.lk user ID, sender name and key pasted on the Integrations page, and the reminder job sends with them. The server's settings remain the fallback.
- **Older checks updated.** Test-connection checks that used card payments now use email (still offered); the Stripe read-only check is removed with card payments. Integration and SMS checks reworded to the new structure, with the same requirements.
- **Guard.** Every catalogue entry must be on the implemented list and read on the server; no entry may need an authorisation step; the removed services must stay removed.
- **Files.** lib/integrations.ts (entries removed, SMS user ID field, implemented list), lib/sms.ts (per-business config), app/api/cron/reminders/route.ts, scripts/verify-integrations-keyed.ts (26 checks), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v212b: marketing and sales costs can be entered and recorded (operations and management costing)

- **Entering costs.** Marketing, Sales payroll and Transport & logistics are expense categories that reach the selling costs in the profit split, each with a monthly budget. Confirmed in the expense form.
- **Ad spend to costs.** Imported campaign spend is recorded as one Marketing expense per campaign on the owner's press, dated the last day of the period. A campaign already recorded for the period is skipped. Importing alone still only feeds the promo-code comparison, as before.
- **Files.** lib/adSpend.ts (campaignCostEntries), components/MarketingCostRecorder.tsx, scripts/verify-marketing-costs.ts (13 checks). Changed: components/AdSpendImport.tsx (passes its period), app/settings/page.tsx (recorder), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v211b: orders matched to supplier invoices (costing control)

- **Three-way match.** Each received purchase order should have one purchase for the same quantity. Finds receipts with no invoice, quantities that differ, and purchases with no order (or whose order no longer exists). Shown at the top of the Cost variance tab. Reads and reports only.
- **Files.** lib/invoiceMatch.ts, scripts/verify-invoice-match.ts (10 checks). Changed: components/ops/CostVariancePanel.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v210b: cost variance (costing, operations and management)

- **Cost variance.** For each received purchase with a paid price: quoted against paid, the percentage difference, and the money impact across the units received. Flagged at 5% either way. Totals by supplier. Read from the purchase orders; restates nothing.
- **Files.** lib/costVariance.ts, components/ops/CostVariancePanel.tsx, scripts/verify-cost-variance.ts (12 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v209: accruals in the books, and operations events to the webhook (finance and operations)
- **Found by a balance check and fixed.** A month holding only an accrual or its reversal was not reported by the monthly builder, so the cost never reached profit or retained earnings. The accrual dates now count when the reporting months are chosen. The verification now checks that an accrual and its reversal move the balance sheet correctly.
- **Not verified here.** The Firestore security rules. The emulator's download host is unreachable from the build environment, so they need one run on a machine with network access (`firebase emulators:exec`).

- **Accruals.** A cost used in a month but billed later is recorded as an accrual. It adds to that month's profit and reverses on the first day of the next month, so the real bill is not counted twice. It is not cash: the cash runway and cash paid read the expense records only. The balance sheet counts accrued costs as a liability until they reverse. Added and removed on the Month-end close page; never edited; refused in a closed month or one whose reversal would land in a closed month. The close checklist gains an accruals step (done when accruals exist or the owner confirms none are needed).
- **Operations events.** The existing webhook address also receives an incident opened and a purchase order approved, each with only what a routing step needs; the record is re-read on the server; a failure to send never undoes the record.
- **Files.** lib/accruals.ts, app/api/webhooks/ops-event/route.ts, lib/opsEvents.ts, scripts/verify-accruals.ts (19 checks), scripts/verify-ops-events.ts (13 checks). Changed: lib/types.ts (Accrual, closed-month list), lib/calculations.ts (monthly profit, balance sheet), lib/periodGuards.ts (guards), lib/monthClose.ts (step), lib/backupPayload.ts, scripts/restore-from-backup.mjs, firestore.rules, contexts/DataContext.tsx, components/ops/MonthClosePanel.tsx, scripts/verify-month-close.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Searched.** For operations and management, the connectors that matter are the webhook-capable automation tools (Zapier, Make, n8n), which the webhook address already serves. The new operations events close the gap of those tools hearing nothing about incidents and approvals.
## v208: month-end close checklist (finance and operations)

- **Checklist.** Per month: bank matched, cash counted, stock counted (if held), overdue customers (over 60 days), overdue bills, expenses recorded, sales recorded. Each step read from the records; status and detail shown.
- **Lock.** Offered only when every step is done; uses the existing closed-period rules and setting; asks for confirmation; changes only the lock date.
- **Files.** lib/monthClose.ts, components/ops/MonthClosePanel.tsx, scripts/verify-month-close.ts (19 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Still not built.** Month-end accruals (expenses incurred but not yet billed) would change the figures in the books, so they need a separate, planned change.
## v207: stock priorities and clearance advice (inventory)

- **Priority grid.** Products placed by recent demand (90 days) against margin, split at the median of the business's own products: protect, push margin, check price or cost, or review. Products with no selling price are listed last.
- **Clearance advice.** Stock with no sale in 60 days, or never sold: each markdown (20, 35, 50%) with the cash it releases. Clear at a price covering cost once idle 90 days or more; below cost is shown but not advised; otherwise hold. Estimates only.
- **Found already in place.** Inventory turnover, cash conversion cycle, GMROI, stock ageing and slow-moving lists, EOQ and reorder levels, the cycle count plan, supplier payment terms and forecasting.
- **Files.** lib/stockPriorities.ts, components/ops/StockPrioritiesPanel.tsx, scripts/verify-stock-priorities.ts (14 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v206: starter sets for any kind of business (operations and management)

- **Starter setup.** Seven kinds of business (shop, food, services, making things, venue, wholesale, other). Each gets a first set of measures with the decision each informs, areas of responsibility, and standard procedures, on top of common ones. Only what is missing is added; applying again is safe; the kind of business is remembered.
- **Files.** lib/starterSets.ts, components/ops/StarterSetPanel.tsx, scripts/verify-starter-sets.ts (50 checks). Changed: lib/types.ts (businessKind), lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Scope.** The system already had menu presets that hide modules by business type. Starter sets add the operations and management starting records for each type.
## v205: overdue high-value stock on the management review

- **Review agenda.** Class A stock that is due or overdue a count now appears in a Stock counts due section of the management review, with how many days late. Same figures as the Cycle counts tab.
- **Files.** Changed: lib/reviewPack.ts, components/ops/useReviewSections.ts, scripts/verify-cycle-counts.ts (one more check).
## v204: cycle counts by stock value (inventory, automated)

- **ABC classification.** Stock held is classified by value: items starting below 80% of total value are A, below 95% are B, the rest C. Counted every 30, 90 and 365 days.
- **Last count.** The latest count correction per product (breakage and theft excluded).
- **Automation.** Due high-value items appear on the Agenda as one daily line for owners and managers (switch under Automations, default on), and on a Cycle counts tab sorted by class and lateness.
- **Files.** lib/cycleCount.ts, components/ops/useCycleCounts.ts, components/ops/CycleCountPanel.tsx, scripts/verify-cycle-counts.ts (14 checks). Changed: lib/types.ts, lib/leadIntake.ts, lib/operations.ts, app/operations/page.tsx, lib/agenda.ts, app/agenda/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Scope.** Sales and marketing work stays as built; new work follows operations, management, inventory and finances.
## v203: sales team scorecard with targets (sales measures, automated)

- **Scorecard.** Per salesperson, last 30 days: revenue, orders, average order, leads, won, conversion, and attainment against a monthly revenue target. Unattributed sales shown separately.
- **Targets.** Monthly revenue target per person, stored in the business settings (owner and manager set them on the Sales team tab).
- **Review.** Anyone under 70% of target is flagged behind and raised on the Management review agenda, in a Sales team section. The review recalculates when a target changes.
- **Files.** lib/salesTeam.ts, components/ops/SalesTeamPanel.tsx, scripts/verify-sales-team.ts (13 checks). Changed: lib/types.ts (settings field), lib/operations.ts (tab), app/operations/page.tsx, lib/reviewPack.ts (section), components/ops/useReviewSections.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v202: standard sales measures as automatic KPIs (sales and marketing measures, in scope)

- **Three standard measures, calculated.** Average order value (30 days), repeat customers (90 days), and lead conversion (30-day cohort), all from recorded sales and leads.
- **Automatic KPIs.** A measure can be tracked as a KPI whose figure is the live measure, not a typed reading; the KPI list and the management review both use it, and the review calculates it once.
- **Files.** lib/salesMeasures.ts, scripts/verify-sales-measures.ts (12 checks). Changed: lib/types.ts, lib/operations.ts, contexts/DataContext.tsx (source field saved on add and update), components/ops/RecordsPanels.tsx (measures card, live figure, source choice in the form), components/ops/useReviewSections.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v201: sales drop alert (sales and marketing measure, now in scope)

- **Sales drop exception.** The last seven days, today included, against the average week of the four weeks before. A drop of 40% or more is raised on the escalation list (medium at 50%, high at 60%). Needs at least eight selling days in the baseline, otherwise no alert. Reads sales only; changes none.
- **Files.** scripts/verify-sales-drop.ts (12 checks). Changed: lib/exceptions.ts (rule, thresholds, sales source), lib/escalations.ts (area), components/ops/useEscalations.ts (feeds sales), USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v200: venue clashes (events and bookings sharing a room)

- **Events have a room and a run length.** Optional room or stage (blank = main lane) and minutes it runs (default 180), on the event form, validated (15 to 720 minutes; room name up to 60 characters).
- **Venue clashes.** An event that shares a room with a booking, on the same day, with overlapping times, is listed on the Capacity tab with the booking it clashes with. It reuses the booking clash rule, so the two cannot disagree. Shown, not blocked.
- **Files.** scripts/verify-venue-clash.ts (12 checks). Changed: lib/types.ts (event fields), lib/events.ts (fields, validation, eventClashes), app/events/page.tsx (form), components/ops/CapacityPanel.tsx (venue clashes), USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Found already in place.** Booking clash prevention, capacity and utilisation, the compliance register (which holds certificates and permits), incidents and risk assessments in the risk register, partners and sponsors, and the maintenance schedule for equipment.
## v199: supplier performance, leaver handover (operations and management)

- **Supplier performance.** Automatic, from purchase orders: on-time share (against the expected day), average lateness, price variance against the quote, overdue orders now; poor below 80% on time, watch below 90%, at least three deliveries to judge. Suppliers in trouble go on the Management review agenda.
- **Leaver handover.** Choose a leaving person: the six steps (equipment, access, final pay, handover, rota, record) and everything they still own (KPIs, open decisions, responsibilities). Reassigns nothing.
- **Files.** lib/supplierPerformance.ts, lib/leaverHandover.ts, components/ops/SupplierPerformancePanel.tsx, components/ops/LeaverPanel.tsx, scripts/verify-suppliers-leavers.ts (14 checks). Changed: lib/operations.ts (tabs), app/operations/page.tsx, lib/reviewPack.ts (suppliers section), components/ops/useReviewSections.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Found already in place, left as they are.** Onboarding, compliance renewals and training records, corrective actions for quality and incidents, the procedure coverage view, the risk register.
## v198: code clean-up (no behaviour change)

- **Unused declarations: 14 down to 0.** Removed unused destructured values and an unused function and two unused constants (sortEvents, PRIORITY_FOR_DAYS_OVERDUE, vendorPatterns). Renamed unused parameters with a leading underscore where the signature is kept. Where a hook was called, its value is kept and only the unused setter is dropped, so the order hooks run in is unchanged.
- **Checks.** Type-check, lint and production build pass with the strict unused-code rules on. The suite passes 224 of 226 scripts; the two failures predate this work.
- **Files.** Changed: app/collections/page.tsx, app/offers/page.tsx, app/products/page.tsx, app/team/page.tsx, lib/aiSuggestedQuestions.ts, lib/calculations.ts, lib/notification-automation.ts, lib/ocr.ts, lib/support.ts, scripts/verify-period-lock.ts.
## v197: scorecard colours, weekly operations review on the Agenda

- **Red, amber, green.** Each KPI is green on target, amber within its amber band (10% of target by default, set per KPI), red beyond it, and uncoloured with no reading. The management review lists red before amber, each line labelled.
- **Weekly review on the Agenda.** On Mondays, owners and managers see the operations review with the count of items needing a decision (switch under Automations, default on). The review tab and the Agenda share one agenda, built once in components/ops/useReviewSections.ts.
- **Files.** lib/kpiRag.ts, components/ops/useReviewSections.ts, scripts/verify-rag-weekly.ts (15 checks). Changed: lib/types.ts (amber band, switch), lib/operations.ts (input), lib/leadIntake.ts (default), lib/agenda.ts, app/agenda/page.tsx, lib/reviewPack.ts (ordering), components/ops/ReviewPackPanel.tsx, components/ops/RecordsPanels.tsx, contexts/DataContext.tsx, components/AutomationsCard.tsx, scripts/verify-review-pack.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
## v196: procedure coverage (operations and management)

- **Coverage.** New Coverage tab (owner and manager): for each written procedure, who is qualified on its current version, who has yet to read it, and a flag where nobody or only one person is qualified. Gaps are listed first. The management review agenda raises the same gaps under ownership and people.
- **Files.** lib/coverage.ts, components/ops/CoveragePanel.tsx, scripts/verify-coverage.ts (9 checks). Changed: lib/operations.ts (tab), lib/reviewPack.ts (procedure gaps, optional), components/ops/ReviewPackPanel.tsx, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Found already in place, left as they are.** Batch traceability and recall, production runs and yield, recipes, training as a compliance item with expiry, procedure acknowledgements, and the expiry and renewal alerts.
## v195: management review agenda (operations and management)

- **Management review.** A new Management review tab (owner and manager) assembles the review agenda automatically from existing records: escalations, decisions due, numbers off target (with a flag where no decision is linked), capacity problems, compliance expiries, open incidents, risk reviews, overdue objectives, and ownership gaps (areas with no one responsible, waiting requests, unread procedures). Empty sections are left out; the copied text ends with the instruction to decide, name an owner and set a day for each item. Nothing is sent or closed.
- **Files.** lib/reviewPack.ts, components/ops/ReviewPackPanel.tsx, scripts/verify-review-pack.ts (10 checks). Changed: lib/operations.ts (tab), app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Code quality (this round).** Unused declarations reduced from 24 to 14: unused imports and unused database and business-id lines removed. The type-check, the linter and the build pass. The remaining 14 are unused local variables in older code, listed here for review: calculations.ts (sortEvents, pd, ed, asOfISO), support.ts (today), ocr.ts (vendorPatterns), notification-automation.ts (PRIORITY_FOR_DAYS_OVERDUE), aiSuggestedQuestions.ts (expenses), products, offers, team and collections pages, and two in verify-period-lock.ts.

## v193b: capacity planning (operations and management)

- **Capacity.** For each of the next two weeks: hours rostered (less approved leave) against hours booked (cancelled and no-show excluded). Days flagged over, unstaffed, tight, balanced, spare or nothing booked; problem days first. A Capacity tab (owner and manager) and an Agenda alert for the next week, owners and managers only (leave is visible to them alone). Switch: Capacity alert under Automations (default on).
- **Files.** lib/capacity.ts, components/ops/useCapacity.ts (shared by the tab and the Agenda), components/ops/CapacityPanel.tsx, scripts/verify-capacity.ts (13 checks). Changed: lib/operations.ts (tab), lib/types.ts, lib/leadIntake.ts (default), lib/agenda.ts, app/agenda/page.tsx, app/operations/page.tsx, components/AutomationsCard.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Scope note.** With capacity closed, the operations and management gaps listed in earlier rounds are closed except the sales-drop alert (needs a baseline per business first, and is a sales measure).
## v192b: cash allocation, financial exceptions, decision rules, responsibilities, KPI ownership (operations and management)

- **Cash allocation.** The cash page shows the balance split into committed (next 30 days: payables, loan installments, pay, recurring costs, rent), the operating reserve (months chosen, default three), and free to spend; plus a week-by-week view flagging weeks that close below the reserve. The cash runway now reports committed outflow per day from the same sources as the outflow, so the two cannot disagree.
- **Financial exceptions.** A price move of 10% or more in the last 30 days, and a payable overdue more than seven days, join the escalation list (medium at 20% and 14 days, high at 50% and 30 days).
- **Decision rules.** Every decision needs an owner and a deadline. A field records the next best option given up (opportunity cost).
- **Discount check.** On the Decisions tab: margin and contribution before and after a discount, the volume needed to pay for it, and a verdict. Saves nothing.
- **Responsibilities (RACI).** New Responsibilities tab (owner and manager): responsible, accountable, consulted, informed per area of work. An area with no one responsible is flagged.
- **KPI ownership.** A KPI can name its owner and the decision it informs; a KPI with no decision is flagged. Both optional.
- **Files.** lib/cashAllocation.ts, lib/initiativeMath.ts, lib/exceptions.ts, components/CashAllocationCard.tsx, scripts/verify-cash-decisions.ts (28 checks). Changed: lib/calculations.ts (committed per day), app/cash-flow/page.tsx, lib/businessLog.ts, lib/types.ts, lib/operations.ts, lib/escalations.ts, components/ops/BusinessLogPanels.tsx, components/ops/RecordsPanels.tsx, components/ops/useEscalations.ts, contexts/DataContext.tsx, scripts/verify-ops-management.ts, scripts/verify-limits-documented.ts, USER-MANUAL.md.
- **Found already in place, left as they are.** Cash firewall (reserve target and idle line), the cash runway, the cash map, contribution margin in products and statements, customer acquisition cost and lifetime value, SOPs, onboarding, objectives, the decisions register, escalations.
- **Not built.** An automatic sales-drop exception (it needs a fixed baseline per business first); a planning view combining staff, equipment and orders (capacity planning, still open).
## v192: shift-swap approval moves the rota; escalations

- **Shift-swap approval.** A shift-change request names the rota shift (next 30 days) and optionally the person taking it. Approving it moves that shift on the rota in the same write as the approval. A shift that has gone from the rota refuses the approval rather than approving against nothing. Pay is not touched.
- **Escalations.** New Operations tab (owner and manager): decisions past their day, incidents open over two weeks, overdue corrective actions, overdue risk reviews, requests waiting over three days, overdue equipment services, expired compliance. Severity by how late (a week medium, a month high); sorted most serious first. One computation (components/ops/useEscalations.ts) feeds both the tab and the Agenda.
- **Agenda switch.** Show items a month or more overdue on the Agenda (default on; it lists only).
- **Files.** lib/escalations.ts, components/ops/EscalationsPanel.tsx, components/ops/useEscalations.ts, scripts/verify-escalations-swap.ts (20 checks). Changed: lib/operations.ts (request fields, tab), lib/types.ts, lib/leadIntake.ts, lib/agenda.ts, contexts/DataContext.tsx (approval write), components/ops/RequestsPanel.tsx, app/operations/page.tsx, app/agenda/page.tsx, components/AutomationsCard.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Still open in operations and management.** Capacity planning across staff, equipment and orders (figures exist on separate pages, with no combined view yet).
## v191: management decisions and shift handover (operations and management)

- **Management decisions.** A decision record in the business log: what was decided, the day, the owner, the day it should be done by, status (open, done, dropped). Owner and manager only. Open decisions near or past their day appear on the Agenda, marked past its day when late. Switch: Decisions reminder under Automations (default on; it only lists).
- **Shift handover.** A handover record in the business log: the shift, the day, and what the next shift needs to know. Everyone who works in the business writes and reads them. New permission log:handover (owner, manager, staff).
- **Rules.** The team reads and writes handovers; decisions stay with owner and manager (the existing rule). The team's query includes handovers.
- **Files.** scripts/verify-ops-management.ts (17 checks). Changed: lib/businessLog.ts, lib/types.ts, lib/permissions.ts, lib/operations.ts, lib/leadIntake.ts, lib/agenda.ts, app/agenda/page.tsx, app/operations/page.tsx, components/ops/BusinessLogPanels.tsx, components/AutomationsCard.tsx, contexts/DataContext.tsx, firestore.rules, scripts/verify-agenda.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Found and left as they are.** Consignment handovers are a different thing (stock given to a partner) and are not affected.
## v189b: testimonials on the enquiry page (sales and marketing)

- **Testimonials.** Feedback scored 8 or more can be approved by the owner or manager for display, with the customer's agreement confirmed and a name shown (first name and last initial by default). Approved words appear on the public enquiry page under What customers say (newest ten). The public route returns only words and name, is cached at the edge for five minutes, and is rate limited.
- **Files.** lib/testimonials.ts, components/TestimonialControl.tsx, app/api/public/testimonials/route.ts, scripts/verify-testimonials.ts (17 checks). Changed: lib/types.ts (FeedbackEntry), contexts/DataContext.tsx (setFeedbackTestimonial), app/feedback/page.tsx, app/enquire/[businessId]/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Scope note.** Sales and marketing gaps checked this round: testimonials were the clear gap and are now closed. Remaining candidates found in the sweep, not built: SMS campaigns (email campaigns exist; SMS needs its own opt-in and unsubscribe handling), anniversary offers (birthday offers exist), and abandoned-cart recovery for an online shop (no cart exists in Balancr, so it would need the shop platform's data first).
## v189: automation (AI drafts, expense categories)

- **AI review replies.** A new draft kind on the existing AI draft route (same key, same daily allowance, same cost controls). A Draft a reply button on each online review in Feedback. Under 80 words, plain text, no promises of refunds, dates or results the review does not contain, no marketing opt-out line, capped at 900 characters. Nothing is posted.
- **Expense category suggestions.** Keyword rules (lib/expenseCategory.ts) suggest a category from the expense name, and the expense form fills an empty category automatically. A chosen category is never changed. Replaces the old receipt-only substring match. No outside service and no cost per use.
- **Files.** lib/expenseCategory.ts, components/ReviewReplyDraft.tsx, scripts/verify-automation.ts (18 checks). Changed: lib/aiDraft.ts (review kind), app/feedback/page.tsx, components/QuickForms.tsx, scripts/verify-limits-documented.ts, USER-MANUAL.md.
- **Deliberately not automated.** Sending messages, posting replies, and moving money stay with the owner. This is the one line that keeps the software from doing things in the business's name without a person deciding.
## v188: pick lists and import price history

- **Pick lists.** Each invoice on the Invoices page has a Pick list button: a printable sheet with each item and its quantity, a tick box, the same product combined across lines, sorted by name. No prices, costs or margins. Records nothing and moves no stock.
- **Import price history.** Products added by a bulk import now record their starting sell, cost and wholesale prices in the price history. Import batches are sized for the extra writes.
- **Files.** lib/pickList.ts, scripts/verify-pick-import.ts (6 checks). Changed: app/invoices/page.tsx, contexts/DataContext.tsx (bulkAddProducts), USER-MANUAL.md.
- **Correction.** Earlier notes called multi-currency invoicing the largest open gap. That was wrong: sales and purchases already carry a currency, an exchange rate at the transaction date, and the foreign price, with live rates available. The real open item in that area is the reports and invoice layouts in foreign currency, not the recording.
## v187: price history

- **Price history.** Every change to a product's sell, cost or wholesale price is appended to a price history in the same write as the change, so the record and the change succeed or fail together. A price set for the first time or cleared is recorded too. Shown on the price-control page as Recent price changes: day, product, price, old and new value, percentage moved, and who made the change (latest 25; the newest 200 are kept).
- **Rules.** The price history is append-only: owners and managers can add to it; nobody can edit or remove a record.
- **Backup and restore.** The price history is included.
- **Files.** lib/priceHistory.ts, scripts/verify-price-history.ts (12 checks). Changed: contexts/DataContext.tsx (updateProduct batch and subscription), firestore.rules, app/price-control/page.tsx, lib/backupPayload.ts, scripts/restore-from-backup.mjs, USER-MANUAL.md.
- **Not changed.** Price changes made by a bulk import are not yet recorded in the history; the import writes products directly. That is the next item if imports are used for pricing.
## v186: code and efficiency audit

- **Correctness.** The two recurring-generation effects in the data context called helpers that read the latest settings, products and user, but were not in the effect's dependencies. They now call the latest helper through a ref, so they re-run only when their own data changes. The assistant's three callbacks now include the business id in their dependencies, so they cannot keep an old business after a switch. The eslint run reports zero problems (it reported five).
- **Dead and unused code.** Removed unused imports and unused locals from the lines the strict check identifies; removed a leftover exemption line in the third sale form. Unused declarations fell from 42 to 24. The remaining 24 are older code and are listed by the strict check; each needs a human decision.
- **Cost (reads).** The customer account page loads its invoices in parallel batches of eight, not one after another, with the same reads. The supplier order page queries only the supplier's own orders instead of reading every purchase order. The owner's web-order and quality listeners are capped (300 and 500 newest), since the screens show only recent records.
- **Checks kept in step.** Two new non-money writes (purchase approval and log status) are classified on the period-lock list. Three outdated expectations from earlier rounds were updated to the rules and tabs as built.
- **Known cost driver, not changed.** The data context still opens about 90 live listeners, most of them over whole collections. Reducing that needs per-screen loading, which changes how every page works; it is the next efficiency item.
- **Known scans, not changed.** The daily reminders job still reads a few whole collections (receivable payments, returns, discounts); the web-order intake reads the product list on each order. Both are bounded by the size of the business and noted for later.
- **Files.** contexts/DataContext.tsx, contexts/AiAssistantContext.tsx, app/api/portal/route.ts, app/api/supplier/route.ts, components/QuickForms.tsx, components/ops/BusinessLogPanels.tsx, several unused-import lines across the app and lib, scripts/verify-period-lock.ts, scripts/verify-operations.ts, scripts/verify-business-log.ts.
## v185: waitlist, backorders, tax-exempt customers, purchase approval

- **Purchase order approval.** An owner sets an amount on the Requests tab. Orders above it wait as "awaiting approval" on the Purchase orders page until an owner or manager approves (placed) or rejects (cancelled, with a reason). A waiting order is not committed and cannot be received.
- **Waitlist.** Operations tab for everyone who works in the business: the person, the day they want, what they want, and status (waiting, offered, booked, removed).
- **Backorders.** Operations tab: an item a customer ordered that was out of stock, the customer, the day, how many were short, status (open, fulfilled, cancelled). Records no sale and moves no stock.
- **Tax-exempt customers.** A checkbox on the customer form. Sales to that customer, quick-sale tax, delivery tax and estimates are taxed at zero from then on; past sales keep their recorded tax. Matched by name.
- **Permissions and rules.** New permission log:demand (owner, manager, staff). The business log accepts waitlist and backorder entries from the team; the team may change only their status.
- **Files.** lib/poApproval.ts, lib/tax.ts (exemption), lib/delivery.ts (exemption), lib/businessLog.ts (two kinds), components/QuickForms.tsx, app/estimates/page.tsx, app/customers/page.tsx, app/purchase-orders/page.tsx, components/ops/RequestsPanel.tsx, components/ops/BusinessLogPanels.tsx, contexts/DataContext.tsx, firestore.rules, lib/permissions.ts, lib/operations.ts, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-po-approval.ts, scripts/verify-demand-tax.ts.
- **Still open.** Nothing from this round's research list remains open except the items left out for compliance (WhatsApp sending) and external accounts (search-engine tooling).
## v183: web orders queue and the pause switch

- **Web orders.** The order API (same Lead API key) queues an order from the business's shop or site with its external id, customer, day and lines. Nothing is recorded as a sale on arrival. The Operations tab Web orders lists the queue: lines are matched to products by sku or barcode, then by name, or matched by hand. Confirm records one sale per line through the existing addSale path (payment chosen at confirmation, dated on the placed day, linked as one invoice); Decline records nothing. A failure partway reports how many lines were recorded. A repeated order number is not queued twice.
- **Pause switch.** One owner switch on Integrations stops every automatic change to leads (assignment, follow-up dates, sequences, revisit and proposal follow-ups) and the webhook push. It is enforced in one place (resolveAutomations), so every route and screen gets the same answer. Alerts and duplicate merging keep working.
- **Notification.** New type order_received, linked to the queue.
- **Left out, and why.** WhatsApp message sending through a provider (compliance: approved templates and opt-in; the owner sends by design). Search-engine tooling (needs a search-provider account and a decision about sharing site data).
- **Files.** lib/webOrders.ts, app/api/v1/businesses/[businessId]/orders/route.ts, components/ops/WebOrdersPanel.tsx, scripts/verify-web-orders.ts (29 checks). Changed: lib/types.ts, lib/leadIntake.ts (pause), components/AutomationsCard.tsx, lib/operations.ts, app/operations/page.tsx, app/notifications/page.tsx, contexts/DataContext.tsx, firestore.rules, lib/backupPayload.ts, scripts/restore-from-backup.mjs, scripts/verify-period-lock.ts, scripts/verify-operations.ts, scripts/verify-api-route-guards.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not tested.** Firestore rules against the emulator (the jar cannot be downloaded here). A live order through the order API, and a confirmation that records sales, against a deployment.
- **Failing before this round, still failing.** verify-catalog-mirror-fields and verify-demo-guardrails. Not touched.

## v182: business log (competitors, objectives, correspondence, inspections, partners), switches

- **Business log.** One collection, five kinds: competitors (what they offer, at what price, threat level); objectives (target date, progress percent, status, optional linked KPI name, owner; overdue is computed); correspondence (letters, emails, calls, messages, sent or received, with the party and a summary; the team logs them); inspections (the steps, how often, last done; due dates are computed, and the team records one done today); partners (distributor, reseller, affiliate, agent, investor, with status active, paused or ended). Five Operations tabs. Competitors, objectives and partners are for the owner and manager; correspondence and inspections are for the team.
- **Switch: inspection reminders.** Inspections that are due appear on the Agenda. Default on; switched off under Automations.
- **Rules and data.** Permission log:correspondence (owner, manager, staff). Security rule for the shared collection: the team can read only correspondence and inspections, can create correspondence, and can only record an inspection done (lastDoneOn and updatedAt). Team queries use the exact filter the rule allows.
- **Backup and restore.** The business log is in the full backup and the restore script. Closed-period lock: exempt, since none of these entries is money.
- **Framework map.** Updated: strategy (objectives), market research (competitors), quality (inspections), partnerships (partners), administration (correspondence) are covered. Still not built, and not planned: search-engine tooling (needs a search-provider account and a data-sharing decision), WhatsApp sending through a provider (approved templates and opt-in; the owner sends by design), and automatic recording of an online shop's orders (moves stock and money; needs its own design review).
- **Switches section.** The manual now lists every on/off switch in one place.
- **Files.** lib/businessLog.ts, components/ops/BusinessLogPanels.tsx, scripts/verify-business-log.ts (38 checks). Changed: lib/types.ts, lib/permissions.ts, lib/operations.ts, lib/agenda.ts, lib/leadIntake.ts, lib/backupPayload.ts, scripts/restore-from-backup.mjs, scripts/verify-period-lock.ts, scripts/verify-operations.ts, scripts/verify-agenda.ts, firestore.rules, contexts/DataContext.tsx, app/operations/page.tsx, app/agenda/page.tsx, components/AutomationsCard.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not tested.** Firestore rules against the emulator (the jar cannot be downloaded here). The team's queries and the inspection-done write against a live deployment with a staff account.
- **Failing before this round, still failing.** verify-catalog-mirror-fields and verify-demo-guardrails. Not touched.

## v181: review API, shared lead key check, low-review alerts, three compliance kinds

- **Review API.** Google Business Profile, Facebook or a review site (through Zapier, Make or n8n) posts a review to the business's reviews address with the same Lead API key. Filed as customer feedback with channel online review; stars map onto the 0 to 10 feedback scale (1 to 2, 2 to 4, 3 to 6, 4 to 8, 5 to 10); a duplicate external id is not filed twice. Nothing is sent to the reviewer and no reply is posted.
- **Low-review alert.** A review of one or two stars notifies the owner (new notification type review_received, linked to the feedback record). On by default; switched off under Automations.
- **One key check.** The key check moved to lib/leadApiAuth.ts, shared by the lead and review routes, so the rules exist once.
- **Compliance kinds.** The compliance register gains trademark, domain or copyright; data-protection registration or privacy notice; and environmental permit, waste carrier or emissions. These close the framework's intellectual-property, data-protection and environmental record gaps.
- **Framework map.** Updated. Still not built: a competitor log, tracked objectives, a correspondence store, search-engine tooling, per-product inspection plans. WhatsApp sending through a provider and automatic recording of online-shop orders are left out on purpose (compliance and design, respectively).
- **Files.** lib/reviewIntake.ts, lib/leadApiAuth.ts, app/api/v1/businesses/[businessId]/reviews/route.ts, scripts/verify-reviews.ts (24 checks). Changed: lib/types.ts, lib/feedback.ts, lib/leadIntake.ts, lib/leadIntakeServer.ts (entity type), lib/operations.ts (compliance kinds), app/api/v1/businesses/[businessId]/leads/route.ts (shared check), app/notifications/page.tsx, components/AutomationsCard.tsx, scripts/verify-api-route-guards.ts, scripts/verify-lead-intake.ts, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Not tested.** Firestore rules against the emulator (the jar cannot be downloaded here). The review and lead APIs against a live deployment with a real key.
- **Failing before this round, still failing.** verify-catalog-mirror-fields and verify-demo-guardrails. Not touched.

## v180: account and supplier portals, SG&A split, risk register, quality log

- **Customer account page.** An owner or manager makes an account link from a customer (Account link on the Customers page). The customer sees their invoices with what is paid and what is owed, and opens each invoice through its existing invoice link. Shows nothing else. Link valid 60 days.
- **Supplier order page.** An owner or manager makes an order link from a supplier (Order link on the Suppliers page). The supplier sees their open orders (what, how many, ordered and expected dates) and confirms the delivery day for each. The confirmation is kept apart from the expected date the owner set, so the owner's on-time record cannot be changed by the supplier. The owner sees the confirmation on the purchase order.
- **SG&A split.** The income statement shows operating expenses split into Selling (marketing, sales payroll, delivery) and General and administrative (everything else), with SG&A as a share of revenue. A Sales payroll category lets sales staff pay be separated from office pay. The totals do not change.
- **Risk register.** Operations gains a Risks tab (owner and manager only): likelihood and impact from 1 to 5, a score, a review date, status, and a continuity kind for keeping the business running when the usual way fails.
- **Quality log.** Operations gains a Quality tab (everyone logs and reads; owner or manager closes): checks with pass, pass-with-note or fail, defects, a corrective action with an owner and dates, and a 30-day pass rate.
- **Business framework map.** The manual maps each of the 29 framework areas to where it lives in Balancr, and lists what is still not built.
- **Route guards.** The guard check recognises the two signed-link pages (portal and supplier) with their own purpose checks.
- **Lead stage push.** A lead moving stage sends a lead.stage_changed event to the owner's webhook address, when one is set, checked on the server.
- **Files.** lib/accountPortal.ts, lib/sga.ts, lib/riskQuality.ts, lib/leadScore.ts (earlier), app/api/portal (route and link), app/api/supplier (route and confirm), app/api/webhooks/lead-stage, app/portal/page.tsx, app/supplier/page.tsx, components/PortalLinkButton.tsx, components/ops/RiskQualityPanels.tsx, scripts/verify-portals-sga.ts (45 checks), scripts/verify-risk-quality.ts (42 checks). Changed: lib/signedToken.ts (two purposes), lib/types.ts, lib/calculations.ts (split in the monthly P&L), lib/operations.ts (tabs), lib/backupPayload.ts, scripts/restore-from-backup.mjs, scripts/verify-period-lock.ts, scripts/verify-operations.ts, scripts/verify-api-route-guards.ts, firestore.rules, lib/permissions.ts, contexts/DataContext.tsx, app/statements/page.tsx, app/purchase-orders/page.tsx, app/customers/page.tsx, app/suppliers/page.tsx, app/operations/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Still not built.** A competitor log, tracked objectives, intellectual-property and data-protection records, environmental records, a correspondence store, search-engine tooling, per-product inspection plans. Enrichment from outside data and scraping of sites that forbid it are not planned (compliance).
- **Not tested.** Firestore rules against the emulator (the jar cannot be downloaded here). The portal links, the supplier confirmation and the lead webhook against a live deployment. Test one of each before relying on them.
- **Failing before this round, still failing.** verify-catalog-mirror-fields and verify-demo-guardrails. Not touched.

## v179: lead score and outbound lead webhook

- **Lead score.** lib/leadScore.ts: a transparent 0 to 100 score per open lead, built only from facts on the lead (contact details, stage, estimated value, contacts logged and whether spoke, recency, consent, expected close within 30 days, overdue follow-up as a deduction). Shown on each open lead card; the reasons with their points appear on hover. Won, lost and do-not-contact leads score 0. No model and no outside data.
- **Outbound lead webhook.** Automations gain a webhook address. Each new lead from the website form or the lead API is posted once to that address as JSON (event lead.created). Five-second limit; redirects are refused; the address must be https and public (localhost, private ranges, link-local and metadata addresses, .local and .internal names are refused, checked on save and again before posting). A failed post does not lose the lead and is not retried.
- **Files.** lib/leadScore.ts, scripts/verify-lead-score-webhook.ts (33 checks). Changed: lib/types.ts, lib/leadIntake.ts (webhook address check, defaults), lib/leadIntakeServer.ts (pushLeadWebhook), app/api/enquiry/route.ts, app/api/v1/businesses/[businessId]/leads/route.ts, app/leads/page.tsx, components/AutomationsCard.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Dropped for compliance.** Paid contact enrichment from outside data sources, and scraping of sites that forbid it. Not built and not planned.
- **Still open.** A customer portal and a supplier portal (closable, but not finished in this round). Scheduled pushes of every change (only new leads are pushed; a change-watching job would be needed).
- **Not tested.** Firestore rules against the emulator (the jar cannot be downloaded here). The lead API and the webhook against a live deployment.
- **Failing before this round, still failing.** verify-catalog-mirror-fields and verify-demo-guardrails. Not touched.

## v178: quiet hours for text reminders

- **Quiet hours.** Automations (Integrations page) gain a time zone and a sending window for text reminders (default 08:00 to 20:00 local; a window past midnight is allowed). The daily reminders job sends no SMS outside the window and does not log the held-back reminder, so the next daily run that falls inside the window sends it. Email is never held back. With no time zone set, nothing changes. Shared rules in lib/quietHours.ts; the reminders route applies them; the card validates the zone and the hours.
- **Files.** lib/quietHours.ts, scripts/verify-quiet-hours.ts (26 checks). Changed: lib/types.ts (AutomationSettings), lib/leadIntake.ts (defaults and validation), app/api/cron/reminders/route.ts, components/AutomationsCard.tsx (rewritten), USER-MANUAL.md, scripts/verify-limits-documented.ts.
- **Still not built.** Enrichment through a paid provider; scraping of sites that forbid it; outbound webhooks pushed on each event (needs a server job that watches for changes; polling is available); a full customer or supplier portal; a model-based lead score. See v177 for the reasons.
- **Not tested.** Firestore rules against the emulator (the jar cannot be downloaded here). The lead API against a live deployment.
- **Failing before this round, still failing.** verify-catalog-mirror-fields and verify-demo-guardrails. Not touched.

## v177: sales and marketing intake (lead API, duplicates, automations), agenda reminders

- **Research basis.** Searches on lead-generation automation, webhook intake with a key, lead routing, speed to lead, sales follow-up, and small-business operations software (2026). Recurring themes: a lead that arrives by webhook and is filed without retyping; one lead per person, not one per enquiry; the lead going to someone at once; follow-up reminders that do not depend on memory; reactivation of lost and past customers; consent recorded at the point of contact. Balancr already had an owner-set integrations catalogue with masked keys, a website enquiry form, a follow-up sequence, a sequence of revisit and follow-up dates, and an owner's notification feed. These were extended, not duplicated.
- **Lead API (the one-key integration).** New entry "Lead API (Zapier, Make, n8n, forms)" on the Integrations page, with one secret key (Generate, then Save; regenerating replaces it). A leads address per business: POST creates a lead (201), reports a repeat by externalId (200 duplicate) or merges it into the lead already on file by phone or email (200 merged); GET returns leads created after a time (since, limit up to 200, nextSince for paging) with private notes and the contact log left out. The route checks the key in constant time, requires the switch on the entry, uses the shared open-business gate, and is rate limited per address and per business per hour. The key is in the owner-only integrations record and stays out of backups on purpose. Route guard check now recognises this as a key-authenticated category.
- **Shared lead intake rules.** lib/leadIntake.ts (pure): phone normalisation with a country code (local numbers match once it is set), email normalisation, match keys stored on each lead (contactKeys), input cleaning with plain-sentence errors, owner choice by fewest open leads (accountants never, inactive never), the inbound lead shape with automations applied, merged notes, duplicate lookup. lib/leadIntakeServer.ts: the Admin-SDK steps (pick owner, find duplicate, find by externalId, notify). lib/businessGate.ts: one open-business check for the enquiry route and the lead API (the enquiry route's private copy removed).
- **Duplicates.** A repeat website enquiry, or a repeat lead through the API, is added to the existing lead's notes with the date, and the owner is told it was a repeat. Manual leads get match keys too. Leads filed before this change match only on their stored text.
- **Automations on or off** (Integrations page, owner only; all off except merging duplicates; saved on the settings record as automations): assign new inbound leads to the person with the fewest open leads; make new inbound leads due for follow-up today; start the new-enquiry sequence on new inbound leads; merge repeat enquiries; look at a lost lead again after N days (0 = off); follow up N days after a lead moves to Proposal sent, when it has no date (0 = off); default country code for local numbers. None sends a message; a switched-off automation leaves what it already did alone.
- **Agenda reminders.** Procedures whose review date has come, and staff reviews that fall due, appear on the Agenda linking to Operations.
- **Files.** lib/leadIntake.ts, lib/leadIntakeServer.ts, lib/businessGate.ts, app/api/v1/businesses/[businessId]/leads/route.ts, components/AutomationsCard.tsx, components/LeadApiHelp.tsx, scripts/verify-lead-intake.ts (63 checks). Changed: lib/integrations.ts (one catalogue entry), lib/types.ts (AutomationSettings, lead fields), app/integrations/page.tsx, app/api/enquiry/route.ts (rewritten to use the shared rules; behaviour kept), contexts/DataContext.tsx (addLead and updateLead), lib/agenda.ts, app/agenda/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts (179 checks), scripts/verify-agenda.ts, scripts/verify-api-route-guards.ts.
- **Deliberately not built this round.** Contact enrichment through a paid provider (Apollo, Hunter and similar): it needs a live key to test and a privacy decision about sending lead data outside, so it is left for a later round. Scraping of Google Maps or any site that forbids it: not done; the OpenStreetMap prospect finder remains the route. Outbound webhooks pushed on each event: they need a server job that watches for changes; the polling GET covers the common case for now. Quiet hours for SMS: Balancr has no business time-zone setting yet, so quiet hours cannot be applied correctly. Customer self-service portal and supplier portal: partly covered by the invoice, quote and booking links; a full portal is a separate build. Automatic lead scoring by a model: the existing deal ranking is unchanged.
- **Not tested.** Firestore rules were not run against the emulator (the jar cannot be downloaded here). The lead API has not been called against a live deployment; its checks cover the rules, not a live request. Test one POST and one GET with a real key before relying on it.
- **Failing before this round, still failing.** verify-catalog-mirror-fields and verify-demo-guardrails. Not touched.

## v176: operations gaps: approvals, procedures, compliance register, incidents, equipment, KPIs, reviews

- **Research basis.** A 2026 review of small-business operations and management software (SOP and task tools, procurement and approval workflows, onboarding, contract and compliance trackers, KPI and performance-management guides) names as essentials: approvals for spend and expense claims with a limit, staff sign-off on written procedures, a register of licences and insurance with renewal reminders, incident and near-miss logs, planned maintenance, measures with targets, and performance reviews. Balancr already had an owner's playbook (procedures and contract dates), a routines checklist, onboarding for new staff, a rota, time off, cheques, mileage, memberships and a support log. These were the gaps closed here.
- **Requests and approvals.** New Requests tab on the Operations page: spend requests, expense claims and shift changes. Staff ask; an Owner or Manager approves or declines. The owner sets a manager approval limit (Settings value managerApprovalLimit; 0 or empty = owner only). A shift change has no amount and any manager can decide it. The requester can withdraw a pending request. Approved expense claims can be marked paid back (a note; the payment is recorded on Expenses). Nothing posts to the books.
- **Procedures with acknowledgement.** New Procedures tab: team-facing written procedures, separate from the owner's Playbook. Editing the title or steps makes a new version; each operating member confirms they have read the current version; owners and managers see who still has to. Review cycle in days, with a Due for review flag. Accountants cannot acknowledge.
- **Compliance register.** New Compliance tab: licences, permits, insurance, certificates, training, leases, contracts and registrations, with expiry dates, reminder windows (30 days default), holder, and an https link to the document (Balancr stores links, not files). Expired and due-soon items are shown first and appear on the Agenda.
- **Incidents and near misses.** New Incidents tab: report a near miss, injury, damage, customer incident or other with date, place, severity and description. Staff see their own reports; owners and managers see all, record action taken, close and reopen. Open items older than 14 days are flagged; near misses in the last 90 days are counted.
- **Equipment and vehicle maintenance.** New Equipment tab: service intervals in days, km or both; state (never, on schedule, due soon, overdue); next due by date and by distance; a service log (capped at 200 per item) with date, reading, note and an optional cost memo that posts no expense. Staff may log a service done. Date-based services appear on the Agenda.
- **KPIs with targets.** New KPIs tab: measures with unit, target, direction (higher or lower is better) and a weekly or monthly rhythm. A figure per period replaces the previous one for that period; the newest 260 are kept. Shows latest figure, on or off target, and the trend.
- **Performance reviews and goals.** New Reviews tab, owner and manager only (staff and accountants cannot read reviews in the rules): rating 1 to 5, strengths, improvements, up to 10 goals with due date and done flag, next-review date. Flags employees never reviewed or due (six months default).
- **Agenda.** Compliance expiries (from the start of each item's reminder window) and date-based equipment services now appear on the Agenda, linking to Operations.
- **Roles.** Owner and Manager: all tabs. Staff: Requests, Procedures, Incidents, Equipment. Accountant: Compliance and KPIs. Menu item Operations under Team.
- **Permissions and rules.** New permissions: create:request, manage:requests, manage:procedures, ack:procedure, manage:operations, create:incident, log:maintenance. Seven new collections (requests, procedures, compliance, incidents, maintenance, kpis, reviews) with rules. A procedure's acknowledgement can only change the reader's own entry. Staff can change only the service fields on equipment. Staff listen to their own requests and incidents, and to all procedures and equipment.
- **Backup and restore.** The seven collections are in the full backup and the restore script. Indexes added for staff queries on requests and incidents.
- **Period lock.** Operations records are knowingly exempt from the closed-period lock: none of them posts to the books.
- **Files.** lib/operations.ts (pure rules), scripts/verify-operations.ts (149 checks), components/ops/RequestsPanel.tsx, components/ops/ProceduresPanel.tsx, components/ops/RecordsPanels.tsx, app/operations/page.tsx. Changed: lib/types.ts, lib/permissions.ts, lib/backupPayload.ts, lib/agenda.ts, lib/navPrefs.ts, components/AppShell.tsx, contexts/DataContext.tsx, firestore.rules, firestore.indexes.json, scripts/restore-from-backup.mjs, app/agenda/page.tsx, USER-MANUAL.md, scripts/verify-limits-documented.ts (173 checks), scripts/verify-period-lock.ts, scripts/verify-agenda.ts, scripts/verify-farm.ts.
- **Deliberately not built.** Automatic reminders sent to anyone; onboarding and offboarding (already in the Employees page); purchase orders with suppliers' approval (the Orders page already covers those); document storage (links only); a predictive KPI model; contract e-signature; payroll-linked review pay.
- **Not tested.** Firestore rules were not run against the emulator (the jar cannot be downloaded in the build sandbox). The staff and accountant listeners and the procedure acknowledgement rule need a live check with a staff account and an accountant account.
- **Failing before this round, still failing.** verify-catalog-mirror-fields (emptying the serial number on a sale edit) and verify-demo-guardrails (a delete rule grouped with create and update). Not touched.

## v175: lead pipeline gaps: contact log, owners, do-not-contact, sequences, close dates, revisits, attribution, renewals

- **Research basis.** A 2026 review of small-business CRM and sales-engagement guidance (CRM feature checklists, lead nurturing and capture tools, outbound sequencing and call-logging guides, quote and proposal software) names as essentials: a contact history on every lead, follow-up reminders with a next step, a lead owner and assignment, a multi-step outreach sequence, a do-not-contact record, speed to first contact, expected close dates and win/loss analysis, and lead-source tracking on web enquiries. Balancr had a stage list, a single follow-up date, free-text notes and no owner. These were the gaps closed here.
- **Contact log and speed to lead.** Log contact on a lead: channel (call, WhatsApp, email, meeting, visit, other), outcome, optional note. Stored on the lead, capped at 200 contacts; notes capped at 500 characters. Records first and last contact times. Leads page shows the median minutes from enquiry to first contact and flags new leads with no contact after 24 hours. Staff may log contacts on leads they created or are assigned (new permission log:leadContact); logging changes no stage or value.
- **Owners.** Lead form gets a Who is working this lead? picker (Owner and Manager). Filter chips: All open, Mine, Unassigned, Follow-up due, Not contacted yet. Team table (Owner and Manager): open leads, follow-ups due, contacts logged in the last 7 days per person. Staff listen to leads assigned to them as well as ones they created (two listeners merged in DataContext).
- **Do not contact.** Flag on the lead (Owner and Manager), or logged as Asked us to stop contacting them (anyone with log:leadContact). Blocks every new contact attempt and any sequence; hides the Message button; never counted as untouched. Security rule: staff can set the flag but cannot clear it.
- **Follow-up sequence.** One built-in sequence, New enquiry: five touches over 21 days, each with a channel and the lead template to use. Start it on an open lead; each step shows when due and how late, and Log this step records the touch and advances the sequence. Stops when the lead is won, lost or marked do not contact. Balancr sends nothing: a step is a reminder, not a message.
- **Expected close date and timing.** Optional date on the lead. Leads page groups open leads into passed, this month, next month, later, no date, with counts and values. Replaces the old note that leads have no close date.
- **Lost-lead revisits.** Optional Look at it again on date on a lead (Owner and Manager). Due lost leads are listed on the Leads page until marked Looked at it. Do-not-contact leads excluded.
- **Enquiry attribution.** The website enquiry form reads utm_source and utm_campaign from its link and the referring site from the browser, and asks How did you hear about us? (fixed list). Stored on the lead as campaign, referrer and howHeard; shown on the lead card. Cleaned server-side: only http and https referrers, control characters removed, length capped.
- **Membership renewals.** Memberships page lists active memberships ending within 14 days that still have hours left.
- **Read-only accountant guard.** The mutation-name rule now includes log, so logLeadContact is refused for a read-only role (verify-accountant-readonly).
- **Agenda.** Missing dependency on the cheques memo fixed (lint warning from v174).
- **Files.** lib/leadPipeline.ts (pure rules), components/LogLeadContactDialog.tsx, components/LeadPipelinePanel.tsx, scripts/verify-lead-pipeline.ts (91 checks). Changed: lib/types.ts, lib/permissions.ts, lib/memberships.ts, lib/readOnlyGuard.ts, contexts/DataContext.tsx, firestore.rules, firestore.indexes.json (ownerUid + createdAt on leads), app/leads/page.tsx, app/enquiry route, app/enquire page, app/memberships page, app/agenda page, USER-MANUAL.md, scripts/verify-limits-documented.ts (164 checks).
- **Deliberately not built.** Automatic sending of any message or sequence step; email open and click tracking; two-way inbox sync; a legal e-signature; a telephone dialer or call recording; a predictive lead-scoring model (the existing deal finder ranking is unchanged).
- **Known limitation.** A contact is written as the whole contact list in one update. If two people log a contact on the same lead within the same moment, the later save can overwrite the earlier entry. Ordinary use does not hit this; a transaction would fix it.
- **Not tested.** Firestore rules were not run against the emulator (the emulator jar could not be downloaded in the build sandbox), so the staff rule and the merged staff listeners need a live check with a staff account. Not run against live email or SMS.
- **Failing before this round, still failing.** verify-catalog-mirror-fields (emptying the serial number on a sale edit) and verify-demo-guardrails (a delete rule grouped with create and update). Not touched.

## v174: cheques, SMS reminders, promised stock, email campaigns, seat requests, table pricing, mileage, memberships, farm batches

- **Research basis.** Cheques: Sri Lankan sources describe post-dated cheques as routine in trade credit, banks charging for returned cheques, and cheques stale six months after their date; the app had cheques only as free-text notes. Promised stock: sales-order tools (Zoho, inFlow and similar) show demand against stock and supplier orders; here an accepted quote moves no stock, so two quotes could promise the same units. SMS: Notify.lk's documented send API. Email campaigns: consent and a one-click unsubscribe are standard for any bulk email.
- **Cheques.** New Cheques page (Money; owner and manager write, accountant reads, staff never see it). Received and issued cheques with post-dated, ready, going-stale (within 14 days of six months), stale, with-bank, returned and closed states; allowed status changes only; a post-dated cheque cannot be banked early and a stale one cannot be banked; returned cheques keep the bank's reason and charge. Four-week outlook, and agenda lines. A memo beside the books: it records no payment. New "cheques" collection, security rule, backup and restore, menu entries. lib/cheques.ts is pure, checked in verify-cheques.ts (65 checks).
- **SMS reminders.** Optional second route for overdue-invoice reminders, through Notify.lk: for customers with a Sri Lankan mobile number and no email, or whose email failed. Off by default (Settings, only while email reminders are on). Never an email and a text for one invoice in one interval; 100 texts per run; message fitted to 320 plain characters, link and payment instructions only if they fit. lib/sms.ts, checked in verify-sms.ts (45 checks).
- **Promised stock.** Card on Estimates: goods promised on accepted, not-yet-invoiced quotes against stock on hand and on order, with the shortfall. Read-only; reserves nothing. lib/promisedStock.ts, verify-promised-stock.ts (12 checks).
- **Email campaigns with unsubscribe.** Card on Outreach (owner and manager): one email to every customer marked as agreed to offers who has an email address. Each email carries that customer's own signed unsubscribe link (365 days); the public unsubscribe page switches their consent off with a POST, so mail scanners cannot unsubscribe anyone. 100 per send, 200 per day. lib/marketing.ts, verify-marketing.ts (28 checks).
- **Changed statement.** The manual and the limits check said "The app never sends a message" about Outreach. That is no longer true of the email campaign, so the sentence now says the templates never send by themselves, and the limits check was updated to match. The reminders section now says reminders are not email-only.
- **Guards.** Route guard registers /api/marketing/send as authenticated and /api/unsubscribe as a public, rate-limited, signed-link route.
- **Online seat requests for events.** An event can be opened to requests (Events form). A public page lists open events with date, time, price and seats left; a customer asks for up to 10 seats with a name and a phone or email; the owner gets a high-priority notification. A request is not a sale and holds no seat. Honeypot, per-address (10 an hour) and per-business (100 a day) limits. lib/publicTickets.ts, verify-public-tickets.ts (20 checks). The manual's "Events have no online ticketing" is now "no online payment".
- **Table-time pricing.** Owner-set minimum charge, billing in blocks and a per-person rate shape the suggested price for hourly services; bookings gain an optional People count. Suggestion only, never posted. verify-table-pricing.ts (24 checks). The manual no longer says group rates and minimum charges are not calculated; packages and membership hours still are not.
- **Mileage log.** New Mileage page (Money; owner and manager write, accountant reads): trips by vehicle with optional odometer readings, a typed cost per km, monthly totals by vehicle, and a list of odometer readings that do not join up. A memo: posts no expense. New "mileage" collection, rule, backup, restore, menu. lib/mileage.ts, verify-mileage.ts (23 checks).
- **Memberships.** New Memberships page: prepaid included hours for a customer, valid between two dates. A booking can be covered by a membership; it then uses hours from it and has no sale to record (left out of the sale list and of the "record the sale" reminders; the sale transaction refuses it). Refuses cover for another customer, outside the dates or beyond the hours left; blocks cutting a membership below hours already used. New "memberships" collection, rule, backup, restore, menu. lib/memberships.ts, verify-memberships.ts (33 checks). The manual no longer says membership hours are not calculated.
- **Farm batches.** Research basis: the two business-aspect pictures you sent (a record shop and a salmon farm) show that the app had no support for live stock. New Farm batches page (Buy & sell; owner, manager and staff, because whoever works the tanks logs the day): a batch with stocking count and weight, then entries for deaths, culls, animals added, feed, weight samples, water readings, costs and harvests, inside one document, written in transactions. Works out alive, survival, biomass, feed conversion, harvest, cost per kg, optional water-range flags and a weekly-loss warning. Posts nothing. New "farmBatches" collection, rule, backup, restore, menu. lib/farm.ts, verify-farm.ts (39 checks).
- **Not tested.** Not run against live Notify.lk or Resend accounts.
- **Failing before this round, still failing.** verify-catalog-mirror-fields ("emptying the serial number on a sale edit") and verify-demo-guardrails (a delete rule grouped with create and update) fail on the v173 upload too. Not touched.
- **Still open (not compliance).** Customer want lists with an alert when a wanted item arrives (record shops); no sensor or camera feeds for farm batches; no breeding, genetics or treatment records.

## v173: card payments (PayHere), overdue reminders by email; e-signature decision

- **Decisions.** Payments: PayHere, per business, into the business's own merchant account (Balancr never holds the money). Messaging: the existing Resend email service, for reminders only, off by default. E-signature: no provider; acceptance remains a recorded name and time.
- **Card payments.** Invoice link shows "Pay by card" when PayHere is set up. Checkout is built on the server (hash formula from PayHere's documentation), so the merchant secret never reaches the browser. Only an amount still owed can be started. The notice is accepted only with a matching signature, status 2, and the issued amount and currency; the payment is written under a fixed id, so repeats never double-record. Recorded on Receivables as card, against the first line.
- **Overdue reminders.** Daily job (/api/cron/reminders): only for businesses that switched it on, one email per overdue invoice per interval, email addresses only, 200 per run. Reply-to optional.
- **Rules.** lib/payhere.ts and lib/overdueReminders.ts are pure and checked in verify-payments-reminders.ts (20 checks).
- **Guards.** Route guard registers the checkout as a signed-link route and the notice as a signature-checked route.
- **Limits.** Not tested against a live PayHere account. PayHere may need address details the app does not collect. No SMS or WhatsApp. No unsubscribe link on reminders. Reminders need the email service configured and the daily job scheduled.
- **Checks.** Type check, route guard, limits check, verify-payments-reminders (new).
- **Still open (not compliance).** Email marketing with unsubscribe; WhatsApp or SMS reminders; online ticketing.

## v172: online booking requests; correction on recipe costing

- **Online booking requests.** Any business can take booking requests from a public page: a customer picks an active service, a day within 90 days, a start time and a length, and leaves a name and a phone number or email. The request is saved as "booked" and raises a Notifications alert. The owner confirms, changes or cancels it on the Bookings page. Nothing is confirmed or charged automatically.
- **Rules.** lib/publicBooking.ts is pure and checked in verify-public-booking.ts (12 checks). It reuses the internal booking rules and adds: active services only, a 90-day window, a contact, and a two-letter minimum name, which the shared booking rule did not enforce. Busy times are shown without names.
- **Protection.** Honeypot, length caps, a per-address limit (10 an hour) and a per-business limit (100 a day). The GET is throttled like the enquiry form.
- **Correction.** The v171 entry listed recipe costing for food as an open gap. That was wrong. Products can be made from components (multi-level bills of materials), production runs record scrap and labour, and services have recipe cost lines. Recipe costing is removed from the open list.
- **Known limits.** Two requests can take the same time if they arrive together. Times earlier today are not refused. No deposits or online payment.
- **Checks.** Type check, route guard, limits check, verify-public-booking (new).
- **Still open.** Card or bank payment online; automatic reminders to customers; the IRD VAT schedule file; the gazetted invoice field list; the secured POS requirement; online ticketing for events.

## v171: ticketed game nights and tournaments

- **Events.** A new Events page (owner, manager, staff) for game nights and tournaments: name, date and time, seats, ticket price, the service tickets are sold under, optional other costs, and scheduled or cancelled status. Seats are sold as ordinary sales linked to the event (Sale.eventId), so they reach the books, tax and reports. The page shows seats sold, ticket sales, other costs, and the net from tickets.
- **Rules.** lib/events.ts is pure and checked in verify-events.ts (22 checks). Sold-out and cancelled events refuse sales. An event with ticket sales cannot be deleted; it is cancelled instead.
- **Plumbing.** New "events" collection: DataContext listener and add, update and delete (manage:bookings), a security rule that matches bookings (readable by active members, written by the operating team, deletable by owner and manager only), and navigation entries.
- **Research basis.** Board game café revenue is commonly described as five lanes: food and drink, table or cover fees, game retail, events and tournaments, and memberships. Events and tournaments are repeatedly named as the largest per-night lift. The sources are mostly industry blog and planning content, not audited data, so treat the percentages as indicative only.
- **Checks.** Type check, limits check, verify-events (new).
- **Still open.** Recipe costing for food; memberships with included hours; group and minimum table pricing; online ticketing; card or bank payment online; automatic reminders to customers; the IRD VAT schedule file; the gazetted invoice field list; the secured POS requirement.

## v170: table time by the hour

- **Hourly pricing on bookings.** A service whose unit is "hour" is priced per hour. When a Done booking is recorded as a sale, the price is suggested as the hourly rate times the booking's length, with the working shown. The owner can change it. lib/bookings.ts suggestBookingPrice is pure and checked in verify-table-pricing.ts (9 of 9).
- **Honest limits.** The sale is still one unit at the price charged; group rates, minimum charges, packages and membership hours are typed by hand. No event or tournament entity, and no recipe (ingredient) costing for food: both are recorded as open gaps.
- **Checks.** Type check, verify-table-pricing (new), limits check, route guard.
- **Still open.** Card or bank payment online; automatic reminders to customers; the IRD VAT schedule file; the gazetted invoice field list; the secured POS requirement; recurring costs in the weekly brief; events and tournaments with capacity; recipe costing for food.

## v169: weekly AI brief, lead-to-quote hand-off, landing and privacy corrections

- **Weekly brief.** "Write brief" on the owner's dashboard writes a few sentences about the last seven days, from figures computed in the app (lib/ownerBrief.ts). The model is not asked to calculate. A brief quoting any figure not supplied, or any percentage, is refused. Figures are shown beside the text. Uses the business's own AI key and the daily AI limit. Nothing is saved or sent.
- **Lead to quote.** "Make a quote" on a lead opens a new quote pre-filled with the lead's name, contact and notes. The lead is not changed and nothing is created until the quote is saved.
- **Landing page.** Corrected the AI data sentence (it goes to the AI provider on the business's own key, not "our" provider) and reworded "Never run out of stock" to "Know before stock runs out", which the app can keep.
- **Privacy policy.** AI processing sentence now states whose key is used (the business's, or the operator's for the demo and the operator's own businesses).
- **Checks.** Type check, production build, route guard, limits check (108 of 108), verify-owner-brief (new), verify-quote-revision.
- **Still open.** Card or bank payment online; automatic reminders to customers; the IRD VAT schedule file; the gazetted invoice field list; the secured POS requirement; recurring costs in the weekly brief.

## v168: customer invoice link and payment claims

- **Customer invoice link.** "Customer link" on each invoice (owner and manager) copies a link valid for 60 days. The customer sees that invoice: lines, discounts and returns, tax, payments recorded, balance due, and the owner's payment instructions. The balance uses the Invoices page arithmetic, computed on the server by the same engine (computeSaleEconomics, no cost ledgers).
- **"I've paid" is a claim.** It creates a Notifications alert ("Customer says they paid"). It records no payment and changes no balance. The owner checks the bank and records the payment on Receivables.
- **Payment instructions.** New Settings field, "How customers pay". Free text; Balancr takes no money and connects to no bank.
- **Balance rules.** A claim is refused for a cash sale, an invoice already paid, or an amount above the balance (lib/invoicePortal.ts, checked in verify-quote-revision.ts).
- **Changes to guards.** Route guard registers the invoice customer route with its link and rate-limit checks. The invoice link route requires an owner or manager.
- **Checks.** Type check, route guard, limits check (102 of 102), verify-quote-revision (27 of 27).
- **Still open.** Card and bank payment online (needs a gateway decision); automatic reminders to customers; the IRD VAT schedule file; the gazetted invoice field list; the secured POS requirement.

## v167: tax identity, locked issued sales, owner alerts

- **Tax identity on documents.** Settings has TIN and VAT registration number fields. They print under the business name on every document, and only when a business name is set. Nothing checks them against the IRD.
- **Lock issued sales.** Settings switch. When on, no sale can be edited or deleted, old or new; only its project and note can change. Enforced in DataContext and in firestore.rules (sales update and delete). Corrections are made by a return or a credit.
- **Owner alerts.** A customer accepting or declining a quote online, and a website enquiry, each write a notification that appears on the Notifications page. Best effort: a failed alert never undoes the answer or the enquiry. No email or text is sent.
- **Checks.** Type check, route guards, limits check (96 of 96), verify-quote-revision (lock rule added), verify-batch-ledger (whitelist check narrowed to the lock branch; 43 of 43 pass).
- **Still open, stated in the manual.** Customer invoice portal and pay-by-link; customer card or bank payment; automatic reminders sent to customers; the IRD VAT schedule file (schedules 01, 04, 07); the gazetted invoice field list; the secured POS requirement (specs not yet published).

## v166: quote revisions, customer quote links, website enquiries, own AI keys

- **Revised quotes.** Revise a quote into a new version; the old one is marked revised and its link stops working. A quote already invoiced cannot be revised. Revising shows any deposit the customer already holds against the new total: a surplus stays as a credit for their next invoice, never refunded automatically.
- **Customer quote link.** A signed link (60 days) lets the customer view a quote and accept or decline it. Accepting records their typed name and the time only. It is not an e-signature and converts nothing. Shows only the quote, never cost, stock or other business data.
- **Quotes to chase.** Sent quotes expiring within 7 days or past their date, with a one-tap message.
- **Website enquiry form.** Public form that files each enquiry as a New lead tagged "Website enquiry". Rate limited per address and per business; honeypot; locked or unset businesses reveal nothing.
- **Own AI keys.** The AI Assistant runs on each business's own DeepSeek key (Integrations > AI assistant). The operator's key is used only for the public demo and businesses listed in AI_OPERATOR_BUSINESS_IDS. Other accounts without a key are told to add one.
- **Changes to guards.** scripts/verify-api-route-guards.ts registers the two customer-facing public surfaces with their required checks. lib/readOnlyGuard.ts treats "revise" as a write. AiAuthError accepts any status code.
- **Checks.** Type check, production build and verify-api-route-guards, verify-accountant-readonly, verify-ai-usage-metering, verify-integrations, verify-customer-deposits, verify-pipeline-automation pass. New verify-quote-revision.ts (20 checks). verify-catalog-mirror-fields and verify-demo-guardrails were already failing in v165 and are unchanged.
- **Not built, on purpose.** Invoice payment from a link, card payments, owner alerts for quote answers, and emailing website enquiries. See the manual's limits.

## v165: build fix for R&D records

- **Build error fixed.** The save label for a new record read the product name on every non-licence record, which broke the type check for R&D projects (they have a name, not a product). Each kind now has its own label.
- **Checks.** Type check on the touched files re-run, unfiltered for property errors. verify-price-control.ts (14), verify-electronics.ts (34) and verify-limits-documented.ts (77) still pass.

## v164: minimum advertised price and product condition

- **Minimum advertised price (MAP).** Set a MAP per product on Price & condition. Sales in a period charged below their product's MAP are listed with the gap per unit and in total. Free items and delivery charges are not counted; discounts and promo codes are.
- **Condition.** New, open box, refurbished or used, per product. Products with no condition count as New. Stock on hand is totalled by condition at cost.
- **Nothing is blocked or sent.** The page only flags and totals. It never changes a price or a sale, and never contacts a brand, buyer or retailer.
- **Checks.** verify-price-control.ts (14 checks), limits check updated.

## v163: licences, trade-ins, price protection and R&D projects

- **Licences and permits.** Keep each licence with its issuer, number, issue and expiry dates, and cost to renew. Licences expired or due within 60 days are listed at the top with a badge.
- **Trade-ins.** Record a device handed in as part payment: condition, agreed credit, date. Each is Open until marked Credited, Paid out or Resold. The page totals the credit still owed.
- **Price protection.** When a supplier cuts a price on stock you hold, record the old and new price and units held. The claim is shown before you save; mark it Claimed or Credited.
- **R&D projects.** One project per product idea, moved through Idea, Prototype, Testing, Certification, Launched or Dropped, with a budget and target date. The page totals budgets not yet launched or dropped.
- **Owner and manager only.** Each save or status change is a button press. Nothing files with an authority, claims from a supplier, pays anyone or posts to the ledger. Changes are covered by the period lock; the full backup and restore include the records.
- **Fixes.** The accountant read-only guard now blocks payTabPart and makeEstimateFromWorkOrder (they were not covered). Work-order methods are classified as memo records in the period-lock check. The delivery, batch-ledger, sales-channels and bookings checks were updated to match current code; the delivery check no longer depends on the day of the month.
- **Checks.** verify-electronics.ts (34 checks), verify-limits-documented.ts (73 checks), verify-period-lock.ts clean.
- **Not verified here.** npm run build. Twelve verify scripts that need firebase, firebase-admin or papaparse cannot run in this sandbox because the package registry is unreachable.

## v162: outreach queue

- **Work through the list.** On Outreach, go through the allowed messages one customer at a time: open WhatsApp or email, press send in your own app, then Messaged, next. Skip and Stop are there too. Nothing opens by itself.
- **Checks.** verify-outreach.ts (43 checks), limits check updated.

## v161: review requests, referrers and post captions

- **Ask for a review.** A segment of customers who bought in the last 14 days, a review-request message filled with your Google review link (set once on Outreach), and a 60-day cool-down so nobody is asked twice. Every recent customer is listed, not only happy ones.
- **Referrers.** A Referred by field per customer. The Referrers segment lists who sent customers your way, with a thank-you message.
- **Post caption.** A caption from the offer wording, business name and review link, copied to paste into your own social app.
- **Limits.** Rewards for referrals are not tracked. Nothing is posted or sent by the app; timed automatic follow-ups are deliberately not built.
- **Checks.** verify-outreach.ts (40 checks), limits check updated.

## v160: customer outreach

- **Outreach (Buy & sell).** Segments customers who have not bought for 60 days, have birthdays in the next 14 days, are top spenders, or ordered for the first time in the last 30 days. Each has a message template, filled with the customer's first name and your business name. WhatsApp and email open with the text ready; you press send, then Messaged.
- **Consent.** Offer messages only go to customers who agreed to receive them, recorded per customer on the page. Order messages go to anyone with a contact.
- **Birthdays and history.** Customers get a birthday field (day and month used) and a last-messaged date, so nobody is messaged twice in a week.
- **Limits.** Nothing is sent by the app. Thresholds are fixed. Customers are matched to sales by name. Replies and opens are not tracked.
- **Checks.** verify-outreach.ts (28 checks), share links check still passes.

## v159: jobs (work orders)

- **Jobs page (Buy & sell).** Open a job for a customer's item or work: customer, contact, item, problem, dates, and labour and parts from your services and products. Move it through Opened, In progress, Waiting for parts, Ready to collect, Collected or Cancelled. Print a job card. Overdue jobs show first. Summary: open, overdue, ready, waiting, open value.
- **Estimate from a job.** One button turns the labour and parts into a draft estimate, which then follows the usual path to a sale.
- **Limits.** Collected and cancelled jobs cannot be reopened. Once an estimate exists, the job's lines are locked. Deleting a job keeps its estimate. Numbers are assigned on save, so simultaneous saves could collide.
- **Wiring.** workOrders collection: data context (listed for owner, manager and staff), Firestore rules (staff can open and move jobs, owner and manager delete), backup and restore lists, and the menu.
- **Checks.** verify-work-orders.ts (32 checks). Backup coverage still passes.

## v158: consignment

- **Consignment (Buy & sell).** Track goods you leave with a partner who sells them. Per partner: units with them, their reported sales, what you owe them on those sales, what you have paid, the balance, and your share of their sales. Owner and Manager record; Accountant reads. Each entry is saved by a button press.
- **Limits.** Payments to a partner cannot exceed the balance owed. Units cannot be reported sold or returned beyond what is with the partner. Consigned goods do not change your stock or profit, and the record is not posted to expenses or sales. Only the owner can delete an entry.
- **Wiring.** A new consignments collection: data context (listed for owner, manager and accountant), Firestore rules (owner and manager write, owner deletes), the full backup and restore lists, the closed-period guard, and the menu.
- **Checks.** verify-consignment.ts (30 checks). Backup coverage and rentals checks still pass.

## v157: thermal kitchen printing and bills

- **Thermal printing.** Kitchen tickets and tab bills print on an ESC/POS thermal printer on your network. Pure builders (lib/escpos.ts) produce the printer's bytes for a ticket (table in large type, items in bold) and a bill (lines, quantities, amounts, TOTAL). Text is folded to ASCII and wrapped to the paper width (32 or 42/48).
- **Print agent (scripts/print-agent.ts).** Runs on the computer next to the printer. Listens on 127.0.0.1 only, accepts requests from your app's address with the token, refuses any printer address that is not on the private network, and caps the job size. It sends the bytes to the printer on TCP 9100.
- **Settings > Kitchen printer.** Agent address, token, printer address and port, saved in this browser only, with a Test print button.
- **Fallback.** If no printer is set, or it is not reached, the ticket or bill opens in the normal print window and the page says why.
- **Print bill.** New button on a tab, beside Close and charge: prints the bill to the printer or the browser.
- **Checks.** verify-thermal-print.ts (38 checks); verify-kitchen-print.ts updated for the shared print path. The print agent was smoke-tested for its refusals (wrong app, wrong token, public address, unreachable printer, preflight). A full print to a real printer has not been tested.

## v156: equal shares on the close form

- **Split between how many people?** On the Tabs close form, the number of people shows each share, rounded to the cent. The last share takes the leftover cents, so the shares add up to the bill exactly. The bill is still closed on credit and each share is recorded on Receivables as it is paid, as before.
- **Checks.** verify-equal-shares.ts (12 checks). Tabs (52/52) and the limits check still pass.

## v155: Google Ads import, investment price refresh

- **Google Ads spend import.** Beside the Meta button on Settings > Promo campaign spend. Needs the Google Ads keys in the hosting settings. It exchanges the refresh token for a short-lived access token, reads each campaign's cost for the chosen month, converts micros to money, adds the days together, and matches promo codes. It fills the box; you press Save.
- **Refresh prices (Investments).** Investments with a ticker get a **Refresh prices** button that fetches the latest price and trading day for up to five at a time, stalest first. The owner presses it; prices only change when the button is pressed. A provider rate-limit note is reported and never treated as a price.
- **Ticker field.** The investment form now says what the ticker is for.
- **Checks.** verify-google-market.ts (43 checks). The limits check covers the new manual sections.
- **Still not built:** kitchen printer hardware, and tax and invoice compliance (left to you by choice).

## v154: connections and Meta Ads spend import

- **Connections card (Settings, Account tab).** Shows each outside service as Connected or Not connected, with the setting names still missing. It never shows a key or its value. Keys go in the hosting provider's environment settings, as the AI and email keys already do.
- **Meta Ads spend import.** With META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID set, Settings > Promo campaign spend has **Import from Meta Ads** for this month so far or last month. Each promo code gets the spend of the campaigns whose names contain it as a whole word. Unmatched campaigns are listed. The token travels in a request header only, and paging follows only Graph-host links. An import fills the box; nothing saves until you press Save.
- **Ready for keys.** Every connection shows the same status and a clear "not connected" message until its keys are added. Nothing else changes when a key is missing.
- **Checks.** verify-connections.ts (49 checks) covers the status, the request shape, reply parsing, whole-word matching and month ranges. The limits check covers the new manual section.
- **Still not connected:** live stock or commodity prices, Google Ads and other ad platforms, and kitchen printer hardware (kitchen tickets print through the browser to any printer).

## v153: equal split guidance

- **Equal split.** The Tabs page explains that a bill is split equally by closing it on credit under the table name and recording each share on Receivables. The manual has the steps. No new payment model: the existing credit sales and receivable payments already keep stock, profit and tax right.
- **Checks.** The limits check now covers the equal split route.

## v152: printable kitchen tickets

- **Print a kitchen ticket.** Print on the Kitchen page or on a tab's ticket opens a large-type ticket (table, time, items) through the browser's print dialog, so it can go to a kitchen printer. Names are escaped.
- **Checks.** scripts/verify-kitchen-print.ts (7 checks) and the limits check pass.

## v151: kitchen tickets and split bills on tabs

- **Kitchen.** A tab's items can be sent to the kitchen. Each item is sent once, as a ticket, and the Kitchen page lists the tickets from every open tab, oldest first, with New, Preparing, Ready and Served steps. Tickets change no stock, sale or figure.
- **Split the bill.** A tab can be paid for in part: pick the items this group is having, and they are recorded as sales and taken off the tab while the rest stays open. The tab closes when nothing is left on it. The data layer checks the choice itself, so it cannot pay for more than is on the tab.
- **Checks.** scripts/verify-kitchen-split.ts (27 checks), scripts/verify-tabs.ts (52, unchanged), and the navigation and limits checks pass.

## v150: promo campaign results

- **Promo campaigns (Sales page).** Each promo code is a campaign: sales, revenue, gross profit, what it took off, spend, profit after spend and spend per sale. Spend is typed under Settings and is a comparison only; it is never posted or added to profit.
- **Checks.** scripts/verify-campaigns.ts (15 checks) and the limits check pass.
- **Correction.** A table-tab page was added and then removed in the same version: the app already has a full Tabs feature (Buy & sell menu, Tabs page, documented in the manual), and it was never missing.

## v149: shelf order for stock counts, extra customer details

- **Shelf or bin per product.** The product form takes where an item sits (A-03). The stock count lists items in shelf order (A-2 before A-10) and shows each shelf, so the count follows the walk around the shop. Items with no shelf come last.
- **Extra customer details.** Settings take up to four names (for example Vehicle number, Birthday). Each customer gets a box for each one, shown on their card. Nothing in the books, balances or credit checks reads them.
- **Checks.** scripts/verify-bins-customer-fields.ts (20 checks) and the limits check pass.

## v148: promo codes, short and damaged deliveries

- **Promo codes.** Set codes under Settings (SAVE10:10, WELCOME:5). On a single sale in the shop currency, typing a code and pressing Apply fills in the lower price. The sale is saved at that price, so revenue and profit already reflect it; no separate discount is booked.
- **Promo codes this month (Sales page).** A read-only card shows each code's uses and the total it took off. It appears once a sale has used a code.
- **Short and over deliveries.** A purchase order that arrives short or over shows a badge with the difference, and a field on the receive form records anything wrong with the delivery (damaged, short, wrong item). The note changes no stock or cost figure.
- **Checks.** scripts/verify-promo-receiving.ts (31 checks) and the limits check pass.

## v147: tips

- **Tips on a sale.** A single sale can carry an optional tip, passed on to staff. Editing a sale shows it, and clearing the box removes it.
- **Tips this month (Sales page).** A read-only card adds up the month's tips, the number of sales with a tip and the average. It shows only once a sale has a tip.
- **Tips are not money figures.** No revenue, profit, tax or cash figure reads the tip. Tips are recorded on single sales, not on multi-item invoices.
- **Checks.** scripts/verify-tips.ts (18 checks) and the limits check (now 23 checks) pass.

## v146: eco tags, profit trendline

- **Eco and sustainability tags on products.** The product form takes tags such as Vegan, Organic or Recyclable packaging (suggestions offered, any text accepted, up to eight per product). Clearing the box removes them.
- **Eco and sustainability mix (My Profit).** A read-only card shows the share of the period's sales revenue from tagged products, split by tag. It uses the same per-sale revenue as Sales by channel, so the two agree. A tag never changes a price, a cost or any profit figure.
- **Profit trendline.** The monthly chart on My Profit now draws a dashed straight-line trend for profit after tax as well as for revenue.
- **Checks.** scripts/verify-eco-tags.ts (21 checks) covers the tag cleaning, the revenue share with hand-worked figures, and the wiring. The limits check and the trend check still pass.

## v145: lint fix

- **Build error fixed.** The partner and royalty card had an apostrophe in its JSX text ("period's"), which the project's lint rule rejects. The sentence now reads "the profit for this period".

## v144: limits check covers the newest features

- **Tests.** `scripts/verify-limits-documented.ts` now checks the partner split and royalty limits too (17 checks). The limits themselves were already in the manual.

## v143: partners and franchise royalty (read-only)

- **Partners' share of profit.** Two to ten partners, shares that total exactly 100%, and each partner's amount for the period. The amounts add back exactly to the profit.
- **Franchise royalty.** A percentage of the period's revenue, shown as a figure.
- **Read-only.** Nothing is saved, posted or sent. The figures use whole months in the period.
- **Tests.** `scripts/verify-partner-royalty.ts` (19 checks).

## v142: landing page matches the app

- **Landing page copy** now describes bookings (with a "Book the time" step), won leads becoming sales in one tap, the automatic follow-up date, camera scanning on the till, and what each channel costs and is worth.
- **Tests.** `scripts/verify-landing-copy.ts` (6 checks).

## v140: scan with the phone camera

- **Scan with camera** on the sale form, where the browser can read codes (Chrome on Android and similar). It picks the item the same way a scanner or a typed code does, and it is hidden where the browser cannot read codes.
- **Camera is on only while the box is open** and is switched off as soon as a code is read or the box is closed. Nothing is stored or sent.
- **Tests.** `scripts/verify-camera-scan.ts` (14 checks). The camera itself can't run in the build sandbox, so the checks cover the rules around it.

## v139: follow-up dates and duplicate warnings

- **Follow-up dates set themselves.** A lead moved to Contacted or Following up gets a follow-up three days out; a proposal gets five. A date already set is never overwritten, and the owner can change or clear it.
- **Possible duplicates.** The lead form warns when a name or phone or email matches an existing lead or customer. It never blocks the save. Phone numbers match on their last nine digits, so 077… and +94 77… are one number.
- **Tests.** `scripts/verify-lead-followup.ts` (24 checks).

## v138: build fix

- **Build error fixed.** `scripts/verify-channel-consistency.ts` built its sales fixture without the `qty` field the sales type requires. The build type-checks scripts too, so it stopped. The fixture now carries `qty`. Its 9 checks still pass.

## v137: the two channel reports agree; why leads are lost

- **Sales by channel now uses the customer's source** for a sale with no channel of its own, the same rule as channel economics. The two reports had disagreed; they now match.
- **Why leads are lost.** The Lost section on the Leads page counts the reasons typed on lost leads, most common first. Reasons match ignoring case and spacing; a lost lead with no reason counts as No reason given.
- **Tests.** `scripts/verify-channel-consistency.ts` (9 checks) checks the two reports agree on the same sales.
## v136: sale reminders

- **Sale not recorded yet.** A Done booking, or a Won lead, with no sale appears in Notifications. It only reminds; nothing is recorded until a person presses Record as sale.
- **Tests.** `scripts/verify-sale-reminders.ts` (11 checks).

## v135: channel attribution fixed

- **Bug found and fixed.** Channel economics attributed a sale only through its customer's lead source, so booking and won-lead sales that carried their own channel did not count under it. Revenue, contribution and lifetime profit per customer now come from the sale's own channel first, and from the customer's source only when the sale has none.
- **Correction to v133.** v133 said booking sales count in channel economics. That was not true until this version.
- **Known, stated difference.** Sales by channel on the Sales page groups by the sale's own channel only, so a sale with none shows as Not recorded there, while channel economics still counts it under its customer's source.
- **Tests.** `scripts/verify-channel-economics.ts` now 48 checks, including a sale with no customer record and a sale whose own channel beats its customer's.

## v134: Won leads become sales

- **Record as sale on a Won lead.** Pick what was sold, check the price (it starts from the lead's estimate, or the product's price), choose how it was paid, and say how they came in (defaults to the lead's source). The sale and the lead's link are saved in one transaction, as with bookings.
- **Estimates stay estimates.** A lead's estimated value never counts as revenue; only the recorded sale does.
- **Limits, enforced in the data layer.** One sale per lead. A lead with a sale stays Won and cannot be deleted. Deleting the sale puts the lead back to Won with no sale. The sale date must be in an open period. Credit goes on the Sales page.
- **Where it lives.** `lib/leadSales.ts` (rules), `contexts/DataContext.tsx` (`recordLeadSale`, guards on update and delete, sale-delete unlinking), `lib/periodGuards.ts`, `app/leads/page.tsx`, `lib/types.ts` (`Lead.saleId`).
- **Tests.** `scripts/verify-lead-sale.ts` (42 checks). Manual's pipeline section updated.

## v133: channel on booking sales

- **How they came in.** The Record as sale form takes the channel (presets offered: Walk-in, Online, referral and the rest of the list). The sale carries it, so Sales by channel and channel economics count booking sales the same as any other sale.
- **Tests.** `scripts/verify-booking-sale.ts` now 51 checks.
- **Unchanged, by design.** Customers match by name across the whole app (sales, rentals, collections, bookings). Changing bookings alone to customer IDs would break that consistency, so it stays a stated limit.

## v132: deleting a sale frees its booking

- **Deleting a sale** on the Sales page now clears the link on the booking it came from. That booking goes back to "Done, not yet a sale" and can be recorded again. The link clear is in the same batch as the sale delete, so they succeed or fail together.
- **Manual** updated: the limit is now a behaviour, not a caveat.
- **Tests.** `scripts/verify-booking-sale.ts` now 47 checks.

## v131: bookings to sales, with limits

- **Record as sale.** A Done booking is recorded as one sale on the Sales page: service, price charged, and how it was paid. The sale and the booking's link are saved in one transaction, so a booking gets one sale even if two people press the button together.
- **Done, not yet a sale.** A card on the Bookings page lists finished bookings still waiting for their sale (the most recent 50).
- **Limits, enforced in the data layer.** A booking with a sale stays Done and cannot be deleted. The sale date must be in an open period (period lock). Services only, so no stock moves. Price above zero and within 1,000,000,000. Credit is not offered here. A later edit of the booking keeps the link.
- **Limits, stated.** The manual's Bookings section lists every limit, including that deleting the sale later does not clear the booking's link and that bookings match customers by name.
- **Where it lives.** `lib/bookings.ts` (rules), `contexts/DataContext.tsx` (`recordBookingSale`, the guards on update and delete), `lib/periodGuards.ts`, `app/bookings/page.tsx`, `lib/types.ts` (`Booking.saleId`).
- **Tests.** `scripts/verify-booking-sale.ts` (45 checks).

## v130: booking reminders

- **Booking coming up.** A booking still marked booked that starts within the next 24 hours appears in Notifications. Within two hours it is high priority. Done, cancelled and no-show bookings never remind.
- **Where it lives.** `lib/bookingReminders.ts`, wired into `contexts/NotificationsContext.tsx`. Keyed by booking and start time, so a moved booking gets a fresh reminder.
- **Tests.** `scripts/verify-booking-reminders.ts` (27 checks). The customer-quiet wiring check now expects the bookings dependency.
- **Not closed.** A done booking does not create a sale. A sale needs a catalogue product, so this needs a product choice on the booking first.

## v126: branch-restricted staff

- **Work locations** (Team page, owner only). Tick the locations each manager or staff member works at. Nothing ticked means every location, so nothing changes for anyone who is not limited.
- **Scoped data.** A limited person sees sales, purchases, stock adjustments, estimates and sale returns only at their locations. Records with no location count as the default location. The owner is never limited.
- **Location picker.** A limited person is offered only their locations, and a new entry moves off a location they may not use.
- **Where it applies.** In the app's data layer (`contexts/DataContext.tsx`, `lib/locationScope.ts`), not as a database rule. A database-level lock would need rule changes that were not tested here.
- **Tests.** `scripts/verify-location-scope.ts` (41 checks: who is limited, which branch a record belongs to, visibility, the picker, wiring).
- **Manual** and the assistant describe it.

## v125: build fix

- The customer win-back test script set `name` twice, which the build rejects. Fixed.

## v124: test connection for saved keys

- **Test connection** (Integrations page, owner only). Email (Resend) and card payments (Stripe) can be tested. A test makes one read-only call with the saved key from the server and shows Connected, the key was rejected, the service is busy, or it could not be reached, with the time. Keys go in the request header, never the URL, and are never returned to the page.
- **Safe by design.** Owner only, blocked in the public demo, at most 30 tests per business per day, 8 second timeout. A test sends no email, charges no card and changes nothing at the service.
- **Pure logic** in `lib/integrationTest.ts` (which checks exist, the request, the reading of the result). Route `app/api/integrations/test`.
- **Not yet testable:** the other services. They stay saved-only until each one's real connection is added.
- **Tests.** `scripts/verify-integration-test.ts` (29 checks). The existing `scripts/verify-integrations.ts` still passes (28).
- **Not verified live.** The calls to Resend and Stripe need real accounts and keys, which this environment does not have. Run Test connection once with your real keys to confirm.
- **Manual** and the assistant describe it.

## v123: customers gone quiet on Notifications

- **Win-back prompts reach the bell** (`lib/notification-automation.ts`, `contexts/NotificationsContext.tsx`). A customer whose order rhythm has slipped (at least twice their usual gap since the last order, the same "Gone quiet" status the Customers page shows) becomes a "Customer gone quiet" notification. Before this, that prompt existed only on the Customers page.
- **Kept small.** Only slipping customers are raised; "due to reorder" stays on the Customers page. At most 20 at a time, most overdue first. Priority is high at three times the usual gap.
- **No repeats.** Each notification is dated by the customer's last order, so a lapse is raised once and returns only after a new order and a new lapse.
- **Tests.** `scripts/verify-customer-quiet-notifications.ts` (24 checks: the rule, priority, wording, order, cap, end to end from raw sales, wiring).
- **Manual** and the assistant describe it.

## v122: lifetime value by channel

- **Lifetime profit per customer** (`lib/channelEconomics.ts`, Leads > Marketing by channel). For each channel: the profit from every sale, at any date, to every customer the channel has ever brought, divided by how many it has brought. A customer with no sales yet counts as zero, so the figure is cautious.
- **Lifetime profit ÷ cost per customer.** That lifetime figure divided by this window's cost per new customer (CAC). About 3.00 or more is the usual healthy mark; under 1.00 means the customers do not repay the cost of winning them.
- **Unchanged.** The period figures (spend, leads, new customers, sales, profit, back per 1 spent, CAC) are computed exactly as before. The new figures are added beside them.
- **Tests.** `scripts/verify-channel-economics.ts` extended with hand-worked lifetime cases (old sales counted, customers with no sales, a channel with no customers ever).
- **Manual** and the assistant describe the new figures.

## v121: integrations (keys for outside services)

- **Integrations page** (`lib/integrations.ts`, `app/integrations/page.tsx`, Admin menu, owner only). A catalogue of the outside services a business uses (bank feed, card payments, email, WhatsApp, SMS, live exchange rates, accounting software, calendar, online shop), each with its own key fields. Keys are saved per service; secrets show only their last four characters; a service is ready only when its required keys are saved and it is switched on.
- **Security.** `firestore.rules` gives the owner alone read and write, and blocks writes in the public demo. The keys are kept out of the full backup.
- **Not yet connected.** Saving a key does not start a connection. Each service's real calls (for example, the bank feed or card payments) still need its own code path and a real account, and that is the next step per service.
- **Tests.** `scripts/verify-integrations.ts` (28 checks: catalogue, status, cleaning, masking, wiring).
- **Manual** has an Integrations section, and the assistant knows about it.

## v120: build fix

- **Menu group type.** `lib/navPrefs.ts` now allows the "Overview" group that the Agenda item (and Home, Assistant, Notifications) already use in the menu. This was the TypeScript error that stopped the build.

## v119: deal finder

- **Work these next** (`lib/dealFinder.ts`, `components/DealFinder.tsx`, Leads page). Open leads ranked by expected value, each with a 0 to 100 readiness score and plain reasons. Win rate per source is taken from decided leads and used only after three decided leads from that source.
- **Paste a list.** Pasted lines go through the same checks and duplicate handling as the spreadsheet import (`lib/leadImport.ts`) and are added only after a preview. Nothing is fetched from other websites.
- **Tests.** `scripts/verify-deal-finder.ts` (33 checks: parsing, win rates, scores, ranking, paste checks, wiring).
- **Manual** has a Deal finder section, and the assistant knows about it.

## v118: monthly trend on My Profit

- **Monthly revenue and profit** (`components/MonthlyTrendChart.tsx`, My Profit page). Revenue and profit after tax by month, with a straight-line trend (`lib/trend.ts`) and the revenue change from the first month to the last. Reads the P&L figures; it does not compute its own.
- **Tests.** `scripts/verify-trend.ts` (16 checks: trend fit, flat and rising series, too few months, zero base, wiring).

## v117: checklists, timeline, multi-level recipes, staff rota

- **Task checklists** (`lib/tasks.ts`, Delegation page). Up to 30 steps per task. Ticking a step saves at once, and progress shows on the task. Finishing the task is still separate.
- **Timeline** (`lib/timeline.ts`, Agenda page). A Gantt-style view over 14, 30 or 60 days: project spans and task spans from hand-over to due date, clipped to the window, overdue and done marked. Read only.
- **Multi-level recipes** (`lib/bomTree.ts`, production form, product save). A sub-assembly can have its own recipe. The produce form plans the run through every level: the sub-runs to record first, the finished run last, and raw materials still missing. Shared raw stock is counted once across branches. Saving a recipe that loops back on itself, or nests more than eight levels deep, is refused. The one-level suggestions stay as they were, so each "Make" they offer is one run that the stock on hand supports.
- **Staff rota** (`lib/rota.ts`, Rota page, Team menu). One shift per person per day, within the day. Owner and manager set shifts; everyone reads. Hours per person, shifts on approved leave flagged, and copying last week without duplicates. New `shifts` collection (rules, data layer, full backup, restore) and the `manage:rota` permission.
- **Tests.** `scripts/verify-task-subtasks.ts` (23), `scripts/verify-timeline.ts` (27), `scripts/verify-bom-tree.ts` (22), `scripts/verify-rota.ts` (45).
- **Manual** has sections for the rota, and the checklist, timeline and multi-level recipe notes. The assistant knows about all four.

## v116: restaurant tabs

- **Tabs** (`lib/tabs.ts`, `app/tabs/page.tsx`, Buy & sell menu, owner, manager and staff). Open a tab per table, bar seat or takeaway by name. Items are added and adjusted as they are ordered. Closing the tab charges it in one batch: each item becomes a sale with its sales tax taken per line at the item's own rate (or the shop rate), an optional service charge becomes its own sale on a service item (taxed at the shop rate), and a credit tab needs the customer's name. Closed tabs are read-only; open tabs can be deleted by owner and manager.
- **Data and rules.** A `tabs` collection (`firestore.rules`) readable by active members, written by owner, manager and staff, deleted by owner and manager, never in the public demo. Closing is period-guarded by its date and covered by the accountant read-only guard. Tabs are included in full backups and the restore script.
- **Tax helper.** `TaxSettings` is now exported from `lib/tax.ts` and shared.
- **Tests.** `scripts/verify-tabs.ts` (52 checks: names, lines and totals, closing with tax and service charge, credit and validation errors, and wiring).
- **Manual** has a Tabs section, and the assistant knows about tabs.

## v115: new-hire onboarding

- **Start onboarding** (`lib/onboarding.ts`, `app/employees/page.tsx`). On each employee, a six-step checklist made as ordinary tasks due from today (today, +1, +2 and +7 days), assigned to the person by name without a login. Pressing it again adds only the missing steps. Shown to people who manage tasks.
- **Tests.** `scripts/verify-onboarding.ts` (13 checks: due days, blank name and bad date, duplicates, wiring).
- **Manual** and the Employees section explain it.

## v114: agenda, customer history, pipeline drag

- **Agenda** (`lib/agenda.ts`, `app/agenda/page.tsx`, Overview menu, every role). One list of what needs attention in the next 7, 14 or 30 days, overdue first: open tasks due, rentals due back, shipments not yet delivered with an expected date, bookings still booked from today, lead follow-ups (not won or lost), open support cases and open project dates. Each line links to the page that handles it. Reads only.
- **Customer history** (`lib/customerTimeline.ts`, `components/CustomerHistory.tsx`, Customers page). A History button on each customer (owner and manager) opens a newest-first list across sales, deposits and gift cards, rentals, bookings, support cases and payment contacts, matched by name. Reads only.
- **Pipeline drag** (Leads page). Drag a lead onto another stage to move it, using the same stage update as its menu. Only for people who can edit leads.
- **Tests.** `scripts/verify-agenda.ts` (23 checks: window edges, done and resolved items left out, overdue order, a past project start not treated as overdue, customer matching, labels, wiring).
- **Manual** and **assistant** knowledge cover the agenda, history and dragging.
- **Not built, on purpose:** team chat and file sharing (they need live messaging and secure storage rules, which are new product areas); a drawn Gantt chart (the agenda lists project dates instead).

## v113: staff sell gift cards

- **Staff sell gift cards at the counter** (`lib/permissions.ts`, `firestore.rules`, `contexts/DataContext.tsx`, `app/gift-cards/page.tsx`, `components/AppShell.tsx`). New permission `create:giftCard`, granted to staff only. The database rule for customer deposits lets staff create one thing: a received deposit with a gift card code, made by them, with an amount above zero. Staff cannot read deposits, balances or history, and cannot apply, refund, change or delete anything. On the Gift cards page, staff see only the sell form and print. Owner and Manager keep everything else.
- **Known limit.** Staff cannot read the existing codes, so the uniqueness check runs on the owner's side only. A code has about a trillion combinations, so a collision is not a practical risk; the database still refuses a second card with the same code made by an owner or manager.
- **Tests.** `scripts/verify-gift-cards.ts` now has 38 checks, including the staff rule, the permission grant and the page's staff view.
- **Manual.** The gift cards section says what staff can and cannot do.

## v112: gift cards, owner review, loyalty points

- **Gift cards** (`lib/giftCards.ts`, `app/gift-cards/page.tsx`, `contexts/DataContext.tsx`, `lib/customerDeposits.ts`). Sell a card with a generated code, print a voucher, look a card up with its history, use it on any open invoice (a bearer card, so it can pay another customer's invoice), or refund the unused balance in cash. The money is held in the existing customer deposit ledger under the card's own name, so it is a liability until used, counts in cash flow and the deposit total, and cannot go below zero or be used twice. The deposit check gained one narrow exception, `bearer`, used only for gift card balances. Owner and Manager only, matching customer deposits. No expiry date.
- **Owner review** (`lib/reviewQueue.ts`, `components/ReviewQueueCard.tsx`, `reviewMarks` collection, rules, backup). Settings has an amount ("Ask me to check..."). Discounts, expenses, sales returns and cash refunds a staff member, manager or accountant enters above it are listed on the Dashboard until someone marks them checked. Flags only. Expenses now record who entered them (`createdByUid`, `createdByName`); older ones are not flagged.
- **Loyalty points** (`lib/loyalty.ts`, Customers page). Settings has an amount ("Loyalty: one point for every..."). Points are worked out from revenue net of returns and discounts, shown on the customer card and row with how much more is needed for the next point. Nothing is stored.
- **Read-only guard.** The `mark` verb is now a write verb, so `markReviewed` is refused for accountants along with the other writes.
- **Tests.** `scripts/verify-gift-cards.ts` (32 checks, including the bearer exception and code collisions) and `scripts/verify-review-queue.ts` (22 checks: threshold edges, who is flagged, marks, loyalty steps and wiring). The AI coverage check now also expects gift cards, owner review and loyalty.
- **Manual.** Gift cards, Team entries to check, and Loyalty points sections.
- **Not built, on purpose:** gift card expiry and bearer-card refunds to a named person; blocking approvals (the review flags, it does not stop the entry); points redemption as its own button (use a discount with the Loyalty reason); staff selling gift cards (customer deposits are owner and manager only).

## v111: sell again for staff

- **Sell again on the staff sales list** (`app/sales/page.tsx`, `StaffSalesView`). Staff see the same Sell again button on each sale as owners and managers, on both the phone card and the desktop row (not on delivery lines). It opens the sale form prefilled in the same way, and a new sale from the page starts empty again.
- **Tests.** `scripts/verify-repeat-sale.ts` now has 14 checks: the staff list offers Sell again twice (card and row), the staff repeat prefills and resets the form, and a new sale from the staff page is not prefilled.
- **Manual.** The Sell again paragraph says staff see the same button.

## v110: sell again

- **Sell again** (`lib/repeatSale.ts`, `app/sales/page.tsx`). On each sale on the Sales page, a Sell again button opens the sale form prefilled with the same item, quantity, price, customer and payment method, dated today. Notes, serial number, project and invoice are not copied. Delivery lines are not repeated on their own. Foreign-currency sales repeat in their own currency and price.
- **Tests.** `scripts/verify-repeat-sale.ts` (11 checks, including the Sales page wiring). Two mutations (foreign currency dropped, delivery lines repeated) each fail it.
- **Manual.** The Logging Sales section explains Sell again.

## v109: production gaps: scrap, what can be made, what to make

- **Scrap in a run** (`lib/production.ts`, `contexts/DataContext.tsx`, `components/ProduceForm.tsx`). A production run can record units scrapped in the run. Scrap uses up its inputs as well as the good units, and its cost is spread over the good units, so each good unit costs what was really spent to make it. Recorded in the run's notes and in the stock adjustment.
- **Can make now** (`components/ProduceForm.tsx`). The production form shows how many units the stock on hand can make, and which input runs out first.
- **What to make now** (`components/ProductionSuggestionsCard.tsx`, `app/products/page.tsx`). Made items below their minimum stock, sized to the gap and capped by what the inputs allow, most urgent first. Items the inputs cannot make yet are listed with the input that is out. Each Make press asks first and records a normal production run.
- **Manual.** A production section was missing entirely; it now covers the bill of materials, runs with scrap, and both views.
- **Tests.** `scripts/verify-production.ts` (26 checks: scrap, cost per good unit, buildable quantity and its limiting input, shortfalls, capped and ordered suggestions, and the wiring). Two mutations (scrap not consumed, suggestions not capped) each fail it.
- **Not changed:** the period lock already guards production runs; no new write path was added.

## v108: manual covers support due dates

- **User manual** (`USER-MANUAL.md`). The customer support section now explains the optional "Sort it by" date: an open case past that day is flagged past due and counted in the summary, the date cannot be before the case was opened, and it is dropped once the case is resolved.
- **Month lock.** Confirmed as already designed: once a month is closed, nobody (Staff, Manager or Owner) can change it, and only the Owner can reopen it from Settings. No change.
- **Not updated:** the separate how-to guide in Claude Docs. Its link is needed to edit it; the manual already covers shipments, rentals, sales by channel and support due dates.

## v107: one-press supplier orders from "What to order now"

- **Order all for a supplier** (`components/BuyingListCard.tsx`, `lib/buyingList.ts`). Each supplier's group on the "What to order now" card has an "Order all" button, for people who can place orders. It places one order per priced line at the suggested quantity and cost, after a single confirmation that shows the count and the total. Lines marked Wait by the budget are left out, so a press never spends past what was set aside. Lines with no known cost are not ordered and are named, so they can be ordered by hand. Orders are placed one after another; if one fails, the message says how many were placed.
- **Why this and not new agents.** The collections queue with message drafts, the routines and close-the-month checks, and the reorder list were already in the app and run from the records without a model call. This change removes the remaining steps from reordering.
- **Tests.** `scripts/verify-buying-orders.ts` (13 checks: priced lines ordered, Wait lines and no-cost lines left out and named, total, no-supplier case, zero quantity). Two mutations (Wait ignored, no-cost lines ordered) each fail it.
- **Not changed:** no stock, cost or cash figure is written here beyond the purchase orders the person confirms; `addPurchaseOrder` was already unlocked by the period lock.

## v106: rentals

- **Rentals** (`lib/rentals.ts`, `app/rentals/page.tsx`, `contexts/DataContext.tsx`, `firestore.rules`). Things rented out and returned: what went out, who has it, the day out, the day due back, a rate per day and an optional deposit. Owner and Manager record and return; Accountant reads; Staff do not see it. Rent is charged on return counting each day out (both the day it left and the day it came back), so a late return costs more by itself. Damage is a separate charge. The rented item is not stock.
- **Money.** Rent and damage post as ordinary sales under a service chosen for rentals (taxed by the same rule as delivery when sales tax is on). A deposit is recorded as a customer deposit (received the day it is taken, not income); the return refunds what is chosen, and any part kept stays a deposit balance until applied. A return is one batch: the rental, its sales and any refund are saved together or not at all. A deposit cannot be changed once taken; a returned rental cannot be edited or deleted.
- **Period lock.** `returnRental` is dated by its return day, `addRental` only when a deposit is taken (dated that day), and `deleteRental` by the deposit's date when it holds one. `updateRental` is non-money and classified as such.
- **Reminders.** An overdue rental raises a `rental_overdue` notification (`lib/notification-automation.ts`), with its label on the Notifications page.
- **Read-only guard.** `return` added to the mutation verbs in `lib/readOnlyGuard.ts`, so an accountant's return is refused like any other write.
- **Backup and restore.** `rentals.csv` in the backup, the `rentals` collection in the payload, and the restore allow-list.
- **Menu and assistant.** Rentals in the Buy & sell menu (owner, manager, accountant) and in the hidable-pages list; the assistant knows about rentals.
- **Tests.** `scripts/verify-rentals.ts` (67 checks: day counting, rent and late days, input and return checks, deposit balance, overdue, the summary window with both edges, open-list order, and the wiring). Three mutations (day out not counted, window start dropped, refunds ignored) each fail it. `verify-period-lock` and `verify-accountant-readonly` pass with the new methods; `verify-ai-knowledge-coverage` has a rentals needle.
- **Not verified here:** the Firestore rules in the emulator, a full `npm run build` with real packages, and the page in a browser.

## v105: sales by channel

- **Sold through** (`lib/types.ts`, `components/QuickForms.tsx`, `lib/delivery.ts`, `contexts/DataContext.tsx`). An optional `saleChannel` on each sale: Walk-in, Wholesale, Online, Phone / WhatsApp, Agent / reseller, Tender / project, or any name. It is set on the single sale form (under "Add notes / project") and on the multi-item invoice, and the invoice's delivery line carries the same channel. Clearing it on edit removes the stored value. It is separate from marketing channels (`lib/channelEconomics.ts`), which record where a customer came from.
- **Sales by channel** (`lib/salesChannels.ts`, `components/SalesByChannelCard.tsx`, `app/sales/page.tsx`). A read-only card on the Sales page for this month, the last 30 or 90 days, or this year: per channel, sale lines, units, sales value (net of returns and discounts), gross profit, margin and share of sales. Uses the same per-sale economics as the P&L. Sales with no channel are grouped as "Not recorded". Both window edges are included.
- **Sales CSV** (`lib/csv.ts`). A `saleChannel` column.
- **Tests.** `scripts/verify-sales-channels.ts` (38 checks: hand-worked totals, both window edges, case and spacing merge, untagged group, the empty and zero-revenue cases, the day counts of the windows, and the wiring). Two mutations (dropping the last day, case-sensitive matching) fail it. `scripts/verify-batch-ledger.ts` regex widened to accept the new key in the clearing list.
- **Not changed:** no money figure, no period-lock classification (no new write method), no backup or restore allow-list change (sales are already restored as whole documents).

## v101: build fix for the bookings clash check

- **Build error fixed** (`app/bookings/page.tsx`, `setStatus`). The clash check was passed the whole booking with a `status` field, which the function's parameter type does not allow. It now passes only the slot (date, start, length, resource). Behavior is unchanged: the check never read the status.
- **Why the earlier checks missed it:** they ran with module resolution off. This pass type-checked the changed files with the project's own types and stubs for the packages this sandbox does not have. The stubbed run flags the original error and passes the fix.
- **Not verified here:** the full `npm run build` with real packages (the sandbox's npm registry is blocked), and everything listed in v98.

## v104: optional "sort it by" date on support cases

- **Support** (`lib/support.ts`, `app/support/page.tsx`, `lib/csv.ts`). A case can carry an optional date it should be sorted by. An open case past that day is flagged on its card, counts as needing attention, and is counted as past due in the summary. A date before the case was opened is refused, and the date is dropped once a case is resolved. The support CSV has a `dueOn` column.
- **Correction to the earlier list:** support already showed open-case age, cases waiting over 7 days, and average time to resolve. The only thing it lacked was a per-case due date, which this adds.
- **Verified:** `scripts/verify-support-due.ts` (16 checks), and the existing `verify-support.ts` (46 checks). Breaking the open-only rule fails one check.
- **Not verified here:** the page in a browser, and the full build.

## v103: overdue shipments on Notifications

- **Shipment reminders** (`lib/notification-automation.ts`, `contexts/NotificationsContext.tsx`, `app/notifications/page.tsx`). Each shipment still on the way past its expected day raises one "Shipment overdue" notification, with its reference, how many days late, and where it is. Priority uses the same scale as lead follow-ups. Delivered shipments and ones not yet due raise nothing. Owner and manager see it, the same as other reminders.
- **Verified:** `scripts/verify-shipment-notifications.ts` (14 checks). Breaking the late-only rule fails four of them.
- **Not verified here:** the Notifications page in a browser, and the rules in the emulator.

## v102: shipments (imports and deliveries, with proof of delivery)

- **Shipments** (`lib/shipments.ts`, `app/shipments/page.tsx`, rules, `DataContext` `shipments`, Buy & sell menu). A manual record: reference, carrier, supplier, route, stage, the day each stage happened, and proof of delivery (receiver name, optional delivery note or waybill number). A stage needs its date, dates cannot run backwards, and delivery needs the receiver. Moving a shipment back a stage drops the later dates and proof. Nothing is fetched from a carrier, and no money figure changes.
- **Overdue and timing**: anything still on the way past its expected day is overdue and sorts to the top. Summary: on the way, overdue, delivered in the last 30 days (a delivery dated after today is not counted), and average days from departure to delivery.
- **Access**: any active member reads; owner, manager and staff record stages; owner and manager delete. Accountant reads nothing here (same as bookings for the front desk). Backup writes `shipments.csv` and the JSON backup carries the collection.
- **Verified here:** `scripts/verify-shipments.ts` (36 checks). Two mutations (the proof-of-delivery rule, the upper edge of the 30-day window) are each caught.
- **Not verified here:** the rules in the emulator, the page in a browser, and the full build on the real packages.

## v100: bank statement re-import does not double lines

- **Bank re-import** (`lib/bankImport.ts`, `app/reconciliation/page.tsx`). A line is the same when its date, description (case and spaces ignored) and amount to the cent all match. Lines already on the list count whatever their status, so a reviewed line is never put back in front of the person. Matching is by count, so two identical same-day payments in a first import both survive. The import toast reports how many were skipped.
- **Verified:** `scripts/verify-bank-import.ts` (10 checks). A mutation that disables the duplicate check fails four of them.
- **Not verified here:** the page rendering in a browser, and the import against real Firestore data.

## v98: bookings, delegation, and freelancer attendance

- **Bookings** (`lib/bookings.ts`, `app/bookings/page.tsx`, rules, `DataContext` `bookings`). Appointments and reservations with a resource, a start time and a length. A booking that overlaps another on the same resource is refused before it is saved; only booked ones block a slot. Week strip, still-to-come count, deposits held (recorded, not posted), no-show rate, cancellations over 90 days, and a seasonal view by month and weekday once there is a full year of history. Any active member reads; owner, manager and staff write; owner and manager delete.
- **Delegation** (`lib/tasks.ts`, `app/tasks/page.tsx`, rules, `DataContext` `tasks`). Work handed to a team member or an outside freelancer with no login, with an optional due date and an urgent flag. Overdue first, then urgent, then by due date. "Who has what" per person, with open, overdue and done in 30 days. Records only: nothing is sent, nothing in the books changes. Owner and manager write; the accountant reads; only the owner deletes.
- **Freelancer and contractor attendance** (`lib/outsideWorkers.ts`, the manual time form on the Time page). A named outside worker can be logged without a login, under a stable identity by lower-cased name (so Sinhala and Tamil names work). Costed like any entry. The time rules are unchanged: owner and manager already log time for anyone.
- **Plumbing:** backup and CSV (`tasks.csv`, `bookings.csv`), restore allow-list, period-lock classification (not financial), menu entries and hidable-page parity, permissions (`manage:tasks`, `manage:bookings`), AI assistant knowledge.
- **Checks:** three new scripts. Delegation 41 checks, bookings 57, outside workers 21, with the boundaries pinned (7 and 30 day windows, 90-day window, back-to-back bookings, twelve months for the seasonal view). Mutation testing caught every behavioural breakage; the survivors that remain are equivalent (they change no result).
- **Found and fixed while checking:** the bookings listener sat inside the owner/manager block, so staff would have waited on bookings forever (now runs for every role); two numeric values were passed to `Stat`, which takes strings only, and would have failed the production type check (now converted, and a test guards it).
- **Not verified:** the rules in the emulator (none can run here), `npm run build`, how the pages look on a phone, the real Firestore round trip. The pages were checked for syntax and rendered-text escaping only, not for type errors against the full project.

## v95: the rate fills itself in

- **Automatic rate on sales and purchases** (`hooks/useReferenceRate.ts`, `components/ReferenceRateHint.tsx`, `lib/liveRates.ts` `suggestRate`). When a foreign currency is picked on a sale, a purchase or a stock entry, the rate box is filled from today's free reference rate, to four decimals. It is only filled when the box is empty or still on its default "1"; a rate already typed, or one on a saved record, is never overwritten. The box stays editable. A line under it says the figure came from the reference rate and to check it against what was actually paid or received, with a one-tap "Use today's reference rate" once it has been changed. If the rates cannot be loaded, the form works exactly as before. The saved rate is the one in the box, as always: nothing is posted differently.
- **Checks:** 61 checks, including the suggestion math, the fill rules (never overwrites, never refills on typing, nothing for the business currency), the hint wording, and that no record is written by the hook or the hint. 13 of 13 deliberate breakages caught.
- **Not verified:** how the filled box looks on a phone, the live call (sandbox has no network).

## v94: live reference exchange rates

- **Reference rates on Money owed** (`lib/liveRates.ts`, `app/api/fx/rates/route.ts`, `components/FxExposureCard.tsx`, and per-side foreign amounts added to `lib/fxExposure.ts`). The free, keyless daily rates from Exchange Rate API (LKR included) show what one unit of each unpaid foreign currency is worth today, and what the same unpaid balance would be worth at that rate, next to the books. The booked rate is never changed: it is a what-if. If the source is down, the last good copy is served for up to six hours of cache; if no copy exists, the card says the rates are unavailable and shows the booked figures as before. Rates older than two days are labelled as stale. The attribution the free terms require is shown.
- **Sign-in:** the route uses a new `requireSignedIn` (`lib/firebaseAdmin.ts`): any active member of the business, any role, so the accountant sees the box too. It is added to the route-guard allow-list; the guard still requires authentication on every route.
- **Checks:** 43 checks for the rate parsing (bad or partial responses refused, never guessed), cross rates through USD, staleness at the two-day boundary, the reference view, the new per-side units, and the wiring (signed-in only, cache, nothing written, attribution shown, the card hides when there is nothing foreign). 23 of 24 deliberate breakages caught; the one survivor changes no behaviour.
- **Not built, with the reason:** branch-restricted staff (below). Rates are not written into invoice or bill forms: the rate on each booking is still typed by the person booking it, as before.
- **Not verified:** the live call to the rates source (no network in the sandbox; the response shape is tested from a fixed copy of it), `npm run build`, how the box looks in a browser.

## v93: tailor the menu

Found by looking at the product the way a new owner or a new hire sees it: 43 pages in the menu, with no way to hide the ones a business never uses. For a business that does not yet know which kind it is (or one that sells a product one year and a service the next), that is the main obstacle to using it.

- **Tailor your menu** (Settings > Menu, owner only; `lib/navPrefs.ts`, `components/MenuTailoring.tsx`, `components/AppShell.tsx`, new `Settings.hiddenPages`). Five starting points (shop or product, service or consulting, products and services, just the basics, everything), then any page can be ticked or unticked. It applies to the whole business and only hides pages from the side menu and the More sheet: nothing is deleted or locked, hidden pages and links to them still work, Jump to still finds them, and who may open a page is still decided by role. Home, Assistant, Notifications, Settings, Team access and every page on the phone's bottom bar can never be hidden; the page you are on stays visible; a saved list with an unknown or unhideable page is cleaned; a corrupt value shows the full menu. No new rules, indexes or routes.
- **Checks:** 107 checks, including that the hidable and never-hidden lists match the real menu (label and group) page for page and that every phone bottom-bar page is protected, so a future menu change fails the test instead of silently drifting. 17 of 17 deliberate breakages caught.
- **Not verified:** `npm run build`, how the tab looks in a browser.

## v92: the outbound and inbound gaps, and two operating checks

Checked against a long set of notes about running outbound (find, enrich, send, follow up, close), inbound (posts), a BDR's duties and the economics of a business. Most of it was already built (unit economics, payback, concentration risk, seasonality, procedures, routines, collections, commission). Five things were not, and none needs a compliance system or a paid service.

- **Find prospects** (Leads page; `lib/prospectFinder.ts`, `lib/prospectSearch.ts`, `/api/prospects/search`, `components/ProspectFinder.tsx`). The free replacement for a paid maps key: OpenStreetMap (Nominatim to find the area, Overpass for the businesses), no key, account or deposit. Twenty kinds of business; an area is refused if it is larger than about 65 km across; at most 100 results; businesses already in Leads or Customers are marked (same name or same phone or email) and cannot be added; the reachable new ones are pre-ticked; added through the existing `bulkAddLeads` as New leads with source "Cold outreach". Owner and Manager only, never the public demo, 15 searches a day per business (the services are shared and free). Nothing writes without the owner's tick and nothing is contacted. 77 checks against a fake map service (no network in the sandbox), 28 of 29 deliberate breakages caught (the survivor changes no behaviour). Found and fixed while testing: an area of exactly the size limit was refused because of floating-point error.
- **Write with AI** (`lib/aiDraft.ts`, `/api/ai/draft`, `components/MessageButton.tsx`, new `Settings.offerContext`). A first message or follow-up for a lead, or three post ideas (`components/PostIdeasCard.tsx`), drafted by the existing DeepSeek client from a few sentences the owner writes under Settings > What we sell. It is text for the owner to read and send; nothing is sent, posted, scheduled or saved. Same sign-in, role rule, per-kind daily cap and demo cap as the other AI routes; bad requests and a missing description are refused before a message is counted; a draft that is empty or uses false urgency is thrown away and the message given back; every lead message always ends with an easy way to say no; lead notes are passed as quoted data, not instructions. 64 checks, 16 of 16 breakages caught.
- **Sales below cost** (Profit page; `lib/lossSales.ts`). Last 90 days: which items and customers lose money after discounts, how many were discounted; returns and oversold sales are left out so what remains is a pricing choice. Read-only.
- **Weekly scorecard** (Routines page; `lib/weeklyScorecard.ts`). This week so far against last week for sales, sales made, new leads and customers, support opened and resolved, feedback answers and score, plus overdue follow-ups and waiting cases. Read-only, honest that early in the week is a shorter week. 37 checks for these two, 24 of 24 breakages caught (3 survivors found and fixed by adding test data, 1 equivalent).
- **Not built, with the reason:** automatic sending of emails and messages, follow-up sequences that send themselves, closing deals by AI, and auto-posting with analytics (each needs a sending or social-platform account and credentials, and sends in the owner's name with nobody reading it; the notes themselves say "nothing fully automated, controlled enough"). Scraping other websites to enrich leads (against most sites' terms and not testable here). The Python workers from the notes are not part of this tree. A Google Maps key: nothing in this code uses one.
- **Not verified:** `npm run build`, any screen in a browser, the real OpenStreetMap and DeepSeek calls, the Firestore rules (unchanged since v91.1).

## v91.1: customer feedback score (NPS)

The last gap in the "know your customers" loop that needs no outside provider. Leads, sales, support and referrals were all tracked; whether customers would recommend you was not.

- **Feedback page** (Buy & sell menu, `/feedback`; `lib/feedback.ts`). New collection `feedback`, same trust line as the support log (read: whoever reads the books; write: Owner and Manager; delete: Owner, never the public demo). One 0 to 10 answer per row with the customer's own words. Score = (fans - unhappy) / answers over the last 90 days, shown against the 90 days before; under 10 answers it says "first impression" instead of giving a verdict. Lists: low scores nobody has followed up (last 180 days, oldest first), recent buyers not asked in 6 months (from the sales already recorded), and recent fans to ask for an introduction.
- Two new ready-written messages ("Ask how we did", "Reply to a low score"); the ask message carries the easy way to say no like every other first contact.
- No new permission (it uses `manage:support`), no new index, no change to any figure in the books. Included in the backup, `feedback.csv` and the restore script.
- 66 checks (`verify-feedback.ts`), 18 of 18 deliberate breakages caught; message test now 66, AI-coverage test has a Feedback needle.
- **Publish `firestore.rules` again** (a third new block). Everything else in the v91 notes below still holds.

## v91: merge with the parallel v89 (stress test) and the remaining gaps

Asked to combine the externally built v89 with this tree, bring in what the eight business areas and the marketing charts still lacked, and leave nothing in "still not built" that does not need an outside provider. The external zip and this tree both descend from v88: the external one added only the **Stress test** on Financial health (`components/StressTest.tsx`, `lib/stressTest.ts`, `verify-stress-test.ts`, two lines in `app/health/page.tsx`, one line in each of the AI prompt, BUSINESS-VALUE and USER-MANUAL), and no other file in it differed from v88, so the merge is those files copied in and those three doc lines applied. Its 23 checks pass here.

- **Payslip, overtime and leave** (Employees page, Owner only; `lib/payslip.ts`, `lib/leave.ts`, `components/PayslipCard.tsx`, `components/LeaveCard.tsx`). A payslip is worked out on screen from the employee's pay and the month's extras (overtime hours x hourly rate x a rate you set, allowances, commission, no-pay days, other deductions) and printed; nothing is stored. EPF is on basic plus commission plus allowances, not overtime. The recurring payroll expense is unchanged; overtime and allowances can be recorded once per person and month (a fixed expense name guards a second press). Leave is a new owner-only collection `leaveRecords`: paid kinds count against `Employee.leaveDaysPerYear`, no-pay days are offered as a suggestion on the payslip, and a spell counts in the year or month it starts. 57 checks, 19 of 19 deliberate breakages caught.
- **Marketing by channel** (Leads page; `lib/channelEconomics.ts`, `components/ChannelEconomicsCard.tsx`). New optional `Expense.channel` on Marketing expenses (also listed in `EXPENSE_CLEARABLE_FIELDS`, otherwise removing a tag would not save). Per channel over 1, 3, 6 or 12 months: spend (counted by month exactly as the P&L counts it), leads, new customers, cost per lead, CAC, sales and profit from the channel's customers, and profit per 1 spent. No rules change (the expenses rule does not whitelist fields). 37 checks, 13 of 13 caught.
- **Customer support log** (Buy & sell menu, `/support`; `lib/support.ts`). New collection `supportCases`, same trust line as the Playbook. Open, urgent, waiting over 7 days, average days to resolve over 90 days, repeat customers. 46 checks, 16 of 16 caught. Staff cannot read it (a staff-readable rule needs query-constrained reads that cannot be tested without the rules emulator): they tell the owner or manager.
- **Message templates** (`lib/messageTemplates.ts`, `components/MessageButton.tsx`) on leads, customers and support cases: ten ready-written messages (first hello, follow-up, qualifying questions, quote chase, win-back, thank-you, referral ask, support check-in and update) that open in WhatsApp or the mail app, or copy. Nothing is sent or tracked. First-contact messages carry an easy way to say no, and a test fails if any message uses false urgency or scarcity. 59 checks, 9 of 9 caught.
- **Commission on profit** (`Employee.commissionBasis`). Net contribution margin of the login's sales in the month of the sale (already net of returns and discounts, so they are not subtracted twice); a losing month earns 0; no profit figures known earns 0. The default and every existing employee stay on sales. 14 new checks (66 in all), mutation-checked.
- **Also:** the lead stage **Qualified** and seven more source names (v90.1, v90.2), folded into the AI assistant's knowledge and its coverage test (one pinned phrase in that test had to change with the new stage).
- **Still not built, on purpose:** sending campaigns or tracking opens and clicks (needs an outside email or messaging provider), prospect scraping of other sites (v92 adds a free map search instead), staff-readable Playbook and support (rules emulator), tax structuring, contract drafting, bank feeds, automatic card billing, self-serve signup, a combined view across several businesses.
- **Checked here:** 118 of 130 verify scripts pass; the other 12 cannot start because this machine cannot install firebase, firebase-admin or papaparse (the same 12 as before any of these changes). Every new library type-checks under `--strict`; every edited file parses. **Not verified:** `npm run build`, any screen in a browser, the new rules blocks in the emulator, real Firebase reads and writes. **Publish the rules first** (DEPLOY-CHECKLIST "v90 to v91").


## v90.2: more lead-source presets

Compared against inbound/outbound marketing charts (search/SEO, content, email, ads, influencer/affiliate, events and trade shows, print/radio/TV). The source field was already free text, but the dropdown only listed nine channels. Added presets in a new "Content & search" group and to Paid and Physical: Search / SEO, Content / blog / video, Email / newsletter, Search / display ads, Influencer / affiliate, Print / radio / TV, Event / trade show. Presets only: nothing existing changes, conversion and customer-by-source tables work per label as before, no rules change.

## v90.1: a "Qualified" lead stage

The sales screenshots stress vetting a lead (budget, authority, need, timeline) before spending a proposal on it. Leads had no step for that. Added one stage, "Qualified", between Outreach sent and Following up. Existing leads keep their stage. Win rate and conversion only count Won and Lost, so no figure changes; no rules change (stage is not validated in the rules). Tests that touch leads pass.

## v90: Playbook (procedures and contract dates) and bulk lead import

Asked whether every part of running a business is covered (getting customers, money, operations, customers, employees, tech, legal, reporting) and to systemize every business run on Balancr. Checked against the code. Two real gaps remained that needed no outside provider, and both are built here: the written side of operations and contracts, and loading a prospect list for outbound work.

- **Playbook** (Team menu, `/playbook`, `lib/playbook.ts`, collection `playbook`). Two kinds of entry that matter, plus "other". A **procedure** has steps, an owner and an optional review schedule (every N days, counted from the last review or from the day it was written); it is flagged "Review due" in the 14 days before and "overdue" after, and "Mark reviewed today" restarts the clock. A **contract** has who it is with, start, end or renewal date and days of notice; decide-by = end less notice; "Act now" from the decide-by day to the end, "ending soon" in the 30 days before it, "Ended" the day after the end date. Entries needing action rise to the top, then coming up, then the rest. Plain text (20,000 characters) and dates only: it changes no figure, drafts and checks no legal document, and says a contract entry is a reminder, not the agreement. Printable (everything typed is escaped).
- **Who and where:** Owner and Manager write (`manage:playbook`), only the Owner deletes, the view-only Accountant reads. **Staff do not load or see it** (a staff-readable procedure needs a query-constrained read rule that cannot be tested without the rules emulator; print an entry for anyone without a login). One additive rules block copied from `stockOuts`. An edit replaces the entry (so a removed end date is really removed) and keeps the author and the original creation time. In the full backup, restorable, and `playbook.csv` in the backup zip. Audit-logged.
- **Bulk lead import** (Import / export, owner, `lib/leadImport.ts`, `bulkAddLeads`). A CSV of prospects becomes New leads. Column names match loosely (business name or company for the name, phone or mobile or email for the contact, source, estimated value, next follow-up date); money like "Rs. 1,200" or "1,200/-" is read; dates must be year-month-day because day/month is ambiguous; stage columns are ignored on purpose. Duplicates (same name and same contact, ignoring case, spacing and punctuation) are skipped and counted, never added twice, also within the file. All or nothing: any row problem adds nothing and lists the rows. At most 500 a file. Written in batches of 400 with one audit line, with the same permission as adding one lead, and no rules change (the existing leads rule already allows it). The app's own leads export (new) imports back. Balancr does not find or collect prospect lists.
- **Tests:** `verify-playbook.ts` (56) and `verify-lead-import.ts` (39). Mutation-checked: 15 of 15 and 11 of 11 deliberate breakages caught. One existing check (`verify-customer-deposits`, which pins the order of the collection lists) caught my first placement of the new collection and passed after I moved it to the end of the lists.
- **Checked here:** the new library files type-check under `--strict`; every edited file parses; 113 of the 125 verify scripts pass (the other 12 could not start because this machine cannot install packages such as firebase and papaparse).
- **Not verified:** `npm run build`, either screen in a browser, the new rules block in the emulator, and a real import. **Publish the rules first** (see DEPLOY-CHECKLIST), then run the "try these once" list.
- **Not built, and why:** payslips, leave and overtime (more payroll than this stage needs; EPF/ETF, commission and pay are already booked); a customer support or complaints log (the Playbook holds the procedure, the Collections diary holds calls to people who owe money); per-channel marketing spend and cost per customer (needs an expense field, so a rules change); staff-readable procedures; email or WhatsApp campaigns and any collecting of prospect lists (outside the no-external-systems scope).

## v89: pipeline coverage and a rate-rise what-if

Checked against a larger set of business-fundamentals cheat sheets (cash, CAC/LTV, unit economics, sales pipeline, incentives, capital, risk). Nearly everything was already built. Two small, read-only gaps were worth closing; both are arithmetic over figures already in the books.

- **Pipeline coverage** (Leads page, `lib/pipelineCoverage.ts`). Open leads' estimated value divided by what is still needed to reach THIS month's revenue target (target from Statements > Budget, less revenue booked so far this month). Shown as "N.N x cover", healthy from 3x, thin from 1x, short below 1x (cannot reach the target even if every lead closes). Shown only when a target is set, it is not yet met, and at least one open lead has a value (silence is never shown as 0x). Leads carry no close date, so it compares all open leads with this month's gap, and the page says so: a funnel check, not a forecast. Revenue so far is floored at 0 so a refund-heavy month cannot make the gap larger than the target. Owner, Manager and Accountant only (`view:reports`); Staff never see financial figures.
- **What if interest rates rise?** (Loans page, `components/RateRiseCard.tsx`, `lib/rateRise.ts`). For each active loan, the payment on the balance still owed over the payments still to come at the current rate and at +1, +3 and +5 points: extra per month, new total, % extra, and extra interest to the end (the principal is the same either way, so the whole difference is interest). Names the loan that suffers most. A negative recorded rate is floored at 0. For loans the lender can reprice; a fixed-rate loan is unaffected, and the card says so. Changes nothing; if a lender does reprice, the owner edits the loan's rate and every statement follows.
- **Tests:** `verify-pipeline-coverage-and-rate-rise.ts` (37), including a cross-check of the extra interest against the app's own amortization schedule and the day-a-payment-falls-due boundary; mutation-checked 11 of 11 (one survivor on the first run, the payments-left boundary, now pinned).
- **Checked here:** the new library files type-check under `--strict`; the edited pages parse; 111 of the 123 verify scripts pass (the other 12 could not start because this machine cannot install packages such as firebase and papaparse, the same 12 as before this change).
- **Not verified:** `npm run build` (no packages here), the two screens in a browser, and the rules emulator. Run the build once. No rules change, no new collection, no new stored field.
- **Judged and not built:** profit-based commission (changes the employee record, rules and backups); written SOPs / process storage (a new collection, so a rules change I cannot test here; the best first feature after launch if the software becomes the business); customer satisfaction scores (needs survey responses, not the books); hedging, tax structuring, contracts and IP (outside the no-external-compliance scope).

## v89 (parallel branch, merged in v91): a stress test on Financial health

The one remaining item that fits the risks you keep naming (currency moves, energy and import costs, "models that collapse when one assumption changes", risk of ruin). Several rounds of checking found nothing else both missing and valuable.

- **Stress test** (Financial health page, `components/StressTest.tsx`, `lib/stressTest.ts`). Two dials, sales change (%) and costs change (%), run on the average of the last (up to) 3 COMPLETE months. Shown now versus in the case: monthly profit, net margin, break-even sales, sales above break-even, and how long cash lasts when the case is a loss. Three one-tap presets (a bad stretch, costs +15%, lose 30% of sales); typed values are clamped (sales -90..+100, costs -50..+100).
- **The model, stated on screen:** sales volume moves revenue and the costs that follow volume (cost of goods, variable costs); a cost rise lifts cost of goods, variable costs and operating expenses; the selling price stays put; interest, depreciation and other items are held; the baseline adds up to the real profit exactly (the leftover between revenue and profit is carried as "other costs"); cash changes by the change in profit, divided into cash on hand. A model, not a forecast, and it says so.
- **Read-only:** saves nothing, changes no books, no rules, no new collection.
- **Tests:** `verify-stress-test.ts` (23): hand-worked cases (sales -20% and costs +10% turn 10,000 profit into -5,300, break-even 75,000 into 95,588, 50,000 cash into 6.8 months), each shock alone, never-breaks-even, negative fixed costs, cash flow of exactly zero, clamping, the baseline rules (complete months only, last three), and the same contribution ratio as the app's own break-even. Mutation-checked 17 of 17 after two edge cases and one wiring check were added.
- **UI/UX (static):** labelled inputs, 40px preset buttons on a phone, a table that scrolls sideways, theme colours only; not viewed in a browser.
- **Not verified:** not viewed in a browser or run on real data.

## v88: Routines, and a UI/UX pass on everything added since v78

Asked, with more than a week to spare, to implement what is necessary and very valuable without scope creep, and to double-check UI/UX. The assessment of "can Balancr be the backbone for running every business" found one worthwhile gap: nothing said whether the business was running its rhythm. Built; everything else judged scope creep.

- **Routines** (Money menu, `/routines`, `lib/routines.ts`, `lib/useRoutineChecks.ts`). Six fixed checks, each decided from the records, not ticked by hand: cash counted in the last 7 days; every overdue customer has a collections-diary entry in the last 7 days; no supplier or general bill past due; no bank line unmatched for over 7 days; stock counted (a count-correction adjustment) in the last 35 days; last month closed through the period lock (from the 8th of the next month). A check appears only if the business uses what it checks; "Not set up" (the month close before the lock is ever used) is shown but never counted as a problem. Needs-attention first, a one-line summary, an Open button to the page where the work is done, a one-line hint on the Dashboard only when something needs attention.
- **Owner and Manager only,** because the checks read data Staff and Accountants cannot see (an Accountant would be told a cash count is missing when they simply cannot see it). Read-only: writes nothing, needs no rules, no new collection. Not a task manager and not a procedures tool, on purpose.
- **UI/UX pass (static, no browser here)** over every screen added since v78: inline text buttons (Bill it, Cancel, Use it, Use price breaks) were small tap targets on a phone and now have a 40px minimum height below the `sm` breakpoint (the older wholesale "Use it" too, for consistency); the count sheet's number boxes are taller; every input and select added has a label or aria-label; no hard-coded colours; the one table added scrolls sideways; the Routines page stacks on a phone with a 44px Open button. Nothing could be viewed, so layouts remain unverified by eye.
- **Tests:** `verify-routines.ts` (47: every threshold at its exact boundary, what appears when, the month close across a new year, bad input, the role limits and navigation), mutation-checked 14 of 14. The manual and the AI assistant's notes cover it.
- **Not verified:** none of the screens added since v78 has been viewed in a browser or run against real Firestore; the rules have not run in the emulator.
- **Judged scope creep, not built:** a task manager, written procedures (SOPs), a view across several businesses of your own (an owner login belongs to one business; separate entities are better kept in separate books).

## v87: expected pipeline value and revenue drivers

The two small items left from checking your cheat sheet against the app. Both read-only, both from figures already in the books.

- **Expected pipeline value** (Leads page, `lib/pipelineValue.ts`). Beside "Worth ~X if it all closes" (the best case) it now shows "about Y at your Z% win rate (N decided leads)": the open leads' estimated values times how often this business has actually won the leads it decided (won over won plus lost, the same conversion the page already shows). One overall rate on purpose: a rate per stage needs numbers the owner would have to invent. Shown only after 5 decided leads; a 0% rate is shown as 0.
- **What drives your revenue** (Customers page, `lib/revenueDrivers.ts`). The last 12 months as customers x orders each x average order = revenue, compared with the 12 months before: "customers +50%, orders each +11%, order size +20% = revenue +100%", and which lever moved most. The product is exact (revenue divided into orders, orders into customers). Orders are invoices (a late charge is not one), revenue is before tax, names match ignoring case and spaces. Sales with no customer name cannot be counted by customer, so their share is reported separately instead of silently missing.
- **Read-only:** nothing posted, stored or changed; Staff do not see the Customers cards. The AI assistant knows both.
- **Tests:** `verify-pipeline-and-drivers.ts` (20), mutation-checked 12 of 12.
- **Not verified:** not viewed in a browser.
- **Not built, consciously:** a win rate per pipeline stage (needs invented numbers); ROIC (return on capital employed gives the same signal); employee attendance and performance (an HR product).

## v86: a net margin target on the dashboard

The one small gap the profitability review found: Profit First sets money aside but nothing tracked the business against a margin it was aiming for.

- **Net margin target** (Settings, `lib/marginTarget.ts`, Dashboard). One optional number (0 or empty = off). The Dashboard then shows the last three complete months and the running one: net margin (net profit before tax over revenue, the same net profit as the Profit & Loss) with how many points above or short of target, coloured. After two complete months in a row below target it says so and points at the Profitability page and recurring costs. A month with no sales has no margin and is skipped, never counted as a miss; the running month is shown "so far" and never counts toward the warning.
- **Read-only.** Changes nothing in the books. One new optional setting, no rules change (settings were already owner-written, no field list).
- **Tests:** `verify-margin-target.ts` (15), mutation-checked 6 of 6. The AI assistant knows the setting.
- **Not verified:** the Settings field and the Dashboard card were not viewed in a browser.

## v85: final audit, one correction, no new features

A last check of the business value by running realistic businesses through the real calculation code, and re-reading my own earlier claims against it.

- **A wrong claim corrected.** I had said (v81, in the changelog, the count sheet and the AI assistant's notes) that a stock count changes quantity only and "nothing posts to profit". That was wrong. A stock adjustment reaches profit through the stock shrinkage line: a shortage is a loss at average cost, extra stock a gain. The engine was right and is unchanged; the words were wrong. The count sheet now shows "effect on this month's profit" with the sign, the code comments, the AI notes and the v81 entry are corrected, and a test pins the real behavior.
- **End to end, four businesses** (`verify-business-models.ts`, 12 checks, hand-worked arithmetic through the real engine): a reseller with a stock count (profit 500 after 100 net shrinkage), a dropshipper who logs the sale before the purchase (cost 60, profit 90), a service business with a staged-billing milestone and a billed late charge (receivables 50,500, no stock), and goods bought on supplier credit with a credit sale and damage (profit 330, payables 1,000, receivables 360). In every one the Balance Sheet balances.
- **Efficiency at scale** (500 products, 100,000 sales, 5,000 customers, run on this machine): stock ledgers with re-costing 0.4 s; order rhythms 0.5 s plus 0.1 s for the summary (only on the Customers page); tax by rate 0.08 s. No regression against the earlier ledger budget.
- **Deploy checklist** now lists what v79 to v85 need (publish the rules first or with the release; nothing breaks if late) and the tests to run once on a test business.
- **Launch-readiness check** run here: it fails only on environment variables that this machine does not have (Firebase keys, admin passcode, service account, support email). Nothing in the code.
- **Still not verified:** nothing has been viewed in a browser or run against real Firestore, and the rules have not run in the emulator. This audit cannot change that.

## v84: a sale logged before its purchase is re-costed when the purchase arrives

The one item from the not-built list that was both very valuable and safe to test here. A week remains, so this core change is made now, with room to test on real data.

- **The problem (since v82's note).** The average-cost ledger costs a sale at the average at that moment. Sold before bought, that is zero for an item never bought, or a stale figure, and it stayed wrong for good: the purchase's cost never reached any sale, profit was overstated, and the next sale's average was inflated (the late purchase's whole cost landed on the few units left).
- **The change** (`computeProductLedger`, average costing). Units sold before they were bought are remembered, oldest first, with their provisional cost. When a purchase arrives, the units it covers are re-costed at THAT purchase's cost (the sale's cost and cost per unit are updated), and only the units it adds beyond them go into the weighted average. A customer return or count correction that covers owed units first stops them waiting. With no shortfall the maths is exactly the old weighted average, so a business that buys before it sells sees no change in any figure.
- **What moves, honestly:** only the cost and profit of sales that were sold before their purchase was recorded, and only once that purchase exists. Because the cost belongs to the sale, an EARLIER month's profit can change if the purchase is entered later (the closed-month lock stops editing records, not recalculation). Until the purchase exists the sale stays provisional and flagged.
- **Dashboard text** for "You've sold more than you have" now says so; the AI assistant knows it. "Buy to order" (v82) still records the purchase first, which keeps the order of entry honest and the stock right at once.
- **Batch costing** (the other costing method) is not changed here: it already tracks units owed against a batch (v69), and was not touched.
- **Tests:** `verify-oversold-recost.ts` (18): nine hand-worked cases (never bought; bought before and sold early; partly covered; a bigger purchase than the shortfall; two early sales settled oldest first across two purchases with everything bought accounted for; no shortfall unchanged; return; loss adjustment; a smaller purchase than the shortfall) and conservation (everything bought is cost of sales or stock, to the cent) over 400 random sequences. Mutation-checked: 11 deliberate breakages, all caught (one needed a new case). The 116 other scripts, including the books fuzz test, pass unchanged; the one that pinned the old behavior (v82's buy-to-order check) now expects the re-cost.
- **Not verified:** not run against real data. Worth one look on a test business: sell an item you have not bought, check the profit, record the purchase, check the profit again.
- **Not built, consciously:** re-costing under batch costing; gift vouchers (a prepaid customer deposit already does this), loyalty points (marketing, no trigger).

## v83: customer order frequency

Asked whether logistics (physical and digital costs) and customer order frequency are covered. Checked against the code:
- **Logistics, already covered:** landed cost on purchases (freight, customs, other spread over the units and fed into average cost), delivery charged to the customer as a real line on the sale, and what delivery costs YOU as a per-unit or percent variable cost on the delivery item (set on purpose as a separate decision). **Digital costs, already covered the same way:** a per-unit or percent-of-sale variable cost (hosting or API cost per order, payment fees, licences) that reduces contribution margin, or into cost of goods when ticked, plus recurring subscriptions as recurring expenses; digital goods and services carry no stock.
- **Order frequency, was missing** (retention compared whole quarters only; nothing said how often a given customer orders). Built.

- **Ordering rhythm** (Customers page, `lib/orderFrequency.ts`). Per customer: orders, the typical gap between order days (the median, so one holiday does not distort it), days since the last order and the expected next date. A customer is Due to reorder past their usual gap and Gone quiet past twice it, with their usual order size; the card lists them, worst first, and shows the shop-wide picture (share of last year's customers who ordered on more than one day, orders each, typical gap).
- **What counts as an order:** one invoice (goods plus delivery is one), or a lone sale; two orders on one day are one order day for the rhythm; billed late charges are not orders; names match ignoring case and spaces like every other customer figure. A customer is never flagged inside a week. Two order days give a gap that is marked "based on two orders only". One order shows as new, or one-off after 90 days.
- **Read-only:** nothing stored, sent or changed. Hidden from Staff (shown to Owner/Manager/Accountant as the other customer money figures are). The AI assistant knows it.
- **Tests:** `verify-order-frequency.ts` (22), mutation-checked: every breakage caught except one equivalent mutant (the floor of 1 on the gap, which distinct days already guarantee).
- **Not verified:** not viewed in a browser.
- **Not built:** a per-customer "cost to serve" (support and digital cost allocated to each customer): costs are tracked per item and per order, not per customer; contribution margin per customer already reflects per-order costs. No trigger yet.

## v82: selling before buying (dropshipping, made-to-order, pre-orders)

Found by probing the business models you named (productized businesses, anything you might run) against the code, not by assuming. Recurring-revenue metrics (MRR, ARR, added/lost, churn, retention, LTV, CAC, payback, unit economics), retainers, staff utilization, and payment-fee costs (a percent-of-sale variable cost) were already covered. One real gap: the stock ledger replays events by date and entry time, and a sale logged BEFORE its purchase is costed at the average cost at that moment, which is zero for an item never bought. A dropshipper who logs the order and then the supplier purchase saw 100% margin on every order and the cost was lost for good.

- **Buy to order** (sale form, `lib/buyToOrder.ts`). When a new sale is for more than is in stock, Owner/Manager now see, next to "log as a lost sale", a tick: "I am buying the missing N from my supplier for this order". Tick it, type the supplier's price (and supplier, optional) and saving records the purchase of exactly the missing units FIRST, then the sale. The ledger then sees the stock arrive and leave, so the sale's cost and profit are exact and nothing is flagged oversold.
- **No change to the costing engine.** This fixes the order of entry, not the maths, so no existing figure moves. The test shows both cases on the real ledger: purchase first gives cost 60 on a 3 x 50 sale (profit 90); the same purchase logged after gives cost 0 and an oversold flag.
- **Limits, stated plainly:** only for a new sale (never an edit), only Owner/Manager (Staff never see stock), one product at a time (the multi-item invoice form does not have it); the purchase is recorded as paid in cash, so if the supplier is paid later edit that purchase to credit; the sale's profit preview on the form still uses the old cost until saved. (Superseded in v84: a sale logged before its purchase is now re-costed when the purchase is recorded.)
- **Tests:** `verify-buy-to-order.ts` (11), mutation-checked 5 of 5.
- **Not verified:** not viewed in a browser or run against real Firestore.
- **Built later, in v84:** automatic re-costing of an already-oversold sale when its purchase arrives later.

## v81: physical stock count

Found by checking common SME features rather than assuming: stock could only be corrected one item at a time (the one-item adjustment form), with no way to walk the shelves and record a whole count.

- **Count stock** (Products page, `components/StockCountSheet.tsx`, `lib/stockCount.ts`, `recordStockCount`). A sheet of every active goods item with the books' quantity; type what is really there (blank = not counted, 0 = the shelf is empty), see the difference and its value at average cost, record every difference at once. Searchable; with several locations it counts one location at a time.
- **Safe by construction.** The difference is worked out when you press Record, against the stock on hand at that moment, not what the screen showed (a sale made while counting is not counted twice). Differences are ordinary count-correction adjustments, the same record the single-item form makes (CORRECTED in v85: they do reach profit, as stock shrinkage at average cost; this line first said "quantity only", which was wrong). One batch, all or nothing; at most 400 differences per batch (refused in words, count one category at a time); services refused; closed-month lock and the Accountant read-only guard cover it; same permission as a single adjustment.
- **Tests:** `verify-stock-count.ts` (26), mutation-checked 8 of 8 (the first run let one through, the location branch; now pinned).
- **Not verified:** not viewed in a browser or run against real Firestore.

## v80: several businesses on one login

Closes the last gap that was not an external provider. Done without a server route and without touching how any permission is decided: access to a business is, and stays, the person's member record inside it. The pointer (`memberships/{uid}`) is still written once and never changed; this only lets a person CHOOSE among businesses they are already an active member of.

- **Join an invite while already signed in** (`/join`). A login that already belongs to a business now sees "Add this business to my login" instead of "sign out first". It records the member record and accepts the invite exactly as before, but does not write a second pointer, then bookmarks the business at `memberships/{uid}/linked/{businessId}` and opens it. A login with no business yet follows the original path unchanged.
- **Business switcher** (`components/BusinessSwitcher.tsx`, sidebar and mobile header). Rendered only for a login in more than one business, so a single-business login sees nothing different. Switching is a full page load (drops every listener of the old business at once).
- **The choice** (`lib/activeBusiness.ts`, AuthContext) is kept per login in this browser; none stored means the pointer's business, as before. If the chosen business no longer has an active member record for the person (removed, deactivated, unreadable) the choice is dropped and their own business is shown again, so nobody is stranded.
- **Server routes honour it, safely.** All business-facing API calls (AI chat, sessions, auto-confirm, price suggestion) send `x-business-id`; the server uses it only after the same checks against THAT business (active member record, role, suspension). A header naming a business the caller does not belong to fails like any lost access; a malformed header falls back to the pointer. Without this, the assistant would have worked on the wrong business after a switch.
- **One new, additive rules block** (`memberships/{uid}/linked/{businessId}`): the person reads and removes their own list; a link can be created only to a business where they are an active member; never edited. Publish `firestore.rules` with this release. If a rules deploy has a syntax error Firebase refuses it and the old rules stay live.
- **Tests:** `verify-active-business.ts` (29), mutation-checked (6 of 6 caught): the choice and its fallback, the list, the server's header handling and that membership is checked after it, the rules block, the pointer rules unchanged, and every client API call sending the header. `rules-smoke.mjs` gained 5 checks (not runnable here).
- **Not verified:** none of this was run in a browser or against real Firebase (no emulator here). Test with two real accounts: invite an existing login to a second business, accept, switch both ways, remove the member in the second business and reload (should land back on the first).
- **What it does not do:** it joins existing businesses by invite (Owner is not an invitable role), so it covers an accountant or operator across clients and a person who is Manager in a second business, not creating a second business of one's own; that needs the server-side provisioning path and the trial pipeline, and stays an operator action.
- **Not built, needs the rules emulator:** branch-restricted staff (read limits per location inside a business), because a mistake would expose or hide books. **Not built, needs an external provider and credentials:** card payment, bank feeds, live exchange rates.

## v79: the buildable gaps closed (tax by rate, price breaks, serial/warranty, late-charge billing, health check)

Asked to leave no gap that needs no external compliance system and cannot break the app. Each item below is read-only or an owner's tap; none posts anything by itself.

- **Tax summary by rate** (`lib/taxByRate.ts`, Statements > Tax summary). Sales and stock purchases split by rate, plus a "No tax charged" row. Sale and purchase lines store the tax, not the rate, so the rate is read back: a line belongs to a known rate (shop rate, any item's rate) when its tax matches within one cent; otherwise it shows under the rate it works out to, never forced into a wrong one. Other expenses are in the totals but not split. Totals are unchanged.
- **Quantity price breaks** (`lib/priceTiers.ts`, `Product.priceTiers`). `10:90, 50:80` on the product; the sale form and the multi-item invoice offer the matching price as a one-tap suggestion (shop currency only), never applied by itself; the usual-price warning stays quiet at a break price. Mirrored into the Staff catalog, a real delete when emptied, CSV column `priceTiers` (`10:90; 50:80`) with row-level errors.
- **Serial / IMEI and warranty** (`lib/warranty.ts`, `Sale.serialNo`, `Product.warrantyMonths`). Serial box on the sale form (up front for an item with a warranty, under more details otherwise) and per line on the invoice form; serial and warranty end on receipts and invoices; "Find by serial number" on Sales matches ignoring case, spaces and dashes, 3+ characters, over every sale. CSV column `warrantyMonths`. Information only; no figure uses it.
- **Bill a late charge** (`recordLateFee`, `Sale.lateFeeForKey`, Receivables "Bill it"). One tap records the charge so far as one credit sale of a service item to the same customer. The amount is worked out inside from the live receivable, less what earlier charges billed on that invoice, so a stale screen or double tap cannot bill the same days twice; a charge cannot itself be charged a charge; opening balances are excluded; service items only; Owner/Manager; closed-month lock applies. Still never automatic.
- **Health check in the admin console** (`lib/healthSnapshot.ts`, `meta/healthSnapshot`). The owner's own app writes seven plain fields once a day while open (the maths stays in one place); the account list flags: app not opened for over 14 days, half or more of what is owed overdue, cash runway under 3 months, a loss last month. **Needs one new, additive block in `firestore.rules`** (owner read/write only, never the demo), which must be published with this release; until it is, the write fails silently and the list shows "No health summary yet". Excluded from backups on purpose (derived).
- **Guards fixed on the way:** the Accountant read-only guard caught the first name of the late-charge method (renamed `recordLateFee` so it is covered); the tax-sites guard caught a direct read of the shop rate (now `taxRatePctFor`); backup-coverage now lists the derived summary as excluded; the batch-ledger source check accepts the extra clearable `serialNo`.
- **Tests:** `verify-tax-by-rate` (13), `verify-price-tiers` (18), `verify-warranty` (19), `verify-health-snapshot` (19), `verify-late-fee-billing` (20), `verify-catalog-mirror-fields` (17), all mutation-checked; the one survivor (the one-cent tolerance) now has a test that kills it. `rules-smoke.mjs` gained health-summary checks (not runnable here).
- **Not verified:** nothing viewed in a browser or run against a real Firestore; the new rules block has not been run against the emulator (it copies an existing block, and a test checks the file's braces balance). Publish the rules and try one late charge, one serial sale and one price-break sale on a test business.
- **Known, minor:** an overdue late-charge invoice can still show an advisory late charge in the WhatsApp reminder text; billing a charge on it is refused.
- **Not built, cannot be verified here:** several businesses on one login and branch-restricted staff (both change who may read whose data in the rules; no emulator here). **Not built, needs an external provider and credentials:** card payment, bank feeds, live exchange rates.

## v78: Record in books on a project milestone

Closes the v77 warning properly. Asked to leave no gap that needs no external compliance system and cannot break the app.

- **Record in books** (`lib/milestoneSale.ts`, `recordMilestoneAsSale` in DataContext, Projects > Progress-billing schedule). One tap on a milestone records it as an ordinary sale: one service item, quantity 1, tagged to the project, customer = the project's client, dated today, on credit terms, taxed at the item's own rate. The owner says whether the milestone amount already includes tax (the form shows price + tax = owed before saving). A milestone already marked paid also records its payment (bank transfer, cash or card), so it is not left in money owed. Sale, payment and the link on the milestone are saved in one batch: all or nothing.
- **Guards:** needs the manage-sales and manage-projects permissions (Owner/Manager, as the rules already require); refuses a second recording (the milestone keeps a link, shown as an "In books" badge); accepts service items only, because goods would be taken out of stock; the closed-month lock covers it (`PERIOD_GUARDED_METHODS`); warns when sales already tagged to the project cover the amount, so it is not counted twice. Deleting a recorded milestone keeps the sale, and says so.
- **No rule change, no new collection:** one new optional field (`ProjectMilestone.saleInvoiceId`); milestone writes were already Owner/Manager and sales and payments use the existing paths.
- **Tests:** `verify-milestone-sale.ts` (87: tax maths incl. rounding across 36 amount/rate pairs, the double-record guard, and source checks that the lock entry, permission, service-only and single-batch rules exist). Mutation-checked: 6 of 6 deliberate breakages caught.
- **Not verified:** the new button, form and badge were not viewed in a browser; the write was not run against a real Firestore (no emulator in this environment), so a real paid and an owed milestone should each be tried once on a test business.
- **Still not built (buildable, none blocks a business):** quantity price tiers, per-unit serial and warranty tracking, a per-rate breakdown of the Tax summary, a cross-client health board, a one-tap manual late-fee charge. Queued rather than skipped.
- **Not built, cannot be verified here:** several businesses on one login and branch-restricted staff both change who may read whose data in the security rules, and the rules cannot be run in this environment (no emulator), so they stay out rather than risk breaking access. Card payment, bank feeds and a live exchange-rate feed need an external provider and credentials.

## v77: project milestones no longer look like they are in the books when they are not

Asked to implement anything necessary for any kind of SME. Checked the types of business named as possibly poorly fitted (serial-number goods, staged billing, payroll). Payroll is covered, staged billing had a real gap, serial numbers are a documented non-need (below).

- **The gap.** On a project, marking a billing milestone "invoiced" or "paid" only flips a status. It posts nothing to revenue, money owed, cash or tax, because a milestone is deliberately not a sale. A service business billing in stages could mark a deposit "paid" and see no income in the books, with nothing saying so.
- **The fix, read-only** (`lib/milestoneBooks.ts`, Projects > Progress-billing schedule). A standing line says the schedule is a tracker and the sale must be recorded too, tagged to the project. When the schedule shows more billed than the project's recorded sales cover, an amber note gives the missing amount. The comparison is made before and after tax and only the larger counts as covered, so a milestone quoted with or without tax never raises a false alarm. A difference of 1 or less is treated as rounding.
- **Nothing in the books changes.** No new field, rule or posted entry; milestones still do not create sales (a milestone often has no sellable item to attach to, as the design note in `lib/types.ts` explains). The AI assistant's knowledge of Projects now says the same.
- **Tests:** `verify-milestone-books.ts` (12), mutation-checked: 4 deliberate breakages, 3 caught; the survivor (using the after-tax figure alone) is equivalent while tax is never negative.
- **Not built, consciously:** a one-tap "record this milestone as a sale". It needs an item, tax and a decision about deposits, and would touch the books, so it is its own release.
- **Serial-number / warranty tracking: not built, no trigger.** Batch trace covers which batch went to whom; per-unit serials matter to phone and appliance dealers and nobody has asked. Sorted as not built, not as unnecessary for every market.
- **Not verified:** the new note was not viewed in a browser, and nothing was clicked through with real data.

## v76: ready to sell to many (seat advisory, batched admin reads, written readiness sort)

Asked to make it ready for selling to many customers, without external compliance systems. Audited the operator side (admin console, daily job, plans, signup). Most of it already scaled; two real gaps were fixed and the rest is sorted below.

- **Seat advisory** (`lib/seats.ts`, `Tier.seatGuide`, admin "Manage accounts"). Plans never gate features, so a Starter customer (built for 1-2 logins) could quietly invite a whole team. The console now shows active logins per account and an amber "Over plan" badge when a plan with a stated number is exceeded; the count is also in the CSV export. **Advisory only: nothing is blocked**, no rule or invite flow changed. Growth and Business have no stated number and are never flagged; an unknown plan or a failed count is never flagged and never guessed.
- **Batched admin reads** (`app/api/admin/businesses/route.ts`). The account list opened every customer's reads at once; it now works in batches of 10 (the daily job already did). Same output, flatter load on a long list. The new login count is one aggregate read per customer.
- **Tests:** `verify-seats.ts` (11), mutation-checked (3 of 3 caught).

**Readiness sort (nothing else was changed):**
- *Already in place:* trial flow with abuse guards, optional unattended activation (`AUTO_ACTIVATE_TRIALS`), per-business isolation enforced in the rules, per-business AI daily cap and monthly cost view, backup and export, owner-recovery runbook, demo guardrails, plan prices in one file.
- *Not built, waiting on a decision only you can make:* automatic card payment (gateway depends on where the selling company is registered and banked; a gateway wired before that is rewritten), and turning on `AUTO_ACTIVATE_TRIALS` (a switch, once you are happy for signups to go live unattended and have an AI-provider spend limit set).
- *Not built, consciously left out:* several businesses on one login. Customers who each run one business do not need it; it serves an operator or accountant juggling clients, and it changes who can read whose data, so it stays its own tested release (trigger in STRATEGY.md).
- *Not built, no trigger yet:* cross-client health board and benchmarks (STRATEGY.md), hard seat blocking.
- *Known ceiling:* the daily job and the admin list read every customer each run. Comfortable for hundreds of customers; past roughly a thousand, page them or move to a stored per-customer summary. Not measured, so treat that figure as an estimate.
- **Not verified:** nothing clicked through; the new admin line and badge were not viewed in a browser.

## v75: product CSV keeps wholesale price and item tax rate

A regression review of the v73 additions (every catalog write, every import path, the invoice submit) found no data-loss path: imports only create products, and all three catalog writes mirror the new fields. It did find one round-trip gap.

- **Products CSV** (`lib/csv.ts`): export and import now carry `wholesalePrice` and `taxRatePct` (empty = shop rate, 0 = tax-free, kept as 0). Out-of-range values are reported against the spreadsheet row and dropped, never guessed. Files from before these columns import unchanged.
- **Tests:** `verify-product-csv-fields.ts` (10), mutation-checked (5 of 5 caught).
- **Housekeeping:** a stale comment in the invoice form that described the old tax-splitting method now describes the per-line rule.

## v74: supplier statement of account

A third gap hunt (cash calendar, stock counts, credit notes, quotes, barcode scanning, audit log, backups and the 13-week cash map were all already there) found one asymmetry: customers could be given a printable statement of account, suppliers could not.

- **Supplier statement** (`lib/supplierStatement.ts`, `buildSupplierStatementHtml` in `lib/print.ts`, Statement button on Suppliers, cards and table). One page of what the books say is still owed to one supplier: credit purchases and bills, billed, paid or credited, balance, with past-due called out. Built from the existing payables lines, so its total equals the Money owed screens. Names match ignoring case and spaces. Read-only; no new field or collection.
- **Tests:** `verify-supplier-statement.ts` (21, through the real payables and bills aging plus hand-made lines). Mutation-checked: 4 initial survivors each exposed a missing test (zero-balance filter, credited amounts, blank supplier, date ordering); all now caught.
- **Not verified:** nothing clicked through with real data.

## v73: the items left out of v72, built (per-item tax, category budgets, late charge, order drafting, wholesale prices)

Asked to build everything previously left out, without external compliance systems. Each was built so that a business that never uses it gets exactly the numbers it got before.

- **Tax rate per item** (`lib/tax.ts`, `Product.taxRatePct`). Empty = the shop rate; 0 = tax-free. Every place that works out tax when a sale or purchase is entered now asks `taxRatePctFor`: the single sale form, the multi-item invoice (each line at its own rate, the delivery line at the shop rate), the purchase form, recurring invoices, estimate to invoice, offer fulfilment, purchase-order receipts, and the AI assistant's auto-saved sales and its credit-limit check (the server reads the item's rate). Mirrored to the Staff `catalog` so Staff charge the same tax. Tax is still snapshotted onto each record, so nothing already saved is restated and the Tax summary is unchanged. Without any item rate set, 400 random invoices match the old "one total, split by share" numbers to a millionth (`verify-item-tax.ts`).
- **Guard against a missed site** (`verify-tax-sites.ts`): fails if any file outside a short, reasoned allow-list reads `salesTaxRatePct` directly, or if the old tax-splitting code comes back.
- **Category budgets** (`lib/categoryBudgets.ts`, card on Expenses). A monthly budget per expense category on the settings doc, compared with spend using the P&L's own month rules, so rows add up to the month's expense total. Owner edits; on track / close (80%) / over; unbudgeted spend shown separately.
- **Late payment charge** (`lib/lateFees.ts`, Settings > Credit sales). Optional monthly % and grace days; simple interest on what is still owed past the grace period. Shown on overdue invoices and in the WhatsApp reminder. Advisory only: never posted to receivables, revenue, tax or statements. Capped at 10% a month as a typing-slip guard. Not added to the Collections page's grouped messages, which combine invoices of different ages.
- **Order drafting**: an Order link on each line of "What to order now" opens the existing order form prefilled (item, suggested quantity, cost, supplier). Nothing is saved until the form is confirmed.
- **Wholesale prices** (`lib/wholesale.ts`, `Product.wholesalePrice`, `Customer.wholesale`): a one-tap suggestion on the sale form, and "Use wholesale prices" on an invoice. Never applied by itself; the usual-price warning stays quiet when the wholesale price is entered.
- **No new collection, no rules change** (new optional fields on products, catalog, customers and the settings doc). Backups include them through the existing documents.
- **Tests:** `verify-category-budgets.ts` (20), `verify-late-fees.ts` (20), `verify-item-tax.ts` (17), `verify-tax-sites.ts` (18), `verify-wholesale.ts` (11), and new cases in `verify-ai-auto-confirm.ts` (the server path with a fake database). Mutation-checked: all caught except two equivalent changes (a zero-amount guard, and a half-cent floating-point boundary).
- **Still not built, deliberately:** a per-rate breakdown of the Tax summary (it needs a stored rate on every record), tiered pricing beyond wholesale/retail, and charging the late fee automatically.
- **Not verified:** nothing was clicked through with real data; layouts were checked with sample data in a browser.

## v72: buying list, price what-if, margin-holding price

A second business-gap hunt (what a sharp SME owner would still ask for) found three, all derived and read-only.

- **What to order now** (`lib/buyingList.ts`, card on Wholesale orders). Items at their reorder point (stock + on order <= reorder point), suggested quantity = reorder point + one EOQ batch - position (never less than one batch), supplier and cost from the latest purchase (average cost as fallback, "cost unknown" otherwise, never guessed), per-supplier totals, most urgent first. Set against safe-to-commit cash (same formula as My Profit, 3-month buffer); when it does not all fit, `splitByBudget` covers the most urgent first and marks the rest Wait, carrying on past an item that does not fit.
- **What if I change my prices?** (`lib/priceWhatIf.ts`, section on My Profit). -10/-5/+3/+5/+10%: extra profit at the same volume, margin before/after, and the break-even volume change (`M / (M + dP) - 1`): how much volume a rise can lose, or a cut must gain. Assumes nothing about demand; says so. Flags a price that would not cover cost.
- **Margin-holding price** in the Supplier price watch: the selling price that restores the old margin after a cost rise (needs a usual selling price).
- **Still no money figure changes.** No new collection, field, rule or posted entry. Backups and rules unaffected.
- **Tests:** `verify-price-what-if.ts` (19), `verify-buying-list.ts` (23), and 4 more in `verify-supplier-price-watch.ts` (36). 21 deliberate breakages: 20 caught, 1 equivalent (unit cost is already 0 when unknown). AI knowledge updated and covered.
- **Deliberately not built:** automatic late fees on overdue invoices, multiple tax rates, per-category budgets, price tiers, a purchase-order auto-draft. Each changes the books or adds stored data and none blocks a business from running.
- **Not verified:** no click-through with real data; layouts were checked in a browser with sample data at 375px and 1280px.

## v71: two read-only decision cards (foreign-currency exposure, supplier price watch)

Asked to build anything valuable, even nice-to-have, without external systems. An audit against a 12-pillar business blueprint found two real gaps for a Sri Lankan importer/exporter; everything else was already covered.

- **Foreign-currency exposure** (`lib/fxExposure.ts`, card on Money owed). Per currency: unpaid receivables, unpaid payables, net, weighted average booked rate, oldest item, and the net gain/loss for a 5/10/20% move. Built on the real aging lines. Foreign amounts are translated once at entry and payments are recorded in the business currency, so it is labelled "valued at the rates you booked", never a live rate, never a posted gain. Opening balances (no currency) are left out. Hidden when nothing unpaid is foreign.
- **Supplier price watch** (`lib/supplierPriceWatch.ts`, card on Suppliers). Flags an item whose latest delivery cost 5%+ more than the qty-weighted average of up to 3 earlier deliveries (same supplier preferred, otherwise others and says so); 10%+ is "act". Shows extra paid on the last delivery, margin before/after at the product's usual selling price (only if one is set), the cause (supplier price / exchange rate / mixed, only when every delivery was priced in the same foreign currency), and a clearly cheaper supplier from the last 180 days. Latest delivery must be within 120 days.
- **No money figure changes.** No new collection, no rules change, no new stored field, nothing posted. Both are derived from records that already exist, so backups and the rules smoke test are unaffected.
- **Tests:** `verify-fx-exposure.ts` (28 checks, run through the real receivables/payables aging) and `verify-supplier-price-watch.ts` (32 checks). Both were mutation-checked: 12 deliberate breakages, 11 caught after two tests were added; the one survivor is an equivalent mutant (skipping the latest supplier when looking for a cheaper one is redundant because it cannot be cheaper than itself). AI knowledge updated and covered by `verify-ai-knowledge-coverage.ts`.
- **Deliberately not built:** a live exchange-rate feed, realised FX gain/loss posting, and revaluing balances (they need a rate source and a decision on how foreign payments are recorded, and would touch the books). Each flagged in the card wording rather than implied.
- **Not verified:** no browser click-through of the two cards with real data.

## v70: batch costing (opt-in), on the same engine as the batch trace

Asked to build the item v69 left out on purpose. It touches every profit and stock figure, so it was built as an OPT-IN setting with the default unchanged.

- **Setting:** Settings → General → "How cost of goods is worked out": Average cost (default, absent = average) or Each batch's own cost (`Settings.costingMethod`).
- **Engine:** the trace and the costing now run on ONE replay (`lib/batchLedger.ts`), so the batch a sale is shown from is the batch it is costed at. `computeProductLedger(..., method)` dispatches; `computeAllLedgers`,
  the stock-value history and the supplier-return oversell guard all take the method, and the app's ledgers follow the setting. Everything downstream (sale economics, monthly P&L, balance sheet, receivables) reads the same ledger shape and is unchanged.
- **Rules of the replay:** a picked batch first, then soonest expiry, then oldest delivery. Restocked returns go back at the cost the units left at; goods sent to a supplier leave at their own batch's cost; write-offs take the first-expiring batch; found stock is valued at the cost then in force. Units that arrive while something is still owed (an earlier oversell) cancel that debt first, so stock on hand and "owed" never coexist.
- **Production and previews** use the same cost the ledger will book (`lib/costing.ts`: the real engine run with one unsaved sale), so a production run puts the finished good in at exactly what the components came out at, and the sale form's cost preview cannot disagree with the booked cost.
- **Safety:** switching restates all past figures, so it is refused while the books are closed and audit-logged. Default behaviour is byte-for-byte the old engine (the existing 90+ scripts still pass untouched).
- **Tests:** `scripts/verify-batch-costing.ts` (45 checks, 6000 random histories): conservation of cost (purchases + found + restocked = COGS + losses + sent back + stock), identical books to average costing when every delivery cost the same, same units on hand and same oversold sales as average costing, hand-worked cases, production and the guards. `verify-batch-ledger.ts` updated for the shared replay (42 checks).
- **Known limits (flagged, not hidden):** units sold before any delivery was recorded are costed at the last known cost (0 if none), like the average engine; per-location profit still uses business-wide costs (as before); batch costing is only as exact as the batch the seller picked (otherwise earliest-expiry-first, or oldest-first when there are no expiry dates); the multi-item invoice form has no batch pick.
- **Speed:** batch costing replays every product's batches: about 0.7 s for 100,000 sales and 12,000 purchases across 200 products (average costing: 0.1 s). It re-runs when data changes, so it is fine for SME volumes and noticeable only far beyond them.
- **Not verified:** no browser click-through of the Settings switch or the sale-form preview, and no run against a real business's data.

## v69: batch trace (the per-batch gap, built as traceability, not as costing)

Asked to implement the remaining open item. "Per-batch stock tracking" can mean two different things, and only one is safe on the last day:
- **Built: traceability.** Which batch each sale came from, and which customers received a given batch. Derived by replaying history in date order (`lib/batchLedger.ts`): a sale that names its batch uses it
  (recorded), everything else comes from the batch expiring soonest, no expiry last (estimated). Restocked returns go back to the batch the sale drew from; supplier returns leave their own batch; write-offs hit the
  soonest-expiring batch. Sold-with-no-stock and found-stock are shown as such, never dropped. Reconciles to the app's own stock formula (randomized test, 400 scenarios).
- **UI:** Health → Batch trace (product picker, batches, "Who got it", Copy this list); sale form → optional "Which batch?" (owner/manager, goods with batch info only). New optional field `Sale.batchPurchaseId`,
  memo only. No rule change (sales rules whitelist no fields), no new collection. Editing a sale and clearing the pick really clears it.
- **NOT built, on purpose: batch-level costing** (profit using each batch's own cost). It would change every margin, the stock value and the tax figures, and needs its own release. Weighted average cost stays.
- **Not covered (small, flagged):** the multi-item invoice form has no batch pick (its lines are estimated); CSV sales import/export has no batch column; Staff sales are always estimated (Staff cannot see purchases).
- **Tests:** `scripts/verify-batch-ledger.ts` (42 checks). Gate: tsc, lint, all verify scripts, build. **Not verified:** no browser click-through of the new card or form field.

## v68: a way to verify the Firestore rules (not yet run)

Asked again to implement anything necessary. After v67 the app itself needed nothing; the biggest unverified risk was the Firestore rules. I tried to run them here and could not: the emulator
is downloaded from a host this environment cannot reach.

- **Added:** `scripts/rules-smoke.mjs` (reads and denials only, so a failure points at the rules, not at test data): signed-out and other-business access, owner/manager/accountant reads, accountant cannot write,
  staff sees only the cost-stripped catalog and their own sales, server-only documents (`platform/*`, `meta/lifecycle`) closed to every role including the owner. Run command is in DEPLOY-CHECKLIST.md.
- **Not in package.json on purpose:** needs `@firebase/rules-unit-testing`, installed with `--no-save`, so the app build never depends on it.
- **STATUS: written, NOT run.** If it fails, check the named path and role before assuming the rules are wrong. App code unchanged since v67.

## v67: optional environment variables are really optional

Asked: optional variables should not need setting, and features should still run without them. Each one was sorted, not all bent the same way.

- **Now works with nothing set:**
  - Daily reminders + digest without `CRON_SECRET`: "open mode". Because the URL is then unauthenticated it is guarded: at most one run per ~20 h (slot claimed in a transaction, fails closed),
    the reply carries no business data, and email links are built only from the configured site address, never from the caller's headers (a forged Origin could otherwise have put a sign-in link on another domain).
    A secret that is set but under 16 characters is still refused (503); that is a typo.
  - Site address without `NEXT_PUBLIC_SITE_URL`: uses Vercel's production domain (also fixes sitemap/robots/og pointing at localhost).
  - Admin inbox without `ADMIN_NOTIFICATION_EMAIL`: uses `NEXT_PUBLIC_SUPPORT_EMAIL` when that is set. Note: leads' details and feedback then go to your public support address.
- **Already defaulted (unchanged):** support contact, payment line, country code, demo session length, AI model/prices, time zone, demo account, sign-in-link signing secret.
- **Cannot be defaulted, by design (not hidden):** Firebase web + admin keys, `ADMIN_PASSCODE` (a default would be a backdoor), `RESEND_API_KEY` + verified `TRIAL_NOTIFICATION_FROM_EMAIL` (no key = nothing can be sent; the app keeps working and says so), `DEEPSEEK_API_KEY` (no key = AI off).
- **Opt-in features left opt-in:** `AUTO_ACTIVATE_TRIALS` (it changes who gets an account without a human).
- **Tests:** `scripts/verify-env-defaults.ts` (39 checks). Admin Automation card wording updated. Gate: tsc, lint, all verify scripts, build.
- **Not verified:** no live Vercel cron run and no browser check of the Automation card.

## v66: automated email hardening (Resend)

Reported: automated emails are not sending properly. No error text, environment or admin-panel status was available, so the cause on your deployment is NOT confirmed.
What I did was read the whole send path (sender, daily job, cron auth, public routes) and fix the one real defect it has:

- **Fixed:** bursts. Resend allows only a few requests per second (2, as far as I know). The daily job can have several customers due the same morning and sent them in parallel, so everything after
  the first couple would get "429 rate limited", be marked failed, and slip a day. `sendEmail` now spaces sends from one process by 600 ms and retries a 429 up to twice (honouring Retry-After, capped at 5 s).
  Other errors (401, 422, 5xx) are never retried, so nothing can double-send.
- **Tests:** `scripts/verify-email-retry.ts` (14 checks: unconfigured no-op, retry counts, no retry on 401/422/5xx, Retry-After handling, pacing under concurrency).
- **Checked and fine:** public routes await their sends (nothing is cut off after the response); cron auth matches what Vercel sends; "already sent" is only recorded after a real send, so failures retry.
- **Not verified:** whether this was your cause. It only matters when 3+ emails go out in one run. A run that sends nothing at all points to settings, not code (see the reply).
- **Known limit:** the daily job has a 60 s ceiling; at 0.6 s per email that is about 90 sends in one run, above Resend's free 100/day plan anyway.

## v65: expiry date and batch number when receiving a purchase order (finishes a gap v63 flagged)

Asked again to implement anything necessary. After sorting the remaining gaps (see v64), the one thing that was necessary rather than optional was a half-finished
edge of v63: stock that arrives through a purchase order could not carry an expiry date, so a food/pharma business using orders would have had holes in the Expiry watch.

- **Built:** the Receive order form now has the same two optional fields as the Purchases form (use-by date, batch / lot number); `receivePurchaseOrder` writes them
  onto the purchase it creates (blank stays absent). Memo-only, exactly as on Purchases: no cost, stock, cash or profit changes. No new rule, collection or backup change.
- **Tests:** `verify-expiry-watch.ts` extended (30 checks) to pin the receive form and the write.
- **Gate:** tsc clean, lint clean, all verify scripts pass, production build passes.
- **Still not built (small, and flagged rather than hidden):** CSV purchase import has no expiry/batch column (enter them by editing the purchase). No browser click-through done.
- **Everything else open is unchanged from v64** (per-batch sale allocation, several tax rates, card billing, self-serve signup, several businesses per login).

## v64: seasonal view of revenue (the one remaining gap that is purely derived)

Asked again to cover any business type. Each remaining gap was sorted into built / consciously left out / waiting on a decision. Only the seasonal view
was both useful across business types and safe: it is computed from existing monthly revenue, stores nothing and touches no book.

- **Built:** `lib/seasonalForecast.ts` (ratio-to-trend seasonal indices, shrunk toward "an average month" by n/(n+2), rescaled to average exactly 1) and a
  "Seasonal view" line under the Dashboard forecast. Shown only with 24+ complete months and every calendar month seen twice; otherwise nothing shows and
  the old "straight-line, doesn't know about seasons" note stays. The unfinished current month is excluded. Missing months are skipped, not read as zero.
  AI assistant knowledge and manual updated. No new collection, rule or backup change.
- **Tests:** `scripts/verify-seasonal-forecast.ts` (30 checks: gating at 23/24 months, hand-worked shrinkage, gaps, duplicates and junk, order independence,
  growth does not masquerade as a season, all-zero revenue, never negative or NaN, year-boundary keys, module imports nothing from the books).
- **Gate:** tsc clean, lint clean, 89/89 verify scripts pass. Production build passes.
- **Not built, and why (sorted):**
  - *Waiting on a decision, not decided against:* automatic card billing (depends on where the company is registered and banked), self-serve signup
    (`AUTO_ACTIVATE_TRIALS` exists; needs reviewed Terms and an AI spend limit first), several businesses on one login (changes who can read whose data;
    trigger about 5 active clients).
  - *Consciously left out:* automatic bank feeds (documented exclusion), several tax rates at once (documented exclusion: one flat rate assumed; it touches
    sales, purchases, invoices, tax summary and reconciliation together, so it is a release of its own, not a last-day patch).
  - *Not built, and genuinely open:* true per-batch stock tracking (which batch each sale drew from). The books use weighted average cost; real lot
    allocation would change cost of goods and stock value, so it needs its own design and tests. v63's expiry watch (an estimate, newest-first) stays.
- **Not verified here:** no browser click-through of the new Dashboard line.

## v63: expiry and batch tracking (food, pharma, cosmetics); strategy decisions on the other two gaps

Asked to close the three named gaps. Each was judged on its own: one was safe and valuable to build now, two are decisions that depend on choices not yet made.

- **Built: expiry watch.** Optional `Purchase.expiryDate` and `Purchase.batchRef` (memo-only: no cost, stock, cash or profit changes anywhere, proved by a test that
  runs the real books with and without them). `lib/expiryWatch.ts` matches units on hand to deliveries newest-first (the usual oldest-sells-first basis, labelled an
  estimate on screen), and reports expired and expiring-soon stock by value at cost. Screens: the purchase form (goods only), the purchase list, **Health page
  Expiry watch** (30/60/90-day choice, soonest first, mobile-friendly rows), a **Dashboard** notice, and **Write off**, which opens the existing stock-adjustment
  form prefilled (units, reason "expired", batch in the note), so the loss is booked by the proven shrinkage path. Editing a purchase and emptying the boxes really
  removes the values (not silently kept). AI assistant and manual updated. No new collection, no rule change, no backup change (the fields ride on `purchases`).
- **Tests:** `scripts/verify-expiry-watch.ts` (28 checks: day maths over month/leap/year ends, newest-first matching, boundary days, services and undated and malformed
  dates ignored, negative and oversized stock, same-day deliveries, books unchanged with expiry set, write-off clears the warning, wiring present).
- **Not built, by decision (see STRATEGY.md "Decision update"):** automatic card payment (the gateway depends on where the company is registered and banked; Stripe is
  reportedly not directly available in Sri Lanka, local gateways are the usual route), self-serve signup (business creation is closed in the rules on purpose;
  `AUTO_ACTIVATE_TRIALS` already exists for when you want it), several businesses on one login (roadmap trigger: about 5 active clients, as its own tested release),
  lawyer-reviewed Terms (not something software can produce).
- **Not verified here:** a click-through in a browser of the new Health card and the purchase form fields; PO receiving does not yet ask for an expiry date (enter it
  by editing the resulting purchase); CSV purchase import has no expiry column.

## v62: customer deposits / prepayments as a liability (closes the gap named in v61)

Asked again to close the remaining gaps regardless of business type, the one that mattered for the books was advance payments: a
customer paying a deposit was previously either lost or booked as income, flattering profit and cash until delivery. Built as the
mirror image of supplier credit (v54), reusing its rigor.

- **Model (`CustomerDepositEntry`, `lib/customerDeposits.ts`):** per customer (name matched ignoring case/spaces), `received - applied - refunded`,
  never below zero on any date, checked on every save and delete. `received` = cash in, liability up, **no revenue**. `applied` = settles part of an
  open credit invoice (or opening-balance receivable) with no cash moving. `refunded` = cash out, liability down.
- **Books:** receivables aging counts `applied` rows like payments (so the invoice, reminders, AI and the aging report all agree); monthly cash flow
  adds `customerDepositsReceived` / `customerDepositRefunds` to operating cash; the balance sheet carries a `customerDeposits` liability (also a current
  liability in the ratios); "Safe to commit" sets held money aside; bank/card deposits and refunds are bank-reconciliation candidates.
- **Wiring:** DataContext (listener, summary, add/delete with validation), Firestore rules (Owner/Manager write, Owner delete, read = books readers, never Staff),
  period lock (closed months refuse it), backup + restore, cascade on sale / opening-balance delete, a guard so a credit sale with a deposit on it can't be
  switched off credit, AI assistant knowledge, AI/aging/reminder routes thread it through.
- **Screens:** Customers page "Customer deposits" card and a panel (record / use on an invoice / refund / history); a "Held for customers" stat; a hint on the
  Record payment form when the customer has a deposit; lines on the Statements cash flow and balance sheet.
- **Tests:** new `scripts/verify-customer-deposits.ts` (8,911 checks: hand-worked cases for received, applied, refunded, opening balance, same-day, name matching, validation,
  removals, oldest-held date, reminders, safe-to-commit, bank lines; a 250-run seeded stress test against the real books with sales tax and part-payments, worst balance gap
  0.00000000; static checks of rules, backup, restore, period lock, cascades, staff exclusion). `verify-collection-coverage.ts` now pins the new collection's trust line.
- **Gate:** tsc clean, lint clean, production build passes, 87/87 verify scripts pass.
- **NOT verified here:** the new Firestore rules block has not been run against the emulator (same as v60; deploy and smoke test), and nobody has clicked through the new
  screen in a browser. Smoke test: record a deposit on a customer, make a credit sale for them, use the deposit on it, refund a second deposit, confirm the balance sheet still says Balanced.
- **Still deliberately not built:** batch and expiry tracking, live payment-provider feeds, cohort and net-revenue-retention tables.

## v61: repeat-income health on the Dashboard (small, additive, no accounting change)

Asked to fill the remaining value gaps "regardless of business type", including the case where the software itself is the business.
After mapping each business type against the code, the one gap that is purely derived (and so safe to add on a last day) was
recurring-revenue health; the others were weighed and left out on purpose (below).

- **New `lib/recurringRevenue.ts`**: `computeRecurringRevenueHealth` returns ARR (MRR x 12), MRR added and lost in the last month, net new, growth %,
  churn %, the share of the last 3 full months' revenue that was recurring, and recurring income / recurring costs. It reuses `computeMRR`, so it
  always agrees with the existing "Regular money in/out" figure, and `mrr = mrrBefore + added - lost` holds exactly (tested at boundary dates).
- **Dashboard**: a "Repeat income" row of four stats, shown only when the business has recurring revenue (or lost some in the last month). Nothing shows
  for a business without it. No new collection, no Firestore rule, no backup change, no stored data: everything is computed from the existing recurring items.
- **Manual**: a short paragraph under "Recurring revenue" (give a cancelled item an end date so it counts as ended).
- **Tests:** new `scripts/verify-recurring-revenue.ts` (43 checks: identity over 10 dates, one-offs and long-ended items ignored, yearly and weekly
  normalisation, no-baseline gives null not infinity, month-end and year-end windows, order independence, share capped at 100).
- **Considered and deliberately NOT built today:** customer deposits / prepayments as a liability (touches the balance sheet, cash flow, rules,
  backup and restore, and the Firestore rules cannot be run against an emulator here, so it needs its own tested release), batch and expiry tracking,
  live subscription feeds from a payment provider, cohort and net-revenue-retention tables.
- **Correction to an earlier note:** an overall monthly budget-vs-actual does exist (Statements > Budget: revenue and expense targets against actuals).
- **Not tested here:** a click-through in a browser (the new row is plain `Stat` cards in the existing grid, so no new layout pattern).

## v60: collections, borrower records and field officers (the "people side" of lending and credit)

Asked for after comparing Balancr with a dedicated microfinance product: borrower records, a collections workflow and field officers, built to work for
any SME (a shop with credit customers, a distributor with reps on the road, a lender), not only lending. Management notes and arithmetic only: nothing
is sent, scheduled or connected to any outside service.

- **Collections page** (`/collections`, under Money; Owner, Manager and accountant-to-read). One ranked queue of everyone late or falling due within 7 days,
  customer invoices grouped by customer and loans together. Ranking and the promise rules live in `lib/collections.ts`: broken promise, follow-up due,
  untouched, contacted, promised, due soon. A promise is kept by money received after the diary line (same-day ordered by when it was recorded), broken when
  its date passes without it, and a later "no answer" never erases a standing promise.
- **Collections diary** (new `collectionNotes` collection): call / WhatsApp / visit / message, outcome, promised date and amount, next follow-up. Owner and
  Manager write it as themselves; a line is never edited; only the Owner deletes. In the full backup, the restore script, and a readable `collections_diary.csv`.
- **Borrower record.** Customers gain address, ID/registration reference (only to tell namesakes apart), guarantor name and phone, and a collector. Loans gain
  `customerId`, borrower contact, guarantor, collateral and collector. The loan form picks a borrower from the customer list (brings the phone along) and can
  add a new borrower to the customer list in the same step. Loan details show the record and the contact diary.
- **Field officers.** The Owner assigns a collector to a customer or loan (Collections page, customer form, loan form). New **Collected by** on the receivable
  payment form and the loan repayment form credits money to whoever collected it (defaults to the assigned collector; a Staff login can't name someone else).
  Scoreboard per person: assigned, late, to act on today, broken promises, contacts and collected this month; unassigned work is listed too.
- **WhatsApp reminder on loans** (Money lent out) and on the Collections page, using the existing no-integration `wa.me` link, with the borrower's number.
- **Rules (deploy `firestore.rules`).** New `collectionNotes` block; a Manager can no longer change a customer's collector; Staff can't create a customer
  carrying a collector. `lentLoans` / `lentLoanTxns` stay Owner-only to write, deliberately.
- **Deliberately not built:** staff-level logins for field officers on the loan book (it holds rates and principal, and the Staff role never sees those), a
  weekly/daily repayment cycle, flat-rate interest, late and processing fees, group lending, commission on collections, automatic SMS, credit-bureau checks.
- **Tests:** new `scripts/verify-collections.ts` (49 checks: ranking, promise kept/broken edge cases, collector credit, loans, reminder wording, diary
  validation); `verify-collection-coverage` now pins the diary's rules and the customer-collector rule; the AI assistant knows the page
  (`verify-ai-knowledge-coverage`).
- **Not tested here:** the new Firestore rules against the emulator (no emulator in this environment), and a click-through in a browser with live Firebase.
  Smoke test after deploying the rules: log a contact with a promise, see it under Recent contacts, assign a collector to a customer, record a payment with
  Collected by, open the scoreboard, then add a loan from a customer and press Remind on WhatsApp.


## v59: strategy record only (no app code changed)

Added `STRATEGY.md`: the decision that Balancr is an internal advantage first and a product second, what the advantage is and how to measure it, the two
structural limits for a multi-client service (one login = one business; no cross-client health board) with the point at which each is worth building, the
running-cost checklist (Vercel Pro is required once the app is used commercially; Firebase pay-as-you-go with a budget alert; an AI spending limit), and what
a real software launch would still need. v59 is v58 plus this file; if v58 is already deployed there is nothing to redeploy.

## v58: landing-page copy pass (selling, not features)

Read the whole page as a first-time shop owner deciding whether to try it. The structure already sells well (a concrete hero with a real-looking
sale, a no-signup demo as the first step, risk reversal repeated at every decision, a before/after contrast, an honest "what it isn't" section, an FAQ
that answers the real objections). Six small copy edits, nothing structural, no prices or product claims changed:

- **Cost of not knowing, stated.** The before/after band now names what guessing costs (an item priced too low, your top item running out, an invoice nobody
  chased) before asking the "can you say, right now…" question.
- **Value for the price.** One line in the pricing intro: one recovered late invoice or one avoided stock-out can cover a month's plan.
- **Outcome-led card.** "Loans, lending, investments and equipment" is now "Know what you owe, what you're owed and what you own" (body unchanged).
- **Local fit.** One sentence in the "made for the person running the shop" section: prices in rupees, EPF/ETF on staff pay, invoices and reminders you can
  send on WhatsApp. Only things the product does today.
- **New FAQ: "Is it hard to learn?"** Answers the most common small-business objection and points to the sample shop. The FAQ feeds the page's FAQ
  structured data automatically.
- Two wording changes were tried and dropped because `verify-landing-copy.ts` correctly objected: a "tested before each update" trust line (a process claim,
  not something the product can guarantee) and the phrase "best seller" (the page promises no invented popularity).

Deliberately not added: testimonials, customer counts, logos, scarcity or deadlines. None exist yet, and the page promises not to invent them. The single
highest-value copy addition left is one or two real customer quotes or numbers once the first customers have used it.

**Gate:** `tsc` clean, `next lint` 0 warnings, production build passes, all 84 `verify-*.ts` scripts pass; page renders with no horizontal overflow at 1440px
and 390px.

## v57: WhatsApp links now work with local-format phone numbers

Found by opening the deployed landing page: the "Message us on WhatsApp" link pointed at `wa.me/0741143323`. wa.me only accepts the number in
international format (`94741143323`), so a number typed the local way opens WhatsApp's "invalid number" page. The same gap affected the
"send to customer on WhatsApp" button on invoices and estimates (and the late-payer nudge that uses it) for any customer saved as `077 123 4567`.

**Fixed.** New `toWhatsAppNumber` in `lib/share.ts`, used by both the support link and the customer share link. A single leading `0` becomes the
country code (new optional `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE`, default `94`); `+` and `00` numbers are left as international; a stray `0` after the
country code is dropped; anything else (no leading 0, no `+`) is passed through as typed rather than guessed, so a wrong guess can never open a chat with
the wrong person. Emails and blank contacts behave exactly as before. No money figure, data shape or Firestore rule changes.

New `scripts/verify-whatsapp-number.ts` (19 checks). **Gate:** `tsc` clean, `next lint` 0 warnings, production build passes, all 84 `verify-*.ts` scripts pass.

**Re-test after deploying (2 minutes):** open the landing page and tap "Message us on WhatsApp"; open an invoice for a customer saved with a local number
and tap the WhatsApp share. Both should open a chat with the right number.

## v56: last audit sweep (business pillars, cross-feature interactions)

Walked every pillar the app is sold on (depreciation and appreciation, loan and lending interest, turnover and GMROI, margins and net profit,
inventory economics, recurring income and expenses, assets and liabilities, overhead, commission, pipeline, AI cost controls, landing page)
and checked each against its own verify script and against the v54 features. Every pillar has working, tested code behind it. One real
interaction problem turned up and is fixed:

**Fixed: delivery charges earned salesperson commission and counted as units sold.** A delivery line is a sale made by the same login, so
commission (a percentage of what that login sold) was quietly including pass-through delivery fees. Delivery lines are now flagged
(`Sale.isDelivery`) when created and left out of commission (and of the returns and discounts taken off it), and out of "units sold". The flag
sticks even if delivery is later turned off in Settings, and commission also leaves out lines of the delivery item saved before the flag
existed. No money figure changes: revenue, tax, receivables and the balance sheet are exactly as before. New checks in `verify-commission.ts`
(52) and `verify-delivery.ts` (42).
**Landing page:** one plain sentence added about logging a lost sale; wording check still passes. Nothing on it claims something the app no
longer does.
**Gate:** `tsc` clean, `next lint` 0 warnings, production build passes, all 83 `verify-*.ts` scripts pass.
**Unchanged and still true:** the two things that need you, not me: deploy the Firestore rules before or with the app, and run the smoke test
under v55. Deliberately left out: TAM/SAM/SOM, ROAS, multi-rate tax, bank feeds, card-terminal hardware, e-filing, any compliance integration.

## v55: audit of v54 (fixes only, no new features)

Re-read every change in v54 end to end, tried to break it, and fixed what turned up.

**Bug fixed: deleting an opening-balance payable left supplier credit behind.** Credit used on an old bill ("opening balance") was not
deleted with the bill, so the credit held would have stayed reduced for a bill that no longer existed and the Balance Sheet would have been
out by that amount. Deleting an opening balance now removes the credit used on it (the credit is put back), and closed months protect it.
`verify-supplier-credit.ts` now also fails if either bill-deleting path (purchase or opening balance) ever stops removing it.
**Fixed: credit kept from a return was invisible if you had no supplier records.** The Suppliers page showed only its empty state, hiding the
new "Credit held with suppliers" section. It now shows whenever any credit exists.
**Fixed: Delivery setup could create a duplicate "Delivery charge".** If the Settings card rendered before products loaded it ignored an
existing "Delivery" service; it now follows the best match until you choose.
**Fixed smaller things:** a bill part-settled with supplier credit showed as "sent back"; the Payables page now says "credited". The credit
history named opening-balance bills "item". Held supplier credit now counts as a current asset in the current ratio (not the quick ratio).
**Release hazard documented:** the app subscribes to `stockOuts` and `supplierCredits`, so the Firestore rules MUST be deployed before or with
this version or every owner/manager/accountant login hangs on loading (same as earlier collections). Added to DEPLOY-CHECKLIST.md.

**New check, `verify-collection-coverage.ts` (12 checks):** every collection the client touches has a rules block, every backed-up collection
is restorable, and the two new collections keep the same trust line as the records beside them. Proven by deleting a rule on purpose.
`verify-supplier-credit.ts` grew to 60 checks (credit used on opening-balance bills, source guards). Gate: `tsc` clean, `next lint` 0
warnings, production build passes, all 83 `verify-*.ts` pass.

**Smoke test to run once on a real project (about 10 minutes, after the rules are deployed):**
1. Settings → General → turn on Delivery charge. Sell an item with a delivery amount on a credit sale; open the invoice and confirm two lines,
   one receivable covering both.
2. On an item with a Carton pack, sell 2 cartons; confirm stock drops by 2 × the pack size and the note shows the pack.
3. Type more than you have on a sale; use the lost-sale link; check Products → Lost sales shows it and Statements are unchanged.
4. Buy stock from a named supplier, send some back "kept as credit"; Suppliers → Credit held shows it, Statements → Balance Sheet lists it.
5. Create a credit purchase from that supplier; use credit on it; confirm what you owe drops, cash does not move, and the Balance Sheet
   still says balanced. Then delete that credit entry and confirm everything returns.
**Still not tested:** the Firestore rules for the two new collections have not been run in the emulator (it can't be downloaded here); the
screens have not been clicked through in a browser.

## v54: the four remaining "not yet built" items

Built in this order, smallest risk first. Each has its own verify script, and the full gate was re-run at the end.

**Selling by the pack.** The sale form and the multi-item invoice take quantity and price per pack and convert to single units before
saving (`lib/units.ts`, the same conversion purchases use). A 5-carton sale is stored as the identical 60-piece sale, so stock, cost,
tax and margins cannot tell them apart; the pack typed goes into the sale's notes. Whole packs unless the item is "Sold in parts".
Pack names and sizes are now mirrored onto the staff catalogue (`CatalogItem.packSizes`); a product whose packs were set up earlier shows
them to staff after its next save. Estimates and repeating invoices stay in single units. `scripts/verify-pack-selling.ts` (16 checks).

**Delivery-charge line on a sale.** One setting (`Settings.deliveryProductId`, Settings → General → "Delivery charge on sales": reuse an
existing delivery service or create "Delivery charge"). When on, the sale and invoice forms get a delivery box; the charge is saved as a
second Sale (qty 1) of that service sharing the goods' invoice id, date, customer, payment method and credit terms, taxed like any
other line, in foreign currency too. No change to the calculation engine. New `DataContext.addSales` saves several lines in one batch
(the multi-item invoice form now uses it too, so an invoice can no longer be left half-written). `lib/delivery.ts`,
`scripts/verify-delivery.ts` (38 checks through the real engine).

**Costing of stock-outs, from what you log.** New collection `stockOuts` (Owner/Manager write, Owner delete; in backup and restore). Products
→ "Lost sales (out of stock)" logs what a customer wanted and you had none of; the sale form's "only N left" warning links to it.
Price and cost are snapshotted, and the panel shows the last 90 days of lost sales and margin by item. It is a memo that no
calculation reads. Nothing is estimated: only logged entries count. `lib/stockOuts.ts`, `scripts/verify-stock-outs.ts` (16 checks).

**Supplier credit held as a balance.** An asset on the balance sheet. New settlement "Keep it as credit with them" on goods sent back, and
new collection `supplierCredits` (deposit / applied / refunded; Owner/Manager write, Owner delete; period-locked; in backup and restore).
Suppliers → "Credit held with suppliers" records deposits, uses credit on an open bill (no cash moves, the bill drops) and records a cash
refund. Engine changes: `MonthlyPnL.supplierDeposits` / `supplierCreditRefunds` (inside `purchaseCash`), `PayableLine.amountCredited` now
also carries credit applied (for opening-balance payables too), `BalanceSheet.supplierCredit`, till count, bank-reconciliation candidates,
the aging report, the Assistant's overdue data and reminders. Guards: balance never negative on any date, bill and supplier must match,
nothing dated in the future, no deleting credit that was spent, no editing the figures of a bill that has credit used on it.
`lib/supplierCredit.ts`, `scripts/verify-supplier-credit.ts` (51 checks, including 500 seeded random businesses balanced to the cent; I
also broke the engine three ways on purpose and confirmed the test fails each time).

**Also fixed:** products imported from CSV or the POS wizard never got their staff-catalogue entry, so staff could not see or sell them.
`bulkAddProducts` now writes it (and requires the product-management permission, as the Firestore rules already did).

**Gate:** `tsc` clean, `next lint` 0 warnings, all 82 `verify-*.ts` scripts pass (78 existing + 4 new).
**Still deliberately left out:** TAM/SAM/SOM, ROAS, multi-rate tax, bank feeds, card-terminal hardware, e-filing.
**Still not tested:** no browser click-through of any screen touched here or in v50–v53, and no run against live Firebase. Firestore rules
for the two new collections are written but have not been run in the emulator.

## v53: optional safety buffer on reorder alerts

The reorder point was daily demand × lead time, so any late delivery meant running out before the flag even fired. Now
`reorder point = daily demand × (lead time + safety buffer days)`.
- One new setting, **Settings → Operations → Safety buffer (days)**, default **0**, so existing accounts and every existing number are
  unchanged until someone sets one (a settings document without the field is read as 0; negative values clamp to 0).
- It moves **only the "reorder now" flag**. EOQ, orders per year and annual ordering/holding cost are untouched, nothing is written to the
  books, no Firestore rules or backup changes (it lives in the existing settings document).
- Per-product lead time still overrides the default; the buffer sits on top of it.
- `scripts/verify-safety-stock.ts` (10 checks). Manual, README and the Assistant's product knowledge updated; the "no safety buffer" limit
  is removed from the manual.
- Layout: the four planning defaults now sit 1 / 2 / 4 across at phone / tablet / desktop widths.

**Still not built, each with a workaround in the manual:** delivery-charge line on a sale (log a "Delivery" service sale), costing of
stock-outs, supplier credit held as a balance, selling in pack units. **Still deliberately left out:** TAM/SAM/SOM, ROAS, multi-rate tax,
bank feeds, card-terminal hardware, e-filing. **Still not tested:** no browser click-through of the v50–v53 screens, no live Firebase run.

## v52: supplier on-time scorecard (the one documented logistics gap that needed no new input)

Re-ran the whole gate on v51 before any change: `tsc`, `next lint` (0 warnings), `next build` and all 76 `verify-*.ts` scripts clean.
Walked every pillar again; the only "not yet built" item that could be closed with zero new inputs, zero accounting-engine changes and
nothing written to the books was the supplier delivery scorecard, so that is the only thing added.

- **Suppliers → Delivery column** (and a line on the mobile card): on-time % over received orders that had an expected date, with the
  sample size shown ("80% on time (4 of 5)"), plus open orders already past their expected date ("1 overdue"). Colour (green 90%+, amber
  70%+, red below) only once a supplier has 3+ scored orders. Orders without an expected date, cancelled orders and orders without a
  supplier name are not counted. Names match the way the rest of the page does (case/space-insensitive).
- Read-only: `lib/supplierDelivery.ts` (pure), no schema change, no Firestore rules change, no backup/restore change.
- `scripts/verify-supplier-delivery.ts` (15 checks, incl. boundary tones, DST-safe day counting, exclusions).

**Still not built, each with a workaround in the manual:** delivery-charge line on a sale (log a "Delivery" service sale), safety buffer in
the reorder point (lengthen the product's lead time), costing of stock-outs, supplier credit held as a balance, selling in pack units.
**Still deliberately left out:** TAM/SAM/SOM, ROAS, multi-rate tax, bank feeds, card-terminal hardware, e-filing.
**Still not tested:** no browser click-through of the v50–v52 screens and no live Firebase run.

## v51: last-day audit of v50 — two small supplier-return fixes

Re-ran the whole gate on v50 before any change (`tsc`, `next lint`, `next build`, all 75 `verify-*.ts` scripts: clean), then walked every
place stock, payables and profit are computed to confirm supplier returns reach all of them (ledger, location stock, stock history, monthly
P&L, balance sheet, payables aging, reminders, Assistant, till count, reconciliation, backup/restore, rules). They do. Two real gaps found:

- **Editing an older purchase that had a supplier return was refused even for a harmless change** (a typo in the notes, a new supplier name).
  The "figures can't move under a return" guard compared stored values literally, so a purchase saved before credit terms existed
  (no payment method = cash) or before locations existed (no location = the default one) looked "changed" the moment the edit form filled
  those in; float noise in the recomputed all-in unit cost could trip it too. The comparison is now by meaning, with a tiny tolerance
  (`lib/purchaseEditGuard.ts`, `scripts/verify-purchase-edit-guard.ts`, 11 checks). Real changes to quantity, cost, tax, product, payment terms
  or location are still refused.
- **The "send back to supplier" quantity box accepted 2.5 of a whole-unit product.** It now follows the product's whole-unit/fractional
  setting like every other quantity box, and the starting quantity/refund suggestion respects it.

**Gate:** `tsc --noEmit`, `next lint`, `next build` clean; all 76 `verify-*.ts` scripts pass. Still not tested: no browser click-through of the
v50 screens and no live Firebase run (see the v50 note below for the exact steps).

## v50: the three product-business gaps closed (supplier returns, variants, units of measure)

All three were found by audit, not built, and not recorded as deliberate exclusions. Each is built so that the accounting engine
keeps its existing rules: nothing about WAC, margins, the balance sheet or any report had to be reinterpreted.

**Supplier returns (goods sent back to a supplier).** New `SupplierReturn` record against a purchase (Purchases → Send back).
- Stock leaves at the cost it came in at (a snapshot of the purchase's unit cost) and WAC is re-derived from what remains, so
  returning a bad batch does not move the cost of the good units, and past sales keep the cost they were booked at.
- Settled one of two ways: a **refund** (cash/bank/card in; goods + the input tax that goes back) or **reduce what I owe** (only against an
  unpaid credit purchase; no cash). Profit effect = credit given minus stock value that actually left: zero at full price, a loss for a
  restocking fee or part-credit, booked in cost of goods that month. Input tax is reversed pro-rata, the last return taking the cent remainder.
- The profit figure is read off the ledger's own before/after stock value, so the balance sheet cannot drift from it.
- Guards: not more than bought, than in stock (also per location), or than is still owed on the bill; not before the purchase date; refuses a
  return that would leave a later sale without stock (an oversold sale is a known way for the books to stop balancing, and this was the one
  way the new feature could have caused it); a purchase with returns cannot have qty/cost/tax/terms/location edited; deleting a purchase
  deletes its returns; closed months refuse it; owner/manager create, owner delete.
- Wired everywhere stock or payables are computed: ledger, location stock, stock-value history, monthly P&L (cogs, refunds, input tax,
  `purchaseCash`), payables aging (new `amountCredited`), the statements cash-flow page, the daily till count (cash refunds), bank
  reconciliation (bank/card refunds only), reminders, aging report, Assistant, suggested questions, backup/restore, Firestore rules.
- `scripts/verify-supplier-returns.ts` (46 checks): hand-worked cases for each settlement, tax and fee, then 500 seeded random businesses
  (1,834 returns) requiring the balance sheet to balance, payables to equal the raw records and stock levels to match the ledger.

**Units of measure (buy by the carton, sell by the piece).** `Product.baseUnit`, `packSizes`, `allowFractionalQty`; `lib/units.ts`.
Purchase, quick "Buy more" and purchase-order forms convert "5 cartons at 1,200" to "60 pc at 100" *before saving*, so the engine only ever
sees base units (a ledger check proves a pack purchase and a piece purchase are identical). Pack entry is noted in the purchase notes.
Fractional quantities (kg, m) are allowed per product on purchase, sale, invoice, estimate, return and adjustment forms. Staff catalogue
mirrors only the unit label and the fractional flag. Removing a pack or unit is a real delete (not a silent no-op).
`scripts/verify-units.ts` (29 checks).

**Variants (size/colour).** Each variant is a normal product; `variantGroup`/`variantLabel` only group them. Products → "+ Sizes / colours"
builds the whole grid (up to 60 at a time), generates SKUs, skips anything that already exists (safe to re-run), and a "Sizes & colours"
panel shows group stock, value and out-of-stock sizes. `scripts/verify-variants.ts` (19 checks).

**Logistics costing fix (found in the last-day audit).** Freight/customs/handling could only be added on the full Purchase form;
**receiving a purchase order, and the quick "Buy more" form, booked the supplier's price alone**, so stock cost and margins were overstated for
anyone importing or ordering through POs. Both now take the delivery costs (a total for the delivery, spread over the units, into
`unitCost`, with the raw parts kept in `goodsUnitCost`/`freightCost`/`customsCost`/`otherLandedCost` exactly as the full form does). Input tax
is still worked out on the goods alone. New `landedUnitCost` helper; `scripts/verify-landed-cost.ts` (7 checks, through the real ledger).
Known logistics limits left alone on purpose (in the manual): no safety-stock buffer in the reorder point, no supplier on-time scorecard,
no costing of stock-outs, no delivery-charge line on a sale.

**Gate:** `tsc --noEmit` clean, `next build` clean, `next lint` shows only two pre-existing hook-dependency warnings in recurring
invoice effects, all 75 `verify-*.ts` scripts pass (71 existing + 4 new).

**Still deliberately not built:** a supplier credit note held as a balance for a future order, selling in pack units, a single product
with a size picker on the sale form, multi-rate tax, bank feeds, card-terminal/hardware links, e-filing, TAM/SAM/SOM, ROAS.
**Not tested:** no click-through of the new screens in a browser, and no live Firebase run (rules, listeners, writes). Do that once
before relying on it: add a purchase, send some back both ways, add a size grid, buy by the carton.

## v49 check: final review; one missing inventory-return metric added

- Re-ran the whole gate on v48: `tsc --noEmit`, `next lint`, `next build` and all 70 `verify-*.ts` scripts were clean before any change.
- Walked every pillar (appreciation/depreciation, interest and loans, turnover, gross/contribution/operating/net margin,
  inventory economics, recurring income/expenses, assets and liabilities, overhead cover, commission, CAC/churn/LTV, cash
  runway, break-even, investments). All were already calculated and shown. One gap: **GMROI** (yearly gross profit per 1 of
  stock held at cost), the number a reseller uses to decide where stock money works hardest. It is margin and turnover in one
  figure, computed from numbers the app already has, so there is no new input.
- Added `gmroiAnnualized` (annualized the same way as inventory turnover, so GMROI = turnover × gross profit ÷ COGS), a tile
  on the Financial Health page, a line in the Assistant's health tool (it reads the figure automatically) and the user manual.
  New `scripts/verify-gmroi.ts` (6 checks, including reconciliation with turnover and below-cost selling).
- Nothing else changed. Deliberately still not built: TAM/SAM/SOM, ROAS, multi-rate tax, bank feeds, e-filing.

## v48 check: landing page tuned to convert, honestly

- **Hero:** an identity line ("For shops, workshops and small teams") so the right visitor recognises themselves; a subhead
  that leads with the outcome (real profit, who owes you, what's running low, every day instead of weeks later); and
  "Nothing to cancel" added to the reassurance row (already true: no card, a trial that simply ends).
- **A second conversion moment** under the Today / With Balancr band: a direct question ("Can you say, right now, which item
  earns you the most and who still owes you money?") and a one-tap sample-shop button, so a convinced visitor doesn't have to
  scroll to the end.
- **Pricing:** the "Most popular" badge is now "Recommended" (there are no customers yet, so "popular" would have been an
  invented claim); each plan shows what it costs per day, computed from the real price; and every Start button repeats
  "14 days free · no card · nothing to cancel" at the moment of decision.
- **Deliberately not used:** fake scarcity ("only 3 spots"), countdown deadlines, "join 1,000 owners", made-up testimonials.
  `verify-landing-copy.ts` now fails if any of them appears, and checks the risk-reversal lines and the per-day price.
- Checked at 1440px and 390px, no sideways scroll; typecheck, lint, build clean.

## v47 check: counter sales get barcode scanning; one foreign-currency slip fixed

- **Scan to sell.** The sale form has a "Scan or type a code" box (shown when any item has a SKU). A USB or Bluetooth barcode
  scanner types the code and presses Enter; the matching item is picked, its price filled in and the cursor jumps to the
  quantity. Exact match only (ignoring case and stray spaces); an unknown code or two items sharing a code says so and picks
  nothing. Works for floor staff too (their cost-free item list already carries the code). The product field is now labelled
  "SKU / barcode". `lib/skuLookup.ts`, `verify-sku-lookup.ts` (8 checks).
- **Foreign-currency rate of 0 is no longer accepted.** The helper treats a missing rate as 1, so a rate of 0 would have saved
  100 USD as 100 in the business currency. The rate box now needs a value above zero. New `verify-fx.ts` (6 checks).
- Landing page: the staff card now says staff can scan a barcode and print a receipt.
- Re-checked the CRM side (customers with history and statements, six-stage lead pipeline with follow-up dates, estimates to
  invoice) and the POS side (fast sale entry, multi-item invoices, cash/card/transfer/credit, receipts, till count, create-only
  staff role, offline): both fit small-shop use; no hardware or card-terminal integration, by design.

## v46 check: landing page builds more trust and lands the pitch faster

- **Trust strip right under the hero**: four proof points a careful buyer looks for, each true today: your data is yours
  (backup and export), you press Save (assistant never records on its own), every change on record, numbers that are
  checked (calculations covered by automated tests). 2×2 on a phone, one row on desktop.
- **Before / after band**: "A shoebox of receipts, three spreadsheets and a call to your accountant" against "Type what
  happened, tap Save. Your profit, your stock and who owes you are already up to date." The whole pitch in two sentences.
- **A visible way to reach a person in the footer** (email, WhatsApp and response-time promise, whichever are configured).
  It appears only when `NEXT_PUBLIC_SUPPORT_EMAIL` / `_WHATSAPP` / `_RESPONSE_TIME` are set, so set them before launch.
- Deliberately no customer counts, star ratings, testimonials or logos: none exist yet and none are invented. When real
  customers say yes, add their words; that is the next trust upgrade.
- `verify-landing-copy.ts` now guards the new sections and fails on any invented social proof. Checked at 1440px and 390px,
  no sideways scroll.

## v45 check: landing page highlights three strengths it undersold

- "Type it the way you'd say it" now says the assistant answers "how healthy is my business?" (margins, cash, debts, what to
  improve), matching the new business-health tool.
- "Get paid faster" mentions the one-tap WhatsApp nudge for late payers (the Share button already does this).
- "Never run out of stock" mentions several shops/stores with stock and profit tracked for each (Locations).
- Copy only; every line matches a shipped feature. Landing page rechecked at desktop and phone width, no sideways scroll.

## v44 check: closer-to-expiry reminders for customers and for you

- **Customers get a last-chance email.** Before, a trial or renewal got ONE early heads-up (3 / 7 days out) and nothing on
  the day itself — easy to miss when payment is a bank transfer that takes days. Now: trial = 3 days out, then again on
  the last day or the day before; renewal = 7 days out, then again on the last day or the day before; overdue renewal =
  the first day late, then once more a week late (then it is left to you, as before). Each is sent once per date (an
  extended trial or new renewal date starts a fresh sequence), at most one email per customer per day, and an account
  first seen late still gets just one. Suspended and complimentary accounts are still never emailed. Same plain-text
  wording; the templates already handled "tomorrow / today".
- **Your morning digest shows ending trials a week ahead** (was 3 days), matching renewals, so there is time to message
  someone personally and for their transfer to land.
- Tests: `verify-lifecycle.ts` now replays the whole schedule day by day (trial, renewal, late setup, extension): 84+ checks.
- Docs: DEPLOY-CHECKLIST and the new-account note in the admin panel describe the new timing.

## v43 check: the Assistant can now talk about business health and growth levers

- New Assistant tool `get_business_health`. Ask "how healthy is my business?", "what should I improve to earn more?",
  "how are my margins / liquidity / debt?" or "how often am I correcting entries?" and it answers from the Financial
  Health and Growth figures: current, quick and cash ratio, margins, days sales/payable/inventory outstanding, debt and
  interest cover, EBIT/EBITDA/free cash flow, the four growth levers against the previous period, and the manual-override
  signal. `lib/aiBusinessHealth.ts`.
- **The numbers are the screens' own.** The browser sends the figures it has already calculated; the server rebuilds nothing,
  so the Assistant and the pages cannot disagree. The server accepts only plain numbers, nulls and dates (no free text,
  odd keys, nesting beyond three levels, or oversize payloads), and only then offers the tool. Without a snapshot (quick-entry
  modal, older browser tab) the tool isn't offered and nothing changes.
- **No extra cost on ordinary turns.** The figures go in the request, not the prompt; they reach the model only when it calls
  the tool. The Assistant remains owner/manager only.
- `scripts/verify-ai-business-health.ts` (19 checks, including hostile input). `verify-demo-guardrails.ts` pattern updated for
  the new tool-list call. 68 `verify-*.ts` scripts, `tsc`, `next lint` clean.

## v42 check: landing page copy and the sample profit split

- Landing page now mentions what v41 already did but never said: making your own products from a list of parts (production
  runs) and sales commission per salesperson.
- The sample profit split on the landing page showed 54% + 17% + 30% (adds to 101). The three shares are now rounded
  together so they always add to 100.
- Landing page checked at desktop and phone widths: no sideways scrolling. `tsc`, `next lint`, build clean.

## v41 check: the AI says what its sales and cash-flow numbers include

- The Assistant's report tool described sales totals as "revenue" and its cash-flow total only as revenue minus purchases
  minus bills. Sales there are the invoiced price (later discounts and returns are not deducted, credit sales count when
  invoiced), so the AI could present a figure that differs from the profit and loss without saying why. Every sales and
  cash-flow report result now carries a plain-words `basis`, and the tool description says the same, so the Assistant
  states what the number counts instead of calling it profit or net revenue. No calculation changed.
- Re-checked clean: `tsc --noEmit`, `next lint`, all 67 `verify-*.ts` scripts.

## v40 check: customer revenue and offer margin now match the books

- **The Customers page showed each customer's revenue at list price while the lifetime-value numbers beside it used
  revenue after returns and discounts**, so one row could show two different revenue totals as soon as a discount or
  return existed. The per-customer revenue (and the totals above the table) now use the same net figure as the profit
  and loss.
- **Offers (bundles/services) margin was list price less cost.** Revenue now comes from the same net-of-returns/discounts
  figure as everything else, so the margin shown is what was actually kept. New `scripts/verify-offer-stats-net.ts` (5 checks).
- Left as is on purpose: average order value, new/returning customer split and the customer-concentration shares use the
  billed amount (order size at the time of sale); a later discount moves those shares by a rounding error, and the AI
  concentration tool reads the same definition, so the two always agree.
- Re-checked clean: `tsc --noEmit`, `next lint`, and all 67 `verify-*.ts` scripts.

## v38 check: commission now follows discounts

- **Commission was paid on the pre-discount price while the books count revenue after discounts.** A discount recorded
  against a sale (price match, goodwill, markdown decided after the sale) already lowers revenue in the profit and loss
  and the balance sheet, but the Employees-page commission only took returns off. Discounts dated in the month on a
  salesperson's own sales are now subtracted too (same rule as returns: a discount given in a later month takes commission
  back in that month; the base never goes below zero; a negative amount never adds commission back). The card shows a
  "discounts" figure beside "returns" when there is one. `computeCommissions` takes the discounts as an optional last
  argument, so nothing else changes. `scripts/verify-commission.ts` is now 47 checks (6 new, hand-worked: 11,000 - 3,000 - 800 = 7,200; 5% = 360).
- Everything else re-checked clean: `npm ci`, `tsc --noEmit`, `next lint`, `next build`, and all 66 `verify-*.ts` scripts.

## Last gaps: sales commission per person, expected rise in value for land, and two "cleared field stayed put" bugs

- **Sales commission per salesperson.** Employees can have a commission % and a linked team login. The Employees page
  shows, for any month, each person's sales (before sales tax, less returns; a return in a later month takes commission
  back in that month; never below zero) and what they earned. Nothing is booked automatically: **Record as expense**
  adds a one-off "Payroll & labor" expense dated today, named `Commission — <name> (<month>)`, and the page will not
  offer it twice. `lib/commission.ts`, `scripts/verify-commission.ts` (41 checks, hand-worked figures). Before this,
  commission could only be modelled as a % variable cost on products (still available; it suits marketplace fees and
  business-wide commission).
- **Expected rise in value (appreciation) for land and property.** `FixedAsset.appreciationPct`: the Fixed assets page
  shows a rough market value now and in 1, 3 and 5 years, and the gap over book value. Management view only: books,
  depreciation and tax are untouched. `estimatedMarketValue` / `AssetOutlook.appreciation` in `lib/assetOutlook.ts`.
- **Bug fixed: un-ticking "Sold or scrapped" on an asset, or clearing its salvage value, notes or rate, saved
  "successfully" but kept the old value** (Firestore ignores `undefined`), so a sold asset could not be un-sold.
  `updateFixedAsset` now turns those cleared fields into real deletes.
- **Bug fixed: re-activating an employee left their payroll expense still ending on the old date**, so their pay silently
  stopped being counted in profit. The end date is now really cleared on both the employee and the linked expense.

## Final-day review: recurring billing dates and two month-label bugs

A last read of the pipeline (lead, estimate, invoice, payment, receivable, cash map) and of every place that does
month arithmetic. The money maths and the AI cost controls needed no change. Three real date bugs were found and fixed.

- **A monthly schedule that starts on the 29th, 30th or 31st skipped a month, then billed on the 3rd forever.**
  `calculateNextDueDate` used local-time `setMonth`, which has no month-end clamping: 31 Jan + 1 month became 3 Mar
  (February never billed), then 3 Apr, 3 May and so on. It hit recurring invoices and recurring expense templates, so
  the usual "month-end retainer" lost an invoice and then drifted. It is now plain calendar arithmetic on the date text
  (same answer in any time zone), clamps to the last day of a short month, and takes an optional `anchorDay` so a
  31st schedule goes 31 Jan, 28 Feb, 31 Mar, 30 Apr. A yearly 29 Feb schedule returns on the leap day.
- **A schedule's next date was worked out from the day the app happened to open, not from its own due date.** A retainer
  due on the 1st but generated on the 4th was then billed on the 4th every month. Generation now steps on from the
  schedule's own `nextDueDate` (and anchors on its `startDate` day), so the cadence holds however late the app is
  opened. "Generate now" on a schedule that is not due yet uses up that cycle (the next one is a full period after the
  due date it replaced), which is what "bill this client today instead of waiting" means.
- **Assistant suggestion "revenue vs last month" compared the wrong months in Colombo.** It built the previous month
  from local midnight converted to UTC, which in UTC+5:30 is the 31st of the month before, so it compared this month
  with the one two back (and used the UTC month for "this month"). It now uses the person's own calendar months.
- **Cash-flow forecast month labels** (the Assistant's forecast tool) used `setMonth`, so from the 31st the labels
  skipped a month (31 Oct + 1 = 1 Dec). They now step one calendar month at a time.
- `scripts/verify-recurring-month-end.ts` (34 checks, re-runs itself under Asia/Colombo, UTC and America/New_York).
  The recurring-expense, forecast-determinism, pipeline-automation and lifecycle checks still pass.
- **Cash cushion now has an upper line as well as a lower one.** The cash firewall already warned below 3 months of cover
  (and "act now" below 1). Cash beyond 6 months of cover is now mentioned on the OK cushion line ("about X sits above
  6 months of cover ... could be working", pointing at the put-to-work calculator on Profitability). Text only: it never
  becomes a warning light and nothing is decided for the owner. `CASH_FIREWALL_IDLE_MONTHS` in `lib/earlyWarnings.ts`;
  6 new checks in `scripts/verify-early-warnings.ts`.

## Last-day sweep: receipt-scan dates, CSV import dates, a stray robots.txt

Found by a final read-through plus running the build, all verify scripts and a production smoke test.

- **Receipt scan pre-filled the wrong date (Purchases and Expenses forms).** The scanner's date text went through
  `new Date(text).toISOString()`: "05/10/2026" was read month-first (5 May, saved as 9 May after the UTC shift),
  "25/10/2026" was "Invalid Date" so nothing was filled, and "5 Oct 2026" / "2026/10/05" came out as the day BEFORE
  in Colombo (UTC+5:30). The date drives the books and the period lock. New `lib/receiptDate.ts` reads the digits and
  checks the calendar without touching timezones; ambiguous numeric dates are read day-first (how receipts are
  written here), and anything that is not a real date leaves the field alone. `scripts/verify-receipt-date.ts`
  (10,250 checks, round-trips every calendar day 2024-2030, runs itself under Asia/Colombo).
- **CSV import accepted dates that do not exist** ("2026-02-31", "2026-13-45", "2/30/2026"), and read ambiguous
  ones month-first. They passed the shape check and were saved, then sorted and filtered wrongly; and a Colombo
  spreadsheet's "05/10/2026" silently became 10 May. `isoDate` in `lib/csv.ts` now rejects impossible dates with the
  usual row error, and reads an ambiguous date (both parts 12 or under) the way the FILE does: if any date in the
  same file is only possible day-first the file is day-first, if any is only possible month-first it is month-first
  (`detectDateOrder`, date-named columns only). A file with nothing to go on is read day-first. 25/10/2026 and
  10/25/2026 were never ambiguous and still import correctly. The Import/Export help text now says "day/month/year".
  `scripts/verify-csv-import-dates.ts` (34 checks).
- **CSV and POS number reading was silently wrong for rupee formatting and accounting negatives.** The old cleanup
  deleted every character that was not a digit, minus or dot: "Rs. 1,200" kept the dot of "Rs." and imported as
  0.12; a bank withdrawal written "(500.00)" or "500-" imported as +500 (a deposit); "1E+06" imported as 106. New
  `parseAmount` in `lib/csv.ts` (used by every importer and by the POS "price is the line total" mode) strips only
  known decoration (Rs./LKR/$ and other currency words, %, "/-", "/=", brackets, grouping commas and spaces),
  honours the sign and the exponent, accepts western (1,250,000) and lakh (1,25,000) grouping, and reports anything
  else as a row error instead of guessing ("12-15", "1.250,50", and a European decimal comma like "12,50", which
  would otherwise silently become 1250). `scripts/verify-csv-import-numbers.ts` (67 checks).
- **Mistyped selling price now gets a heads-up on the sale form.** A dropped or extra zero ("120" for a 1,200 item) was
  only visible as a lower profit figure the owner had to notice. The sale form now shows one amber line when the price
  is below half or above double the product's usual selling price, naming both prices. Advisory only (never blocks a
  sale, so clearances and premium customers are unaffected), compares in the business's own currency, and uses the
  default sell price staff can already see, so it reveals nothing new to any role. `lib/priceSanity.ts`,
  `scripts/verify-price-sanity.ts` (20 checks).
- **Speed at real SME volumes.** Every new sale re-runs the stock ledger, sale economics, P&L, receivables and per-location
  stock calculations over the whole history. Measured on synthetic data (Node, desktop; a phone is several times
  slower): `computeAllLedgers` and `computeLocationStockLevels` re-scanned every purchase, sale, return and
  adjustment once per product (and per location), so cost grew with products x transactions. Both now group each list
  once. Ledgers at 30k sales / 200 products: 246 ms -> 67 ms; at 100k sales / 500 products: 985 ms -> 288 ms.
  Per-location stock at 100k sales: 1,198 ms -> 47 ms. The whole recompute chain at 30k sales: 675 ms -> ~400 ms, at
  100k sales: ~2.0 s -> ~1.3 s, and the balance sheet still balances at every size. Results are byte-for-byte
  identical to the old code: `scripts/verify-ledger-grouping.ts` (303 checks) and
  `scripts/verify-location-stock-grouping.ts` (402 checks) compare against the old implementation on randomised data,
  including same-day ties, restock/no-restock returns, adjustments, transfers, inactive locations and ghost products.
- **Bank reconciliation "Reviewed ... on <date>"** showed the UTC date; it now shows the reviewer's own day.
- **`public/robots.txt` had come back** although it was replaced by `app/robots.ts`; the static file wins, so the live
  site had no `Sitemap:` line and no allowlist. Removed.

## First-run checklist: works for service businesses and lenders, and points to the Assistant

A line-by-line read of the whole trial-to-customer path (request, email confirmation, lead, auto-activation, provisioning,
payment recording) found no defects: the confirmation claim is atomic, the account and business are created as one unit
(the login is removed if anything fails), prices come from the server's list, auto-activation is capped and fails
closed, and a payment and its renewal date change in one transaction. Two small first-run fixes:

- The "Get set up" checklist never completed for a business that has running costs but never buys stock (a service
  business, a lender), because step 2 only counted purchases. A cost entry now counts too.
- It now points new customers to the Assistant ("just tell it what happened ... it fills the form in for you to check and
  save"), the headline promise of the landing page, which the checklist never mentioned.

## Spending review, and a silent bug when editing an expense

- **Bug fixed (affects profit and tax):** editing an expense and EMPTYING an optional field saved "successfully" but left
  the old value in place, because Firestore ignores `undefined`. Only the project and location tags were handled. So
  removing a recurring cost's **end date** (to make it ongoing) left it ending on the old date, so the cost stopped being
  counted and profit looked better than it was; unticking **reclaimable tax** left the old tax being reclaimed; and a
  one-off unpaid bill turned into a recurring cost kept its stale "unpaid" status. Those fields (end date, tax, payee,
  payment status, due date, importance) now clear for real, and a partial edit (such as tagging a project from the
  Projects page) still touches nothing else. `clearListedUndefined` in `lib/firestorePatch.ts`.
- **Spending review** (Expenses page): tag a recurring cost essential / useful / optional; the page shows the monthly
  split, how much pausing the optional ones would free, and how many are unreviewed. The cash-squeeze advice on the Cash
  flow page quotes that amount. Included in the expenses CSV and known to the AI helper. `lib/spendingReview.ts`.
- `scripts/verify-spending-review.ts` (22 checks).

## 13-week cash map, overdue bills in the projection, and a debt payoff planner

Checked against a standard small-business cash-flow playbook (separate personal and business money, a 13-week forecast,
know every debt, talk to lenders early, speed up cash in, cut leaks, pick an order to repay debt, keep a reserve).
Most of it was already in the app; three things were not.

- **A real flaw in the projection, fixed:** the cash projection only looked at bill due dates from tomorrow onward, so a
  supplier bill that was already overdue, or due today, never appeared as cash going out and the squeeze looked smaller
  than it is. Bills already due now leave tomorrow, labelled "overdue, pay now". Customers who are already late are still
  (cautiously) not counted as incoming, but the total is now reported so the owner knows what is being left out.
- **13-week cash map** (Cash flow page, default look-ahead 91 days): week by week, cash at the end of each week, what moves
  it, and OK / Tight / Cash runs out flags with a plain headline ("Cash runs out in week 4 ... Rs 57,508 short"). When a
  squeeze is coming it lists the fastest fixes (invoice sooner, deposits, supplier terms, pause optional spending, talk to
  the lender early and get it in writing). The rent card no longer says "You can make it" in green without warning when
  cash goes below zero days later. `lib/cashMap.ts` only re-groups the daily projection, so the two always agree.
- **Debt payoff planner** (Loans page): extra monthly payment -> debt-free date and interest for scheduled-only, highest
  interest first (avalanche) and smallest balance first (snowball), with the payment order. `lib/debtPayoff.ts`.
- `scripts/verify-cash-map.ts` (26 checks) and `scripts/verify-debt-payoff.ts` (31 checks), including 200 and 300 random
  cases for the identities (weeks chain and add up to the daily projection; money paid = debt + interest).

## Money lent out, stock over time, and what equipment will be worth later

For businesses that lend money and earn interest (customer credit, staff advances, equipment on instalments), that
invest spare cash, or that hold depreciating equipment: the app already covered borrowing, investments and
depreciation, but had **nothing for money the business lends out**, and nothing that looked forward on equipment or
back on stock. Added, without connecting to any bank, credit bureau or authority.

- **Money lent out** (`/lending`, owner writes, manager and accountant read): borrower, amount, yearly rate, number of
  monthly payments, equal payments or interest-only. Record each repayment actually received (interest owed first, then
  principal; the form shows the split before saving; "Settle in full" fills the exact amount owed that day), and write
  off bad debt. Shows what is still owed, interest earned, who is late and for how many days, what arrives in the next
  12 months, a money-weighted yearly return, concentration on one borrower, and "is lending worth it" against what the
  cash could earn elsewhere (present value at a rate you choose).
- **In the books** (`lib/lending.ts`): lending out is cash out (investing), repayments are cash in, the interest part is
  profit when RECEIVED (never before; owed-but-unpaid interest is shown separately and stays out of profit, tax and
  cash), a write-off is a loss, and what is still owed is an asset on the Balance Sheet ("Money lent out"). The P&L,
  cash flow and Balance Sheet all gained matching lines. Interest follows the Loans page's convention (rate / 12 a month
  on what is owed, month-anchored at the start date so 31-Jan loans don't drift), so paying exactly as agreed matches the
  schedule to the cent while late, early and short payments are handled truthfully.
- **Safety:** `lentLoans` + `lentLoanTxns` collections with owner-only write rules; both are in the full backup and the
  restore script, the accountant pack (CSV), the period lock (repayments, write-offs, loans and money-changing edits in
  a closed month are refused; fixing a name or note is not), and accountant read-only. A repayment bigger than what was
  owed, a backdated one that would break a later one, deleting a loan that has entries, and terms that no longer fit
  recorded repayments are all refused with a plain message. A late borrower raises a notification linking to the page.
  The two new reads are failure-tolerant: if the updated Firestore rules are not deployed yet, the page is empty and
  everything else still loads (deploy the rules first anyway: see DEPLOY-CHECKLIST).
- **Stock over time** (Financial health): inventory value at each of the last 12 month-ends (a replay of the same
  weighted-average-cost ledger, so the newest point equals the Balance Sheet), cash tied up in items that have not sold
  for 90+ days (an item that only just arrived is not "slow"), and items that will run out within 30 days at the recent
  pace. `lib/inventoryInsights.ts`.
- **What equipment will be worth later** (Fixed assets): book value today and in 1, 3 and 5 years, depreciation still to
  come in the next 12 months, and which assets are fully depreciated within a year (replacement planning). It asks the
  same function the Balance Sheet uses, and reconciles with the P&L's month-by-month depreciation. `lib/assetOutlook.ts`.
- **Accountant pack, monthly P&L:** the CSV now lists contribution margin, depreciation, asset disposal gain/loss,
  investment income and gains, interest received on money lent and its bad debts, so the columns add up to
  `net_profit_before_tax` (before, depreciation and investment income were inside profit with no column to explain
  them). Checked in `verify-lending.ts`. Editing a loan and emptying "purpose" or "notes" now really clears it.
- **Dashboard "Needs your attention":** two new lights, "Borrowers are late paying you" (watch from 5% of what is owed
  being late, act from 25%) and "Cash is stuck in stock that isn't selling" (watch from 25% of stock value unsold for 90+
  days, act from 50%). Silent unless the business actually lends or holds stock.
- AI help knows the new page. User manual, deploy checklist and business-value doc updated. The landing page feature card now says the app covers money lent out and investments (previously it only mentioned borrowing and equipment).
- `scripts/verify-lending.ts` (128 checks, including 300 random lending books where the Balance Sheet balanced every
  time), `verify-inventory-insights.ts` (25), `verify-asset-outlook.ts` (17).

## Time entries: the correction form used the wrong calendar day, and refused overnight shifts

Found in the last-day review by running the real round trip in Colombo time (UTC+5:30).

- **Wrong day:** the Time page's "Correct an entry" form read the date from UTC but the start/end times from the local
  clock. A shift that began between midnight and 5:30 am reopened with *yesterday's* date, and saving moved it back a
  whole day (payroll and project labor cost landed on the wrong day). Same UTC-vs-local slip in the Projects cost
  ledger's labor-row date and in the Profitability 30/90-day window start; both now use the person's own date.
- **Overnight shifts:** both times were glued to one date, so a shift that ran past midnight failed with "Clock-out has
  to be after clock-in" even when the manager only wanted to fix the rate. An end time earlier than the start now means
  the next day, and the form says so ("this shift ends the next day (8.0 h). Check that is what you meant").
- `lib/timeEntryEdit.ts` (new, pure) holds the logic; `scripts/verify-time-entry-edit.ts` (new, 131 checks) round-trips
  every quarter-hour band across midnight, overnight and year-end shifts, and refuses empty input. It re-runs itself
  under Asia/Colombo when no timezone is set, so it can never pass vacuously.

## Selling a share of the business: ownership, dilution and a use-of-funds plan

Covers the equity-raising ideas a founder needs (equity vs loan, dilution, valuation, a clear plan for the money)
without going near a registry, exchange or regulator. IPOs, primary/secondary markets and follow-on offerings are
deliberately not built: they need those external bodies and don't apply to the SMEs Balancr is for.

- **My Profit → Selling a share of the business** (owner only, collapsed by default): a shareholder list, a what-if
  raise showing price per share, new shares, what the investor owns and what every current owner gives up, warnings
  when an investor would hold more than half or an owner would lose their majority, a "money raised vs % given away"
  ladder (tap to fill in), a valuation sanity check from the business's own sales, profit and balance sheet, a
  use-of-funds plan that checks it adds up to the raise, and a history of past raises.
- `lib/equity.ts` (new, pure): cap table, list validation, `planRaise`, `dilutionLadder`, `impliedMultiples`,
  `summarizeUseOfFunds`. Shares are whole numbers; the money buys the nearest whole number of shares and the screen
  says so when that changes the effective price.
- Stored on the settings doc as `Settings.equity` (so it is in the backup). The general Settings form only saves its own
  fields, so it can never overwrite it. No new collection and no change to `firestore.rules` (settings are owner-write).
- `DataContext.recordEquityRaise`: one batched write for the updated owners list, the round history and, optionally, the
  cash received as a capital entry. Goes through the period lock on the cash date.
- `scripts/verify-equity.ts` (new, 44 checks): percentages, validation, the textbook 100-share case, 3,000 random cap
  tables (everyone diluted by the same proportion, percentages add to 100, investor holds money / worth-after), control
  warnings, refusals, the ladder round trip, the sanity-check ratios, the use-of-funds plan, and the Balance Sheet still
  balancing when the money is recorded.

## Investor pools: crowdfunded land and property, dividends by percentage

Gap found in the final check: depreciation (straight-line and reducing balance) and appreciation of the business's own
investments (property included) were covered, but taking in other people's money and paying them dividends by share
was not. Added without changing how the statements are built.

- An investor's money and a payout are normal capital entries, now optionally tagged with the investment
  (`securityId`), the person (`investorName`) and, on a payout, `distribution` ("profit" or "capital"). Cash flow and
  the balance sheet already treat capital as equity in and out, so they stay balanced with no change to them. No new
  collection and no change to `firestore.rules`.
- `lib/investorPool.ts` (new): shares by what each put in, pool worth now (the investment at its typed-in value plus the
  pool's cash), pool profit, each investor's stake and return, and the payout split. The split adds up to exactly the
  amount to the cent (largest-remainder), and a return of capital splits by what is still owed.
- Investments page: a new **Investor pools** section (phone cards, table from sm up), an add-money form and a payout form
  with a live preview and confirm-on-warning. Owner only, like the rest of the page. A payout saves all investors in one
  batch (`addCapitalEntries`) so a dropped connection can't leave it half paid, and it goes through the period lock.
- Investor payouts are no longer counted as the owner taking money out (survival number, maintenance reserve), and
  reconciliation labels them "Investor dividend / capital returned / money in".
- An investment that has investor entries can't be deleted. The capital list labels investor rows. CSV export and
  import keep the tagging (`investor`, `investment_id`, `payout_type`), and the JSON backup keeps it already.
- `scripts/verify-investor-pool.ts` (new, 50 checks): a land project from raising money to buying, revaluing, selling,
  paying a dividend and returning capital, with the Balance Sheet checked at every stage, plus 3,000 random splits.

## Two small timezone fixes

Full re-check before launch: `tsc`, lint, production build and all 49 verification scripts pass. Two places still used
the UTC date where the customer's own calendar date is right (Colombo is UTC+5:30, so they disagreed from midnight to
5:30 am):

- **AI cash-flow tool:** overdue receivables/payables were aged against the UTC date; it now uses the person's own date
  already resolved for the request (`resolveToday`), the same one the AI uses to date proposed entries.
- **Staff utilization:** a clock-in was placed on its UTC day when deciding whether it falls inside the trailing window;
  it now uses the local day, matching how the window start is computed. `computeStaffUtilization` in `lib/calculations.ts`.

Left alone on purpose: UTC dates used for the daily AI message cap, trial/renewal dates and the daily job, which only
need to be consistent, not local.

## Slow stock and customer statements (cash-focused, no new settings)

Both are read-only views of records the app already holds; no ledger, rule, index or setting changed.

- **Slow stock (Items page):** lists items you still hold that have not sold for 90+ days (never-sold items count
  from the day first bought, so new stock is never flagged), with the cash tied up at cost and its share of your stock
  value. Same cost figure as the Balance Sheet. Shown only when something qualifies. `lib/stockHealth.ts`, checked by
  `scripts/verify-slow-stock.ts`.
- **Customer statement of account (Customers page):** one printable page per customer with every open invoice, what
  is overdue, an aging split and the total owed, built from the same lines as Receivables. Hidden from Staff (they
  never see balances). Customer text is escaped on the printed page. `buildCustomerStatementHtml` in `lib/print.ts`,
  checked by `scripts/verify-customer-statement.ts`.

## Removed three unused write endpoints (launch-day safety)

No screen, setting, calculation or document used these, so nothing a customer sees changes.

- **Removed `/api/recurring/generate`, `/api/invoices` and `/api/stock/levels`.** They were early scaffolding that no
  screen calls. Each wrote straight to the database with the server key, around the app's own safeguards: the first
  could post expenses on a date the owner had already closed (the in-app recurring flow cannot, and asks for review
  first), the second wrote invoice records nothing reads, and the third was a GET that rewrote a stock number on every
  product that nothing displays. The first also needed a database index that was never declared, so it would have
  failed with an error if ever called. Recurring expenses, invoices and stock all keep working exactly as before
  through the app (DataContext).
- README: verification script count corrected (47).
- Checked and left alone: all 47 verification scripts pass (the books fuzz test confirms the Balance Sheet balances
  on every random business), every Firestore query has the index it needs, the AI route is capped per day, per
  message, per tool round and per turn time, and every on-screen table scrolls sideways on a phone.

## Reducing-balance depreciation and investment goal planning

- **Depreciation:** fixed assets can now be depreciated by reducing balance (a yearly % of the value left, floored at
  salvage) as well as straight-line. Every existing asset stays straight-line, exactly as before. It feeds book value,
  the monthly P&L, disposal gain/loss and the Balance Sheet through the one existing calculation, so they cannot
  disagree. New check: `scripts/verify-depreciation-methods.ts` (also proves the Balance Sheet balances).
- **Investments:** a target planner: the monthly amount needed to reach a target in N years, or the time to reach it
  at the current top-up, on the same assumptions as the projection.
- README states plainly what is out of scope: managing other people's money (funds, brokers, insurers).

## Investments: growing the business's capital in securities

- **New page: Investments** (owner records, manager and accountant read). Shares, bonds and treasury bills, funds,
  fixed deposits, property or anything else: buys, sells and income entered by hand, prices typed in by hand
  (no broker, no price feed, no external system). Shows cost, value now, unrealised and realised gain, income, total
  return, a money-weighted yearly return (after 3 months of history), allocation by type, and an assumption-based
  "what it could be worth later" projection with a monthly top-up.
- **Books:** buys/sells move cash in Investing; income and realised gains are profit (below operating profit, taxed
  with it); holdings are on the Balance Sheet at current value with the unrealised gain in equity. The Balance
  Sheet balances by construction (verify-investments.ts proves it). A business with no investments is unchanged.
- **Safeguards:** weighted-average cost; no future dates; cannot sell units not held or delete a buy a later sale
  depends on; closed months refuse trades; unpriced holdings are carried at cost with no invented gain; stale
  prices (90+ days) flagged. New Firestore rules (owner writes, books readers read), `manage:investments`, audit
  log, backup/restore, CSV and Accountant pack.
- No new indexes or settings. New check: `scripts/verify-investments.ts`.

## Owner alert when the AI provider needs attention, and a no-maintainer guide

- **New:** if the AI provider refuses the key (401/403), reports an empty balance (402) or no longer knows the
  model (404), the owner gets one plain email a day at `ADMIN_NOTIFICATION_EMAIL`. Customers see the same
  friendly "temporarily unavailable" message as before and are not charged a message. Busy/timeouts never email.
  `lib/aiProviderAlert.ts`; `aiErrorResponse` in `lib/apiError.ts` is now async (all callers already `return` it).
- **New:** `MAINTENANCE.md` (watch-list for running without a maintainer) and a "Scope decisions" section in the README.
- **Landing page:** redesigned (ruled-ledger hero, shared section layout, closing call-to-action), with a phone-only
  sticky action bar (`components/MobileCtaBar.tsx`), better tablet breakpoints on pricing, and 44px touch targets.
- **Fix:** escaped quotes in the empty-search message on the Customers page (lint).

## Accountant login, and fast sign-in for very large businesses

**Deploy `firestore.rules` for this build** (the Accountant login does not work without it).

- **New: view-only Accountant login.** Owner invites someone as "Accountant (view only)" from Team access. They can
  view and print the books and download a new **Accountant pack** (monthly profit & loss, receivables and payables
  aging, sales, purchases, expenses, capital, tax payments, loans, fixed assets, items, customers). They cannot create,
  edit or delete anything, and never see payroll, team, settings, the activity log, notifications or the AI assistant.
  Enforced three ways: `firestore.rules` (the role appears only in read rules and is excluded from every "any active
  member can create" rule), `lib/permissions.ts` (no write permission) and `lib/readOnlyGuard.ts` (every data-context
  mutation refuses with a plain sentence). "+ Add" buttons are hidden for the role and any form that opens shows a
  view-only notice. Checked by `scripts/verify-accountant-readonly.ts`, which fails if a new write method or rule lets
  the role through. Limit: one login belongs to one business.
- **Faster sign-in for high-volume businesses.** The app used to recalculate stock, profit & loss, aging and the balance
  sheet each time one of ~40 collections arrived (dozens of full passes over every sale). It now waits and calculates
  once. Sales lookups use a map instead of scanning the product list for every sale.
- **Long lists no longer draw every row.** Sales, purchases, invoices, customers, estimates and cash counts show the
  newest 50 with "Show more" (and "Show all" when it is small). Totals, KPIs and exports still use every record.
  Customers gained a search box.
- **Cheaper AI/aging reads.** The AI reminders/forecast and the aging report now read only credit sales and credit
  purchases (the only ones that can be owed), instead of the whole sales and purchases history.
- **Accountant-pack CSVs are spreadsheet-safe**: text starting with = + - @ gets a leading apostrophe so a customer name
  cannot run as a formula on the accountant's machine. Backup files are untouched.
- Unknown role strings now mean "no permissions" instead of a crash.
- **Early warnings and cash firewall (Financial health page; a short "Needs your attention" strip on Home only when
  something is amber/red).** Five plain-language lights computed from numbers the app already has: cash cushion vs your
  survival number (or fixed costs) with a 3-month safety target and the exact shortfall, sales vs what you need, gross
  margin slipping, customers paying late (>30 days share), and losing money several months running. They look at
  completed months only, so a half-finished month never raises a false alarm. `lib/earlyWarnings.ts`, tested by
  `scripts/verify-early-warnings.ts`.
- **Rough value of the business** (same page): 2-4x yearly pre-tax profit from the last 6-12 full months, with net assets
  shown separately and a "not a valuation" note. Never shows a positive value for a loss-making business.
- **Bank reconciliation shows who reviewed each line** (and when), so the owner can see the reviewer is not the person who
  made the payments - a basic separation-of-duties check.
- Not changed, on purpose: the app still loads a business's full history at sign-in (reports need it). Returning users
  load from the browser's local cache; a first visit from a new device on a very large account is the remaining slow case.

## Trial form follows the email rule

- **Fixed: the trial form always said "Please use a Gmail address", even after `TRIAL_EMAIL_DOMAINS` was widened.**
  A company-email visitor was told they could not apply while the server would have accepted them. The hint and
  placeholder now come from the real setting (`app/request-trial/page.tsx` reads it on the server and passes it to
  `RequestTrialForm.tsx`). Default behaviour is unchanged: Gmail-only still shows the Gmail hint.
- Checked and left alone: the login and trial pages have no sideways scroll on a phone, all fields are 16px so iOS
  does not zoom, and the only sub-40px links are inline sentence links.

## Audience copy widened

- The "Made for the person running the shop" paragraph said "one to ten people", which told a 15-person business
  it was not for them. It now says "a one-person shop or a growing team". No other copy, pricing or logic changed.
- Measured, not changed: the core maths (monthly P&L, stock ledgers, receivables aging) runs in about a second at
  100,000 sales. Cloud load time at that size was not measured; the app reads every record into the browser at sign-in,
  so very high-volume businesses are the first thing to watch.

## Landing page polish

No logic, pricing or copy changed.

- **Main button is now above the fold on laptops.** The hero was centred against the tall demo card, which pushed
  "Try it now" to the very bottom edge of a 1280x800 screen. It is now top-aligned, with a slightly smaller headline
  below 1280px wide; the button sits at about 670px on 1366x768, 1280x800 and 1440x900.
- **Logo link is a 44px tap target on phones** (it was 28px).
- **Demo card header stacks on phones** instead of squeezing its two labels onto separate wrapped lines.
- **Pricing and FAQ links scroll smoothly** (unless the device asks for reduced motion) and stop just clear of the
  sticky header.

## Launch-day pass: dead-scheduler warning and one wrong checklist line

No ledger, billing, rules or pricing logic changed.

- **New-lead email warns if the daily job has stopped.** The morning digest cannot tell you it is not running, so
  the new-lead email (which still arrives) now carries a WARNING line when the daily job last ran more than 36 hours
  ago (`lib/cronHealth.ts`, same threshold as the admin Automation card). Silent when `CRON_SECRET` is unset or the job
  has never run yet. It can never block or fail a lead. Checked by `scripts/verify-cron-health.ts`.
- **Fixed: DEPLOY-CHECKLIST said the set-password link lasts about an hour.** It lasts 7 days; only the Firebase
  fallback link lasts about an hour.
- Dependency audit reviewed and left alone on purpose: the critical Next.js finding is the self-hosted Image Optimizer
  DoS and does not apply to a Vercel deploy without `remotePatterns`; the rest need breaking upgrades.

## Last-day review: AI cost metering, a wasted-turn bug, and a randomized books test

No ledger, billing, rules or pricing logic changed.

- **AI usage is metered per business.** Messages and tokens are added to `meta/aiUsage` each month
  (`lib/aiUsageLimit.ts`), including the tokens of a turn that failed part-way and was refunded.
  Admin → Manage accounts shows "AI this month: N messages · ~$X" and the CSV gains
  `ai_msgs_this_month` / `ai_est_usd_this_month`. The estimate uses DeepSeek Flash's peak list price
  (`AI_PRICE_*` overrides). Best-effort: a failed write never affects the customer's answer.
- **Fixed: price suggestion with an empty name cost a daily AI message.** It is now validated before
  the turn is counted.
- **Fixed: a false "private key embedded" launch failure** from a dummy string in
  `verify-pipeline-automation.ts`.
- **New `verify-books-fuzz.ts`:** 400 seeded random businesses (credit and cash sales and purchases,
  partial collections, write-offs, unpaid bills paid in parts, withdrawals, tax, owner draw) must keep
  the Balance Sheet balanced and receivables, payables, bills and revenue tied to the raw records.
- README: price line updated to DeepSeek's current Flash prices; script count corrected.
- Known limit, unchanged: suspension and trial/renewal locks are enforced in the app and API routes,
  not in `firestore.rules` (see the 'Limit' note under the trial-lock entry below).

## Set-password link + email fixes, and strangers can't use our email

No Firestore-rules change. Fixes the "Something went wrong" page on the copied WhatsApp link, and the setup email that
never arrived.

- **The set-password link no longer dies on an unauthorised domain.** Firebase refuses to build a reset link whose
  return address isn't under Authentication → Authorized domains; `/api/start`, the provisioning fallback and the
  browser's Firebase-email fallback all hit that and failed together. `lib/resetLink.ts` now retries without the return
  address, so the link works either way (add the domain anyway — see DEPLOY-CHECKLIST).
- **The error page carries a reference** (`Reference 3fa9c1`) that matches the Vercel log line `[api/start ref=…]`, so a
  failure can be traced without telling a stranger anything about the setup.
- **A failed email now says why**, in the admin panel (Send sign-in link, Activate, New business): Resend sandbox
  sender, unverified domain, bad API key, malformed Reply-To, rate limit. `check-launch-readiness.mjs` fails on a
  `@resend.dev` sender and on a malformed support address.
- **Strangers can't phish through our domain.** The confirmation email greeted "Hi <first word of the typed name>", so a
  name like `http://evil.example/win` put a troll's link in a message from our verified domain. Only a real-looking first
  name (any script) is echoed now (`lib/emailSafety.ts`); everything else becomes "there".
- **A hard daily ceiling on emails a stranger can cause** (`lib/emailBudget.ts`, 60 confirm + 30 feedback by default,
  fails closed, separate budgets, admin/receipt/reminder mail never counted) so many addresses or many connections can't
  drain the Resend allowance. The "you already have an account" email gained the same per-address daily limit as the
  confirmation (it only had 1 per 10 minutes, i.e. up to 144 a day to one customer's inbox). Feedback gained a per-IP
  daily limit; the note is always saved even when its email nudge is over the cap.
- New check: `npx tsx scripts/verify-email-abuse.ts`. Two older structural checks were repointed at the new helper.

## Free-account guardrails: the public demo can't be ruined, trials can't run up costs

Additive for paying businesses (their limits and rules are unchanged); needs `firestore:rules` and `storage` redeployed.

- **No shared demo password.** `/api/demo/session` mints a one-time Firebase custom token; `DEMO_PASSWORD` and the
  hard-coded password are gone. The demo's login is restored if a visitor deletes/disables/re-addresses it (same uid).
- **Auto-reset to sample data** (`lib/demoServer.ts`): after use + 35 min idle, once a day (daily job), or from the admin
  "Reset public demo now" button. Wipes everything except the account marker, re-seeds, removes strangers' membership
  pointers, rotates the password. Lock + minimum gap stop it looping. Refuses unless the account is flagged public demo AND
  plan "Demo" AND complimentary, so a customer's books can never be wiped.
- **Database-level restrictions in the demo** (`firestore.rules`, `isPublicDemo`): nothing can be deleted, settings and
  team/invites can't be changed. Only ever an extra `&&` on existing rules, so it can deny more but never allow more. Delete
  rules that were combined with create/update were split so the guard can't be skipped. The UI hides the same actions.
- **AI limits by account kind** (`lib/guardrails.ts`): demo 40/day, 8 per IP, 500-char messages, no note/product persisting;
  trial 50/day; paying unchanged at 100. Applies to `/api/ai/chat` and `/api/ai/suggest-price`.
- **Storage:** the logo path is pinned to `logo.png`. It used to accept any file name under the business's folder, so a free
  account could upload unlimited 5 MB public images.
- `verify-demo-guardrails.ts` (89 checks, including the destructive reset run against an in-memory fake);
  `verify-api-route-guards.ts` covers the new public route; launch check warns on missing `DEMO_EMAIL` / `CRON_SECRET`.

## Trial form: Gmail-only, confirm-your-email, and quiet handling of trolls

Additive; no ledger, billing, rules or pricing logic changed.

- **Gmail only by default** (`lib/emailPolicy.ts`). Other providers are refused with a message that says to use Gmail;
  addresses Gmail cannot have (under 6 or over 30 characters, `_`, `-`, `..`) are refused before we email them.
  `TRIAL_EMAIL_DOMAINS` widens it (a list, or `*`).
- **Confirm your email.** A submission is held in `trialIntake` and the typed address is emailed a signed 24-hour link
  (`/verify-trial`, `app/api/trial-requests/verify`). Only a confirmed address enters the Trial requests queue,
  emails you, or can be auto-activated. The page POSTs the token itself, so a mail scanner that merely fetches the link
  cannot confirm an address for its owner. Confirming claims the submission atomically (no double lead on a double tap).
- **One trial per person.** Gmail dots, `+tags` and googlemail.com collapse to one identity key (`emailKey`); the
  typed address is still what we email and log them in with. An address that already has a login (under the typed or
  collapsed form, or via an earlier provisioned request) gets a "you already have an account" email instead.
- **Quiet, not loud.** Honeypot, blocked identity, suspicion score, existing account and per-identity limits all
  return the same success response as a real submission. Only the Gmail rule and the IP limit ever show an error, and
  both state the published rule rather than the detection.
- **Soft suspicion score** (`lib/trialAbuse.ts`): placeholder / one-letter / keyboard-mash names, links in name or
  business, script-like posts, sub-1.5 s fill-in time, many identities from one IP. No single signal can discard a
  request; 3–5 shows a **Looks odd** badge with reasons on the lead card; 6+ is dropped quietly (kept in `trialIntake`
  for audit, never queued). Script-aware: Sinhala/Tamil names are never penalised.
- **Dismiss & block** on a lead card blocks that Gmail identity (silently); **Reopen** lifts it.
- Per-IP daily limit (15) added beside the hourly one (5); per-identity: 1 confirmation email / 10 min, 4 / day.
- Confirmation links are built from `NEXT_PUBLIC_SITE_URL` (or the host the request arrived on), never the request's
  `Origin` header, so the email can't be turned into a phishing link from our own sender.
- `trialIntake` is emptied after 7 days by the daily job. Neither it nor `trialBlocks` has a Firestore rule (client denied).
- If email isn't configured no link can be sent: requests are saved **unconfirmed** (flagged in your notification email),
  and `scripts/check-launch-readiness.mjs` warns.
- New `scripts/verify-trial-abuse.ts` (80 checks); `verify-api-route-guards.ts` now covers the confirm endpoint;
  `verify-pipeline-automation.ts` assertions re-pointed at `lib/trialCommitServer.ts`, where the save → activate →
  notify sequence now lives.

## Landing page in plain words, and a demo that explains itself

Copy and presentation only; no logic, pricing, rules or data changed.

- **Headline** is now "Just type what happened. Balancr does the accounting." (the old tagline stays in the footer);
  page title, meta description and share images say the same.
- **The hero demo (`components/HeroLedger.tsx`) is three numbered steps**: 1 tap something that happened today,
  2 see the form Balancr fills in plus one plain sentence on what it does to your profit, 3 save and watch the profit
  move, with a "+Rs 2,800 from this" change next to it. Accounting words became everyday ones (cost of goods -> "stock
  you bought to sell", overhead -> "running costs (rent, wages, bills)", net profit -> "profit this month - what you keep"),
  break-even is one sentence, and a "try the real thing" link sits under the card.
- **The demo button says what it is:** "Try it now - no signup" (landing, trial section, login page). Under the hero
  buttons: what you land in (a sample shop with made-up sales) and three things to try: Selling, Money owed, Assistant.
- Every section heading, feature, step, FAQ answer and pricing line rewritten in shorter, concrete sentences; jargon
  (EOQ, weighted-average costing, P&L, receivables/payables aging, retainer, white-glove) removed. New FAQ: "What should
  I do once I'm in the demo?". Plan taglines in `lib/pricing.ts` reworded (prices unchanged).
- New `scripts/verify-landing-copy.ts`: no jargon in visible text, one label for the demo button everywhere, the menu
  items the page tells visitors to open really exist, and the demo's sentences quote the same numbers it calculates with.

## Pipeline automation, second pass: fewer clicks for you, fewer dead ends for the customer

Everything is additive; no ledger, rules, pricing or billing logic changed.

**For the customer**
- **The welcome link no longer expires in an hour.** The email now carries `/api/start?t=…` (new
  `app/api/start/route.ts`, `lib/signedToken.ts`): an HMAC-signed link valid for 7 days that mints a fresh Firebase
  password link when opened. It refuses anyone who has already signed in (a stale email can never reset a chosen
  password), is rate limited, never cached, and falls back to Firebase's own link if no signing key exists.
- **Missed the email? They get a fresh link by themselves** on day 2 and day 6 after activation, then it stops
  (`activationNudgeDue` in `lib/lifecycle.ts`, sent by the daily job, remembered per date so it is never repeated, and
  never on the same morning as a trial/renewal reminder).
- Optional **instant activation** (`AUTO_ACTIVATE_TRIALS`, off by default): the request form answers "your account is
  ready, check your inbox" instead of "we'll be in touch". Guards in `lib/autoActivate.ts` (throwaway domains,
  existing logins, daily cap that fails closed, leads you already replied to stay manual); everything it declines falls
  back to the normal queue. Provisioning moved into `lib/provisionServer.ts` so the admin route and this path share one
  implementation.

**For you**
- **Today** now lists waiting leads with an Activate button, shows a **Customer funnel** (activated → signed in →
  logged something → paying), lists customers who **never signed in** with a one-press **Send sign-in link**, and
  refreshes itself every minute while visible.
- The new-lead email links straight to that lead with Confirm open; **Activate all** handles a backlog; a request
  activated automatically says so in Resolved and in your inbox.
- **Manage accounts** shows a *Never signed in* badge and the same Send sign-in link button
  (`/api/admin/businesses/[id]/invite`); the accounts CSV gains a `last_sign_in` column.
- The admin passcode is kept for the tab (sessionStorage, 30 idle minutes, re-verified with the server on restore), with
  a Lock button; the tab title shows the waiting-lead count.
- The morning digest also lists never-signed-in customers and the sign-in reminders it sent.

**Checks**: new `scripts/verify-pipeline-automation.ts` (token tampering/expiry, nudge schedule, digest, guard rules and
source-structure checks); `verify-lifecycle` and `verify-api-route-guards` updated for the moved activation code and the
one new public link route. `tsc`, lint, all verify scripts and a production build pass.

## Final review, second pass: AI session id validated before use

- `lib/apiError.ts` adds `isValidSessionId` (letters, digits, `_` and `-`, 8 to 64 characters; the app's own UUIDs and
  timestamp ids pass). `/api/ai/chat` and `/api/ai/sessions` (delete) now refuse anything else with a 400 before a daily
  message is counted or any database path is built. The id was being placed straight into a Firestore path, so a value with
  a slash could point at a different document inside the caller's own business. It could never cross into another
  business, but it could waste a message or write a stray document. No ledger, rules or pricing changes.
- Checked with no change needed: empty-data behaviour of forecast, break-even, runway and Profit First (no NaN reaches the
  screen; the one Infinity, break-even with no sales yet, is already shown as "—"); provisioning rolls the login back if
  the business documents fail to write; AI prompt size is bounded (catalog capped at 300, last 16 messages, capped memory
  notes, 4000-character messages, 100 messages/day, 35 s turn budget).

## Final review: AI turn time budget + demo-login warning

- `app/api/ai/chat/route.ts`: the tool-round loop now stops starting new rounds once a turn has used 35 s (clock starts
  before the first provider call). Before, five slow provider calls in a row (1 + up to 4 rounds, 20 s each) could outlast
  `maxDuration = 60`; a host kill skips the catch block, so the message would not be refunded. Hitting the budget returns
  what was already collected, exactly like hitting `MAX_TOOL_ROUNDS`. No ledger, rules or pricing changes.
- `scripts/check-launch-readiness.mjs`: warns when `NEXT_PUBLIC_DEMO_EMAIL` / `NEXT_PUBLIC_DEMO_PASSWORD` are unset, because
  the "Try it now" button then uses the defaults in `lib/demoAccount.ts`, which anyone can read in the site's JavaScript.

## Final-day check: a hung AI provider can no longer eat a customer's message

The one gap found in the last review. `callClaude` had no timeout, so a provider that accepted the request and then
never answered held it open until the host killed it. A host kill skips the routes' catch blocks, so the daily message
was never given back and the customer saw a bare platform error.

- `lib/anthropic.ts`: each provider call now stops after 20 s (covers reading the body too). Timeouts, network
  failures and unreadable answers all become an `AnthropicApiError`, so the routes give the message back and show the
  same friendly "temporarily unavailable" text as any other provider problem. Checked against a server that never answers: fails with 504 after the limit.
- `/api/ai/chat` and `/api/ai/suggest-price` declare `maxDuration = 60` so a turn with a few tool rounds isn't cut short
  by a low host default. Hosts without a limit ignore it. No ledger, rules or pricing changes.

## Signed-in UI/UX pass (last day)

Reviewed the shared components and the pages a new customer hits first. Shared components were already solid (16px
inputs so iOS doesn't zoom, 44px touch targets, card lists on phones instead of wide tables, bottom nav with a More
sheet, autofill and show/hide password on login). Three gaps fixed, all in shared code, no logic or data touched:

- **Form labels now linked to their fields.** None of the ~370 labels were (`htmlFor` was never set), so tapping a
  label didn't focus its field and screen readers couldn't pair them. `Field` now registers its first control and
  `Label` points at it (components/ui.tsx); explicit ids are respected, a label outside a Field is unchanged.
- **Toasts and inline form errors are announced** to screen readers (role status / alert).
- **Primary button matches the landing page:** flat gold instead of gradient + glow, so the CTA a visitor clicks looks
  like the one waiting inside the app.

## Landing page redesign (last day)

- **Hero is now a working demo** (`components/HeroLedger.tsx`): pick something an owner would say, see the entry the
  assistant proposes, press Save, and the net profit and break-even bar update; Undo reverses it. It replaces the two
  static mockups. Static data, no network, keyboard and screen-reader friendly (radio group, live status).
- **Layout:** wider container, heading + intro in a left column with content beside it on desktop, stacked on phones.
  Sticky header (Pricing, FAQ, Sign in, one primary button). The demo link moved out of the header into the hero.
- **Less template, more product:** flat amber buttons (no glow), no ruled-paper backdrop, sentence-case labels instead
  of tracked all-caps, pricing cards without scale/glow or the extra "most businesses choose" line, plain steps under
  pricing. Copy, prices and brand colours unchanged. FAQ now says "Open the live demo" to match the button.
- **Colour with meaning (added after the redesign).** The page now uses the app's own palette instead of gold alone,
  and each colour marks a real difference: feature icons in five tones (no two neighbours match), product flow in
  gold vs service flow in sapphire, one colour per "in control" point, green check vs grey cross for "It is / It
  isn't", a gold/sapphire/plum top accent per plan, and a lighter band behind the control section for rhythm. The
  hero demo colour-codes Sale (emerald) vs Expense (sapphire) and replaces the break-even bar with a stacked "where
  revenue goes" bar (cost of goods gold, overhead sapphire, profit emerald) with a labelled legend, so colour is
  never the only signal. All text colours clear 5:1 contrast on the page's dark surfaces. No copy, prices or logic changed.
- Earlier entries below that mention the "worked examples" band or a header demo link describe the previous layout.

## One-tap demo: "Try it now" on the landing and login pages

Lowest-friction way to see the product before asking for a trial. **The free-trial request is unchanged** and sits
beside every demo button.

- **`components/TryDemoButton.tsx`** signs into the shared demo login in one click; `AppShell` then sends the visitor
  to the dashboard. If sign-in fails it turns into a link to `/request-trial`, so nobody hits a dead end.
- **Landing page:** the hero's primary button is now "Try it now — one tap" with the trial button beside it (pricing
  became a text link under it); a "Try the demo" link in the header (desktop); an "Open the live demo" band under
  the two worked examples; a "look around first" button in *How a trial works*; and a new FAQ entry.
- **Login page:** a "Just looking? Try the demo" button under the form.
- **Demo sessions end on their own.** The demo sign-in (`signInDemo` in `AuthContext`) uses per-tab Firebase session
  persistence, so closing the tab or browser signs the tester out and their next visit shows the landing page. A tab
  left open is cut off after 30 minutes (`NEXT_PUBLIC_DEMO_SESSION_MINUTES`) and sent back to the landing page, and
  "Sign out" inside a demo also returns to the landing page instead of `/login`. Normal logins are untouched: `signIn`
  restores remembered (local) persistence and clears the demo stamp, so using the same account via `/login` never
  times out.
- **`lib/demoAccount.ts`** holds the demo email and password, overridable with `NEXT_PUBLIC_DEMO_EMAIL` and
  `NEXT_PUBLIC_DEMO_PASSWORD` (documented in `.env.local.example`). They are public by design: use a throwaway
  sandbox account (Admin → New business → Create demo business), never one with real customer data.

## Last-day audit: AI failures no longer cost the customer a message or leak vendor errors

Full check on the finished build: `tsc`, lint, all 34 `verify-*` scripts and a production build (64 pages) pass.
The audit found two problems in the AI path, both fixed without touching the ledger or any rules:

- **A failed AI turn still used up a daily message.** The cap is charged before the model is called, so a
  provider outage plus a few retries could lock a customer out for the day having received nothing. The turn is
  now given back (`refundAiDailyTurn`, best-effort, never below zero) when the provider fails, on both
  `/api/ai/chat` and `/api/ai/suggest-price` (which also gives it back on an unusable answer).
- **Raw provider errors reached the customer**, and the provider's own status was forwarded, so an empty provider
  balance or bad key (401/402) looked like the customer's sign-in problem. `aiErrorResponse` now logs the real
  detail server-side and returns a plain message (502, or 503 when busy). The deployer still sees the cause in logs.
- Docs: BUSINESS-VALUE said the cap was 200 (it is 100); README said 28 verify scripts (there are 34).

## Small UI/UX polish: headline, login, keyboard focus

Checked the public pages in a real browser at phone and desktop width and fixed what looked rough. No logic,
data or rules changed.

- **Landing headline** no longer leaves "can you." stranded on its own line (balanced wrapping).
- **Demo amounts** ("Rs 9,000", "rs 9000") stay on one line in the landing-page assistant preview.
- **Login:** a Show/Hide password toggle (large phones-friendly), the "Balancr" name links back home, the
  placeholder reads "Your password" instead of dots that looked already filled in, and the "no login yet?"
  note now links straight to Request a free trial and says plainly how a new owner signs in the first time.
- **Keyboard focus:** buttons, links, dropdowns and summaries now show a clear amber ring when tabbed to
  (mouse and touch users never see it). Text inputs keep their existing border-colour focus style.


## Machine-facing API routes now report sign-in / lock-out problems correctly

Found on the last-day pipeline audit: `/api/invoices`, `/api/recurring/generate`, `/api/aging/report` and
`/api/stock/levels` swallowed every error into a generic 500 ("Failed to ..."). They were already safe
(an unauthenticated call was refused), but a suspended, trial-expired or signed-out caller got a vague
failure instead of the real reason. They now use the same `aiErrorResponse` helper as every other route, so
the caller gets 401 / 403 with the actual message. No UI calls these routes; no logic or data changed.


## Landing page: says plainly what Balancr is and isn't

Buyers can assume a bookkeeping product files their taxes, reads their bank or runs statutory payroll.
The landing page now says up front what it does and doesn't do, before pricing, instead of leaving it to
one FAQ line.

- New section "What Balancr is — and what it isn't" (`app/page.tsx`, between "Helpful, never in charge" and
  Pricing). It IS: your own books, and something you can hand your accountant. It ISN'T: a tax filing tool,
  connected to your bank, or a payroll service. Each line matches the product today (no bank feed on
  Reconcile, no tax-authority connection, payroll booked as a cost with estimated take-home and EPF/ETF).
- New FAQ "Will it replace my accountant?"; the existing tax/bank FAQ also mentions payroll filings. The FAQ
  list feeds the FAQPage JSON-LD automatically, so search snippets carry the same answers.
- Copy only: no logic, data or rules changed. Support response time is not hardcoded here because it is set
  per deployment (`NEXT_PUBLIC_SUPPORT_RESPONSE_TIME`).


## Investment calculator: safe-to-commit cash and a downside stress test

The "Is this investment worth it?" calculator (Profit page) judged a purchase on one set of cash flows and
never asked whether the business could afford it. Two additions, both inside the existing collapsed card,
both pure functions in `lib/calculations.ts`, no new page, no new stored data, no Firestore rule changes.

- **`computeSafeToCommit`**: cash on hand − sales tax the books say is owed − supplier and expense bills
  already owed − a buffer (default 3 months of `breakEven.monthlyFixedCosts` + loan repayments). Floors at
  zero and reports the shortfall when cash doesn't cover owed + buffer. Negative tax or payables balances are
  floored at zero rather than treated as spare cash. Receivables are not counted (not cash yet). It runs low
  on purpose (depreciation is in monthly costs; a bill already owed may recur). Everything is from the books;
  nothing is filed with or checked against any tax authority.
- **`computeInvestmentScenarios`**: the same NPV / IRR / payback as base, strong and downside. Each year's
  cash flow moves by the owner's percentages in the favourable or unfavourable direction (a loss-making year
  gets smaller in the strong case and bigger in the downside), floored so a large percentage can't flip a
  sign, plus an optional cost overrun on the downside outlay. No probabilities: a made-up probability would
  look as precise as a fact.
- UI: safe-to-commit block at the top of the card with an editable buffer, three side-by-side case cards
  (stack on phones), a plain verdict on the downside, and a check of the upfront cost against what is safe to
  commit.
- Docs: USER-MANUAL, README, BUSINESS-VALUE and the AI assistant's app knowledge describe it.
- New `scripts/verify-investment-scenarios.ts` (29 checks, hand-computed values).
- Not built, on purpose: lease-vs-buy comparison and a "review this investment against today's numbers"
  page. Each needs data the app doesn't record (lease terms, what an investment was forecast to return), so
  a figure would be a guess presented as a fact.


## Sales tax now carries through every way an invoice can be created

Found on the last-day audit: with sales tax switched on, the estimate you print for a customer includes
tax, and a hand-entered invoice carries it, but three other paths created Sale rows with no `taxAmount`.
The customer was quoted one total and invoiced a lower one, the output tax never reached the Statements
tax summary, and receivables aging under-counted what the customer owed.

- **Estimate → invoice** (`convertEstimateToInvoice`): each generated Sale line now carries its share of
  the tax, split by line value with the last line absorbing rounding (same rule as the multi-line invoice
  form), so the invoice total equals the printed estimate total.
- **Recurring invoices** (`generateInvoiceForSchedule`): retainer/subscription invoices carry tax, computed
  from the current Settings at generation time. The allocation counter resets inside the transaction body
  so a Firestore retry cannot double-count it.
- **Offer fulfilment** (`fulfillOffer`): the sale it logs carries tax on the offer's price.
- **Closed months.** `convertEstimateToInvoice` was missing from `lib/periodGuards.ts`, so converting an
  estimate ignored a locked current month. It is now guarded like `addSale`.
- Not changed, on purpose: CSV / POS imports (historical figures, tax is already inside them) and
  AI-proposed entries (already covered by `verify-ai-auto-confirm`).
- Checked: all verify scripts pass except `verify-credit-limit`, which needs the `firebase` package
  installed to load (`npm install` first). No type-check or `next build` could be run in the audit
  environment (no network): run `npx tsc --noEmit && npm run build` before deploying.

## Opening balances, a demo business, and a support response time

- **Opening balances.** A business that is already running can now enter what customers already owe it and what it already owes suppliers (Money owed → Add opening balance). No revenue or cost is booked, so past months stay untouched; the amounts sit on the Balance Sheet with the matching entry in owner's capital. Collections, supplier payments and write-offs use the normal forms. Add and delete only (no edit, because the amount feeds equity). Covered by Firestore rules, backup/restore, period locks, reminders and the aging report API. Proof: `npx tsx scripts/verify-opening-balances.ts`.
- **Demo business.** /admin/new-business → Create account → Demo business creates a separate, complimentary account with three months of sample data. It never writes into a customer's business. Proof: `npx tsx scripts/verify-demo-data.ts`.
- **Support response time.** `NEXT_PUBLIC_SUPPORT_RESPONSE_TIME` is shown above the support links, and launch readiness warns when it, or any support contact, is unset.
- **Packaged offers.** The sell form now warns owners/managers when the chosen item is a packaged offer with a cost recipe: selling it there skips the delivery cost, so profit looks too high. It points to Offers → Fulfill, which logs the cost and the sale together.
- **Goods + services businesses.** Fixed a false "oversold" badge on every service sale and a red "you've recorded selling X (-7 in stock)" dashboard warning for any service with no cost entry logged. Services have no stock to run out of, so both are now hidden for services (the cost math was already right). Proof that a business mixing goods, pure services and a productized recipe-costed offer balances and reports coherently: `npx tsx scripts/verify-mixed-business.ts`.
- **Final audit fixes.** The AI assistant's cash-flow tool now says it is a rough projection (not a cash balance) and reports overdue customer and supplier money, opening balances included. "Print invoice" is hidden on opening-balance lines (no invoice was issued by this business). The AI assistant knows what opening balances are. The setup checklist points migrating businesses to Add opening balance. Touch targets on the new list were enlarged for phones.

## Home screen: customers to chase and bills to pay

Overdue customer payments and bills coming due were only visible on the Notifications and Money owed pages,
so an owner who opened the app and looked at Home never saw the most time-sensitive cash items.

- **`computeCashActions`** (`lib/calculations.ts`): a pure roll-up of the existing receivables, payables and bills
  aging (no second calculation, so it cannot disagree with Money owed). Overdue customer balances (total, count,
  oldest, top three customers) and payables/bills overdue or due within 7 days.
- Dashboard shows a "Customers to chase" / "Bills to pay" card only when there is something to act on, linking to
  Money owed (which already has per-invoice WhatsApp reminders).
- Forecast note now says plainly that the trend line ignores seasons.
- New `scripts/verify-cash-actions.ts` (9 checks).
- Not built, on purpose: seasonal forecasting, customer deposits/prepayments as a liability, and a per-customer
  statement of account. Each needs data or accounting treatment the app doesn't record today.

# Changelog — this build

## Survival number on the break-even card

The existing break-even card ("Are You Covering Your Costs?") answers whether the business covers its
own costs, but an owner-run SME's real monthly number also has to fund the owner's living costs — money
that never shows up as an Expense, since a draw is a withdrawal, not a cost of doing business.

- **`computeSurvivalNumber`** (`lib/calculations.ts`): break-even's fixed costs plus the average monthly
  amount actually taken out as a "withdrawal" capital entry over the trailing 3 months, and the sales
  needed to fund both. Deliberately reads real recorded withdrawals rather than asking for a typed-in
  "personal expenses" figure — a number the owner would have to keep updated by hand and that this app has
  no way to check. Returns `null` when no withdrawal is on record in the window, so it only appears on the
  Profitability page once it means something, instead of showing a survival number identical to break-even
  for anyone who doesn't track draws through Capital.
- Shown as a second line under the break-even card. Not part of the Instant AI Assistant automatically —
  it can already read Capital entries and break-even, so it can talk through this on request.
- New `scripts/verify-survival-number.ts` (9 checks): correct window filtering (entries before the window
  and non-withdrawal kinds excluded), the arithmetic, `null` on no data or a bad date, and the boundary
  entry exactly on the window's start date. `verify-ai-knowledge-coverage.ts` gains one assertion.
- Docs: README, USER-MANUAL and the AI assistant's knowledge described the break-even card in outline;
  filled that in properly and added the survival number alongside it.

## Profit by location, location tagging on expenses, and a portfolio-facing README

The Locations feature could tag stock and transactions per branch but nothing in the reporting split by
location, so "which branch is actually making money" had no answer inside the app. Now it does.

- **`computeLocationProfitability`** (`lib/calculations.ts`), shown as a "Profit by location" section on
  Profitability once a second active location exists (single-location businesses see no change). Per
  location: orders, units, revenue, gross profit and margin, contribution and margin, average order,
  purchases received (context only), direct one-off costs, contribution after direct costs, and recurring
  monthly costs. It sums the existing per-sale `SaleEconomics` rather than re-costing anything, so there is
  no second costing engine (WAC stays business-wide) and gross profit includes variable costs tagged
  `includeInCogs` exactly as the P&L does. Records with no `locationId` resolve to the default location via
  the same `resolveLocationId` the stock numbers use. Every active location is listed even with no sales
  in the period; history from a since-deactivated location still shows for the period it was active.
- **Time bases are never mixed.** One-off costs tagged to a location are dated sums on the same basis as
  revenue, so they net into "after direct costs". Recurring costs are a monthly run-rate as of the end of the
  period (the same idea as MRR) and are shown as a separate column; subtracting a monthly figure from a
  90-day or all-time total would misstate any period that isn't exactly one month.
- **Shared overhead is never allocated.** `Expense` has no location unless a person sets one, and an
  untagged expense stays out of every branch's numbers. An allocation key would be a guess that looks as
  precise as a fact, the same reasoning behind the features listed under "Deliberately not built" elsewhere
  in this file.
- **`Expense.locationId?`** (optional, purely additive, mirrors `projectId`). The expense form gets an
  optional Location field, shown only with two or more active locations and defaulting to "shared
  overhead". Firestore rules needed no change (no field allow-list on expenses). AI-entered expenses leave it
  unset, the same as `projectId`.
- **CSV exports** for sales, purchases and expenses (and the backup zip's copies of them) gain a `location`
  column, by name. A sale or purchase with no location shows the default location; an expense with none
  stays blank because "no location" is a normal state for an expense. Export-only, like `paymentMethod`
  and `dueDate`: the importers still read only their core fields. The backup zip reads locations from
  `extra.locations`, where `buildBackupPayload` already puts them, so the backup format is unchanged.
- **Docs.** README, USER-MANUAL and the AI Assistant's app knowledge previously said reports stay
  consolidated and Locations are a physical-quantity tag only; they now describe Profit by location and
  say plainly what it does not do (no allocation of shared overhead, Statements still consolidated). The
  README gains a "What this demonstrates" section mapping each area of business analysis to the function
  that computes it and the script that checks it.
- **Tests.** New `scripts/verify-location-profitability.ts` (20 checks): default-location resolution for
  legacy records, date-range filtering, `includeInCogs` tie-out, direct vs recurring cost handling, ended
  recurring costs, untagged expenses never allocated, zero-activity locations, deactivated-location history,
  and empty input. `verify-ai-knowledge-coverage.ts` gains two assertions.
- **Tag-clearing bug fixed in `updateExpense`.** Found on the final pass: the Expenses form sends
  `locationId`/`projectId` as `undefined` when the person picks "shared overhead" / "not part of a
  project", but Firestore is initialised with `ignoreUndefinedProperties`, which silently drops an
  undefined field from an update. So taking a tag OFF an expense saved without error and left the old tag
  in place, quietly keeping a branch's (or a job's) cost where it no longer belonged. An explicit
  `undefined` on those two fields now maps to `deleteField()`. Only those two fields: other optional
  fields keep their existing behavior.
- **Housekeeping.** Three earlier entries said "28" verify scripts; there were 25. Corrected. There are now 26.

Not built, on purpose: allocating shared overhead across locations by revenue share or headcount, a
per-location balance sheet or cash flow, and per-location costing (a second WAC per branch). Each would
need data the app doesn't record, and a wrong figure would read as confidently as a right one.

## Products: batch delete, plus a real permission-vs-UI bug fixed along the way

Added "Delete selected" to the existing checkbox multi-select on the Products page (same toolbar as
"Apply % discount…"), owner only. Loops `deleteProduct` per id; reports how many succeeded/failed
rather than assuming all-or-nothing, since one item mid-batch can theoretically fail independently
of the others.

While wiring the permission check for the new button, found the single-item Delete on the
product-edit modal had never been gated at all — it showed for Owner *and* Manager, but
`deleteProduct` requires `delete:records`, which is owner-only by design (Manager "can't delete
records," per `ROLE_DESCRIPTIONS`). A Manager clicking it got a permission-error toast instead of
the button simply not being there — a working-looking control that silently fails is exactly the
kind of "ease of use" problem worth catching. Fixed by gating both the single- and batch-delete
buttons behind `canDelete` (`can(role, "delete:records")`), matching the pattern Customers and
Locations already used correctly.

Docs (`USER-MANUAL.md`, `lib/aiPrompts.ts`) updated to mention the new button. Full `tsc`,
`eslint`, all 25 `scripts/verify-*.ts`, and `next build` re-run clean.

## Closed three more "logged it by mistake, no way to undo it" gaps

Same class of bug as the Locations delete fix below: `deleteSaleReturn`, `deleteDiscount`, and
`deleteStockAdjustment` all already existed in `contexts/DataContext.tsx` — owner-only,
period-lock-guarded, audit-logged — but none of the three had any UI calling them. Found by
auditing every `delete*` method in DataContext against every `app/**` call site; these three (plus
the four already fixed for Locations) were the only ones with zero UI usage.

- **`app/sales/page.tsx`**: new "Recent returns & discounts" section (collapsed by default) at the
  bottom of the Owner/Manager sales view, listing the last 25 of each with a Delete button, owner
  only. Deleting one is a plain Firestore delete — no manual reversal step needed, since
  `computeAllLedgers`/`computeSaleEconomics` derive stock and revenue from the live `saleReturns`
  and `discounts` collections on every render, so the record's effect disappears the moment it's
  gone, the same way an accidental Purchase or Sale already unwinds when deleted.
- **`app/products/page.tsx`**: new "Recent stock adjustments" section, same pattern, listing the
  last 25 with product, signed qty, reason (via `STOCK_ADJUSTMENT_REASONS`), date, location and
  notes.
- **Docs**: `lib/aiPrompts.ts`'s Sales entry and `USER-MANUAL.md`'s Common Questions both now cover
  where to go to delete a wrongly-logged return, discount, or adjustment. `scripts/verify-ai-
  knowledge-coverage.ts` re-run clean.
- Full `tsc --noEmit`, `next build`, and all 25 `scripts/verify-*.ts` re-run clean after each change.

## Locations: added Delete for a branch added by mistake

Asked specifically for a way to remove a misadded branch — there was only Edit (rename/deactivate),
no Delete, so a typo'd or duplicate location sat in the picker forever.

- **Added `deleteLocation`** (`contexts/DataContext.tsx`), owner-only, exposed as a "Delete" button on
  the Edit-location modal (`app/locations/page.tsx`) next to Customers/Suppliers' existing delete
  pattern. Deliberately narrow: refuses on the default location (legacy locationId-less records resolve
  to it) and refuses on any location referenced by even one Sale, Purchase, Estimate, stock adjustment,
  sale return, recurring invoice schedule, or stock transfer — that's what makes this safe to expose at
  all, since a Location can be years deep in historical WAC/COGS-tagged records. A branch with real
  history still uses "Inactive" (unchanged); Delete only ever fires on an empty, never-used one.
  `firestore.rules`' `locations` match now allows `delete: if isOwner(businessId)` (was `if false`),
  matching every other owner-only hard-delete in the app (stockAdjustments, customers, etc.).
- **Fixed a pre-existing gap in `scripts/verify-period-lock.ts`**: its "every add/update/delete method is
  either period-locked or knowingly exempt" check didn't have `addLocation`/`updateLocation` in its
  exemption list at all (predates this change), so it was silently failing before `deleteLocation` was
  even added. Classified all four Location/StockTransfer writers as knowingly exempt with a comment
  explaining why (a Location is a structural tag, not a dated financial record — nothing here touches
  revenue/COGS/WAC — and `deleteLocation` self-guards against touching any period via its zero-history
  check). Ran the full `scripts/verify-*.ts` suite (25 scripts) after the fix — all pass.
- **Docs**: Locations had no entry in `USER-MANUAL.md` at all (multi-location was undocumented end to
  end) — added an "Advanced Features" section covering what it does and the new Delete-vs-Inactive
  distinction. `lib/aiPrompts.ts`'s `APP_HELP_KNOWLEDGE` (what the AI Assistant knows about the app)
  updated to match, so "how do I remove a location I added by mistake" gets a correct answer instead of
  the AI not knowing Delete exists. `scripts/verify-ai-knowledge-coverage.ts` re-run clean.

## Trial-request pipeline: closed the duplicate-lead edge case

Asked specifically to check the trial-request flow for edge cases that make the pipeline less convenient
for the visitor *and* for the business running it — still with no external integrations (no CAPTCHA
service, no third-party lead/CRM sync; the honeypot + per-IP/per-email rate limiting already in
`app/api/trial-requests/route.ts` covers spam/abuse without one).

- **Fixed: resubmitting the trial form created a second lead card.** A double-click, a retry after a
  flaky connection, or someone genuinely checking in again a few days later were all indistinguishable
  from a brand-new prospect — every one of them wrote a fresh `trialRequests` doc, leaving the admin to
  notice the duplicate and reconcile it by hand. Now a submission from an email that still has an open
  (pending/contacted) request updates that same record instead: `createdAt` bumps to now (so a real
  follow-up resurfaces at the top of the queue as fresh, not buried under its original timestamp), the
  admin notification email is marked "Follow-up" so it reads as a signal rather than noise, and any new
  message text is appended to the old one rather than replacing or duplicating it. A request already
  `provisioned` or `dismissed` is left alone — a past customer or a closed-out lead coming back always
  starts a fresh request, since that's a new opportunity, not a duplicate. The merge decision itself
  (`lib/trialRequestDedup.ts`) is a pure function so it's unit-testable without Firestore —
  `scripts/verify-trial-request-dedup.ts` covers the status-preservation and message-merge branches.
  The Firestore lookup this needs is wrapped in its own try/catch: if the composite index isn't deployed
  yet, the trial request still goes through — it just isn't de-duplicated that one time — rather than
  failing a prospective customer's submission. **Needs `firebase deploy --only firestore:indexes`** (new
  entry in `firestore.indexes.json`); added to `DEPLOY-CHECKLIST.md` along with a one-line note on how the
  new behavior shows up in the admin's queue.

## Strategic/growth review: one new AI tool, everything else already covered

Asked to look at this from "what does a business need to systemize and scale on this as its backbone"
rather than a bug audit — AI features, UI/UX, and inventory specifically in scope, external
integrations/compliance still explicitly out. Mapped the request against the actual codebase rather than
against what's easy to assume from the page count.

Finding: the strategic/analytical layer is far deeper than the UI lets on. Growth levers (COGS%/opex%/avg
price/AOV trend vs. prior period), full financial health ratios, revenue-per-employee, staff utilization,
manual-ops signal (edit/delete rate + overrides — literally "how systemized is this business"), inventory
EOQ/reorder points/dead-stock aging, capital budgeting (NPV/IRR/payback/WACC), customer and supplier
concentration risk — all real, all already computed, all already surfaced on dedicated pages (`/health`,
`/profitability`, `/sales`, `/purchases`, `/products`). None of that needed building.

One real, closeable gap: **the AI Assistant couldn't discuss any of it.** `run_report` only covers ledger
totals (expense/sale/purchase/cashflow) — a business owner asking the Assistant "am I too dependent on one
customer?" got nothing, despite that exact number already existing and already backing a card on the Sales
page. Concentration risk is the textbook thing that blindsides a scaling SME (lose the one customer or
supplier you built around), so this was worth closing.

- **Added: `assess_concentration_risk` AI tool.** New `lib/aiGrowthRisk.ts` wraps the existing
  `computeCustomerConcentration` / `computeSupplierConcentration` (zero new business logic — same numbers,
  same 60%/35% "high"/"medium" bands the Sales/Purchases page Badges already use, so the Assistant's read of
  "risky" can never disagree with what the page itself shows) into one AI-tool-shaped report. Wired into
  `app/api/ai/chat/route.ts` the same way `detect_anomalies` already is (reuses the same
  `loadRecentOperationalData()` 12-month loader, no new Firestore reads), with matching system-prompt
  guidance in `lib/aiPrompts.ts` and a new bullet in `BUSINESS-VALUE.md`. Covered by
  `scripts/verify-concentration-risk-tool.ts` (severity-band boundaries at exactly 35%/60%, empty-history
  returns null rather than a false "low", customer and supplier sides don't bleed into each other).
- **Considered and deliberately not built:** exposing `computeGrowthLevers` / `computeFinancialHealthRatios`
  / `computeManualOpsSignals` the same way. All three need much more than the 12-month
  sales/purchases/expenses this route already loads — `computeGrowthLevers` and `computeFinancialHealthRatios`
  both need a full server-side `computeMonthlyPnL` (settings, employees, fixed assets, loans, capital
  entries, variable costs — a lot of new plumbing into an API route that currently doesn't touch most of
  those collections), and `computeManualOpsSignals` needs the audit log plus stock adjustments/write-offs/
  returns. Real, wiring-level work with no way to exercise the actual conversation end-to-end from here
  (no live Firebase/DeepSeek credentials in this environment) — the wrong thing to add un-tested on a last
  day. Concentration risk was the one that could be added, verified, and shipped safely; the rest is a
  clean next-session task, not scope creep to reach for today.
- **Structural ceiling, not a bug:** no multi-location/multi-branch concept anywhere in the data model —
  fine for the single-location SME this is scoped for, but it's the wall a customer hits if they open a
  second shop. Not something to start on a last day either way.

## Final scope-completeness pass: feature set confirmed, one real bug fixed

Re-confirmed the go-to-market scope (SME/personal-business, AI-assisted but controlled, no external
compliance integrations, proper account/role management) against the actual codebase rather than assuming
last session's answer still holds. `npm ci`, `tsc --noEmit`, `next lint`, and a full `next build` were all
clean before touching anything; all 22 `scripts/verify-*.ts` checks passed. No `serviceAccountKey.json` in
this upload. No new features added — audit-and-fix only, per standing instruction.

- **Fixed: an Estimate converted to an invoice never got a real due date.** `convertEstimateToInvoice`
  writes its Sale rows directly (batch write, not through `addSale`) and set `paymentMethod: "credit"` +
  `creditTermDays` but never computed `dueDate` — the one field every other credit-sale path in this app
  sets (`addSale`, `updateSale`, and `generateInvoiceForSchedule` for recurring invoices all compute it the
  same way). The result was two different wrong answers depending on which screen you looked at: the
  Invoices page's overdue flag reads `Sale.dueDate` directly, so with it `undefined` an estimate-converted
  invoice could never show as overdue, however late it got; the printed invoice's "Due:" line was silently
  dropped for the same reason. Meanwhile `computeReceivablesAging` and the AI's overdue-reminder logic fall
  back to `dueDate ?? date`, so *those* screens started treating it as due the day it was created — an
  immediate false "overdue" nudge instead of respecting the actual credit term. Fixed by computing `dueDate`
  in `convertEstimateToInvoice` the same way (`addDaysToDate(saleDate, creditTermDays)`), so an
  estimate-turned-invoice behaves identically to one entered by hand.
- **Audited, no change needed:** Offers (composite-product fulfillment), Leads/Opportunities permissions
  against `firestore.rules`, and the bank-reconciliation matcher (`computeCashLedgerCandidates` /
  `suggestMatchesForLine`) — all read correctly scoped (suggest-only, no external bank feed) and consistent
  with the app-level permission checks. Spot-checked the AI Assistant's anomaly-detection and cash-flow-
  forecast claims in `BUSINESS-VALUE.md`/`lib/aiPrompts.ts` against the actual tool wiring in
  `app/api/ai/chat/route.ts` — both are real, not aspirational copy.

## Last-day pass: AI "Confirm all" double-logging, honest Staff numbers, and credit limits made trustworthy

Found by reading the newest (undocumented) code, then driving the real pages and forms in a headless browser
under fake data computed by the real calculation functions, as Owner and as Staff, at phone and desktop
widths. Type-check, lint, all verify scripts and a production build were green **before** this pass; none of
them covered the browser-to-server contract or Staff-shaped data, which is where these all were. No new
product features: everything below fixes or finishes something that already existed.

- **Fixed (launch blocker): "Confirm all" / "Save without reviewing" could log every entry twice.**
  `/api/ai/auto-confirm` replied `{ results, summary }` but the browser treated the whole body as an array
  and called `.filter()` on it. By then the server had already written the entries, so the screen showed an
  error, the proposals stayed "pending", and the next tap logged them again. (The throw is reproduced in
  isolation and the write-then-error sequence was traced through the code; it was not run against live
  Firebase, which is why the smoke test below covers it.) The reply is now built and read
  by one shared pair in `lib/aiAutoConfirmShared.ts`; an unreadable reply says "some entries may already be
  logged, check before saving again" instead of inviting a blind retry.
- **Fixed: an AI-saved sale dropped its sales tax.** With sales tax on, the same sale carried tax when
  saved through the form but not through the AI shortcut, understating tax owed and what a credit customer
  owes. `autoConfirmSale` now stores `taxAmount` exactly as the form does.
- **Fixed: Staff saw wrong Customers numbers.** Staff load only their own sales and no cost data, so cost was
  zero: a normal customer showed CM ratio 100%, LTV:CAC 20x, payback 0.05 months, and "Owe you" / credit
  status were partial in both directions. Staff now get a plain directory (name, contact, source, credit
  limit). Add-customer hides CAC and Credit limit for them, and `firestore.rules` rejects a Staff-created
  customer carrying either (**redeploy rules**; see DEPLOY-CHECKLIST).
- **Fixed: clearing a field never cleared it.** Firestore ignores `undefined`, so emptying Credit limit
  (or phone, notes, CAC, source) said "Customer updated" but kept the old value, and the old limit kept
  flagging. `updateCustomer` / `updateSupplier` now turn blanks into real deletes (`lib/firestorePatch.ts`);
  each has exactly one caller that sends the complete form, so nothing can be erased by accident.
- **Fixed: editing a credit sale counted its own balance twice**, giving a false "over limit" (a 5,000 sale
  edited to 12,000 against a 15,000 limit warned 2,000 over; it is now correctly fine). New tested
  `projectCreditExposure` / `existingSaleCreditPosition`. Warnings now say what the customer *would owe in
  total*, which reads correctly for new and edited sales.
- **Fixed: the AI shortcuts skipped the credit limit.** A credit sale that would take a customer over their
  limit now stays pending for review (cumulative across one batch, tax included), using the existing
  "couldn't be auto-confirmed, review below" path.
- **Fixed: the "full backup" omitted monthly budgets** (`meta/budgets`). Now in `full-backup.json`, the
  manifest and `restore-from-backup.mjs`. `scripts/verify-backup-coverage.ts` scans `DataContext` and fails if
  any collection or meta doc is neither backed up nor explicitly excluded, so the next omission is caught.
- **Fixed:** two directory entries with one name resolved to whichever loaded last; the stricter limit now
  wins. `/receivables-payables` had no role guard (not in Staff's nav, but reachable by URL). Customers CSV
  now includes `creditLimit`. Table cells no longer split "Rs 60,000.00" or phone numbers across two lines,
  and the channel breakdown no longer truncates "Not recorded" to "Not re..." on a phone.
- **Fixed: the in-app feedback endpoint had no rate limit.** Like the trial-request form it is public and
  emails you on every submission, so a script looping on it could burn the email quota that your real
  new-trial alerts share and silence them. Now 10 notes/IP/hour (same limiter, same fail-open behaviour).
  `scripts/verify-api-route-guards.ts` scans all 21 route handlers and fails if a new one ships
  unauthenticated or a public POST loses its rate limit or honeypot (mutation-checked five ways).
- **Audited, no change needed:** every other browser-to-server call (AI chat, sessions, suggest-price, the
  whole admin panel: accounts, trials, billing, provisioning, trial requests, feedback; and the public
  trial form's team-size values) was compared field by field against its route. They match; `auto-confirm`
  was the only broken one.
- **Documented:** credit limits (README 6c, user manual, business value, the in-app AI's own help text and its
  coverage test) had shipped with no documentation at all. Corrected a stale comment in `lib/aiAutoConfirm.ts`
  claiming the chat route auto-confirms (it never writes to the ledger).
- **New checks:** `verify-ai-auto-confirm.ts`, `verify-backup-coverage.ts`, and 20 new assertions in
  `verify-credit-limit.ts` (it had 6). Each was mutation-checked (deliberately re-breaking the code and confirming the
  check fails).

**Not verified here (needs your real Firebase):** the Firestore rule change (no emulator available), the live
AI and email providers, and the sign-in paths. `DEPLOY-CHECKLIST.md` has a 10-minute smoke test for exactly these.

## Launch-day audit: honest numbers, a phone-usable admin, and a stricter readiness check

Found by running the real toolchain (type-check, lint, all verify scripts, a production build) and then
rendering the pages in a browser at phone widths. Everything below is a fix to something that already
existed; nothing new was added to the product.

- **Fixed: MRR overstated revenue.** The admin's MRR tile summed `billingAmount` over every account that
  wasn't locked. Provisioning stores the plan's list price on each new trial account, so every free trial
  with a chosen plan (and any complimentary account carrying an amount) counted as revenue. MRR now counts
  only paying accounts: no trial date, not complimentary, still has access, has an amount, and has a recorded
  payment or a renewal date. New pure `monthlyRecurringRevenue` / `countsTowardMrr` in `lib/billing.ts`.
  On a sample book of two paying customers plus one free trial and one complimentary account (two locked
  accounts were already excluded), the tile went from Rs 20,300 to the true Rs 7,316.67, i.e. it overstated
  revenue 2.77x.
- **Fixed: "Edit billing" was cut off on phones.** The account card's action row was `shrink-0` *and*
  `flex-wrap`, so it never wrapped and pushed Edit billing (and, at 320px, Record first payment) off-screen
  on exactly the cards that need action. Both rows now wrap; checked at 320/360/390/420/768/1280px.
- **Added: duplicate-payment guard.** Each recorded payment moves the renewal a further cycle, so an identical
  payment (same amount, cycle, method and reference) arriving within 60 s of the last one, typically a retry
  after a timeout, is refused with an explanation instead of silently granting an extra period. Pure
  `isLikelyDuplicate` in `lib/billing.ts`; the route's header comment previously claimed this was already
  impossible, which it wasn't.
- **Fixed: launch-readiness script could pass a site that crashes on every page.** The app refuses to start
  without `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` and `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, but the script
  only checked four of the six Firebase web-config vars. It checks all six now, and an `ADMIN_PASSCODE` under
  12 characters is a failure instead of a warning (it is the only gate to every customer's data).
- **Fixed: landing-page worked example contradicted itself.** The hero income statement hardcoded a break-even
  of 1,120,000; the product's own formula (overhead / contribution-margin ratio) gives 671,383 for those
  numbers ("cleared on day 11", not 18). Both are now derived from the example's figures.
- **Fixed: stale admin copy.** The locked-account notices said "Press Mark paid" / "convert to paid"; the
  buttons are Record payment / Record first payment.
- **Polish: owner's plan card** no longer shows "How to pay" on day 1 of a "no card needed" trial; it appears in
  the last 7 days of a trial, within 14 days of a renewal, and after either date has passed.
- **Build hygiene:** `export const dynamic = "force-dynamic"` on the GET routes that read headers and live data
  (removes the "Dynamic server usage" error from the build log and rules out a cached admin/lead list).
- Tests: `scripts/verify-billing.ts` gained MRR and duplicate-guard checks, mutation-checked (removing the trial
  rule, the complimentary rule, the payment-evidence rule, the window, the reference comparison or the
  empty-history case each makes it fail). A first draft of the trial test did NOT fail when the trial rule was
  removed (another rule masked it); it was strengthened with a fixture that isolates the rule.
- **Not verified here:** live Firebase (rules, provisioning, password emails), Resend, DeepSeek, and the signed-in
  owner screens. The admin console was rendered with its API mocked, not against real data.
- **Known, deliberately not changed:** the admin account list costs ~4 Firestore reads per business per action
  (fine for dozens of customers; revisit past a few hundred). Trial requests have no dedicated phone/WhatsApp
  field, so a number typed into the free-text message is read by eye.

## Account management & pipeline, systemized (manual billing, no gateway)

- **Payments are records, not a moved date.** New `lib/billing.ts` (pure, verified by
  `scripts/verify-billing.ts`) + a transactional billing route: each payment stores amount, method,
  reference, "paid until" and exactly what it replaced, in owner-readable `meta/billingHistory`
  (new Firestore rule — deploy rules). The latest payment can be **undone** (refused if the renewal date
  was edited afterwards), and each has a copyable **receipt**. Replaces the old `confirm()` Mark paid.
- **Bug fixed — month-end renewals.** `setUTCMonth(+1)` turned 31 Jan into 3 Mar (skipping February);
  renewals now clamp to the last day of the month.
- **Bug fixed — free-forever hole.** "Convert to paid" used to clear the trial with no renewal date, so
  nothing ever chased or locked the account. It is now **Record first payment**, and any non-trial account
  with no renewal date shows an amber "Billing not set up" flag and counts as needing action.
- **Bug fixed — unvalidated renewal date.** A malformed date was stored as-is and every lock check treats
  an unparseable date as "never locks". The route now rejects it.
- **Complimentary accounts** (your own business, partners): never invoiced, never lock, never in the queue.
- **Auto-lock on overdue** is now the default (visible checkbox) when the first payment is recorded, so an
  unpaid renewal enforces itself; each account card shows whether it is on or off.
- **One source of truth for pricing:** `lib/pricing.ts` (plans, prices, `TRIAL_DAYS`). Pricing cards,
  the trial form and the admin billing forms all read it. Plan is a pick-list with a suggested price.
- **Manage accounts:** filter chips (All / Needs action / Trials / Paying / Locked), one-tap **Email**
  reminder, reminders include `NEXT_PUBLIC_PAYMENT_INSTRUCTIONS`.
- **Lead pipeline:** the trial-request queue is worked oldest-first with a waiting timer (amber > 1 day,
  red > 2 days), one-tap Reply (marks contacted), "already has a login" and "asked N times" flags, and
  technical details collapsed. The requester now gets an acknowledgement email (max one per address per
  day); your notification email replies straight to the lead. Creating an account from a request pre-sets
  the plan, cycle and price they were looking at, and offers a copyable welcome message.
- **Owner's Your plan card** (`components/PlanCard.tsx`): payment history, how to pay, complimentary state;
  fixed the amount being formatted in the *business's* currency instead of Rs.
- **Landing page:** accurate metadata (it said "one flat price" beside three tiers), sharper hero with
  trial length and trust line, a "Helpful, never in charge" section, "how billing works" under pricing,
  a FAQ (with FAQPage structured data) that says plainly what Balancr does not do (no tax filing, no bank
  feeds), and a clearer confirmation on /request-trial.

## Expired trials now lock automatically

- New `lib/accountAccess.ts`: one function decides "locked or not" for both the browser
  (`AuthContext`) and the server (`requireAiContext`). A trial locks 2 days (UTC) after
  `trialEndsAt`; computed on read, nothing is stored, so there is no flag to clear.
- Safe by construction: a missing/malformed trial date never locks; **Mark paid** now also
  clears `trialEndsAt`; a paid account with a future renewal date is never trial-locked.
- Lockout screen says "Your free trial has ended" (not "suspended") with a trial-specific
  contact prefill; the owner banner states the exact last access day.
- Admin "Manage accounts": auto-locked accounts are labelled, excluded from "Active", and
  stay in the alert queue. Manual Suspend/Reactivate is unchanged.
- Owners locked out by an expired trial get a "Download a copy of my data" button on the
  lockout screen — the same full backup as Import / export (shared via
  `lib/backupPayload.ts`), so "your data is safe" is something they can verify. It writes
  nothing back to the business, and is not offered for manual suspensions.
- Opt-in per account: **auto-lock on overdue renewal** (Edit billing checkbox, off by default,
  7-day grace). Same computed-on-read design, so Mark paid unlocks instantly; manual
  Suspend is unchanged and still wins. Owner banner states the exact last access day.
- Fix: a locked business no longer has recurring invoices / expense occurrences generated
  in the background by the open app.
- Admin "Manage accounts": **Copy reminder** button (polite, ready-to-send message for trials
  ending/ended and renewals due/overdue — nothing is sent from the app) and **Export accounts
  (CSV)** (customer list with status, plan, renewal and trial dates; formula-safe for Excel).
- Owner "Your plan" card now shows the actual last access day (trial, or renewal when
  auto-lock is on). Admin **Mark paid** asks for confirmation so a stray click can't push a
  renewal a whole extra cycle.
- Financial health: new **Asset turnover** ratio (annualized sales ÷ total assets), plus
  tap-to-reveal definitions for Working capital, EBIT and Asset turnover.
- Pipeline: every account card shows **last activity** (from the audit log; "No activity
  logged yet" is highlighted for running trials). An amber note flags trials ending within 5
  days with nothing logged, and **Copy reminder** switches to a friendly "let me walk you
  through setup" message for idle trials instead of a payment nudge. CSV export gains
  `last_active`.
- Pipeline: **Trial → paid** tile (converted ÷ trials that reached a decision). `convertedAt`
  is stamped when a trial converts (Convert to paid, or first Mark paid while a trial date is
  set); accounts converted before this shipped aren't counted.
- Financial health: new **Cash ratio** (cash ÷ current liabilities) alongside current and quick.
- Test: `npx tsx scripts/verify-trial-lock.ts` (40 checks); `verify-asset-turnover.ts`.
- Limit (same as manual suspend): enforced in the app shell and in every API route, not in
  Firestore rules — a technical user with their own SDK could still read their own data.

## Launch pipeline: closed a free-account loophole, honest landing/legal pages

- **Fixed: anyone could create a free, unapproved business.** Firebase's web config is
  public, and `firestore.rules` let any signed-in user create their own
  `memberships/{uid}` pointing at themselves. Calling `createUserWithEmailAndPassword`
  from a browser console was therefore enough to own a business with no trial request, no
  approval and no billing record. Provisioning now happens on the server
  (`app/api/admin/provision`, Admin SDK, admin passcode; rolls the login back if the
  documents fail to write), `lib/provisioning.ts` only sends the reset email, and the
  "brand-new business" branch is removed from the `memberships` rule. Team invites are
  unchanged. **Deploy order matters** — see DEPLOY-CHECKLIST.md (app first, test a real
  provision, then the rules). Signed-in users with no business now get a clear "not linked
  to a business" screen instead of an empty app. The legacy `*-once` pages can no longer
  create owner pointers.
- **Landing page AI demo** showed "Logged: Sale…" with a tick, i.e. auto-logging. It now
  shows "Ready to save" with Save/Edit, matching the real (review-first) behaviour.
- **/legal rewritten.** It was a one-business "internal use, not a public product" template
  with literal `[BUSINESS NAME]`, `[DATE]`, `[CONTACT EMAIL]` placeholders on a public page,
  and it said "the AI provider" without naming it. It is now a seller-side draft that
  discloses Google Firebase, DeepSeek (AI Assistant), Resend (operator emails) and the
  technical details stored with trial requests. **Draft, not legal advice.**
- New: `scripts/check-launch-readiness.mjs` (env vars, placeholders, stray key file, rule
  check) and `DEPLOY-CHECKLIST.md` (console steps, pipeline walkthrough, smoke test).
- Superseded: expired trials now auto-lock (see the top entry).
- **Not verified:** the provisioning route and the new rule against a real Firebase project
  (no network/emulator here); rules syntax was checked by eye only.

## Controlled AI entry, and "Close the books"

- **The AI Assistant no longer writes to the ledger on its own.** `/api/ai/chat` used
  to log any "complete" proposal (matched product at ≥ 0.7 confidence, a price, a
  quantity) straight to Firestore in the same turn — no click — and the Quick Entry
  modal's "Log automatically, skip my review" box defaulted to **on**. That
  contradicted the README ("you still hit Save") and the sales copy. Now every proposal
  comes back pending as a pre-filled form. The two shortcuts that remain are explicit
  human actions: **Confirm all** (renamed from "Auto-confirm all") and the Quick Entry
  **Save without reviewing** box, now **off by default**. The system prompt no longer
  tells the model entries are logged automatically.
  - **Model dates are validated.** A date from the model was accepted if it was any
    non-empty string ("yesterday", "2026-13-40"). It must now be a real `YYYY-MM-DD`
    calendar date or it falls back to today for review, and `isAutoConfirmable` refuses
    an invalid date.
  - **Behaviour change to know about:** anyone used to "say it and it's logged" now has
    one extra step unless they tick Save without reviewing.
- **Added "Close the books"** (Settings → Operations, owner only). Locks all finished
  months through a chosen month-end: no add/edit/delete of a dated sale, purchase,
  one-off expense, payment, write-off, return, discount, stock adjustment, capital entry
  or tax payment in a closed month, for anyone including the owner, until reopened.
  New: `lib/periodLock.ts` (pure rules), `lib/periodGuards.ts` (table of guarded
  methods + wrapper), `components/CloseBooksCard.tsx`, `DataContext.setBooksClosedThrough`
  (validated, audit-logged), `Settings.booksClosedThrough`.
  - Also enforced on the AI Assistant's Admin-SDK write path, with a fresh settings read
    (the shared business context is cached for 30 s, too long for a lock).
  - **Not frozen:** recurring schedules, payroll, loans, fixed assets (see README §6b).
  - **Limitation:** app-layer only, not in `firestore.rules` — a rules `get()` per
    written document would cap bulk imports and multi-line invoices at ~10 documents.
    A capable Manager calling Firestore directly can bypass it. Same trust level as the
    audit log.
- New verification: `scripts/verify-period-lock.ts` (61 checks: date validation,
  boundaries, every guarded method, cascades, bulk imports, recurring exemption, the AI
  write path, and that every DataContext add/update/delete is locked or knowingly
  exempt). Mutation-checked: breaking the wrapper, the `<=` boundary, or the AI check
  each makes it fail. `verify-ai-knowledge-coverage.ts` gained two lines.
- **How it was verified.** All `scripts/verify-*.ts` pass under `tsx`. A type-check with
  Firebase/React/Next stubbed to `any` shows no new errors beyond stub artifacts.
  **Not verified:** a real `next build`, the Settings card rendered in a browser, a
  signed-in session against live Firebase, and the AI flow end to end (no dependencies
  or network in the environment where this was written). Run `npm install && npm run
  build` and click through Settings → Operations and Quick Entry before shipping.

## Statements: print / save as PDF, and four accuracy fixes found while testing it

- **Added "Print / save as PDF" on the Income statement, Cash flow, Balance sheet and
  Tax summary tabs** (not Budget, an editing screen). Prints a cleaned copy of exactly what
  is on screen — `lib/statementPrint.ts` clones the rendered statement, removes controls,
  and re-themes it for paper (white page, dark text, system font stack, denser rows) — so
  the paper cannot disagree with the screen; nothing is recomputed. Business letterhead
  from Settings, period and currency line, and an "unaudited / not filed with any tax
  authority or other body" note in a table footer so it repeats on **every** printed page
  (a log that spills to page 2 would otherwise leave page 1 without it). The `<title>` is
  "what - when - whose", which is what browsers offer as the Save-as-PDF file name.
  Nothing integrates with any external system.
  - Glossary labels (`Term`) are buttons on screen but carry the line's wording, so they are
    unwrapped, not deleted. Every other control is stripped by default (allow-nothing), so a
    control added later can't leak onto paper. The tax-payment log prints its recorded rows
    but not its form, instructions or Delete buttons, and is omitted when empty.
  - `openPrintWindow` now returns whether the pop-up opened (a blocked pop-up used to be a
    silent dead button; the Statements page now says so) and can wait for images before
    printing (`waitForLoad`, statements only; the letterhead logo is a remote URL and a fixed
    250 ms delay can print it as a blank box). It waits on the images themselves — Chromium
    reports `readyState === "complete"` right after `document.close()` even while an image is
    still downloading. Capped at 4 s so a dead logo URL can't block printing. Existing
    invoice/receipt/estimate printing is unchanged.
  - If no business name is set, pressing Print shows a one-line tip to add one in Settings.
- **Fixed: a loss printed as a profit.** The Statements `Line` component showed
  `Math.abs(value)` with no sign unless a caller passed `negative` (used only for deductions),
  so a net loss of −228,330.61 read as a plain "Rs 228,330.61" — next to a red −28.1% net
  margin. Same for negative operating/financing/net cash flow, negative cash, retained
  earnings and equity, and "true profit". Figures below zero now show in parentheses and red.
  Found because the statement was rendered with a loss-making month, which is what a bank
  will look at.
- **Fixed: Balance sheet "Out of balance" for any business that flags an expense as carrying
  reclaimable tax.** `Expense.taxAmount` is added on top of `amount`, so cash paid (and the
  amount owed on an unpaid bill) is amount + tax, but only `amount` was counted — cash was
  overstated by the tax while the same tax was already netted off Sales Tax Payable. Off by
  exactly that tax. `expenseCashTotalForMonth` and `computeBillsPayable` now use the gross.
  P&L still uses the net amount (reclaimable tax is not an expense). **This changes cash and
  payables figures for anyone who uses that option**; businesses that don't are numerically
  unchanged (guarded in the verify script). Payables/aging/forecast/AI reminders read
  `amountDue`, so they pick up the gross consistently.
- **Fixed: Cash flow "Operating expenses paid" used the accrual total** (`operatingExpenses`)
  instead of cash actually paid (`expenseCash`), so with unpaid bills the section did not add
  up to its own total. It now shows `expenseCash`.
- **Fixed: "Net vat reclaimable".** The tax label was lower-cased mid-sentence, which mangles
  an acronym (VAT, GST). Acronyms are now left as typed.
- New verification: `scripts/verify-statement-print.ts` (print builder, escaping, footer),
  `scripts/verify-expense-input-tax.ts` (balance identity for paid / recurring / unpaid /
  part-paid / settled taxed expenses + a no-tax regression), and a print/PDF line added to
  `scripts/verify-ai-knowledge-coverage.ts`.
- **How it was verified.** The real Statements page was bundled with the real calculation
  engine (seeded transactions run through the same pipeline as `DataContext`), rendered with
  the project's compiled Tailwind CSS in headless Chromium, the real button clicked, and the
  printed document checked and rendered to PDF: every money figure on paper equals the screen;
  no buttons/inputs/forms on paper; sections foot to their totals; assets = liabilities +
  equity; one page each for Income / Cash flow / Tax; disclaimer on every page of a long log;
  blocked pop-up; hostile business name; 375 px phone produces the same printout; slow and
  dead logo timing. **Not verified:** an actual printer or a real OS print dialog (headless
  Chromium's PDF output stands in), Safari/Firefox, and a signed-in session against live
  Firebase data.

## Security & data safety (pre-sale hardening — no new features)

- **The admin passcode was readable by every customer.** It lived in
  `NEXT_PUBLIC_ADMIN_PASSCODE`, and Next.js inlines `NEXT_PUBLIC_*` values
  into the browser bundle, so anyone with dev tools could read it and call
  `/api/admin/*` directly — listing other customers' businesses, suspending
  them, or editing their billing. It is now the server-only `ADMIN_PASSCODE`,
  verified by the new `/api/admin/verify` route (same per-IP lockout as every
  other admin route); the admin page no longer contains it. The old variable
  name is deliberately not read as a fallback. **Action required: set
  `ADMIN_PASSCODE` to a NEW value, delete `NEXT_PUBLIC_ADMIN_PASSCODE`, and
  redeploy** — the old value has been public in every bundle you shipped.
  Confirmed by building with canary values for both names: neither appears
  anywhere in `.next/static`.
- **"Full backup" wasn't full.** The zip only carried 15 entities as CSVs.
  Payments collected/made, write-offs, returns, discounts, cash counts, stock
  adjustments, suppliers, estimates, leads, recurring schedules, project
  costs, bank lines and journal entries were missing, so a restore would have
  shown every collected credit sale as unpaid. The zip now also contains
  `full-backup.json` with every collection plus settings, the in-app copy and
  the manifest say plainly what the CSVs do and don't restore, and
  `scripts/restore-from-backup.mjs` (dry-run by default, never overwrites
  existing documents unless `--overwrite`, writes only to an allow-list of
  collections) puts it back. Documented in RECOVERY-RUNBOOK.md.
- **Mobile polish found by actually rendering the public pages** (headless
  Chromium at 375px and 1280px: no horizontal overflow, inputs already 16px so
  iOS won't zoom). Fixed what the measurements flagged, all phone-only so
  desktop is unchanged: "Forgot your password?" on login was a 16px-tall tap
  target; landing footer links (16px), header "Sign in" (36px), the
  Monthly/Annual pricing toggle (32px) and the feedback CTA (40px, with its
  arrow orphaned on its own line) are now 44px; the request-trial logo link
  got padding. Also raised the four remaining sub-44px icon buttons (assistant
  session rename/delete, modal close, "More" sheet close). Login tagline said
  "... for one." (a leftover from the single-user version); it now matches the
  landing page. Signed-in pages were not rendered (they need a live Firebase
  session).
- **Customers now have a way to reach you.** The trial-ended banner, the
  billing section and the suspended screen all said "get in touch" with no
  contact detail anywhere, which is the exact moment a manual-billing
  product converts or loses a customer. New `SupportContact` (WhatsApp
  and/or email from `NEXT_PUBLIC_SUPPORT_WHATSAPP` / `NEXT_PUBLIC_SUPPORT_EMAIL`)
  appears on Settings → Account and the suspended screen; hidden if unset.
- **Public trial-request form now rate-limited** (5 valid submissions per IP
  per hour, `lib/rateLimit.ts`; fails open). Each submission writes a lead and
  emails the admin, so a looping script could flood both.
- **Added `.gitignore`** (none was present): env files, service-account keys,
  build output and backup files stay out of source control.
- **Reverted an unintended `package.json` change from the previous
  touch-target delivery.** Installing tooling to verify Tailwind had bumped
  `autoprefixer`, `postcss` and `typescript` ranges without updating
  `package-lock.json`, which makes `npm ci` (used by most hosts) fail. It is
  back to the original, in sync with the lockfile.

## Changed

- **Secondary row actions now meet the 44px touch-target floor on phones.**
  Edit / Delete / Print / Share / Record payment and similar text-link
  actions were `min-h-[32px]` everywhere (84 sites across 23 files), below
  the 44px minimum (WCAG 2.5.5 / Apple HIG) that the primary `Button`
  already follows. They are now `min-h-[44px] sm:min-h-[32px]` — the same
  phone-vs-desktop pattern `Button` uses — so phones get the larger
  target while desktop row density is exactly unchanged. Also raised: the
  three `Button`s that overrode the floor down to 36px (offers card
  "Fulfill", offers "+ Add cost line", products bulk "Apply % discount"),
  the `ShareButton` default class, and the WhatsApp/Email items in its
  fallback menu. The desktop-only offers table "Fulfill" button
  (`!min-h-[32px]`, hidden below `sm`) was intentionally left as is.
  Class-string changes only; no logic touched. Verified that Tailwind
  emits the new classes with the `sm:` rules after the base rules.

## Verified (no code change)

- **Time-value-of-money / capital budgeting (NPV, IRR, payback period,
  WACC) already existed in this app — pre-dating this session's changes —
  and had never been independently checked against known values.** Lives
  on the "what-if calculator for a big one-off purchase" section of
  `app/profitability/page.tsx`, explicitly opt-in ("Skip it if you don't
  know what those are"), so it doesn't clutter the app for SME owners who
  just want simple bookkeeping while still being correct and available
  for the ones who do think in these terms. Wrote
  `scripts/verify-capital-budgeting-math.ts` and checked it against
  hand-computable textbook cases: NPV at 0% equals the raw cash-flow sum,
  a simple 100-in/110-out case correctly resolves to ~10% IRR and ~$0 NPV
  at a 10% discount rate, an all-negative cash-flow series correctly
  returns a null IRR instead of a misleading number, payback period
  correctly interpolates fractionally within the crossing period, WACC
  matches its formula by hand for a 70/30 equity/debt split, and both
  WACC and payback correctly return null/0 rather than NaN at their edge
  cases (zero total capital; no outlay at all). All 10 checks passed with
  no changes needed to the underlying implementation — this was a
  correctness audit of pre-existing code, not a new feature.

## Added

- **A third scratch calculator on Profitability: "How much capital do I
  need to start?"** — one-time setup costs plus a runway buffer for fixed
  costs before revenue is reliable, the standard rule of thumb being 6-12
  months. Prompted by re-checking the user's own reference material (a
  "startup costs = one-time costs + (fixed monthly costs × buffer months)"
  formula) against the app and finding it genuinely didn't exist yet —
  the app already had cash runway (given current cash, how many months
  can you survive) but nothing for the inverse question a new venture, or
  a new location for an existing one, actually needs to ask before
  opening. Added `computeStartupCapitalNeeded` (`lib/calculations.ts`)
  and a `StartupCostCalculatorCard`, same collapsed-by-default/nothing-
  saved philosophy as the two calculators already there. Made it smarter
  than a blank scratch pad where it could be: the fixed-monthly-costs
  field prefills from `breakEven.monthlyFixedCosts` — a real figure the
  page already computes from the business's own current run-rate —
  rather than starting empty, while staying fully editable for a
  hypothetical that isn't the current business as-is. Also updated the
  AI's own knowledge of this page (`lib/aiPrompts.ts`) to mention all
  three calculators now, and extended
  `scripts/verify-ai-knowledge-coverage.ts` to guard it. Verified the
  formula itself against hand-computable cases — see
  `scripts/verify-startup-capital-math.ts`: the standard case, buffer-only
  (no setup costs), setup-only (no ongoing costs), zero buffer months, and
  nothing entered at all, all resolving to the right numbers rather than
  NaN or a silently wrong total in any edge case.

- **Considered and confirmed NOT missing, while re-checking the same
  reference material**: customer concentration risk (parallel to the
  existing supplier concentration signal) already exists and is already
  live on the Sales page — initially looked like an orphaned
  calculation with no UI consumer on a first pass, until a more precise
  search found it's genuinely wired up, just contextually placed there
  rather than on Financial Health where supplier concentration also
  isn't, as it turns out (that one's on the Purchases page). Slow-moving/
  aging inventory (cash trapped in stock that hasn't sold) already exists
  too, live on the Profitability page. A four-way fixed/step-fixed/
  variable/mixed cost behavior classification does NOT exist and was
  deliberately not added — the existing Expense/VariableCost split
  already covers what actually matters for margin and break-even math,
  and formally classifying every bill by textbook cost-behavior type
  would be accounting-course completeness a small business owner doesn't
  need, not real value.

- **The AI assistant's cash-flow-forecast tool could give a different
  answer to the exact same question, purely by chance.**
  `generateCashFlowForecast` (`lib/aiCashFlowPrediction.ts`) injects a
  ±10% random variation per projected month — by its own doc comment,
  meant to keep a *chart* fed by this function from looking
  suspiciously smooth. Checked every consumer of that function in the
  app (not assumed): there are zero `.tsx` files anywhere that actually
  use it for a chart — the real Cash Flow page computes its own numbers
  separately — so the only real caller left was the AI assistant's
  `forecast_cash_flow` tool (`app/api/ai/chat/route.ts`), which hands the
  random numbers straight to the model to state in a chat reply. A user
  asking the same cash-flow question twice in a row, or the model calling
  the tool twice in one conversation, could get two different numbers
  back with nothing about the business having changed — reads as the
  assistant being unreliable, not as intentional variety, since a chat
  reply isn't a chart. Added a `deterministic` parameter (default `false`,
  so nothing about the existing/original behavior changes for any other
  caller) and set the AI route to pass `true`. Verified, not just wired:
  see `scripts/verify-cashflow-forecast-determinism.ts` — deterministic
  mode gives byte-identical output across repeated calls with the same
  inputs and resolves to exactly the plain average with no jitter at all,
  while the untouched default still varies run to run, confirming the fix
  targets only the AI's use of it.

- **Future value — the flip side of the existing NPV/IRR calculator, which
  only discounted future money back to today, never grew money forward.**
  Added `computeFutureValue`/`computeFutureValueOfSeries`
  (`lib/calculations.ts`) and a second scratch-calculator section on
  Profitability, "What will this grow to?", right next to the existing
  "Is this investment worth it?" one — same collapsed-by-default, nothing-
  saved, plain-hand-verifiable-math philosophy. Answers a genuinely
  different question than the NPV/IRR tool does: not "is this purchase
  worth its cost" but "what will this money be worth later" — a lump sum
  set aside now, or a fixed amount saved every year, projected forward at
  a chosen rate. Also updated the AI's own knowledge
  (`lib/aiPrompts.ts`) to mention both calculators, since the pre-existing
  NPV/IRR tool had the exact same "AI doesn't know its own app" gap this
  session already found and fixed for Leads/Estimates/Invoices/Offers/
  Suppliers/Reconcile — it just hadn't been noticed yet for this one.
  Verified against known values AND cross-checked against the existing
  present-value math for internal consistency — see
  `scripts/verify-future-value-math.ts`: no-growth cases return the
  principal unchanged, a 2-year 10% case correctly compounds rather than
  applying simple interest, a savings series with growth exceeds its raw
  contributions, and — the strongest check — discounting
  `computeFutureValue`'s own output back down via the existing `computeNPV`
  returns the original present value, proving the two functions are
  actual mathematical inverses of each other rather than two independently
  plausible-looking formulas.

- **"Convert to customer" could be double-clicked into a duplicate
  customer record.** `addCustomer` has no duplicate-name detection
  anywhere in this app — the plain "+ Add customer" form doesn't either,
  so that part isn't a new gap — but a one-click button on a Won lead is
  far easier to trigger twice by accident (a slow network, or coming back
  to it days later having forgotten it was already used) than deliberately
  retyping a name into a form. Added `Lead.convertedToCustomerAt`
  (`lib/types.ts`): set once conversion succeeds, it hides the button and
  shows "✓ Added to customers" instead. That alone doesn't stop two clicks
  fired before the first write reaches Firestore, since both would still
  see the flag as unset — so also added a local `convertingIds` guard in
  `app/leads/page.tsx` that disables the button (shows "Adding…")
  immediately on click, before the write even starts, and only clears on
  failure.

- **A lead's overdue follow-up date only showed up if you happened to open
  the Leads page — now it proactively surfaces on Notifications, same as
  every other "something needs your attention" item.** The Lead type's own
  doc comment promised "so a follow-up never quietly gets forgotten," but
  that was only half-true: the "overdue" flag lived on the Leads page card
  alone, with nothing wiring it into the app's existing pull-based
  reminder system (`generateAllNotifications` in
  `lib/notification-automation.ts`, the same mechanism behind overdue
  receivables/payables/loan payments/low stock/etc). Added
  `generateLeadNotifications`, a new `"lead_follow_up"` `NotificationType`,
  and wired both into `generateAllNotifications` and the
  `NotificationsContext` effect that calls it — including its dependency
  array, which is exactly the kind of thing that's easy to update the
  function for and forget to update the array for, silently leaving new
  leads unable to trigger a fresh check. TypeScript's own exhaustiveness
  check on `app/notifications/page.tsx`'s `TYPE_LABEL` map caught the one
  other place a new `NotificationType` needed a matching entry, by simply
  refusing to compile until it was added.
  Verified against the real function, not just wired and assumed — see
  `scripts/verify-lead-notifications.ts`: an overdue follow-up produces a
  notification, a Won/Lost lead never does even with a "overdue" date on
  it, a lead with no follow-up date set generates nothing, and priority
  escalates the same way every other overdue item's does.

- **The AI assistant's own knowledge of the app was stale — Leads,
  Estimates, Invoices, Offers, Suppliers, Reconcile, and the new bill-of-
  materials/Produce action were all missing from it.** The assistant is
  instructed to only ever describe a page/button/feature that appears in
  `APP_HELP_KNOWLEDGE` (`lib/aiPrompts.ts`) and to say "not sure, check
  with whoever manages this account" for anything not listed — so a
  customer asking "where do I track someone before they're a customer" or
  "how do I log making a batch of something" would have gotten that
  brush-off for features that actually exist, directly undercutting the
  app's own "AI that helps you use the app" pitch. Filled in every missing
  page bullet (some pre-dating this session's changes — Estimates,
  Invoices, Offers, Suppliers, and Reconcile weren't described either, not
  just Leads), and added a clause to Financial Health's existing bullet so
  the AI doesn't misdescribe a manufacturing business's production activity
  as an "operational risk" anomaly, matching the real exclusion in
  `computeManualOpsSignals`. Verified against the real exported string, not
  just proofread — see `scripts/verify-ai-knowledge-coverage.ts`.

- **Leads/pipeline, and a landing page that actually shows both flows.**
  There was no way to track someone before they became a Customer — a
  "Customer" only exists once someone's bought something, so outreach that
  hadn't closed yet lived nowhere and could quietly get forgotten. Added
  `Lead` (`lib/types.ts`): name, contact, source, an estimated deal value,
  a next-follow-up date, and a stage —
  New → Contacted → Following up → Proposal sent → Won/Lost — plus a new
  `/leads` page (grouped into Active/Won/Lost, with a running "pipeline
  value" total and an overdue-follow-up flag) and a one-click "Convert to
  customer" action on a Won lead that calls the existing `addCustomer`
  rather than duplicating that data entry. Permissions deliberately reuse
  the existing `create:sale`/`manage:sales`/`delete:sales` rather than
  adding new ones, matching Sales/Estimates' own two-layer split exactly:
  Staff can log a new lead (they're usually the one actually doing the
  outreach call), Owner or Manager can move it through stages, and only
  Owner can delete it — `manage:sales` covers stage changes, `delete:sales`
  is deliberately Owner-only at the app-policy layer even though
  `firestore.rules`' `/leads` block grants Owner-or-Manager at the database
  layer, same layering `/sales` and `/estimates` already use. Verified
  against the real permission matrix, not just written to match it —
  see `scripts/verify-leads-permissions.ts`. Staff also only ever sees
  leads they created themselves, same "own records only" Firestore rule
  Estimates already uses — which is also why `firestore.indexes.json`
  needed a new composite index (`createdByUid` + `createdAt`) for Leads,
  mirroring the ones Sales/Estimates already register for the identical
  `where(createdByUid) + orderBy(...)` query shape: without it, that one
  query would fail for every Staff account in production (invisible to
  typecheck/build, since Firestore only enforces this at query time) —
  and since `loading` in DataContext doesn't turn false until every
  subscribed collection has loaded at least once, a missing index there
  wouldn't just mean an empty Leads list, it would leave Staff on a
  permanent loading screen app-wide. Audited every other
  `where(...) + orderBy(...)` query in the app while fixing this one;
  Sales/Estimates/Leads are the only three, and all three now have their
  index registered.
  Also added a new section to the marketing page (`app/page.tsx`) laying
  out the two operating flows this app is actually modeled on — sourcing →
  pricing → sale/delivery → returns → repeat buyers for a product
  business, and offer → outreach → follow-up → fulfill → repeat work for a
  service business — named after the real page each step lives on, so a
  visitor recognizes their own business instead of reading a generic
  feature list.

- **Bill of materials / production, for manufacturing SMEs.** Products
  could previously only be bought ready-to-sell — there was no way to say
  "this finished good is made from N units of that other product." Added
  `BomComponent[]` (`Product.components` in `lib/types.ts`): a recipe of
  other product-type Products + qty each, editable in the product form
  right next to reorder planning. A "Produce" action then appears on any
  product with a BOM set (`components/ProduceForm.tsx`, wired into
  `app/products/page.tsx`): enter qty produced and it (a) consumes each
  component's stock at that component's *current* WAC and (b) adds the
  produced qty to the finished good's stock at the computed cost
  (component cost + an optional labor/overhead figure), with the full
  breakdown kept in the resulting records' notes for audit.
  Deliberately reuses the existing WAC/COGS engine rather than extending
  it: component consumption is logged as a `StockAdjustment` (new reason,
  `"production_use"`) and the finished-good stock increase as an ordinary
  `Purchase` (supplier `"Production (in-house)"`, a new
  `PRODUCTION_SUPPLIER_LABEL` constant) — no changes to
  `computeProductLedger`/`computeAllLedgers` were needed, and every
  existing report (inventory value, COGS, profitability) picks this up
  automatically. Two correctness fixes went with it, since blindly reusing
  those two record types would have quietly distorted existing risk
  signals for exactly the businesses that would use this: (1)
  `computeManualOpsSignals` now excludes `"production_use"` adjustments
  from the "manual overrides" anomaly count — routine production isn't a
  correction/anomaly the way damage/theft/count-corrections are; (2)
  `computeSupplierConcentration` now excludes `PRODUCTION_SUPPLIER_LABEL`
  purchases from spend totals — in-house production isn't exposure to
  losing an external supplier, and counting it would dilute how
  concentrated the *real* supplier risk looks. No Firestore rules changes
  needed — `components`/StockAdjustment/Purchase writes already go
  through the same Owner/Manager-only paths this uses. Like `recipeLines`
  above, `components` is never mirrored onto `CatalogItem` — Staff still
  never sees a bill of materials, same as they never see cost prices.

- **Share Invoice/Quote with the customer, without any messaging service.**
  Every invoice and quote could only be printed before — getting it to the
  customer meant printing/saving a PDF, then separately opening WhatsApp or
  email yourself and attaching it by hand. Added a "Share"/"Send" button
  next to every "Print" button on Invoices and Estimates (`lib/share.ts`,
  `components/ShareButton.tsx`): on a phone/desktop that supports it, one
  tap opens the OS's own share sheet (WhatsApp, Email, SMS, AirDrop —
  whatever's installed) with a short text summary of the invoice/quote; on
  a browser without that API, the button offers the same two links
  directly (`wa.me` deep link, `mailto:`). Where a phone number or email
  was recorded against the sale (`Sale.customerContact` /
  `Estimate.customerContact`), the link is addressed straight to them.
  Deliberately not a new integration: no WhatsApp Business API key, no
  Twilio/SendGrid, nothing to keep online or renewed — every link just
  hands off to an app the customer or owner already has, the same way a
  `mailto:` link on any website does. No PDF attachment (this app doesn't
  generate one in-browser — see `lib/print.ts`'s own header); the share
  text is meant to travel alongside a PDF saved via Print, not replace it.
- **Installable as an app (PWA manifest).** Added `app/manifest.ts` plus
  two new icon sizes (`/icon-192`, `/icon-512`, same three-bar mark as the
  existing favicon/apple-touch-icon, just redrawn larger) and
  `appleWebApp` metadata in `app/layout.tsx`. An SME owner who opens this
  daily can now "Install app" / "Add to Home Screen" on Android, desktop
  Chrome/Edge, or iOS Safari and get a real icon plus a standalone window
  (no address bar) — no service worker, no offline caching, no push
  notifications added alongside it; Firestore's own offline persistence
  already covers "still opens on a bad connection" (see
  `lib/firebase.ts`), so this is purely how the app looks and launches
  once installed, not a new capability layer.

- **Contribution margin surfaced as its own number, not just used
  internally.** The calculation engine already computed gross margin
  (revenue − COGS, where COGS includes anything tagged "counts toward
  COGS" like outbound shipping) and contribution margin (gross margin −
  other variable costs: selling fees, fulfillment, contractor/variable
  labor, variable marketing) exactly as specified — it just wasn't shown
  next to gross margin anywhere. Added: a "Contribution margin" stat on
  Financial Health, sitting between Gross and Operating margin in the
  ribbon (`FinancialHealthRatios.contributionMarginPct`, new); a
  "Contribution %" column/line on the Profitability page's product and
  customer tables (`ProductProfitability.contributionMarginPct` /
  `CustomerProfitability.contributionMarginPct` were already computed,
  just never rendered). Confirmed net margin (operating result − interest,
  tax, disposals, bad debt) was already correct and, if anything, more
  complete than asked (also absorbs depreciation and bad-debt write-offs).
  Sharpened the Variable Costs section subtitle on Products and the
  `lib/aiPrompts.ts`/USER-MANUAL docs to state the full Gross → Contribution
  → Operating → Net waterfall explicitly, including why employee payroll
  sits in Operating (via Expenses) rather than Contribution margin —
  counting it in both would double-count it. Variable/contractor labor
  (as opposed to an employee's own time, already in payroll) is modeled
  via a Variable Cost record like any other selling/fulfillment cost —
  no new field needed, the mechanism already existed.
- **Operational risk signals on Financial Health.** New "Manual correction
  rate" (edits/deletes as a share of all logged actions, trailing 3 months)
  and "Manual overrides" (stock adjustments + bad-debt write-offs + returns,
  same window) — a working answer to "how much of this business is manual
  fix-ups vs. clean forward entries", built entirely from data the app
  already collects (`auditLog`, `StockAdjustment`, `ReceivableWriteOff`,
  `SaleReturn`). New `computeManualOpsSignals` in `lib/calculations.ts`,
  wired through `DataContext`. Thresholds are a stated heuristic, not an
  audited standard — said so on the page.
- **CAC now flagged, not just displayed.** The Customer acquisition cost
  stat on Financial Health gets a red/amber/good tone: a simplified
  payback check (CAC vs. one window's average revenue per customer), with
  an inline note that it's rougher than the per-customer LTV:CAC ratio
  already on the Customers page and a pointer there for the fuller picture.
- Confirmed churn rate was already tracked with red/amber/good thresholds
  on Financial Health (Customer retention section) — no change needed
  there.
- Explicitly documented (USER-MANUAL, `lib/aiPrompts.ts`) that TAM/SAM/SOM
  market-sizing is NOT tracked and can't be computed from ledger data —
  it needs external market data (population, competitor share) this app
  has no source for. Same treatment as the existing ROAS "not tracked"
  note, rather than inventing a number.
- **AI sell-price suggestion on the Products form.** New "Suggest" button
  next to the sell-price field on Add/Edit product calls a new
  `/api/ai/suggest-price` route (same auth + daily AI-message-cap
  machinery as `/api/ai/chat` — not a second unmetered API surface) and
  fills in a proposed price the owner can accept or edit. Explicitly NOT a
  live market/MSRP lookup — this app has no web-connected pricing source,
  so the estimate comes from the model's general training knowledge only,
  is labeled as such in the UI, and is shown with the model's own
  reasoning and a low/high range so it's easy to sanity-check rather than
  trust blindly.
- Confirmed sales returns (`SaleReturn`) and owner reinvestment
  (`CapitalKind: "reinvestment"`) were already implemented and wired
  through P&L, receivables/refund math, and the Capital & ROI /
  cash-flow calculations — no changes needed there.
- **Supplier directory.** Customers already got a lightweight directory
  (name, contact, notes) so the Sale form has a consistent autocomplete
  instead of "ABC Supplies" vs "ABC supplies" silently splitting one
  customer's history in two — Suppliers had no equivalent, even though
  `Purchase.supplier` and the new `Expense.payee` (bills payable, above)
  are exactly the same kind of free-text field. New `Supplier` type
  (deliberately lighter than `Customer` — no CAC/lead-source, those are
  sales-specific), new `app/suppliers/page.tsx` (list, add/edit/delete,
  per-supplier total spent/owed/last-activity computed by matching name
  against purchases, bills, and payables — same name-matching approach as
  Customer, no new foreign key anywhere). The Buying and Bills forms both
  gained a datalist autocomplete sourced from this directory, and — same
  silent, best-effort pattern the Sale form already uses for Customers —
  typing a new name on either form quietly adds it to the directory.
  Owner/Manager only throughout (`manage:suppliers` permission, new
  Firestore rules): Purchases and Bills, the only places a supplier name
  is ever used, are already Owner/Manager-only, so Staff has no read or
  write need here either.

- **Bills payable — mark any one-off expense as "owed, not paid yet."**
  Previously every `Expense` was assumed paid in cash the instant it was
  recorded — fine for most costs, but not for a contractor invoice, a
  utility bill, rent billed before it's paid, or an employee's pay run
  logged as its own dated line. Added `paymentStatus` ("paid" | "unpaid"),
  `payee`, and `dueDate` to `Expense` (one-off, non-recurring expenses
  only — recurring flat expenses like rent/subscriptions/auto-managed
  payroll keep behaving exactly as before, since they have no single
  discrete instance to mark paid or not). A new `BillPayment` record type
  mirrors the existing `PayablePayment` (credit-purchase) pattern —
  partial payments are their own dated records, same as everywhere else in
  the ledger. `computeBillsPayable` (mirrors `computePayablesAging`) ages
  unpaid bills into the same current/1-30/31-60/61-90/90+ buckets. The
  Money Owed page (`app/receivables-payables/page.tsx`) gained a third
  "Bills" tab alongside Receivables and Suppliers, with its own aging
  table, mobile cards, and Record Payment / Correct Payment flow. An
  unpaid bill still counts as a real cost in the month it's incurred
  (accrual P&L, `expenseTotal`, unchanged) but its cash impact is deferred
  to whichever month a `BillPayment` is actually recorded — new
  `expenseCash`/`billSettlements` fields on `MonthlyPnL`, mirroring
  `purchaseCash`/`payableSettlements` for credit purchases exactly. Wired
  into the Balance Sheet (`accountsPayable` = supplier payables + bills
  payable), bank reconciliation candidates, the "Can You Make Rent" cash
  runway projection, the AI assistant's overdue reminders and suggested
  questions, and the accountant-facing `/api/aging/report` endpoint
  (tagged `source: "supplier" | "bill"` so external tooling can still tell
  the two apart). New `billPayments` Firestore collection, Owner/Manager
  only (matching `expenses` itself, which Staff can't see). Zero migration
  needed and zero behavior change for every expense recorded before this
  existed — an absent `paymentStatus` means exactly what it always meant:
  paid, in cash, immediately.

- **Estimates** (`app/estimates/page.tsx`, new `Estimate` type in
  `lib/types.ts`) — a pre-sale, multi-line quote you can send a customer
  before anything is committed. Deliberately its own document rather than
  a "draft Sale": an Estimate never touches stock, WAC/COGS, or revenue.
  Accepting one runs `convertEstimateToInvoice`, which creates real `Sale`
  rows — one per line, sharing an `invoiceId` — through the exact same
  path a hand-entered multi-item invoice takes, so receivables aging,
  statements, and margins all pick it up normally from that point on. The
  estimate itself is marked `converted` (with a pointer to the invoiceId
  it became) rather than deleted, so the original offer stays on record.
  Print/share reuses the existing letterhead/table layout
  (`buildEstimateHtml` in `lib/print.ts`) so it reads as part of the same
  document family as invoices, just without a payments table or "balance
  due" framing. Same read/write visibility and Firestore rules as Sales
  (Owner/Manager see and manage everything; Staff see and create their
  own). Named "Estimate" rather than "Quote" specifically to avoid
  colliding with the existing `Project.quotedPrice` concept, which is a
  single agreed job price you cost actuals against over time — a
  different thing from a line-itemized pre-sale offer with its own
  accept/decline lifecycle.

## Fixed

- **Staff could not actually log a sale.** `StaffSalesView` shows every
  Staff member a "+ I sold something" button and submits through the same
  `QuickSaleForm` → `addSale` path as everyone else, but `addSale` gated
  on the `"manage:sales"` permission — which the Staff role never has (by
  design: Staff get the narrower `"create:sale"`, and can't edit or
  delete a sale once logged, per the empty-state copy on that page
  itself). Every sale a Staff member tried to log threw "Your role
  doesn't have permission to do that." Added `requireAnyPermission` and
  switched `addSale`'s (and `addEstimate`'s, same shape of gap) check to
  accept either `"manage:sales"` or `"create:sale"` — Staff can now
  create a sale or estimate, same as the UI already implied they could;
  editing, deleting, and converting stay Owner/Manager-only, unchanged.

## Security

- **No `.gitignore` existed at all.** `.env.local` (real Firebase Admin
  private key, DeepSeek/Resend API keys, admin passcode), `node_modules`,
  and `.next` build output all had a clear path into source control the
  moment this became a real git repo. Added one.
- **The admin passcode gate (`lib/adminAuth.ts`) had no server-side rate
  limiting.** The client-side lockout in `app/admin/new-business/page.tsx`
  (5 attempts / 5 min, sessionStorage) is real for someone clicking
  through the UI but no obstacle to a script calling `app/api/admin/*`
  directly with a fresh guess every request — those routes can suspend an
  existing business and touch its billing record, so an unlimited guessing
  budget on them mattered. `requireAdminPasscode` is now async, checks a
  per-IP attempt counter kept in Firestore (`adminAuthAttempts/{ip}` — no
  client read/write path to it, same as every other server-only
  collection), and locks a caller out for 15 minutes after 8 failed
  attempts in a 15-minute window. Also switched the passcode comparison
  itself to `crypto.timingSafeEqual` instead of `!==`, so response timing
  can't be used to narrow down the correct value character by character.
  All 8 call sites updated to `await` it.
- **Added baseline HTTP security headers** (`next.config.js`):
  `X-Frame-Options: DENY` (clickjacking), `X-Content-Type-Options: nosniff`,
  a stricter `Referrer-Policy`, and a locked-down `Permissions-Policy`.
  Deliberately did **not** add a Content-Security-Policy here — writing one
  safely means auditing every inline script/style and third-party origin
  the app actually loads first, and a wrong CSP fails silently (breaks a
  page with no error) rather than loudly. Worth doing as its own pass, not
  bundled into this one.

## Added

- **The landing page had no favicon, no social share image, no sitemap,
  and an unrestricted robots.txt** — asked "can the landing page be any
  better", this is what an actual audit (not a taste pass) turned up.
  Given this product is sold by a real person sharing this link directly
  (WhatsApp, a Facebook business group, a DM) rather than paid ads, the
  shared-link preview card is the first impression for most prospects, and
  there wasn't one at all.

  - `app/icon.tsx` / `app/apple-icon.tsx` — a generated favicon and Apple
    touch icon reusing the exact same three-bar mark and brand colors as
    `BalancrMark` elsewhere on the page, so nothing had to be designed
    from scratch or risk drifting from the real mark.
  - `app/opengraph-image.tsx` / `app/twitter-image.tsx` — a proper 1200×630
    branded share card (same mark, headline, and tagline as the hero),
    verified by actually rendering it and looking at the output, not just
    trusting the build succeeded.
  - `metadataBase` + site-wide `openGraph`/`twitter` defaults in
    `app/layout.tsx`, with `app/page.tsx`'s own metadata overriding with
    the landing page's specific title/description — new
    `NEXT_PUBLIC_SITE_URL` env var (documented in `.env.local.example`,
    falls back to localhost so this never blocks a build) is what lets
    the image URLs and sitemap resolve to a real absolute address instead
    of a relative one nothing can share.
  - `app/sitemap.ts` — lists only the three routes an anonymous visitor
    can actually reach (`/`, `/request-trial`, `/legal`); everything else
    requires auth and just redirects to `/login`.
  - `public/robots.txt` replaced with `app/robots.ts` (so its `Sitemap:`
    line can use the same `NEXT_PUBLIC_SITE_URL` instead of a
    hand-maintained/guessable domain), switched from a single
    `Disallow: /admin/` to an allow-list of the same public routes above
    — the rest of the app was previously crawlable-in-principle (it just
    bounces to `/login`), which is wasted crawl budget, not a real
    boundary; Firestore security rules remain the actual access control.

- **Current ratio / quick ratio / working capital now include the current
  portion of loan debt**, not just accounts payable. This was flagged as a
  known, deliberate simplification in the previous build rather than a
  bug — on request, it's now the standard textbook treatment: "current
  liabilities" = accounts payable + whatever loan principal is actually
  due in the next 12 months, computed off each active loan's own
  amortization schedule (new `computeCurrentPortionOfLoans` in
  `lib/calculations.ts`, next to `computeLoanPortfolio`). A loan's full
  remaining balance still counts in `totalLiabilities` for debt-to-equity
  and the debt ratio — only the near-term slice moves into the liquidity
  ratios. `/health` page copy and `lib/aiPrompts.ts`'s working-capital
  description updated to match; a business with no active loans sees no
  change in its numbers at all, since the current-portion figure is 0.

- **Bad-debt write-off for receivables.** Until now, a credit sale a
  customer will simply never pay had no way to leave the books — revenue
  was recognized at the point of sale, and there was no mechanism to
  correct it once it was known to be uncollectible, so it sat forever as
  both overstated profit and phantom accounts receivable. New
  `ReceivableWriteOff` record (`lib/types.ts`), append-only like
  `ReceivablePayment` for the same audit-trail reasons. Owner/Manager only
  (`manage:writeOffs` permission) to create/correct, Owner-only to reverse
  — a write-off is a business judgment call, not routine cash handling, so
  it sits one trust level above recording a payment, which any active
  member can do.

  Wired end to end: `computeReceivablesAging` now nets `amountWrittenOff`
  out of outstanding/aging; `computeMonthlyPnL` recognizes the same amount
  as a `badDebtExpense` in the month it's written off — non-cash, pre-tax,
  same treatment as `depreciationExpense` (verified the Balance Sheet's
  asset/equity balance still holds, the same way it does for
  depreciation). Firestore rules, DataContext CRUD, and a "Write off"
  action + reversible write-off history on the Receivables & Payables page
  (Owner/Manager can view, only Owner can reverse). Partial write-offs are
  supported (e.g. settling for less than full).

## Fixed

- **Three separate, drifting reimplementations of receivables/payables
  aging math**, found while checking that "all the financial equations are
  complete" actually held up under a real audit rather than just trusting
  the existing docs. `lib/paymentAging.ts` (backs `/api/aging/report`) and
  `lib/aiSmartReminders.ts` (backs the AI Assistant's `get_reminders` tool
  and the composer's auto-suggested questions) each had their own
  from-scratch `qty * unitPrice` math — missing sales tax on a credit
  sale's amount due, not grouping a multi-line invoice's `Sale` rows
  together, and diffing dates with local-time `new Date()` instead of the
  UTC-safe helper the rest of the app uses. That meant the AI Assistant
  and the external aging-report API could show different overdue amounts
  than the Receivables & Payables page itself for the exact same
  customer. Both now delegate to `computeReceivablesAging` /
  `computePayablesAging` — the same functions the page uses — reshaping
  the output into each file's existing public types rather than
  recomputing anything, so a reminder or report line can't drift from what
  a person actually sees in the app. Also makes both aware of bad-debt
  write-offs, which a from-scratch reimplementation would otherwise have
  silently ignored.


- **Three pricing tiers on the landing page**, replacing the old single
  flat-price card. Starter / Growth / Business, with Growth visually
  called out as "Most popular" and a monthly/annual toggle defaulted to
  annual (2 months free) — Monthly stays one click away, never hidden or
  disabled. Tiers differ honestly on team size, support level, and
  onboarding intensity, never on features: this app has no code path that
  gates anything by plan (see `AccountStatus.plan`'s doc comment in
  `lib/types.ts`, unchanged), so claiming a feature split would just be
  false advertising. New `components/PricingSection.tsx` (client component,
  isolated from the otherwise-static `app/page.tsx` so the rest of the
  landing page stays a server component); its full reasoning, including
  why each nudge here is a "make the good choice easy" one rather than a
  dark pattern, is in that file's header comment.

  The tier a visitor picks isn't just decorative — every "Start free
  trial" button carries `plan` and `cycle` through to `/request-trial` as
  query params, which now pre-fills (and lets the visitor freely change) a
  "Plan you're interested in" field. That's saved on the lead
  (`TrialRequest.interestedPlan` in `lib/types.ts`), included in the
  admin's email notification (`lib/email.ts`), and shown as a badge on
  each lead in the "Trial requests" tab (`app/admin/new-business/page.tsx`)
  — so the admin doing the actual manual account setup and billing
  negotiation already knows what the visitor was looking at, without this
  app needing any billing/checkout logic of its own.

## Fixed

- **Found on a follow-up review pass, not on first build:** the three
  pricing cards' grid had `items-start`, which turns off CSS Grid's
  default stretch-to-row-height behavior — so despite each card already
  being built with `flex flex-col h-full` and a `flex-1` spacer intended
  to bottom-align every "Start free trial" button, the cards would have
  rendered at their own natural (mismatched) heights, with buttons landing
  at different vertical positions across tiers depending on how much text
  each card's copy happened to wrap to. Removed `items-start` so the grid
  reverts to `stretch`; the existing flex layout on each card now does
  what it was written to do. Caught by rereading the file end-to-end
  rather than by the type-checker or linter, since it's a real but purely
  visual bug neither tool has any way to see.

# Changelog — 1 build ago

## Added

- **Staff utilization**, on the Time page. Owners/managers now see a
  per-team-member breakdown of billable vs. total hours clocked over the
  trailing 30 days, plus a utilization %. Built entirely from `TimeEntry` —
  the same clock in/out data Project labor costing already reads — so
  there's no new data entry and no assumption about "expected" or
  scheduled hours (this app has no shift/roster feature to compare
  against): it reports what actually got logged, which is the point — a
  team that's clocking in consistently but spending most of that time on
  non-billable work is a margin problem a busy-looking calendar can
  otherwise hide. New `computeStaffUtilization` in `lib/calculations.ts`,
  wired through `DataContext` as `staffUtilization`, surfaced only to
  Owner/Manager on `app/time/page.tsx` (Staff still only sees their own
  entries, as before — this is an aggregate across everyone). `lib/aiPrompts.ts`
  and `BUSINESS-VALUE.md` updated to match.

## Fixed

- Nothing broken by the above — full `tsc --noEmit`, `next lint`, and
  `next build` all pass clean after this change.

# Changelog — 2 builds ago

## Added

- **Tax remittance tracking**, closing the "Sales Tax Payable is cumulative
  activity, not a live balance" limitation called out in
  `lib/calculations.ts` and on the Statements page since this app first
  started collecting sales tax. Owners/managers can now log a payment they
  actually sent to their tax authority (date, amount, optional notes) on
  the Balance Sheet tab; it nets against `salesTaxPayable` — and against
  `cash`, symmetrically, so the balance sheet's own `Assets = Liabilities +
  Equity` check keeps holding — going forward, `salesTaxPayable` reads as a
  real "what the ledger thinks you currently owe" figure for any business
  that keeps this log up to date, not just tax activity since inception.

  This is deliberately narrow and stays inside the "no external compliance
  systems" boundary: there's no tax-authority integration, no filing, no
  verification against a real return — just a self-reported ledger entry,
  the same shape as the existing owner-capital tracking. New `TaxPayment`
  type (`lib/types.ts`), `computeBalanceSheet` now nets it out
  (`lib/calculations.ts`), full CRUD wired through `DataContext` with a new
  `manage:tax` permission (owner + manager write, owner-only delete, same
  tier as capital entries — see `lib/permissions.ts` and
  `firestore.rules`), CSV export/import and full-backup inclusion
  (`lib/csv.ts`, `lib/backup.ts`, `app/import-export/page.tsx`), and a
  small log + form on the Statements → Balance Sheet tab
  (`app/statements/page.tsx`). `lib/aiPrompts.ts`, `USER-MANUAL.md`,
  `BUSINESS-VALUE.md`, and `README.md`'s CSV-formats table updated to
  match, per this project's own convention of keeping the AI's knowledge
  and the docs in sync with actual behavior.

# Changelog — 3 builds ago

Six small, additive changes on top of the existing app. Nothing here changes
existing data shapes, existing exports/imports, or existing permissions —
everything is either new UI wired to existing data, or a new file that
nothing else depends on yet.

## Fixed

- **Sales tax collected on cash sales was silently vanishing from Cash on
  Hand, the Balance Sheet, and every figure derived from them.** Correctly,
  a cash sale's tax amount was never counted as revenue — but it was ALSO
  never counted as cash received, even though a customer paying (say)
  $118 for a $100 item plus $18 tax puts the full $118 in the till, not
  $100. That understated `netCashFlow` (and symmetrically, tax paid on
  cash purchases was never counted as cash out either) for any business
  using sales tax — a first-class, explicitly supported feature of this
  app (`Settings.salesTaxRatePct`, `Sale/Purchase.taxAmount`, the Tax
  Summary on Statements). Because `cash` on the Balance Sheet, cash
  runway, the "Can You Make Rent" projection, and the trailing financial-
  health ratios all derive from `netCashFlow`, this one gap was quietly
  wrong everywhere those numbers show up.

  Fixed `cashSalesRevenue`/`purchaseCash` in `computeMonthlyPnL`
  (`lib/calculations.ts`) to include the tax-inclusive amount for
  non-credit sales/purchases. That alone would have broken the Balance
  Sheet's own "Assets = Liabilities + Equity" self-check — cash goes up
  by the tax collected, with nothing on the other side of the equation —
  so a new **Sales Tax Payable** liability was added, computed as
  cumulative output tax minus reclaimable input tax since inception
  (`MonthlyPnL.outputTax`/`inputTax`, same formula the Tax Summary
  already used per month, now also accumulated for the Balance Sheet).
  New liability line shown on the Balance Sheet (`app/statements/page.tsx`),
  labeled with the business's own tax label from Settings. Verified by
  hand with a worked example (a taxed cash sale against a cash purchase
  and an owner investment) that the balance sheet identity holds exactly
  with the fix in place.

  **Known limitation, called out in both the code comment and the UI**:
  there's no way yet to record an actual remittance payment to the tax
  authority against this liability, so it's a running "tax activity to
  date" figure, not a live "exactly what you owe right now" — building
  real remittance tracking (a proper payment record against the
  liability, excluded from operating expenses) is a bigger feature than
  this fix, and wasn't necessary to close the actual bug: cash was wrong,
  the balance sheet's own liabilities were incomplete, and now both are
  correct given what the app can already track. `lib/aiPrompts.ts` also
  had a stale, incorrect claim that Tax Summary "doesn't cover tax on
  non-stock expenses" — it already did (`expenseInputTaxForMonth`); fixed
  the AI's knowledge to match what the page actually does.

## Fixed

- **AI Assistant / user-manual drift from the scenario-forecast change above.**
  The project's own convention (see `lib/aiPrompts.ts`'s header comment) is
  that `APP_HELP_KNOWLEDGE` and `USER-MANUAL.md` must stay in sync with a
  page's actual behavior, since the AI Assistant is grounded on that block
  and told to say "not sure" rather than guess for anything outside it. The
  scenario-forecast dashboard change had been shipped without updating
  either, so the assistant would have had no grounded answer for "does the
  forecast show a range?" — fixed both.

## Fixed

- **"One-click full backup" wasn't actually full.** The Import/Export page's
  zip export, and the "zip all your data" claim in BUSINESS-VALUE.md, dated
  from before the app grew a customer directory, projects, time tracking,
  opportunities, and a fixed-asset register — none of those five collections
  were in the backup or had any CSV export at all, so a business's customer
  list, project history, time logs, opportunity scores, and asset register
  were locked into this app with literally no way to get them out. Added
  export functions for all five (`lib/csv.ts`), wired them into the backup
  zip (`lib/backup.ts`) and as individual export-only cards on the
  Import/Export page — export-only, deliberately: each of these has real
  relational shape (a Project's cost segments/milestones, a Customer's
  derived unit economics) that a flat CSV importer can't faithfully
  recreate without a materially bigger feature, so building import for them
  wasn't worth taking on just to close this gap. `README.md`'s CSV-formats
  table also picked up the pre-existing loans.csv and variable_costs.csv
  rows it was missing, while this was already open.

## Added

- **Scenario-banded revenue forecast** (`lib/calculations.ts`'s
  `forecastRevenue`, rendered on the Dashboard). The forecast chart used to
  show one trend line — exactly the "single optimistic scenario" trap:
  planning a hire, a lease, or a big order off one number with no sense of
  what a bad month does to it. Projected (future) months now also carry a
  `best`/`downside` figure, computed as the trend ± one standard deviation
  of that same trend line's own residuals against your actual sales
  history — a data-derived range, not an arbitrary ±X% guess. Historical
  months are left alone (they're facts, not scenarios). The chart plots
  both as a light dashed band, and a line beneath it states the plain-
  language range for the final forecast month with a one-line steer:
  size fixed commitments against the downside figure, not the expected
  one. Deliberately doesn't widen the band further out into the forecast
  horizon (a technically "more correct" random-walk treatment would) —
  with a handful of noisy monthly data points, that would mostly add
  false precision rather than real information, so kept constant-width to
  stay hand-verifiable.

- **Manual billing + a public pricing page** (`lib/types.ts` →
  `AccountStatus`, `app/api/admin/businesses/[businessId]/billing/route.ts`,
  `app/admin/new-business/page.tsx`, `app/page.tsx`) — closes the gap
  between "lead" and "renewal" in the admin pipeline. The landing page now
  shows one flat price openly (Rs 4,900/month or Rs 49,000/year, two
  months free) instead of pricing being something a visitor has to ask
  about — everything on the page above it is already included, since
  nothing in this app is feature-gated by plan. The landing page itself
  was also reworked to carry more visual weight than the original
  hairline-rows-only layout: a hand-drawn icon per feature (no icon
  library — a small consistent-stroke SVG set built for this page), a
  second product mockup next to the existing statement preview (an
  "Ask the assistant" chat mockup illustrating the plain-English entry
  feature), a device row under "who it's for", numbered steps for the
  trial flow, and a faint ruled-paper texture behind the hero — all on
  the app's existing dark/amber palette, nothing borrowed from outside it.
  On the admin side, the "Manage accounts" tab gained a billing record
  per business (plan, amount, cycle, renewal date) living on the same
  `meta/account` doc the suspend switch already used, with the same
  "platform-only write" guarantee. "Mark paid" advances the renewal date
  by one cycle; accounts overdue or due within 7 days sort to the top of
  the list and show up as a count on the tab, the same pattern the Trial
  requests tab already used for pending leads. There is still no payment
  gateway anywhere in this project — this is a record of what the admin
  already collected by hand (bank transfer, cash, whatever), not
  something that charges anyone. The Trial requests tab also gained a
  "Mark contacted" action (the `TrialRequest.status` value already
  existed but had no button wired to it), so the full
  lead → contacted → account → paid → renewal path is now something the
  admin can actually work end to end in one place.

- **AI Assistant app awareness** (`lib/aiPrompts.ts` → `APP_HELP_KNOWLEDGE`,
  wired into `app/api/ai/chat/route.ts`) — the assistant now knows what
  every page in the app does and can answer "how do I…" / "where is…" /
  "what does X mean" questions directly, in addition to its existing job
  of logging entries and reporting numbers. The persona prompt was split
  into two explicit jobs (log/report vs. explain-the-app) with a rule
  telling the model how to tell them apart, so a how-to question ("how do
  I add an employee") can never get misrouted into `propose_entries` or
  `ask_question` the way a real transaction description would be. The
  knowledge itself is condensed from README.md/USER-MANUAL.md, not
  invented, and the model is explicitly told to say "not sure, check with
  whoever manages this account" for anything outside it rather than
  guess. Sent as its own cached (`cache_control: ephemeral`) system block
  since it's identical across every business and every turn, unlike the
  per-business block next to it.

- **AI Assistant daily usage cap** (`lib/aiUsageLimit.ts`, wired into
  `app/api/ai/chat/route.ts`) — a per-business, self-resetting daily limit
  (200 messages/UTC day by default) on the only AI route that actually
  calls the model. `requireAiContext` already verified *who* could call
  it; nothing previously limited *how many times*, which is a real cost
  exposure once this is sold to multiple SME customers rather than run for
  one owner. Checked and recorded in a single Firestore transaction before
  the model is called, so a business at its cap never generates model
  cost for that turn. Override per business via the new optional
  `Settings.aiDailyMessageLimit` field, set directly in Firestore — no UI,
  deliberately an account-management knob, not a customer setting.

- **First-run checklist** (`components/OnboardingChecklist.tsx`) — shows on
  the dashboard until a product, a purchase, a sale, and an opening balance
  all exist, then stops rendering for good. Dismissible early via `localStorage`.
- **Offline banner** (`hooks/useOnlineStatus.ts`, `components/OfflineBanner.tsx`)
  — a sticky bar across every page while the browser reports no connection.
  Firestore's existing offline queue (see `lib/firebase.ts`) does the actual
  work; this only makes it visible.
- **One-click full backup** (`lib/backup.ts`, wired into `/import-export`) —
  zips every entity CSV the app can already export into one file, plus a
  short manifest. Each file inside is identical to that entity's individual
  "Export CSV" output, so restoring is re-importing each file the normal
  way.
- **Inline glossary** (`lib/glossary.ts`, `components/Term.tsx`) — tap-to-reveal
  definitions wired onto the accounting terms that appear as-is on
  `/statements` (COGS, gross profit, contribution margin, accrual/cash
  basis, accounts receivable/payable). Not added to `/profitability`, which
  already phrases the same ideas in plain language ("Profit per sale", "You
  need to sell this much") — a glossary term there would be redundant.
- **Logo upload** (`lib/logoUpload.ts`, `storage.rules`, wired into
  `/settings` → General and every printed quote/invoice/receipt via
  `lib/print.ts` and `lib/invoiceGenerator.ts`). Owner-only, first use of
  Firebase Storage in this project — see the README's Firebase setup section
  for the one extra deploy step this needs.
- **Recurring invoices** (`lib/types.ts` → `RecurringInvoice`, `lib/recurringInvoices.ts`,
  wired into `contexts/DataContext.tsx` and `/invoices`) — a billing
  schedule for a repeat-billing customer (a retainer, a monthly service
  contract): set it up once (customer, line items, weekly/monthly/yearly)
  and a real invoice — a proper multi-item Sale group with its own
  `invoiceId`, receivables aging, and print/collect flow, exactly as if
  entered by hand — is generated automatically each time it comes due, or
  on demand via "Generate now". Guarded against double-billing (two open
  tabs, a stale page left open overnight) by a per-(schedule, day) lock
  document written inside the same Firestore transaction that creates the
  invoice. New `recurringInvoices`/`recurringInvoiceRuns` collections,
  Owner/Manager only, same trust line as editing a Sale directly.
- **Owner-recovery runbook** (`RECOVERY-RUNBOOK.md`) — documentation, not
  code. The single-owner-per-business architecture (`businessId == owner's
  uid`) means there's no "wrong person has owner access" scenario to
  defend against; the one real gap (owner loses password *and* email
  access) is rare enough to be a documented manual process rather than a
  built feature.
- **Batch discounting on Products** (`contexts/DataContext.tsx` →
  `bulkDiscountProducts`, wired into `app/products/page.tsx`) — select any
  mix of products/services via checkbox (or "select all") and apply a
  single % discount (or, with a negative value, a % markup) to all of
  their `defaultSellPrice`s at once, with a live before/after preview per
  item before committing. There's no separate B2B/B2C price tier on a
  Product, so this one flow covers both a wholesale bulk-order discount
  and a retail sale-weekend markdown. Writes are chunked the same way
  `bulkAddProducts` already is, items with no sell price set are skipped
  rather than erroring, and one audit-log entry summarizes the whole
  batch. `lib/aiPrompts.ts` → `APP_HELP_KNOWLEDGE` and `USER-MANUAL.md`
  were updated alongside it so the AI Assistant's "how do I…" answers and
  the manual stay accurate.
- **Missing SME financial metrics, actually wired up** (`lib/calculations.ts`,
  `contexts/DataContext.tsx`, `app/health/page.tsx`) — an audit turned up
  that `lib/aiPrompts.ts` and `USER-MANUAL.md` already *claimed* the app
  showed growth rates, average order value, revenue per employee, and cash
  runway, but none of the four were actually computed or rendered
  anywhere — a documentation/reality mismatch, not just a missing feature.
  Also added three standard ratios that were genuinely absent: return on
  assets (ROA), working capital as a dollar figure alongside the current
  ratio, and debt service coverage ratio (DSCR, now that the app tracks
  loans with a monthly payment). All seven are implemented as pure
  functions in `lib/calculations.ts` (`computeGrowthMetrics`,
  `computeAverageOrderValue`, `computeRevenuePerEmployee`,
  `computeCashRunwayMonths`, plus three new fields on
  `FinancialHealthRatios`), each returning `null` — never a fabricated 0 —
  when there isn't enough history yet. Wired into `DataContext` as new
  memoized values and rendered on a rebuilt **Financial Health** page,
  which itself turned out to be entirely undocumented in
  `APP_HELP_KNOWLEDGE`/`USER-MANUAL.md` before this pass — both are now
  fixed to describe what the app actually has, including the distinction
  between the new trailing-average "cash runway" and the existing
  date-specific "can you make rent" tool on the Cash Flow page so the two
  aren't confused.
- **Markup % and payroll-to-revenue ratio** (`lib/calculations.ts` →
  `ProductProfitability.markupPct`, `FinancialHealthRatios.payrollToRevenuePct`)
  — two more standard SME formulas that were missing. Markup (profit ÷
  cost) is shown next to margin (profit ÷ price) on the Profitability
  page, since the two get conflated and a 50% markup is only a 33%
  margin — a real pricing mistake if someone prices off the wrong one.
  Payroll-to-revenue (today's committed payroll ÷ trailing average
  revenue, same "current commitment vs. trailing average" pattern as
  DSCR) sits on Financial Health next to the margin figures — the
  standard "is labor cost eating the business" check for service/retail
  SMEs.
- **ROAS (Return on Ad Spend) — considered and deliberately not built.**
  A trustworthy ROAS needs to know which sale came from which specific
  ad/campaign (attribution), which means integrating the ad platforms
  themselves (Google Ads, Meta Ads, etc) — real external-integration
  scope this project has explicitly stayed out of. A "blended" version
  (total revenue ÷ total marketing spend, no attribution) is a commonly
  misused number that overstates marketing's real impact by crediting it
  with organic and repeat sales it didn't cause; showing one would break
  the pattern every other metric in this app follows (return `null`
  rather than a number that quietly means something else). Customer
  Acquisition Cost and the LTV:CAC ratio (already built) answer the same
  underlying "is our spend on getting a customer worth it" question with
  numbers this app can actually stand behind. Documented in
  `USER-MANUAL.md`'s Common Questions and `lib/aiPrompts.ts` so the AI
  Assistant gives this same honest answer instead of guessing.

## Removed

- **Dead vision-OCR API route** (`app/api/ai/chat`'s sibling
  `app/api/ai/ocr/route.ts`). Leftover from before the AI Assistant went
  text-only: it still called an image-capable model on every POST, was
  reachable by any authenticated Owner/Manager, and — unlike
  `/api/ai/chat` — had no daily usage cap (`lib/aiUsageLimit.ts`), so it
  was a live, unmetered cost surface with zero UI wired to it anywhere in
  the app. Deleted outright rather than finished or capped, since photo
  scanning already exists the right way for this project: local,
  zero-cost, no-API-call OCR via `lib/ocr.ts` + `components/OcrScanner.tsx`
  on the Sales/Expenses quick-entry forms. `lib/aiUsageLimit.ts`'s header
  comment updated to stop pointing at the now-deleted file. `app/legal/page.tsx`'s
  privacy-policy template also updated — it referenced an "Assistant/OCR"
  feature pair that no longer matches what the app actually does.

## Deliberately not built (see BUSINESS-VALUE.md / project scope discussion)

- **Per-occurrence payroll bills.** Bills payable (above) applies only to
  one-off expenses, so an employee's auto-managed recurring payroll line
  (flat, `isRecurring: true`, linked via `Employee.linkedExpenseId`) still
  can't be marked owed-but-unpaid for a specific pay period — same reason
  every other recurring flat expense is excluded, and consistent with its
  existing exclusion from bank-reconciliation candidates. If you need to
  track a specific pay run as owed until disbursed, log it as its own
  one-off Expense (category "Payroll & labor", payee = the employee's
  name) instead of relying on the auto-generated recurring line — that
  already gets full paid/unpaid tracking. Building discrete per-period
  payroll occurrences (mirroring `RecurringExpenseOccurrence`) would be
  the natural next step if this turns out to matter in practice, but
  wasn't built speculatively.
- **Scheduled/emailed backups.** The full backup above is manual (button
  click) rather than an automatic weekly email, because the automatic
  version needs new server-side infrastructure (a scheduled Cloud Function)
  and an email-delivery provider that aren't part of this project yet. If
  that infra gets added later, `lib/backup.ts`'s row-builders
  (`productsRows`, `purchasesRows`, etc. in `lib/csv.ts`) are already
  structured to be called from a Cloud Function the same way they're called
  from the browser here.
- **Self-service owner-recovery flow** (secondary email, phone verification,
  etc.) — real scope (new fields, new verification flow, new attack
  surface), not worth building ahead of it actually being needed. See
  `RECOVERY-RUNBOOK.md` for the manual process in the meantime.
- **Statistical safety stock, seasonality decomposition, and price-elasticity
  modeling.** The EOQ/reorder-point math already in `computeEOQ` is
  deterministic (lead time × daily demand) rather than adding a
  demand-variance/service-level buffer on top, and there's no seasonal
  adjustment or elasticity estimation anywhere in the revenue forecasting.
  All three are genuine econometrics: they need enough clean historical
  data and statistical assumptions (a service-level target, a variance
  estimate, a demand model) that most SME owners using this app don't have
  and couldn't sanity-check — a wrong answer from any of these would look
  just as confident and precise as a right one, which is worse than not
  showing a number at all. Same principle as everything else on this list:
  controlled, not fully automated, don't fake precision the data can't
  support. `computeEOQ`'s reorder point, `forecastRevenue`, and
  `estimateAnnualDemand` (`lib/calculations.ts`) are where this logic would
  plug in if real demand-variance data ever becomes available.

## Final pass
- Dashboard: month-over-month change on revenue, profit and after-tax profit; new Cash position row (cash on hand, runway) using existing computeCashRunwayMonths.
- Fixed: stock losses (damaged, expired, stolen, short counts) now reduce profit as a non-cash Stock lost line, so the Balance Sheet keeps balancing. Income statement also shows bad debt. Check: scripts/verify-stock-shrinkage.ts.
- Dashboard forecast card now also states where monthly profit after tax is heading on the same straight-line trend (needs 3+ months of data; expected trend only, so a projected loss is not hidden).
- USER-MANUAL: added "Moving over a business that is already running" (opening cash and stock method, verified to balance; opening receivables and payables are a known limit).
- Fixed (found in the final check): the demo business showed a LOSS for the current month when created in the first days of a month (a full month of rent against one or two days of sales) — the first thing a prospect sees on the dashboard. The demo now carries a monthly service-retainer as recurring revenue, so every month tells an honest, profitable story and the recurring-revenue feature is on show. `scripts/verify-demo-data.ts` now checks the books on eleven different dates (1st, 2nd, mid-month, month-end, leap day) with the clock set to each, instead of only the day it happens to run.
- **Admin pipeline automation** (`/admin/new-business`): new **Today** tab (now the landing tab) shows leads waiting, trials running, paying accounts, MRR (same figure as Manage accounts), an ordered "Needs you today" list, and an **Automation** card (what is switched on, when the daily job last ran, **Preview today's emails** / **Send due reminders now**). The sidebar badges now have real counts from the first load.
- **One-click activation**: Trial requests → **Activate → Confirm** creates the login and business, starts the trial on the plan the visitor chose, marks the request provisioned and emails the owner a branded welcome with a set-password link. `/api/admin/provision` now does all of this in one request (account, trial date and plan in one batch, so nothing can be left half-set-up; price looked up server-side, never trusted from the browser). If email isn't configured it falls back to Firebase's password-reset email so the customer always gets a way in. **Edit first** keeps the old review-then-create form.
- **Automatic customer emails** (plain text, `lib/lifecycle.ts`, verified by `scripts/verify-lifecycle.ts`): welcome on activation, receipt when a payment is recorded (per-payment tick box), "trial extended", "account is back on" (not sent to an account that is still locked), reminders 3 days before a trial ends / when it has ended / 7 days before a renewal / when overdue (once per date, never two on one day, nothing for suspended or complimentary accounts, nothing contradicting a paid-up account's leftover trial date).
- **Daily job** (`/api/cron/daily`, `lib/dailyJob.ts`, scheduled by `vercel.json`, guarded by `CRON_SECRET`): sends due reminders, emails the admin one digest (leads waiting, accounts needing attention, reminders sent; nothing to say = no email) and records a heartbeat. It never locks, charges, suspends or deletes anything.
- New env var `CRON_SECRET`; `check-launch-readiness.mjs` warns about it and about missing customer-email variables. `verify-api-route-guards` now also accepts the cron guard.
