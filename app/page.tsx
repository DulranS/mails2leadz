// Public, signed-out marketing page — see components/AppShell.tsx
// (isMarketingPage) for how this stays visible to an anonymous visitor
// instead of getting bounced to /login like every other route, and how a
// signed-in user lands here for a split second before being sent on to
// their dashboard.
//
// There is deliberately no "Create account" button anywhere on this page.
// See app/login/page.tsx and lib/provisioning.ts for why: every account on
// this platform is set up by hand, on purpose. The "Request a trial" CTAs
// below all point at /request-trial, which captures a lead rather than
// creating a login — that queue is then worked from the "Trial requests"
// tab of app/admin/new-business/page.tsx.
//
// The demo buttons are the low-friction step BEFORE that: one tap
// signs a visitor into a shared sample business (components/TryDemoButton.tsx,
// lib/demoAccount.ts) so they can see the product, and the trial CTAs stay
// right beside every one of them for when they want their own account.
//
// Design note: the rest of the app is a card-based dashboard (see
// components/ui.tsx's Card). This page doesn't borrow that language: sections
// are hairline-ruled, headings sit in a left column with content beside them
// on desktop, and bordered boxes are kept for places that show a real
// artifact (the hero ledger, the price cards). The hero's memorable moment is
// components/HeroLedger.tsx, a small working demo of the product's core loop
// (say it, check it, save it, watch the statement move). It is static data
// with no network calls.
import Link from "next/link";
import PricingSection from "@/components/PricingSection";
import FeedbackWidget from "@/components/FeedbackWidget";
import TryDemoButton from "@/components/TryDemoButton";
import HeroLedger from "@/components/HeroLedger";
import MobileCtaBar from "@/components/MobileCtaBar";
import SupportContact from "@/components/SupportContact";
import { TRIAL_DAYS } from "@/lib/pricing";

const DESCRIPTION =
  `Accounting and day-to-day operations for shops and small businesses. Type a sale or expense the way you'd say it, and Balancr keeps your stock, invoices, staff pay, deadlines and profit up to date. Try a sample shop in one tap, or start a ${TRIAL_DAYS}-day free trial — no card.`;

const TITLE = "Balancr — accounting and operations for shops and small businesses";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image" as const,
    title: TITLE,
    description: DESCRIPTION,
  },
};

const BUTTON_PRIMARY =
  "inline-flex items-center justify-center min-h-[48px] px-6 rounded-md text-[15px] font-semibold bg-amber text-ink hover:bg-amber-soft transition-colors active:translate-y-px";
const BUTTON_GHOST =
  "inline-flex items-center justify-center min-h-[48px] px-6 rounded-md text-[15px] font-medium border border-line text-fg hover:border-muted hover:bg-panel transition-colors active:translate-y-px";

// Colour carries meaning on this page, using the same palette the app does
// (see tailwind.config.ts): every tone below is a family the signed-in app
// already uses, so a visitor's first impression matches what they'll see
// inside. Class names are written out in full so Tailwind can find them.
// Colour is never the only signal: each use sits beside a label or a shape.
type ToneKey = "good" | "info" | "amber" | "overview" | "plum";
const TONES: Record<ToneKey, { chip: string; rule: string; ring: string; text: string; line: string; dot: string }> = {
  good: { chip: "bg-good/10 border-good/30 text-good", rule: "border-good", ring: "border-good/60", text: "text-good", line: "bg-good/30", dot: "bg-good" },
  info: { chip: "bg-info/10 border-info/30 text-info", rule: "border-info", ring: "border-info/60", text: "text-info", line: "bg-info/30", dot: "bg-info" },
  amber: { chip: "bg-amber/10 border-amber/30 text-amber-soft", rule: "border-amber", ring: "border-amber/60", text: "text-amber-soft", line: "bg-amber/30", dot: "bg-amber" },
  overview: { chip: "bg-overview/10 border-overview/30 text-overview-soft", rule: "border-overview", ring: "border-overview/60", text: "text-overview-soft", line: "bg-overview/30", dot: "bg-overview" },
  plum: { chip: "bg-plum/10 border-plum/30 text-plum-soft", rule: "border-plum", ring: "border-plum/60", text: "text-plum-soft", line: "bg-plum/30", dot: "bg-plum" },
};

