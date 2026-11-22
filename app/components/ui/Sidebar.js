import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAME } from '../../../lib/brand.js';

export const Sidebar = ({ isOpen, onToggle, children }) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onToggle(); };
    const previous = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden'; // the page behind an open menu does not scroll
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen, onToggle]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-200"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-r border-gray-200/50 dark:border-gray-700/50
        transform transition-[transform,visibility] duration-300 ease-in-out lg:translate-x-0 lg:visible lg:bg-white lg:dark:bg-gray-900
        ${isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200/50 dark:border-gray-700/50">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
              {APP_NAME}
            </h2>
            <button
              onClick={onToggle}
              aria-label="Close menu"
              className="lg:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
            {children}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50">
            <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              You approve everything that gets sent.
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const SidebarItem = ({ href, icon, label, badge, isActive }) => {
  const pathname = usePathname();
  const active = isActive || pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`
        flex items-center px-3 py-2.5 min-h-[44px] text-sm font-medium rounded-lg transition-all duration-200
        ${active
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
        }
      `}
    >
      {icon && <span className="mr-3 text-gray-500 dark:text-gray-400" aria-hidden="true">{icon}</span>}
      <span className="flex-1">{label}</span>
      {badge && (
        <span className={`
          inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
          ${badge.variant === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' :
            badge.variant === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
            badge.variant === 'danger' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
            'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-200'}
        `}>
          {badge.text}
        </span>
      )}
    </Link>
  );
};

export default Sidebar;