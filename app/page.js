// app/page.js - the public front door. Every claim matches what the app does today. No statistics, testimonials or guarantees.
import Link from 'next/link';
import { APP_NAME, APP_DESCRIPTION, CONTACT_EMAIL } from '../lib/brand.js';

const STEPS = [
  { n: '1', title: 'Bring your leads together', text: 'Forms, ads, your storefront, WhatsApp, SMS, e-mail replies, missed calls, lead searches and your accounting app all land in one inbox. Duplicates are skipped.' },
  { n: '2', title: 'Reach out on your terms', text: 'Drafts wait for your approval, and every batch of broadcasts is approved by you. E-mail goes from your own Gmail. Texts and WhatsApp go only to people who agreed, and WhatsApp uses approved templates.' },
  { n: '3', title: 'Follow up, then stop', text: 'Follow-ups stop the moment someone replies, and replies are checked each time you open the app. A lost deal is never contacted again.' },
  { n: '4', title: 'See what it earns', text: 'Deals, forecast, cost per lead, lead-to-won, lifetime value to cost, churn, days to pay, click-through rate and website traffic, all from your own records and connections.' },
];

const GROUPS = [
  { title: 'Find and reach', points: ['Weekly lead searches on Google Places, with your own Places key, and daily searches of free open map data', 'Forms, ads, storefront, inbox and missed calls in one place', 'Journeys you send one step at a time', 'Events with RSVPs, waiting lists and reminders', 'Birthdays, for people who agreed to hear from you'] },
  { title: 'Sell and follow up', points: ['Pipeline, stages and a quarter forecast', 'A battle card before each call, built from your catalogue', 'Deals and customers at risk, with early warnings', 'Proposals, quotes and electronic signature', 'Packages, a pricing check and a walk-away minimum', 'Booking no-shows flagged to rebook'] },
  { title: 'Buy and resell', points: ['UK company checks and undervalued eBay listings', 'Sold-price comparables and resale margins', 'Sale readiness for your own business', 'A price watch on the listing feeds you choose, flagging undervalued new listings'] },
  { title: 'Support, stock and grow', points: ['One support queue with two-hour targets and a reliability score', 'A catalogue of products, services, packages and offers, with stock and end dates', 'Waiting lists for sold-out items and full events', 'Your own Facebook Page and Instagram, published only when you approve', 'Balancr: the operations app, sharing leads, deal stages and invoice payments'] },
];

const SWITCHED_OFF = [
  'Automatic e-mailing of invoices and payment reminders (Autopilot billing)',
  'Automatic sending of messages',
  'Automatic answers to customers',
  'Automatic journey emails',
  'Rental check-out texts',
  'eBay publishing and Stripe Connect',
];

const NOT_INCLUDED = [
  { label: 'Needs platform approval', text: 'Social media posting, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, and Meta Lead Ads beyond the owner\'s own account.' },
  { label: 'Not claimed', text: 'Electronic signatures are sent through Dropbox Sign with your own key. They are not presented as a higher legal tier than the provider gives. Check with a lawyer.' },
  { label: 'Left out on purpose', text: 'Scraping marketplaces or other sites. Messaging or calling people who have not agreed. Sending government tenders.' },
];

const accessHref = CONTACT_EMAIL
  ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} access`)}&body=${encodeURIComponent('Hi, I would like to try it. My business: \nMy Google account email: ')}`
  : null;