const FEATURES: { title: string; body: string; icon: (props: IconProps) => JSX.Element; tone: ToneKey }[] = [
  {
    title: "Products, services, or both — one profit figure",
    body: "See which items and jobs really make you money. What your stock cost, what delivery cost, and your running costs all roll into one profit number. Make your own products? List what goes into each one and record a production run; the cost follows. No juggling two spreadsheets.",
    icon: IconLayers,
    tone: "good",
  },
  {
    title: "Type it the way you'd say it",
    body: "Type “sold 3 tiles to Nimal on credit” and the form fills itself in. Ask “who owes me money?” or “how healthy is my business?” and get the answer from your own numbers: margins, cash, debts and what to improve. You check it, then you save it.",
    icon: IconChat,
    tone: "overview",
  },
  {
    title: "Reports your bank and accountant ask for",
    body: "Profit and loss, cash flow and balance sheet build themselves from what you've entered. You also see how much you need to sell to cover your costs, and how many months your cash will last.",
    icon: IconStatement,
    tone: "info",
  },
  {
    title: "Get paid faster",
    body: "Send invoices with your own logo, set up repeat billing for regular clients, and see exactly who owes you money and for how long. Nudge a late payer on WhatsApp in one tap.",
    icon: IconInvoice,
    tone: "amber",
  },
  {
    title: "Know before stock runs out",
    body: "Get a warning before an item runs low, based on how fast it really sells, plus how much to order. Orders already on the way are counted, so you don't order twice. Missed a sale because you ran out? Log it and see what it cost you. More than one shop or store? Stock and profit are tracked for each.",
    icon: IconStock,
    tone: "plum",
  },
  {
    title: "Know what you owe, what you're owed and what you own",
    body: "Each loan payment you make is split into repaying the loan and the interest. Money you lend out shows who is late and the interest you have earned. Investments and equipment show what they are worth now and later. Staff pay is recorded every month on its own, and sales commission is worked out for each salesperson.",
    icon: IconWallet,
    tone: "good",
  },
  {
    title: "Staff see only what you allow",
    body: "Owner, Manager and Staff each get their own login. Staff can ring up a sale (scan a barcode, with a scanner or the phone camera, and print a receipt) and count the till without ever seeing what you paid for stock or how much you earn on it. You can also limit a person to the branches they work at.",
    icon: IconTeam,
    tone: "info",
  },
  {
    title: "Run the operations, not just the books",
    body: "Set the deadlines that come back, like VAT returns and filings, and get warned before they fall due. Plan the day's deliveries by driver and area, see which products depend on one supplier, and run hiring from application to hire, with the checks recorded before anyone starts.",
    icon: IconStatement,
    tone: "plum",
  },
  {
    title: "Keep the customers who pay",
    body: "See which customers leave you money after the cost of what they bought, refunds and discounts, worst first. Turn on routine messages in Settings: booking confirmations and reminders, quote follow-ups, thank-yous and welcomes.",
    icon: IconChat,
    tone: "good",
  },
  {
    title: "Deliveries, invoices and the year",
    body: "Deliver an order in parts, and see what is still to go for each product. Choose, per order, whether it is invoiced in one go or each time a part is delivered. Record a share of each sale for the contractor or talent who earned it. Check that the books balance with the trial balance and the journal, then close the year once you have confirmed it: a closed year is locked against change.",
    icon: IconStatement,
    tone: "info",
  },
  {
    title: "Your data stays yours",
    body: "Download a full backup any time, import and export spreadsheets, and see who changed what. No internet? Keep working. It catches up when you're back online.",
    icon: IconShield,
    tone: "overview",
  },
];

// The proof points a careful buyer looks for, stated as plainly as the product allows. Every line is something the
// product does today (backup/export, the confirm-before-save assistant, the audit log, the automated calculation
// tests); there are no customer counts, logos or testimonials here because none are invented.
const TRUST_POINTS: { title: string; body: string; icon: (props: IconProps) => JSX.Element; tone: ToneKey }[] = [
  { title: "Your data is yours", body: "Download a full backup or export spreadsheets any time.", icon: IconShield, tone: "overview" },
  { title: "You press Save", body: "The assistant fills in the form. Nothing is recorded until you tap Save.", icon: IconChat, tone: "info" },
  { title: "Every change on record", body: "See who changed what, and when.", icon: IconStatement, tone: "amber" },
  { title: "Numbers that are checked", body: "Profit, loan and stock calculations are covered by automated tests.", icon: IconCheck, tone: "good" },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Send us your details",
    body: "Fill in a short form with your name, email and what you sell. It takes under a minute.",
  },
  {
    title: "We set up your account",
    body: `A real person creates your business and starts your ${TRIAL_DAYS}-day free trial, usually within one working day.`,
  },
  {
    title: "Choose your password",
    body: "You get an email with a link. Pick a password and you're in. The link stays valid for a week, so there's no rush.",
  },
  {
    title: "Keep it, or walk away",
    body: "Before the trial ends, tell us which plan you'd like and pay by bank transfer. Not for you? Do nothing. We never took a card, and you can download your data first.",
  },
];

