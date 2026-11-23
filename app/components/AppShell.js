'use client';
// The persistent frame (sidebar + top bar) for the app pages. It lives in the ROOT layout, so it stays mounted while you move
// between pages: only the page underneath changes. Before, each page rendered its own copy of the frame, so every navigation
// threw the whole frame away and rebuilt it (sidebar, top bar, avatar, theme button) along with the page.
//
// Pages still write <DashboardLayout title="..." subtitle="...">: that component now just hands its title to this one.
import React, { createContext, useCallback, useContext, useLayoutEffect, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar, SidebarItem } from './ui/Sidebar';
import { Button } from './ui/Button';
import { useTheme } from './ui/ThemeProvider';
import { useAuthUser } from './AuthProvider';
import { isShellRoute, NAV_ITEMS } from '../../lib/app-routes.js';
import TodayActions from "./TodayActions.js";

const MetaValue = createContext({ title: '', subtitle: '' });
const MetaSetter = createContext(() => {});
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Called by <DashboardLayout>: sets the title shown in the persistent top bar. Re-renders nothing but the top bar. */
export function usePageMeta(title, subtitle) {
  const set = useContext(MetaSetter);
  useIsoLayoutEffect(() => { set({ title: title || '', subtitle: subtitle || '' }); }, [set, title, subtitle]);
}

const TopBar = React.memo(function TopBar({ onOpenMenu }) {
  const { title, subtitle } = useContext(MetaValue);
  const { theme, toggleTheme } = useTheme();
  const { user, workspace } = useAuthUser();
  const initial = String(user?.displayName || user?.email || '').trim().charAt(0).toUpperCase();
  return (
    <div className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center">
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="lg:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="ml-2 lg:ml-0 min-w-0">
            {title && <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white tracking-tight">{title}</h1>}
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => window.dispatchEvent(new Event('autoleads:open-palette'))}
            aria-label="Search screens and tools (Ctrl+K)"
            title="Search screens and tools (Ctrl+K)"
            className="shrink-0 min-h-[44px] min-w-[44px] px-3 py-2 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M20 20l-3.5-3.5" /></svg>
            <span className="hidden sm:inline text-sm ml-2">Search</span> <span className="hidden md:inline text-xs text-gray-500 dark:text-gray-400 ml-1">Ctrl+K</span>
          </button>
          <button
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-lg" aria-hidden="true">{theme === 'light' ? '🌙' : '☀️'}</span>
          </button>
          <div className="flex items-center">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-sm ring-2 ring-gray-100 dark:ring-gray-700">
              <span className="text-white text-sm font-medium">{initial || '?'}</span>
            </div>
          </div>
        </div>
      </div>
      {workspace && !workspace.isOwner && (
        <div role="status" className="px-4 py-2 text-xs bg-amber-50/80 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 border-t border-amber-200/50 dark:border-amber-800/50 backdrop-blur-sm">
          You are working in a shared workspace as a {workspace.role === 'viewer' ? 'viewer. You can look at everything but not change anything.' : 'manager.'}
        </div>
      )}
    </div>
  );
});

// Memoised: the sidebar never re-renders because a page did (its only changing input is the active link, read from the route).
const Nav = React.memo(function Nav({ open, onToggle }) {
  const pathname = usePathname();
  const main = NAV_ITEMS.filter((i) => i.group !== 'More');
  const more = NAV_ITEMS.filter((i) => i.group === 'More');
  return (
    <Sidebar isOpen={open} onToggle={onToggle}>
      {main.map((item, i) => (
        <div key={item.href}>
          {item.group && (i === 0 || main[i - 1].group !== item.group) && (
            <div className="px-4 pt-6 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{item.group}</div>
          )}
          <SidebarItem href={item.href} icon={item.icon} label={item.label} />
        </div>
      ))}
      {more.length > 0 && (
        <details open className="mt-6 px-2">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 min-h-[44px] flex items-center hover:text-gray-700 dark:hover:text-gray-300 transition-colors">More</summary>
          <div className="mt-1">
            {more.map((item) => (
              <SidebarItem key={item.href} href={item.href} icon={item.icon} label={item.label} />
            ))}
          </div>
        </details>
      )}
    </Sidebar>
  );
});

export default function AppShell({ children }) {
  const pathname = usePathname();
  const shell = isShellRoute(pathname);
  const [meta, setMetaState] = useState({ title: '', subtitle: '' });
  const [open, setOpen] = useState(false);
  const setMeta = useCallback((next) => setMetaState((prev) => (prev.title === next.title && prev.subtitle === next.subtitle ? prev : next)), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const openMenu = useCallback(() => setOpen(true), []);

  // Close the mobile menu after choosing a page.
  useEffect(() => { setOpen(false); }, [pathname]);

  const metaValue = useMemo(() => meta, [meta]);
  if (!shell) return <>{children}</>;
  return (
    <MetaSetter.Provider value={setMeta}>
      <MetaValue.Provider value={metaValue}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg dark:focus:bg-gray-800 transition-all">Skip to content</a>
          <Nav open={open} onToggle={toggle} />
          <div className="lg:pl-64">
            <TopBar onOpenMenu={openMenu} />
            <main id="main-content" tabIndex={-1} className="p-4 sm:p-6 lg:p-8"><TodayActions />{children}</main>
            <button type="button" onClick={() => window.dispatchEvent(new Event('autoleads:open-palette'))} aria-label="Search screens and tools" className="lg:hidden fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-xl dark:bg-white dark:text-gray-900 hover:scale-105 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M20 20l-3.5-3.5" /></svg>
            </button>
          </div>
        </div>
      </MetaValue.Provider>
    </MetaSetter.Provider>
  );
}
