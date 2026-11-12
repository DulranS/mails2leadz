"use client";
import { useEffect, useState } from "react";

// Remembers what the owner was typing on this device, so a reload does not lose it. Drafts are not secrets; keys are never stored here.
export function useDraft(name, initial) {
  const key = `autoleads-draft:${name}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      return saved === null ? initial : JSON.parse(saved);
    } catch (e) { return initial; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked: the draft simply is not kept */ }
  }, [key, value]);
  return [value, setValue];
}
