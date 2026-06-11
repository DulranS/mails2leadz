import React, { useState } from 'react';
import { Sidebar, SidebarItem } from './Sidebar';
import { Button } from './Button';
import { useTheme } from './ThemeProvider';

export const DashboardLayout = ({ children, title, subtitle }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const navigationItems = [
    {
      href: '/dashboard',
      icon: '📊',
      label: 'Dashboard',
    },
    {
      href: '/leads',
      icon: '👥',
      label: 'Lead Management',
      badge: { text: 'New', variant: 'success' },
    },
    {
      href: '/campaigns',
      icon: '📧',
      label: 'Campaigns',
    },
    {
      href: '/analytics',
      icon: '📈',
      label: 'Analytics',
    },
    {
      href: '/crm',
      icon: '💼',
      label: 'CRM',
    },
    {
      href: '/ai-tools',
      icon: '🤖',
      label: 'AI Tools',
      badge: { text: 'New', variant: 'success' },
    },
    {
      href: '/settings',
      icon: '⚙️',
      label: 'Settings',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)}>
        {navigationItems.map((item) => (
          <SidebarItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            badge={item.badge}
          />
        ))}
      </Sidebar>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="ml-4 lg:ml-0">
                {title && <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>}
                {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Theme toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="p-2"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </Button>

              {/* User menu placeholder */}
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">U</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