// The honest scope line. Balancr is management accounting: it keeps the
// business's own books and produces reports. Each "isn't" below is something a
// buyer might otherwise assume, said up front instead of discovered after
// paying. Every line matches what the product does today (no bank feed on the
// Reconcile page, no tax-authority connection, payroll booked as a cost).
const IS_ITEMS: { title: string; body: string }[] = [
  {
    title: "Your own books, kept properly",
    body: "Sales, costs, stock, what customers owe you, what you owe, and three real financial reports. You run the business on real numbers, not guesses.",
  },
  {
    title: "Something you can hand your accountant",
    body: "Printable reports, spreadsheet exports, and a record of the tax you've paid. Year-end starts from clean numbers, not a shoebox of receipts.",
  },
];
const ISNT_ITEMS: { title: string; body: string }[] = [
  {
    title: "A tax filing tool",
    body: "It doesn't file returns or talk to the tax office. Tax figures come from what you record, and your accountant stays in charge of filing.",
  },
  {
    title: "Connected to your bank",
    body: "There's no automatic bank feed. You add or import statement lines and match them yourself, so nothing happens without you.",
  },
  {
    title: "Campaigns and sales outreach",
    body: "Those live in AutoLeads, a separate app. Balancr sends AutoLeads its leads and reads invoice status back once a day. It doesn't run ads or send marketing.",
  },
  {
    title: "A payroll service",
    body: "Pay, take-home and EPF/ETF amounts are worked out as estimates and recorded as a cost. It doesn't pay your staff or send anything to the authorities.",
  },
];

// What "in control" concretely means — every line below is something the product
// really does (see the roles, audit log, period lock and assistant code), not a
// promise about future features. Written for a business owner, not a developer.
const CONTROLS: { title: string; body: string; tone: ToneKey }[] = [
  {
    title: "The assistant suggests. You decide.",
    tone: "overview",
    body: "It fills in the form from what you typed. Nothing goes into your books until you tap Save. Don't want to use it? Everything else works exactly the same.",
  },
  {
    title: "Staff see only what you choose",
    tone: "info",
    body: "Owner, Manager and Staff permissions are enforced on our servers, not just hidden on screen. Staff can record a sale without ever seeing a cost price or your profit.",
  },
  {
    title: "Close the month, lock the numbers",
    tone: "amber",
    body: "Once a month is checked and shared with your bank or accountant, close it. After that nobody, not even you, can quietly change those figures.",
  },
  {
    title: "A record of every change",
    tone: "plum",
    body: "An owner-only, searchable log shows who changed what and when. “Who edited that?” always has an answer.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I try it before asking for a trial?",
    a: "Yes. Tap “Try it now” and you land inside a sample shop with made-up numbers. There's no signup, no card and nothing to fill in. Add a sale, look at the reports, ask the assistant a question. It's a shared demo, so please don't enter real business details there, and it closes on its own after a while. When you want your own private account, request a free trial.",
  },
  {
    q: "What should I do once I'm in the demo?",
    a: "Three quick things: open Selling and add a sale, open Money owed to see which invoices are overdue, then open Assistant and type “who owes me money?”. Reports shows your profit and loss. Nothing you do there is real, so click anything.",
  },
  {
    q: "How does the free trial work?",
    a: `You get ${TRIAL_DAYS} days with the whole product, every feature, on any plan. We don't take a card and there's nothing to cancel. If you don't continue, the trial simply ends.`,
  },
  {
    q: "Is it hard to learn?",
    a: "No. Type a sale the way you'd say it, check the form it fills in, and tap Save. The sample shop is the quickest way to find out: you can add a sale there in under a minute, with no signup.",
  },
  {
    q: "I already run my business. Can I move over without starting from zero?",
    a: "Yes. Pick a start date and enter the cash and stock you have that day. Then add what customers already owe you and what you owe suppliers. Those don't count as new sales or costs, so your past months stay clean. There's a step-by-step guide inside the app.",
  },
  {
    q: "How do I pay?",
    a: "By bank transfer or cash, however you normally pay suppliers. Tell us the plan and whether you want monthly or annual, and we send simple payment details. Your account is updated as soon as we record your payment. There's no card on file and nothing is ever charged automatically.",
  },
  {
    q: "What happens if I forget to pay?",
    a: "You get a reminder before the renewal date. If a renewal goes unpaid for about a week, the account can pause until it's settled. Nothing is deleted, and paying switches it back on straight away.",
  },
  {
    q: "Does Balancr file my taxes or connect to my bank?",
    a: "No. Balancr keeps your own books and produces reports you can hand to a bank or an accountant. It doesn't file returns or payroll forms, and it doesn't connect to tax systems or bank feeds. You stay in charge of what goes in.",
  },
  {
    q: "Will it replace my accountant?",
    a: "No, and it isn't meant to. Balancr is for running your business day to day on real numbers. Your accountant still handles filing and anything the law requires, and their job gets easier because your reports, exports and tax records are a click away.",
  },
  {
    q: "What does the AI assistant do with my data?",
    a: "It's optional. Only when someone uses it, their message and the parts of your records needed to answer it are sent to the AI provider (DeepSeek) on the key you add yourself, to deal with that one request. It suggests entries and you confirm them. The details are in the Privacy policy.",
  },
  {
    q: "Where is my data, and can I take it with me?",
    a: "It's stored with Google Firebase, and only the people you invite can see it, each with the role you give them. You can download a full backup and export spreadsheets whenever you like. The data is yours.",
  },
  {
    q: "Can my whole team use it?",
    a: "Yes. Owner, Manager and Staff each get their own login with their own permissions, and your accountant can have a view-only login to see the books without being able to change them. Plans are sized by team and support, never by features, so you're never missing something because of the plan you picked.",
  },
  {
    q: "Does it work without internet?",
    a: "Yes. You can keep working offline, in a shop with patchy signal for example, and it catches up the moment you're back online.",
  },
  {
    q: "Can I change plan later?",
    a: "Any time, just ask. There's no checkout or contract to untangle.",
  },
];

