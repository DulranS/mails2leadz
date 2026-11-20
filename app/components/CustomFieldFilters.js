"use client";
// Filters on the customer list by the owner's own fields (pass 341). The rules live in lib/custom-fields.js; this only edits the rows.
import React from "react";
import { FILTER_OPS, sanitizeDefinitions } from "../../lib/custom-fields.js";

const field = "min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const OP_LABEL = { equals: "is", atLeast: "at least", atMost: "at most", before: "before", after: "after", contains: "contains" };
const MAX_FILTERS = 5;

export default function CustomFieldFilters({ defs = [], filters = [], onChange }) {
  const fields = sanitizeDefinitions(defs);
  if (fields.length === 0) return null;
  const setRow = (i, patch) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const remove = (i) => onChange(filters.filter((_, j) => j !== i));
  const add = () => {
    const d = fields[0];
    onChange([...filters, { key: d.key, op: FILTER_OPS[d.type][0], value: d.type === "yesno" ? "yes" : "" }]);
  };

  return (
    <section aria-label="Custom field filters" className="space-y-2">
      <p className="text-sm font-medium text-gray-900 dark:text-white">Filter by your fields</p>
      {filters.map((f, i) => {
        const def = fields.find((d) => d.key === f.key) || fields[0];
        const ops = FILTER_OPS[def.type] || [];
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select aria-label="Field" className={field} value={def.key} onChange={(e) => {
              const nd = fields.find((d) => d.key === e.target.value) || fields[0];
              setRow(i, { key: nd.key, op: FILTER_OPS[nd.type][0], value: nd.type === "yesno" ? "yes" : "" });
            }}>
              {fields.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <select aria-label="Condition" className={field} value={ops.includes(f.op) ? f.op : ops[0]} onChange={(e) => setRow(i, { op: e.target.value })}>
              {ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
            </select>
            {def.type === "yesno" ? (
              <select aria-label="Value" className={field} value={f.value === "no" ? "no" : "yes"} onChange={(e) => setRow(i, { value: e.target.value })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <input
                aria-label="Value"
                className={field}
                type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                value={f.value ?? ""}
                onChange={(e) => setRow(i, { value: e.target.value })}
                maxLength={def.type === "text" ? 200 : undefined}
              />
            )}
            <button type="button" className="text-xs underline min-h-[44px] px-2 text-gray-600 dark:text-gray-300" onClick={() => remove(i)} aria-label={`Remove filter on ${def.label}`}>Remove</button>
          </div>
        );
      })}
      {filters.length < MAX_FILTERS ? (
        <button type="button" className="min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200" onClick={add}>Add filter</button>
      ) : null}
    </section>
  );
}
