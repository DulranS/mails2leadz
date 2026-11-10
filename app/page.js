// app/page.js - the public front door. Every claim matches what the app does today. No statistics, testimonials or guarantees.
import Link from 'next/link';
import { APP_NAME, APP_DESCRIPTION, CONTACT_EMAIL } from '../lib/brand.js';

const STEPS = [
  { n: '1', title: 'Bring your leads together', text: 'Forms, ads, your storefront, WhatsApp, SMS, email replies and lead searches all land in one inbox. Duplicates are skipped.' },
  { n: '2', title: 'Reach out on your terms', text: 'Drafts wait for your approval. Email goes from your own Gmail. SMS, WhatsApp and calls go only to people who agreed.' },
  { n: '3', title: 'Follow up, then stop', text: 'Follow-ups stop the moment someone replies. A lost deal is never contacted again.' },
  { n: '4', title: 'See what it earns', text: 'Deals, forecast, targets, customer value and where your best customers come from, all from your own records.' },
];

const GROUPS = [
  { title: 'Find and reach', points: ['Weekly lead searches on Google Places', 'Forms, ads, storefront and inbox in one place', 'Journeys you send one step at a time', 'Events with RSVPs and reminders'] },
  { title: 'Sell and follow up', points: ['Pipeline, stages and a quarter forecast', 'Deals and customers at risk, with reasons', 'Proposals, quotes, electronic signature', 'Packages and a pricing check'] },
  { title: 'Buy and resell', points: ['UK company checks and undervalued eBay listings', 'Sold-price comparables and resale margins', 'Sale readiness for your own business', 'Watch-list reminders for listings left undecided'] },
  { title: 'Support and grow', points: ['One support queue with two-hour targets', 'Ready answers from your own library', 'Objectives, targets and a corrective step', 'Referrals, case studies and pitch decks'] },
];

const SWITCHED_OFF = [
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

const btn = 'inline-flex min-h-[44px] items-center justify-center rounded-xl px-6 py-3 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';
const section = 'mx-auto max-w-5xl px-4 py-12 sm:px-6';
const h2 = 'text-2xl font-bold text-white';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-200">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/90 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-lg font-bold text-white">{APP_NAME}</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <a href="#how" className="min-h-[44px] inline-flex items-center hover:text-white">How it works</a>
            <a href="#features" className="min-h-[44px] inline-flex items-center hover:text-white">Features</a>
            <a href="#control" className="min-h-[44px] inline-flex items-center hover:text-white">You decide</a>
            <Link href="/dashboard" className={`${btn} px-4 py-2 border border-gray-600 text-white hover:bg-gray-700`}>Sign in</Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-14 pt-12 sm:px-6 sm:pt-20">
        <p className="text-sm font-medium uppercase tracking-wide text-blue-300">Sales, marketing and deals</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-white sm:text-5xl">Find, reach and close customers, and know what each part earns.</h1>
        <p className="mt-5 max-w-2xl text-base text-gray-300 sm:text-lg">{APP_DESCRIPTION}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Sign in with Google</Link>
          {accessHref ? <a href={accessHref} className={`${btn} border border-blue-500 text-blue-300 hover:bg-blue-900/30`}>Request access</a> : null}
          <a href="#how" className={`${btn} border border-gray-600 text-white hover:bg-gray-700`}>See how it works</a>
        </div>
      </section>

      <section id="how" className={section}>
        <h2 className={h2}>How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4 rounded-2xl border border-gray-700 bg-gray-800/60 p-5">
              <span aria-hidden="true" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{s.n}</span>
              <div>
                <h3 className="font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-sm text-gray-400">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className={section}>
        <h2 className={h2}>What it does</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title} className="rounded-2xl border border-gray-700 bg-gray-800/60 p-5">
              <h3 className="font-semibold text-white">{g.title}</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                {g.points.map((p) => <li key={p} className="flex gap-2"><span aria-hidden="true" className="text-blue-400">•</span><span>{p}</span></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-gray-400">Every outside tool is one click away. Press Ctrl+K (Cmd+K on Mac), or use Search, to jump to any screen or tool.</p>
      </section>

      <section id="control" className={section}>
        <div className="rounded-2xl border border-blue-700/50 bg-blue-900/20 p-6 sm:p-8">
          <h2 className={h2}>You decide what runs</h2>
          <p className="mt-2 text-sm text-gray-300">Lead finding, scoring, follow-up timing, reminders and reports run on their own. These stay off until you switch them on:</p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {SWITCHED_OFF.map((c) => (
              <li key={c} className="flex gap-3 text-sm text-gray-200"><span aria-hidden="true" className="text-blue-400">✓</span><span>{c}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className={section} aria-labelledby="not-included">
        <h2 id="not-included" className={h2}>What is not included, and why</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {NOT_INCLUDED.map((n) => (
            <div key={n.label} className="rounded-2xl border border-gray-700 bg-gray-800/40 p-5">
              <dt className="font-semibold text-white">{n.label}</dt>
              <dd className="mt-2 text-sm text-gray-400">{n.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-6 text-center sm:px-6">
        <h2 className={h2}>Ready to see your pipeline?</h2>
        <Link href="/dashboard" className={`${btn} mt-6 bg-blue-600 text-white hover:bg-blue-700`}>Sign in with Google</Link>
        {CONTACT_EMAIL ? <p className="mt-5 text-sm text-gray-400">Questions? <a className="text-blue-400 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p> : null}
      </section>

      <footer className="border-t border-gray-800 px-4 py-6 text-center text-xs text-gray-500">
        <nav aria-label="Legal" className="mb-2 flex justify-center gap-4">
          <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
        </nav>
        © {new Date().getFullYear()} {APP_NAME}
      </footer>
    </main>
  );
}
