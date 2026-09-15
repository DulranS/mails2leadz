"use client";

import React from "react";

export const DashboardLayout = ({ children }) => {
  return (
    <div className="dashboard-layout min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  );
};

export default DashboardLayout;
