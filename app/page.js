// app/page.js - the public front door. Plain, honest copy: what the product does, how it works and what stays
// under the customer's control. No made-up statistics, testimonials or guarantees.
import Link from 'next/link';
import { APP_NAME, APP_DESCRIPTION, CONTACT_EMAIL } from '../lib/brand.js';

const STEPS = [
  { n: '1', title: 'Add your leads', text: 'Upload a spreadsheet of prospects. Duplicates and invalid emails are skipped for you.' },
  { n: '2', title: 'Reach out', text: 'Email from your own Gmail, or use SMS, WhatsApp and calls. You choose who gets contacted and when.' },
  { n: '3', title: 'Follow up on time', text: 'See who needs a nudge today. Follow-ups stop the moment someone replies, and never go past three.' },
  { n: '4', title: 'See what it earns', text: 'Move replies into a pipeline and watch real numbers: deals, win rate, expected revenue and return on cost.' },
];

const FEATURES = [
  { title: 'AI drafts you approve', text: 'The AI writes follow-ups and answers to replies from what you sell. You read, edit and send. Nothing goes out on its own.' },
  { title: 'Replies handled', text: 'Replies are picked up for you and sorted by what the person wants, so interested leads do not get lost in the inbox.' },
  { title: 'A pipeline that tells the truth', text: 'Only deals you have qualified count as pipeline. Forecasts come with an honest range and say so when there is too little data.' },
  { title: 'Look after customers too', text: 'After a sale, get timed reminders to check in: onboarding, first week, one month and every quarter.' },
  { title: 'Spend you can see', text: 'AI use is capped per day and per month, so there are no surprise bills. Cost and return sit side by side.' },
  { title: 'Your data stays yours', text: 'Download everything or delete your account and data yourself, any time, from the Account page.' },
];

const CONTROL = [
  'Every message is sent because you pressed send.',
  'Each lead gets at most three follow-ups, spaced apart, and none after they reply.',
  'Mark a deal Lost and that person is not contacted again.',
];

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
          Follow up with every lead, and know what it is worth.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-gray-300 sm:text-lg">{APP_DESCRIPTION}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className="rounded-xl bg-blue-600 px-6 py-3 text-center font-medium text-white transition hover:bg-blue-700">
            Sign in with Google
          </Link>
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
        <h2 className="text-2xl font-bold text-white">What you get</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-gray-700 bg-gray-800/60 p-5">
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-blue-700/50 bg-blue-900/20 p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-white">You stay in control</h2>
          <p className="mt-2 text-sm text-gray-300">This is a tool for you to work faster, not an autopilot that talks to your customers for you.</p>
          <ul className="mt-5 space-y-3">
            {CONTROL.map((c) => (
              <li key={c} className="flex gap-3 text-sm text-gray-200">
                <span aria-hidden="true" className="mt-0.5 text-blue-400">✓</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
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
        © {new Date().getFullYear()} {APP_NAME}
      </footer>
    </main>
  );
}
