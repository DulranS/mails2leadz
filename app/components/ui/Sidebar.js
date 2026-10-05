import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const Sidebar = ({ isOpen, onToggle, children }) => {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700
        transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Sales Machine
            </h2>
            <button
              onClick={onToggle}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {children}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              v2.0.0 - Enhanced
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
      className={`
        flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200
        ${active
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
        }
      `}
    >
      {icon && <span className="mr-3">{icon}</span>}
      <span className="flex-1">{label}</span>
      {badge && (
        <span className={`
          inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
          ${badge.variant === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
            badge.variant === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
            badge.variant === 'danger' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}
        `}>
          {badge.text}
        </span>
      )}
    </Link>
  );
};

export default Sidebar;