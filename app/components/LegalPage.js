// Shared shell for /privacy and /terms (server component, no client JS). Plain, readable, matches the landing page.
import Link from 'next/link';
import { APP_NAME, CONTACT_EMAIL } from '../../lib/brand.js';

export const LEGAL_UPDATED = '12 October 2026';

export function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-gray-300">{children}</div>
    </section>
  );
}

export function Bullets({ items }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
}

export function Contact() {
  return CONTACT_EMAIL
    ? <a className="text-blue-400 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    : <span>the contact address shown on our home page</span>;
}

export default function LegalPage({ title, children }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-200">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-bold text-white">{APP_NAME}</Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/privacy" className="text-gray-300 underline-offset-4 hover:underline">Privacy</Link>
          <Link href="/terms" className="text-gray-300 underline-offset-4 hover:underline">Terms</Link>
        </nav>
      </header>
      <article className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        <p className="mt-2 text-sm text-gray-400">Last updated: {LEGAL_UPDATED}</p>
        {children}
      </article>
      <footer className="border-t border-gray-800 px-4 py-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} {APP_NAME}
      </footer>
    </main>
  );
}
