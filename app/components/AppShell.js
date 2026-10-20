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
  const { user } = useAuthUser();
  const initial = String(user?.displayName || user?.email || '').trim().charAt(0).toUpperCase();
  return (
    <div className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center">
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="lg:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="ml-2 lg:ml-0 min-w-0">
            {title && <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>}
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} className="p-2">
            {theme === 'light' ? '🌙' : '☀️'}
          </Button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">{initial || '?'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// Memoised: the sidebar never re-renders because a page did (its only changing input is the active link, read from the route).
const Nav = React.memo(function Nav({ open, onToggle }) {
  return (
    <Sidebar isOpen={open} onToggle={onToggle}>
      {NAV_ITEMS.map((item) => <SidebarItem key={item.href} href={item.href} icon={item.icon} label={item.label} />)}
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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Nav open={open} onToggle={toggle} />
          <div className="lg:pl-64">
            <TopBar onOpenMenu={openMenu} />
            <main className="p-4 lg:p-8">{children}</main>
          </div>
        </div>
      </MetaValue.Provider>
    </MetaSetter.Provider>
  );
}
