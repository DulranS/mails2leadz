"use client";

import React from "react";

export default function AnalyticsDashboard({ data = {} }) {
  const stats = [
    {
      label: "Total Leads",
      value: data.leads?.length || 0,
      color: "bg-blue-500",
    },
    {
      label: "Contacted",
      value: Object.keys(data.repliedLeads || {}).length || 0,
      color: "bg-green-500",
    },
    {
      label: "Average Score",
      value: calculateAverageScore(data.leadScores || {}),
      color: "bg-purple-500",
    },
    {
      label: "Deal Stages",
      value: Object.keys(data.dealStages || {}).length || 0,
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="analytics-dashboard">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg shadow p-6">
            <div className={`${stat.color} rounded-lg p-3 w-12 h-12 flex items-center justify-center mb-4`}>
              <span className="text-white text-xl font-bold">📊</span>
            </div>
            <h3 className="text-gray-600 text-sm font-medium">{stat.label}</h3>
            <p className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function calculateAverageScore(scores) {
  if (!scores || Object.keys(scores).length === 0) return 0;
  const total = Object.values(scores).reduce((sum, score) => sum + (score || 0), 0);
  return Math.round(total / Object.keys(scores).length);
}
