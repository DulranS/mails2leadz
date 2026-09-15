"use client";

import React, { useState } from "react";

export default function CRMComponent({ data, onUpdateLead, onAddNote, onScheduleFollowUp }) {
  const [selectedLead, setSelectedLead] = useState(null);

  if (!data?.leads) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <p className="text-gray-500">No leads data available. Please ensure data is loaded.</p>
      </div>
    );
  }

  return (
    <div className="crm-container space-y-6">
      {/* Leads List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">CRM Dashboard</h2>
          <p className="text-gray-600 mt-1">Manage your leads and customer relationships</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Score</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.length > 0 ? (
                data.leads.map((lead) => (
                  <tr key={lead.email} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{lead.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        {lead.status || "New"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${((data.leadScores?.[lead.email] || 0) / 100) * 100}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button
                        onClick={() => setSelectedLead(lead.email)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View
                      </button>
                      <button
                        onClick={() => onScheduleFollowUp(lead.email)}
                        className="text-green-600 hover:text-green-800 font-medium"
                      >
                        Follow Up
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                    No leads found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead Details */}
      {selectedLead && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800">Lead Details: {selectedLead}</h3>
            <button
              onClick={() => setSelectedLead(null)}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="note-input" className="block text-sm font-medium text-gray-700 mb-2">Add Note</label>
              <textarea
                id="note-input"
                placeholder="Add a note for this lead..."
                className="w-full p-2 border rounded-lg text-sm"
                rows="3"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.ctrlKey && e.target.value.trim()) {
                    onAddNote(selectedLead, e.target.value);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
