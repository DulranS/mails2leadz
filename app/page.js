const STEPS = [
  {
    n: '1',
    title: 'Find',
    body: 'Search Google Maps by industry and city, or import a CSV you already have. Every lead is scored HOT, WARM, or COLD as it comes in.',
  },
  {
    n: '2',
    title: 'Draft',
    body: 'AI writes the first message and every follow-up, in your business\u2019s own voice \u2014 pulling from the examples you\u2019ve actually sent before.',
  },
  {
    n: '3',
    title: 'Approve & send',
    body: 'You read it, edit it if you want, and click send. A reply stops the whole sequence for that lead automatically \u2014 no awkward next follow-up.',
  },
];

const LEDGER = [
  {
    label: 'Find leads',
    body: 'Google Maps sourcing by industry + location, turned into a daily automated search, plus CSV import and website-based email lookup for lists you already have.',
  },
  {
    label: 'Draft in your voice',
    body: 'Save any message that actually got a reply as a template. The next draft calibrates to it \u2014 the more you use it, the less it reads like generic AI.',
  },
  {
    label: 'Follow-ups that stop themselves',
    body: 'Daily inbox check finds replies and halts future drafts for that lead. No one gets a follow-up after they\u2019ve already answered.',
  },
  {
    label: 'Real numbers, not guesses',
    body: 'Funnel, reply rate, win rate, and the actual dollar cost of every AI call \u2014 so \u201cis this working\u201d and \u201cis this cheap\u201d both have an answer.',
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white text-slate-900">
      {/* ---------- Header ---------- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm">
            OE
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Outbound Engine</span>
        </div>
        <a
          href="/login"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Sign in
        </a>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-8 sm:px-10 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-16">
        <div>
          <h1 className="font-display max-w-lg text-[2.75rem] font-medium leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
            Every message that goes out still gets a human\u2019s okay.
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-slate-600">
            Outbound Engine finds your next customers, drafts the emails and
            WhatsApp messages, and keeps the follow-ups moving \u2014 but
            nothing reaches a real person until you click approve. Built for
            small businesses that can\u2019t afford a message with the wrong
            tone going out under their name.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href="/login"
              className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              Start finding leads
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              See how it works
            </a>
          </div>
        </div>

        {/* Mock draft-approval card \u2014 the one thing worth showing, since
            it's the actual product mechanic, not decoration. */}
        <div className="relative">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_40px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">HOT</span>
              <span className="text-[11px] text-slate-400">Draft \u2014 not sent</span>
            </div>
            <div className="mt-3 text-[13px] text-slate-400">To: priya@northstartiles.com</div>
            <div className="mt-1 text-sm font-medium text-slate-800">
              Subject: Quick one about your tile showroom\u2019s online orders
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
              Hi Priya, noticed North Star Tiles doesn\u2019t take orders
              online yet \u2014 we just built that for two showrooms in
              Colombo. Worth a 15-minute call this week?
            </p>
            <div className="mt-4 flex gap-2">
              <span className="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-center text-[13px] font-medium text-white">
                Approve & send
              </span>
              <span className="rounded-md border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-500">
                Edit
              </span>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 -z-10 h-full w-full rounded-xl border border-slate-200 bg-slate-50 sm:block hidden" />
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how-it-works" className="border-t border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
          <h2 className="font-display max-w-md text-2xl font-medium text-slate-900">How it works</h2>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="text-3xl font-medium text-indigo-300">{s.n}</div>
                <div className="mt-2 text-base font-semibold text-slate-900">{s.title}</div>
                <p className="mt-2 max-w-[26ch] text-[14.5px] leading-relaxed text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Why controlled, not automatic ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <h2 className="font-display text-2xl font-medium text-slate-900">
            Why sending still needs a click
          </h2>
          <div className="max-w-2xl space-y-4 text-[15px] leading-relaxed text-slate-600">
            <p>
              An SME buying an outbound tool has to trust what goes out under
              its own name. Fully automated sending is the fastest way to
              lose that trust the first time the AI gets a tone wrong to a
              customer who matters.
            </p>
            <p>
              So the parts that are safe to automate are automated: finding
              leads, scoring them, writing the draft, watching for replies,
              chasing a follow-up on schedule. The one step that actually
              touches a real person\u2019s inbox stays a deliberate,
              one-click decision by whoever owns the relationship.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Feature ledger ---------- */}
      <section className="border-t border-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
          <h2 className="font-display text-2xl font-medium text-slate-900">What\u2019s included</h2>
          <dl className="mt-8 divide-y divide-slate-100 border-t border-slate-100">
            {LEDGER.map((item) => (
              <div key={item.label} className="grid gap-2 py-6 sm:grid-cols-[220px_1fr] sm:gap-8">
                <dt className="text-[15px] font-medium text-slate-900">{item.label}</dt>
                <dd className="max-w-2xl text-[14.5px] leading-relaxed text-slate-600">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="border-t border-slate-100 bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-14 sm:flex-row sm:items-center sm:px-10">
          <h2 className="font-display max-w-sm text-2xl font-medium text-white">
            Set up your business identity and see your first drafts today.
          </h2>
          <a
            href="/login"
            className="shrink-0 rounded-md bg-white px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Create your account
          </a>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-[13px] text-slate-400 sm:px-10">
        Outbound Engine \u2014 one account per business, your own sending
        credentials, your own data.
      </footer>
    </div>
  );
}
