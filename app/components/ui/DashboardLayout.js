'use client';
// Pages keep writing <DashboardLayout title="..." subtitle="...">. The frame itself (sidebar, top bar, avatar, theme button) now
// lives once in the root layout (app/components/AppShell.js) and stays mounted between pages; this component only hands over the
// page title. It renders nothing of its own, so a page no longer rebuilds the whole frame every time you open it.
import React from 'react';
import { usePageMeta } from '../AppShell';

export const DashboardLayout = ({ children, title, subtitle }) => {
  usePageMeta(title, subtitle);
  return <>{children}</>;
};

export default DashboardLayout;