// The two operating flows Balancr is actually modeled on — a product
// business (buy it, price it, sell it, keep them buying) and a service
// business (package it, chase it, close it, keep them coming back). Named
// after the real page each step lives on, not generic feature-speak, so a
// visitor who sells one of these two ways recognizes their own operation
// immediately rather than having to translate "modules" into their day.
const PRODUCT_FLOW: { title: string; body: string }[] = [
  { title: "Buy it", body: "See what each item really costs you: the supplier's price plus freight, customs and duty, not just the invoice." },
  { title: "Price it", body: "Set a selling price and see your profit on it straight away, item by item." },
  { title: "Sell it", body: "Record the sale and send the invoice, from your phone in the shop or your laptop at home." },
  { title: "Take returns", body: "Put it back in stock or write it off. Either way your profit stays honest." },
  { title: "Get them back", body: "See who your regular customers are, where new ones come from, and which customers have gone quiet and need a win-back message. See what each way of finding customers costs you, and what its customers are worth." },
];
const SERVICE_FLOW: { title: string; body: string }[] = [
  { title: "Set your price", body: "A fixed price and what it costs you to deliver, so every job earns the same profit." },
  { title: "Track enquiries", body: "Note down everyone who has asked about your work, before they pay you anything." },
  { title: "Follow up", body: "Move each lead from new, to outreach, qualified, following up, quote sent and won. A follow-up date is set for you as each one moves on, so none is forgotten. A won lead becomes a sale in one tap." },
  { title: "Book the time", body: "Take appointments and reservations. A clash is refused, and you are reminded before each one. A finished booking becomes a sale in one tap." },
  { title: "Do the job", body: "One tap records the cost and the sale together." },
  { title: "Win repeat work", body: "See who comes back and who sent them to you." },
];

