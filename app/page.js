// app/page.js - the public front door. Every claim here is something the app does today. Nothing is invented: no statistics, testimonials or guarantees.
import Link from 'next/link';
import { APP_NAME, APP_DESCRIPTION, CONTACT_EMAIL } from '../lib/brand.js';

const STEPS = [
  { n: '1', title: 'Bring your leads together', text: 'Forms, ads, your storefront, WhatsApp, SMS, email replies and a spreadsheet all land in one inbox. Duplicates and bad addresses are skipped for you.' },
  { n: '2', title: 'Reach out, on your terms', text: 'Email from your own Gmail, or SMS, WhatsApp and calls. Nothing sends until you press send or switch an automation on yourself.' },
  { n: '3', title: 'Follow up, then stop', text: 'Each lead gets at most three follow-ups, spaced apart. They stop the moment someone replies, and a Lost deal is never contacted again.' },
  { n: '4', title: 'See what it earns', text: 'Deals, win rate, order and customer values, acquisition cost, paid versus organic wins, and your targets, all from your own records.' },
];

const BUILT = [
  { title: 'Lead inbox and lead search', text: 'Leads from your forms, ads, storefront and inbox are scored and routed to the least busy person on your team. Your saved searches run weekly on Google Places, and local businesses are added to your list for review. Nothing is scraped.' },
  { title: 'AI drafts you approve', text: 'Follow-ups and replies are drafted from what you sell. You read and edit each one. Call summaries are kept on the customer record.' },
  { title: 'Support desk', text: 'Customer questions and complaints go into one queue with a two-hour target, routing, a reminder before a target is missed, and a single alert when it is. Your own answer library gives ready replies.' },
  { title: 'Deals, buying and selling', text: 'Check a company through public UK records, price an asset against sold prices, work out a resale margin, and see whether your own business is ready to sell. Search eBay for listings priced below the usual level.' },
  { title: 'Money, forecast and measures', text: 'Average order value, price point, average contract value, lifetime value, acquisition cost, and where your best customers come from. The quarter forecast, deals and customers at risk, demand over the last thirty days, and a monthly digest that says where a little spend could move.' },
  { title: 'Connects to the tools you use', text: 'Google (Ads, Analytics, Search Console), Meta, TikTok, Shopify, eBay, Stripe, Twilio, Typeform, Tally and Slack. Most need one approval or one key. Each connection is shown with what it does.' },
  { title: 'Case studies, pitch and agreements', text: 'Case studies are drafted only for customers who agreed in writing, and nothing is published for you. Pitch decks come from your own figures. Agreements can be signed electronically through Dropbox Sign or accepted by typed name through a link. Legal terms are left for a lawyer.' },
  { title: 'Growth, events and accounts', text: 'Objectives and key results measured from your own figures, a next step on your weekly list whenever a target is clearly missed, competitor prices you enter against your own, customer, partner and press accounts you are reminded to reach, journeys you send step by step, referral asks to happy customers, events with RSVPs, package comparisons, and a brief for short videos.' },
  { title: 'Everything one step away', text: 'Every outside tool your business uses is one click away, and Ctrl+K (or Cmd+K) jumps to any screen or tool from anywhere in the app.' },
  { title: 'Your data stays yours', text: 'Download everything or delete your account and data yourself from the Account page. Every email carries a one-click opt-out.' },
];

const SWITCHED_OFF = [
  'Automatic sending of messages, which stays off until you switch it on.',
  'Automatic answers to customer questions, which need your answer library and your switch.',
  'Check-out and extension texts to rental customers who agreed to texts, which need Twilio and your switch.',
  'Publishing listings to eBay, and Stripe Connect for card payments. Each is off until you turn it on.',
];

const NOT_INCLUDED = [
  { label: 'Not claimed', text: 'Electronic signatures are sent through Dropbox Sign with your own key. They are not presented as a higher legal tier than the signing service provides; check with a lawyer what your agreements need.' },
  { label: 'Needs platform approval', text: 'LinkedIn lead forms and connection, and Meta Lead Ads beyond the app owner\'s own account. These need approval from LinkedIn or Meta, which the app cannot give itself.' },
  { label: 'Platform-gated', text: 'Social media publishing (Meta, TikTok, LinkedIn content posting), Google Business Profile, and paid campaign creation on Meta or Google. Each needs the platform\'s own review or approval before an app can act for you.' },
  { label: 'Left out on purpose', text: 'Messaging or calling people who have not agreed to it, and scraping marketplaces or other sites against their terms. Government tender submission is yours to send.' },
];

const accessHref = CONTACT_EMAIL
  ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} access`)}&body=${encodeURIComponent('Hi, I would like to try it. My business: \nMy Google account email: ')}`
  : null;

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-200">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="text-lg font-bold text-white">{APP_NAME}</span>
        <Link href="/dashboard" className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-14 pt-10 sm:px-6 sm:pt-16">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight text-white sm:text-5xl">
          Sell, market and follow up from one place, and know what each part earns.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-gray-300 sm:text-lg">{APP_DESCRIPTION}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className="rounded-xl bg-blue-600 px-6 py-3 text-center font-medium text-white transition hover:bg-blue-700">
            Sign in with Google
          </Link>
          {accessHref ? (
            <a href={accessHref} className="rounded-xl border border-blue-500 px-6 py-3 text-center font-medium text-blue-300 transition hover:bg-blue-900/30">
              Request access
            </a>
          ) : null}
          <a href="#how" className="rounded-xl border border-gray-600 px-6 py-3 text-center font-medium text-white transition hover:bg-gray-700">
            How it works
          </a>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-bold text-white">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4 rounded-2xl border border-gray-700 bg-gray-800/60 p-5">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{s.n}</span>
              <div>
                <h3 className="font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-sm text-gray-400">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-bold text-white">What is built</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT.map((f) => (
            <div key={f.title} className="rounded-2xl border border-gray-700 bg-gray-800/60 p-5">
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-blue-700/50 bg-blue-900/20 p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-white">You decide what runs</h2>
          <p className="mt-2 text-sm text-gray-300">Automation is available, and every automatic action is a switch you turn on yourself. These stay off until you do:</p>
          <ul className="mt-5 space-y-3">
            {SWITCHED_OFF.map((c) => (
              <li key={c} className="flex gap-3 text-sm text-gray-200">
                <span aria-hidden="true" className="mt-0.5 text-blue-400">✓</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-bold text-white">What is not included, and why</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {NOT_INCLUDED.map((n) => (
            <div key={n.label} className="rounded-2xl border border-gray-700 bg-gray-800/40 p-5">
              <dt className="font-semibold text-white">{n.label}</dt>
              <dd className="mt-2 text-sm text-gray-400">{n.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-8 text-center sm:px-6">
        <h2 className="text-2xl font-bold text-white">Ready to see your pipeline?</h2>
        <Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-blue-600 px-8 py-3 font-medium text-white transition hover:bg-blue-700">
          Sign in with Google
        </Link>
        {CONTACT_EMAIL ? (
          <p className="mt-5 text-sm text-gray-400">
            Questions? <a className="text-blue-400 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        ) : null}
      </section>

      <footer className="border-t border-gray-800 px-4 py-6 text-center text-xs text-gray-500">
        <nav className="mb-2 flex justify-center gap-4">
          <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
        </nav>
        © {new Date().getFullYear()} {APP_NAME}
      </footer>
    </main>
  );
}
