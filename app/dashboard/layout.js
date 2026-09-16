'use client';

import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabaseBrowser';

const DashboardCtx = createContext(null);

export function useDashboard() {
  const ctx = useContext(DashboardCtx);
  if (!ctx) throw new Error('useDashboard must be used within the dashboard layout');
  return ctx;
}

const NAV = [
  { href: '/dashboard', label: 'Today', match: (p) => p === '/dashboard' },
  { href: '/dashboard/pipeline', label: 'Pipeline', match: (p) => p.startsWith('/dashboard/pipeline') },
  { href: '/dashboard/sourcing', label: 'Find leads', match: (p) => p.startsWith('/dashboard/sourcing') },
  { href: '/dashboard/leads', label: 'Leads', match: (p) => p.startsWith('/dashboard/leads') },
  { href: '/dashboard/analytics', label: 'Analytics', match: (p) => p.startsWith('/dashboard/analytics') },
  { href: '/dashboard/settings', label: 'Settings', match: (p) => p.startsWith('/dashboard/settings') },
];

export default function DashboardLayout({ children }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState(null);
  const [quota, setQuota] = useState(null);
  const router = useRouter();
  const pathname = usePathname();

  const refreshAccount = useCallback(async () => {
    const res = await fetch('/api/account');
    if (res.ok) setAccount((await res.json()).account);
  }, []);

  const refreshQuota = useCallback(async () => {
    const res = await fetch('/api/quota');
    if (res.ok) setQuota(await res.json());
  }, []);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      await Promise.all([refreshAccount(), refreshQuota()]);
      setReady(true);
    })();
  }, [router, refreshAccount, refreshQuota]);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        Loading\u2026
      </div>
    );
  }

  const setupIncomplete = account && (!account.sender_name || !account.offer_description);

  return (
    <DashboardCtx.Provider value={{ account, quota, refreshAccount, refreshQuota }}>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto flex max-w-[1400px]">
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white sm:flex">
            <div className="px-5 py-5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm">OE</span>
                <span className="text-[15px] font-semibold tracking-tight">Outbound Engine</span>
              </div>
              <div className="mt-1 text-xs text-slate-400">{account?.name || 'Your business'}</div>
            </div>
            <nav className="flex-1 px-3">
              {NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`mb-1 flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
            {quota && (
              <div className="mx-3 mb-3 rounded-md border border-slate-200 p-3">
                <div className="mb-1.5 text-[11px] font-medium text-slate-400">Sends left today</div>
                <QuotaBar label="Email" remaining={quota.email.remaining} limit={quota.email.limit} />
                <QuotaBar label="WhatsApp" remaining={quota.whatsapp.remaining} limit={quota.whatsapp.limit} />
              </div>
            )}
            <div className="border-t border-slate-200 px-3 py-3">
              <button
                onClick={handleSignOut}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              >
                Sign out
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            {/* Mobile top bar \u2014 sidebar collapses below sm */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:hidden">
              <span className="text-sm font-semibold">Outbound Engine</span>
              <div className="flex gap-3 text-sm">
                {NAV.map((item) => (
                  <a key={item.href} href={item.href} className={item.match(pathname) ? 'font-medium text-indigo-700' : 'text-slate-500'}>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>

            {setupIncomplete && !pathname.startsWith('/dashboard/settings') && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 sm:px-8">
                Your business identity isn\u2019t filled in yet, so AI drafts will read generic.{' '}
                <a href="/dashboard/settings" className="font-medium underline">Finish setup in Settings</a>.
              </div>
            )}

            <div className="px-4 py-6 sm:px-8 sm:py-8">{children}</div>
          </main>
        </div>
      </div>
    </DashboardCtx.Provider>
  );
}

function QuotaBar({ label, remaining, limit }) {
  const used = Math.max(0, limit - remaining);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="mb-0.5 flex justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span>{remaining}/{limit}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