export default function LandingPage() {
  const CTA_LG = BUTTON_PRIMARY.replace("min-h-[48px]", "min-h-[52px]");
  return (
    <div className="min-h-screen bg-ink text-fg">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 min-h-[44px] sm:min-h-0">
            <BalancrMark className="w-6 h-6 text-amber" />
            <span className="font-display text-xl font-bold tracking-tight">Balancr</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="#pricing" className="text-sm text-muted hover:text-fg px-3 py-2 hidden sm:inline-block">Pricing</Link>
            <Link href="#faq" className="text-sm text-muted hover:text-fg px-3 py-2 hidden sm:inline-block">FAQ</Link>
            <Link href="/login" className="text-sm text-muted hover:text-fg px-3 py-2 inline-flex items-center min-h-[44px] sm:min-h-0">Sign in</Link>
            <Link href="/request-trial" className={BUTTON_PRIMARY.replace("min-h-[48px] px-6", "min-h-[44px] sm:min-h-[40px] px-4").replace("text-[15px]", "text-sm")}>
              Request a trial
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero: ruled paper behind, the product doing its job on the right. */}
        <section id="hero" className="relative overflow-hidden">
          <div aria-hidden className="ruled-paper absolute inset-0 pointer-events-none" />
          <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-10 pb-16 sm:pt-24 sm:pb-32 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] gap-14 lg:gap-16 items-center">
            <div>
              <p className="inline-flex items-center rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-medium text-amber-soft mb-6">
                For shops, workshops and small teams
              </p>
              <h1 className="font-display text-[2.75rem] sm:text-6xl xl:text-7xl font-bold tracking-[-0.035em] leading-[0.98] text-balance">
                Just type what happened. Balancr does the accounting.
              </h1>
              <p className="text-muted text-lg sm:text-xl mt-7 max-w-lg leading-relaxed">
                Know your real profit, who owes you and what&apos;s running low, every day instead of
                weeks later. Just say it out loud, like “sold 2 bags of cement, cash, Rs 9,000”. Made for
                shops and small teams, not accountants.
              </p>
              <div id="hero-cta" className="mt-10 flex flex-col sm:flex-row gap-3">
                <TryDemoButton
                  label="Try it now — no signup"
                  busyLabel="Opening the sample shop…"
                  className={CTA_LG + " w-full sm:w-auto px-8"}
                />
                <Link href="/request-trial" className={BUTTON_GHOST.replace("min-h-[48px]", "min-h-[52px]") + " w-full sm:w-auto px-8"}>
                  Start your {TRIAL_DAYS}-day free trial
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-2.5 text-sm text-muted">
                {["No card needed", "Nothing to cancel", "A real person sets you up", "Works offline"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <IconCheck className="w-4 h-4 text-good" />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm text-muted max-w-md leading-relaxed">
                “Try it now” opens a sample shop with three months of made-up sales. Nothing is real, so click anything.
              </p>
            </div>
            <div className="animate-statement-in rounded-lg ring-1 ring-amber/20 shadow-[0_50px_100px_-40px_rgba(0,0,0,0.95)]">
              <HeroLedger />
            </div>
          </div>
        </section>

        {/* Trust strip: what a careful buyer wants to know, answered before they have to scroll for it. */}
        <section id="trust" aria-label="Why owners can rely on it" className="border-t border-line bg-panel">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-12 grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-8 lg:gap-x-8">
            {TRUST_POINTS.map((t) => (
              <div key={t.title} className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                <div className={"shrink-0 w-10 h-10 rounded-md border flex items-center justify-center " + TONES[t.tone].chip}>
                  <t.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display font-semibold text-fg tracking-tight">{t.title}</div>
                  <div className="text-sm text-muted mt-1 leading-relaxed">{t.body}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Before / after: the whole pitch in two sentences. */}
        <section id="before-after" aria-label="From shoebox to answers" className="border-t border-line">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 sm:py-16 grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-line p-6 sm:p-8">
              <div className="text-xs font-medium uppercase tracking-wider text-muted">Today</div>
              <p className="mt-3 font-display text-xl sm:text-2xl font-semibold tracking-tight leading-snug text-fg/80">
                A shoebox of receipts, three spreadsheets, and a call to your accountant to ask how last month went.
              </p>
            </div>
            <div className="rounded-lg border border-amber/40 bg-amber/[0.05] p-6 sm:p-8">
              <div className="text-xs font-medium uppercase tracking-wider text-amber-soft">With Balancr</div>
              <p className="mt-3 font-display text-xl sm:text-2xl font-semibold tracking-tight leading-snug text-fg">
                Type what happened, tap Save. Your profit, your stock and who owes you are already up to date.
              </p>
            </div>
          </div>
          <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-12 sm:pb-16 -mt-4 sm:-mt-6 text-center">
            <p className="text-muted text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Not knowing is expensive: an item priced too low, your top item running out, an invoice nobody
              chased. Can you say, right now, which item earns you the most and who still owes you money?
              Balancr answers that from day one.
            </p>
            <div className="mt-6 flex justify-center">
              <TryDemoButton
                label="See it with sample numbers — no signup"
                busyLabel="Opening the sample shop…"
                className={CTA_LG + " w-full sm:w-auto px-8"}
              />
            </div>
          </div>
        </section>

        <Section title="Everything in one place" lede="Know which products or services really make money, and see the whole picture at a glance. No waiting for your accountant to build it.">
          <div className="grid sm:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => {
              const wide = i === 0 || i === FEATURES.length - 1;
              return (
                <div key={f.title} className={"rounded-lg border border-line bg-panel p-6 sm:p-7 " + (wide ? "sm:col-span-2" : "")}>
                  <div className={"w-11 h-11 rounded-md border flex items-center justify-center " + TONES[f.tone].chip}>
                    <f.icon className="w-5 h-5" />
                  </div>
                  <div className={"font-display font-semibold text-fg mt-5 tracking-tight " + (wide ? "text-xl" : "text-lg")}>{f.title}</div>
                  <div className={"text-muted mt-2 leading-relaxed " + (wide ? "max-w-xl" : "text-sm")}>{f.body}</div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Works the way you already sell" lede="Whether you resell products or sell your own time, Balancr follows the path your business already takes.">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-line bg-panel p-6 sm:p-7">
              <div className="font-display text-xl font-semibold mb-6 flex items-center gap-2.5"><span aria-hidden className="w-2.5 h-2.5 rounded-full bg-amber" />Selling a product</div>
              <FlowSteps steps={PRODUCT_FLOW} tone="amber" />
            </div>
            <div className="rounded-lg border border-line bg-panel p-6 sm:p-7">
              <div className="font-display text-xl font-semibold mb-6 flex items-center gap-2.5"><span aria-hidden className="w-2.5 h-2.5 rounded-full bg-info" />Selling a service</div>
              <FlowSteps steps={SERVICE_FLOW} tone="info" />
            </div>
          </div>
        </Section>

        <Section title="Made for the person running the shop, not a finance department.">
          <p className="text-fg/90 text-lg sm:text-xl max-w-2xl leading-relaxed">
            Most accounting software is made for accountants, or for businesses big enough to employ one.
            Balancr is made for the person actually running the business: a one-person shop or a growing
            team, selling products, services, or both. Count the till in the shop, write down any cash taken out for a delivery or an errand so the count still balances, and close the month at home.
            It works on your phone, tablet or laptop, even when the signal drops, and it fits how shops here
            already work: prices in rupees, EPF/ETF on staff pay, invoices and reminders you can send on WhatsApp.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {[
              { l: "Phone", i: IconPhone },
              { l: "Tablet", i: IconTablet },
              { l: "Laptop", i: IconLaptop },
            ].map(({ l, i: Ico }) => (
              <div key={l} className="flex items-center gap-2.5 rounded-full border border-line bg-panel px-4 py-2 text-sm text-fg">
                <Ico className="w-5 h-5 text-muted" />
                {l}
              </div>
            ))}
          </div>
        </Section>

        <Section band title="You stay in control" lede="Small businesses don't need software that acts behind their back. Balancr does the boring typing and leaves the numbers to you.">
          <div className="grid sm:grid-cols-2 gap-4">
            {CONTROLS.map((c) => (
              <div key={c.title} className={"rounded-lg bg-ink border border-line border-l-4 p-6 " + TONES[c.tone].rule}>
                <div className="font-display text-lg font-semibold text-fg tracking-tight">{c.title}</div>
                <div className="text-sm text-muted mt-2 leading-relaxed">{c.body}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="What Balancr is, and what it isn't" lede="So there are no surprises after you sign up.">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-good/30 bg-good/[0.04] p-6 sm:p-7">
              <div className="font-display text-xl font-semibold mb-6 flex items-center gap-2.5"><span aria-hidden className="w-6 h-6 rounded-full bg-good/15 text-good inline-flex items-center justify-center"><IconCheck className="w-3.5 h-3.5" /></span>It is</div>
              <div className="space-y-6">
                {IS_ITEMS.map((i) => (
                  <div key={i.title}>
                    <div className="text-sm font-medium text-fg">{i.title}</div>
                    <div className="text-sm text-muted mt-1 leading-relaxed">{i.body}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel p-6 sm:p-7">
              <div className="font-display text-xl font-semibold text-muted mb-6 flex items-center gap-2.5"><span aria-hidden className="w-6 h-6 rounded-full bg-line text-muted inline-flex items-center justify-center"><IconCross className="w-3.5 h-3.5" /></span>It isn&apos;t</div>
              <div className="space-y-6">
                {ISNT_ITEMS.map((i) => (
                  <div key={i.title}>
                    <div className="text-sm font-medium text-fg">{i.title}</div>
                    <div className="text-sm text-muted mt-1 leading-relaxed">{i.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-8 text-fg max-w-lg leading-relaxed">
            Run the business on real numbers, and hand your accountant clean reports at year end.
          </p>
        </Section>

        {/* Pricing keeps its own component (billing-cycle toggle needs client state). */}
        <PricingSection />

        <Section band title="How a trial works" lede="No card and no contract. Here's exactly what happens after you ask.">
          <ol className="space-y-0">
            {STEPS.map((s, i) => {
              const last = i === STEPS.length - 1;
              const t = last ? TONES.good : TONES.amber;
              return (
                <li key={s.title} className="flex gap-5">
                  <div className="flex flex-col items-center">
                    <div className={"shrink-0 w-10 h-10 rounded-full border bg-ink flex items-center justify-center num " + t.ring + " " + t.text}>{i + 1}</div>
                    {!last && <div className={"w-px flex-1 my-1 " + TONES.amber.line} />}
                  </div>
                  <div className={last ? "pt-1.5" : "pt-1.5 pb-8"}>
                    <div className="font-display text-lg font-semibold text-fg tracking-tight">{s.title}</div>
                    <div className="text-sm text-muted mt-1 leading-relaxed max-w-md">{s.body}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-3">
            <Link href="/request-trial" className={BUTTON_PRIMARY + " px-8"}>Start your {TRIAL_DAYS}-day free trial</Link>
            <TryDemoButton label="Or try the sample shop first — no signup" className={BUTTON_GHOST + " px-8"} />
          </div>
          <div className="mt-4">
            <FeedbackWidget
              label={"Wish it did something else, or found a bug? Tell\u00a0us\u00a0→"}
              className="text-sm text-muted hover:text-fg underline decoration-line underline-offset-4 min-h-[44px] sm:min-h-0"
            />
          </div>
        </Section>

        {/* FAQ — native <details>: works without JavaScript and is readable by search engines
            (the same questions are also emitted as FAQPage JSON-LD below). */}
        <Section id="faq" title="Questions, answered">
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none min-h-[56px] text-[15px] font-medium text-fg hover:text-amber-soft transition-colors [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="shrink-0 w-7 h-7 rounded-full border border-line text-muted text-lg leading-none flex items-center justify-center transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="text-sm text-muted leading-relaxed pb-5 pr-10 max-w-xl">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">Still unsure? Ask us anything in the request form. A person replies.</p>
        </Section>

        {/* Closing call to action: the page's one solid block of gold. */}
        <section id="closing" className="border-t border-line">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-24">
            <div className="rounded-lg bg-amber text-ink px-6 py-12 sm:px-14 sm:py-16 grid lg:grid-cols-[minmax(0,1fr)_auto] gap-10 items-center">
              <div>
                <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em] leading-[1.02] max-w-xl text-balance">
                  Add your first sale in under a minute.
                </h2>
                <p className="mt-5 max-w-md text-ink/75 text-lg leading-relaxed">
                  Open the sample shop and see your profit move. No signup, no card.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
                <TryDemoButton
                  label="Try it now — no signup"
                  busyLabel="Opening the sample shop…"
                  className="inline-flex items-center justify-center min-h-[52px] px-8 rounded-md text-[15px] font-semibold bg-ink text-fg hover:bg-panel2 transition-colors active:translate-y-px"
                />
                <Link href="/request-trial" className="inline-flex items-center justify-center min-h-[52px] px-8 rounded-md text-[15px] font-semibold border border-ink/40 text-ink hover:bg-ink/10 transition-colors active:translate-y-px">
                  Start your {TRIAL_DAYS}-day free trial
                </Link>
              </div>
            </div>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: FAQ.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            }).replace(/</g, "\\u003c"),
          }}
        />
      </main>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row sm:items-start justify-between gap-8">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <BalancrMark className="w-5 h-5 text-amber shrink-0" />
              <span className="font-display text-lg font-bold tracking-tight">Balancr</span>
            </div>
            <p className="mt-3 text-sm text-muted leading-relaxed">The books balance. So can you.</p>
            {/* A visible way to reach a person (shows only if a contact is configured in the environment). */}
            <SupportContact className="mt-4 !justify-start [&>span]:!text-left" />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted">
            <Link href="#pricing" className="hover:text-fg inline-flex items-center min-h-[44px] sm:min-h-0">Pricing</Link>
            <Link href="#faq" className="hover:text-fg inline-flex items-center min-h-[44px] sm:min-h-0">FAQ</Link>
            <FeedbackWidget label="Feedback" className="hover:text-fg inline-flex items-center min-h-[44px] sm:min-h-0" />
            <Link href="/legal" className="hover:text-fg inline-flex items-center min-h-[44px] sm:min-h-0">Privacy and Terms</Link>
            <Link href="/login" className="hover:text-fg inline-flex items-center min-h-[44px] sm:min-h-0">Sign in</Link>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-5 text-xs text-muted">
            © {new Date().getFullYear()} Balancr by Syndicate Software Solutions.
          </div>
        </div>
      </footer>
      {/* Spacer so the phone action bar never covers the footer. */}
      <div aria-hidden className="h-20 sm:hidden" />
      <MobileCtaBar />
    </div>
  );
}

// One shared section frame: heading (sticky on desktop) on the left, content on the right.
function Section({ id, title, lede, band, children }: { id?: string; title: string; lede?: string; band?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={"border-t border-line " + (band ? "bg-panel" : "")}>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-24 lg:py-28 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-x-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.025em] leading-[1.08] text-balance">{title}</h2>
          {lede && <p className="text-muted mt-4 max-w-xs leading-relaxed">{lede}</p>}
        </div>
        <div className="mt-10 lg:mt-1 min-w-0">{children}</div>
      </div>
    </section>
  );
}

// A very faint horizontal-rule texture confined to the hero section,
// evoking ruled ledger paper without competing with the headline — real
// content sits in a `relative` wrapper above it. Pure CSS (a repeating
// gradient), so nothing to load and nothing that moves.
// A compact vertical step sequence — same numbered-circle language as the
// "How a trial works" steps, but small and connected by a hairline so two
// of these can sit side by side as parallel tracks without reading as two
// unrelated lists.
function FlowSteps({ steps, tone }: { steps: { title: string; body: string }[]; tone: ToneKey }) {
  return (
    <div>
      {steps.map((s, i) => (
        <div key={s.title} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-[11px] num ${TONES[tone].ring} ${TONES[tone].text}`}>
              {i + 1}
            </div>
            {i < steps.length - 1 && <div className={"w-px flex-1 my-1 " + TONES[tone].line} />}
          </div>
          <div className={i < steps.length - 1 ? "pb-5" : ""}>
            <div className="text-sm font-medium text-fg">{s.title}</div>
            <div className="text-sm text-muted mt-0.5 leading-relaxed max-w-xs">{s.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons — hand-drawn for this page rather than pulled from a generic icon
// library, so the set reads as one deliberate family (same stroke width,
// same corner radius) instead of assorted glyphs. Every icon takes a
// className so callers control size/color; none carry their own color.
// ---------------------------------------------------------------------------
type IconProps = { className?: string };
const ICON_STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

// Two overlapping rounded rectangles — a product and a service ledger,
// sharing one P&L, the literal point of the feature it illustrates.
function IconLayers({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <rect x="3.5" y="3.5" width="12" height="12" rx="2.5" />
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
    </svg>
  );
}

function IconChat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9.5L5 21v-4.5H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <circle cx="8.3" cy="10.8" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.8" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="15.7" cy="10.8" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconStatement({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <rect x="5" y="2.5" width="14" height="19" rx="1.5" />
      <path d="M8 8h8M8 11.5h8M8 15h5" />
    </svg>
  );
}

function IconInvoice({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <path d="M6 2.5h12v18.2l-2.2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-1.8 1.4V2.5Z" />
      <path d="M9 8.5h6M9 12h6" />
    </svg>
  );
}

function IconStock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <path d="M12 2.8 20 7.2 12 11.6 4 7.2 12 2.8Z" />
      <path d="M4 7.2v9.2L12 21l8-4.6V7.2" />
      <path d="M12 11.6V21" />
    </svg>
  );
}

function IconWallet({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <path d="M3 7.5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2.2M3 7.5v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-4.8M3 7.5l3.5-3.2h9" />
      <rect x="14.5" y="11.5" width="6.5" height="5" rx="1.2" />
      <circle cx="17" cy="14" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconTeam({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.2 20c0-3.6 2.6-6 5.8-6s5.8 2.4 5.8 6" />
      <circle cx="17" cy="9.3" r="2.3" />
      <path d="M14.8 14.2c2.9.2 5.2 2.5 5.2 5.8" />
    </svg>
  );
}

function IconShield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <path d="M12 2.8 5 5.6v6c0 4.6 3 7.7 7 9.2 4-1.5 7-4.6 7-9.2v-6l-7-2.8Z" />
      <path d="M8.7 12.3 10.8 14.4 15.4 9.8" />
    </svg>
  );
}

function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <path d="M4 12.5 9 17.5 20 6.5" />
    </svg>
  );
}

function IconCross({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE} strokeWidth={2.4}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconPhone({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M11 18.2h2" />
    </svg>
  );
}

function IconTablet({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <rect x="3" y="4" width="18" height="16" rx="2.2" />
      <path d="M11.2 17.2h1.6" />
    </svg>
  );
}

function IconLaptop({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <rect x="5" y="4" width="14" height="10" rx="1.3" />
      <path d="M2.5 18.5h19l-1.6-3H4.1l-1.6 3Z" />
    </svg>
  );
}

// Small mark used next to the wordmark in the header/footer — three
// ascending bars, the same tabular-figures/growth motif as the rest of
// the page rather than a generic logo shape.
function BalancrMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 20" className={className} fill="currentColor">
      <rect x="1" y="11" width="5" height="9" rx="1" />
      <rect x="9.5" y="6" width="5" height="14" rx="1" />
      <rect x="18" y="1" width="5" height="19" rx="1" />
    </svg>
  );
}