const btn = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-5 py-2.5 font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 active:scale-[0.98]';
const section = 'mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20';
const h2 = 'text-2xl sm:text-3xl font-semibold text-white tracking-tight';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-gray-200">
      <header className="sticky top-0 z-10 border-b border-gray-800/50 bg-slate-950/80 backdrop-blur-md">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <span className="text-xl font-semibold text-white tracking-tight">{APP_NAME}</span>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
            <a href="#how" className="min-h-[44px] inline-flex items-center text-gray-400 hover:text-white transition-colors">How it works</a>
            <a href="#features" className="min-h-[44px] inline-flex items-center text-gray-400 hover:text-white transition-colors">Features</a>
            <a href="#control" className="min-h-[44px] inline-flex items-center text-gray-400 hover:text-white transition-colors">You decide</a>
            <Link href="/dashboard" className={`${btn} bg-blue-600 text-white hover:bg-blue-500 px-4 py-2`}>Sign in</Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:pt-32">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-4">Sales, marketing and deals</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-white tracking-tight mb-6">
            Find, reach and close customers, and know what each part earns.
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 leading-relaxed mb-8 max-w-2xl">{APP_DESCRIPTION}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/dashboard" className={`${btn} bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/25`}>Sign in with Google</Link>
            {accessHref ? <a href={accessHref} className={`${btn} border border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white`}>Request access</a> : null}
            <a href="#how" className={`${btn} border border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white`}>See how it works</a>
          </div>
        </div>
      </section>

      <section id="how" className={section}>
        <h2 className={h2}>How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4 rounded-xl border border-gray-800 bg-gray-800/40 p-5 hover:border-gray-700 hover:bg-gray-800/60 transition-all duration-200">
              <span aria-hidden="true" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white">{s.n}</span>
              <div>
                <h3 className="font-medium text-white text-base">{s.title}</h3>
                <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className={section}>
        <h2 className={h2}>What it does</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title} className="rounded-xl border border-gray-800 bg-gray-800/40 p-5 hover:border-gray-700 hover:bg-gray-800/60 transition-all duration-200">
              <h3 className="font-medium text-white text-base">{g.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-400">
                {g.points.map((p) => <li key={p} className="flex gap-2 leading-relaxed"><span aria-hidden="true" className="text-blue-400">•</span><span>{p}</span></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-gray-500 text-center">Every outside tool is one click away. Press Ctrl+K (Cmd+K on Mac), or use Search, to jump to any screen or tool.</p>
      </section>

      <section id="control" className={section}>
        <div className="rounded-xl border border-blue-900/30 bg-blue-950/30 p-6 sm:p-8">
          <h2 className={h2}>You decide what runs</h2>
          <p className="mt-3 text-sm text-gray-400 leading-relaxed">Lead finding, scoring, follow-up timing, reminders and reports run on their own. These stay off until you switch them on:</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {SWITCHED_OFF.map((c) => (
              <li key={c} className="flex gap-3 text-sm text-gray-300"><span aria-hidden="true" className="text-blue-400">✓</span><span className="leading-relaxed">{c}</span></li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-gray-400 leading-relaxed">On by default, and never sent: an invoice draft for each won deal. You review it and send it yourself.</p>
        </div>
      </section>

      <section className={section} aria-labelledby="not-included">
        <h2 id="not-included" className={h2}>What is not included, and why</h2>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NOT_INCLUDED.map((n) => (
            <div key={n.label} className="rounded-xl border border-gray-800 bg-gray-800/40 p-5 hover:border-gray-700 hover:bg-gray-800/60 transition-all duration-200">
              <dt className="font-medium text-white text-base">{n.label}</dt>
              <dd className="mt-2 text-sm text-gray-400 leading-relaxed">{n.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-12 text-center sm:px-6">
        <h2 className={h2}>Ready to see your pipeline?</h2>
        <Link href="/dashboard" className={`${btn} mt-8 bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/25`}>Sign in with Google</Link>
        {CONTACT_EMAIL ? <p className="mt-6 text-sm text-gray-500">Questions? <a className="text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p> : null}
      </section>

      <footer className="border-t border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
        <nav aria-label="Legal" className="mb-4 flex justify-center gap-6">
          <Link href="/privacy" className="hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center">Privacy</Link>
          <Link href="/terms" className="hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center">Terms</Link>
        </nav>
        <p>© {new Date().getFullYear()} {APP_NAME}</p>
      </footer>
    </main>
  );
}
