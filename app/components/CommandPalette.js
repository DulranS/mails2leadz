"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { INTERNAL_LINKS, EXTERNAL_LINKS, searchLinks } from "../../lib/quick-links.js";

// Press Ctrl+K (or Cmd+K) to jump to any screen or outside tool. Arrow keys move, Enter opens, Esc closes.
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef(null);
  const items = useMemo(() => searchLinks(q, [...INTERNAL_LINKS, ...EXTERNAL_LINKS]), [q]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) { setQ(""); setI(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => { setI(0); }, [q]);

  const go = (item) => {
    if (!item) return;
    if (item.url.startsWith("/")) window.location.assign(item.url);
    else window.open(item.url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };
  const onInputKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(items.length - 1, n + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    if (e.key === "Enter") { e.preventDefault(); go(items[i]); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Go to a screen or tool" className="w-full max-w-xl rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey} placeholder="Go to a screen or tool (Ctrl+K)" aria-label="Search screens and tools" className="w-full rounded-t-lg px-4 py-3 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100" />
        <ul role="listbox" className="max-h-96 overflow-y-auto border-t border-gray-200 dark:border-gray-700">
          {items.length === 0 ? <li className="px-4 py-3 text-sm text-gray-500">Nothing matches.</li> : null}
          {items.map((it, n) => (
            <li key={it.id} role="option" aria-selected={n === i}>
              <button type="button" onMouseEnter={() => setI(n)} onClick={() => go(it)} className={`w-full text-left px-4 py-2 text-sm flex justify-between gap-3 ${n === i ? "bg-gray-100 dark:bg-gray-700" : ""}`}>
                <span className="text-gray-900 dark:text-gray-100">{it.label}</span>
                <span className="text-xs text-gray-500">{it.url.startsWith("/") ? "Screen" : "Opens in a new tab"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
