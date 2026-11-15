"use client";
// A comma-separated tag box. It saves when the owner leaves the box, and shows whether the save worked.
import React, { useEffect, useState } from "react";
import { sanitizeTags } from "../../lib/contact-tags.js";

export default function TagBox({ value = [], onSave, label = "Tags (comma separated)" }) {
  const current = Array.isArray(value) ? value : [];
  const key = current.join("|");
  const [text, setText] = useState(current.join(", "));
  const [status, setStatus] = useState("");
  useEffect(() => { setText(current.join(", ")); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const next = sanitizeTags(text);
    setText(next.join(", "));
    if (next.join("|") === key) return;
    setStatus("Saving...");
    const ok = await onSave?.(next);
    setStatus(ok ? "Saved" : "Could not save the tags. Try again.");
  };

  return (
    <div className="mt-2">
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus(""); }}
        onBlur={save}
        maxLength={600}
        placeholder="vip, referral"
        className="w-full min-h-[44px] mt-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-white"
      />
      {status ? <p role="status" className="text-xs text-gray-500 dark:text-gray-400 mt-1">{status}</p> : null}
    </div>
  );
}
