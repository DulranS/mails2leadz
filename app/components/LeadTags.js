"use client";
// The tags on one lead in the inbox. Saved when the owner leaves the box, to their own lead record only.
import React, { useState } from "react";
import { doc, setDoc } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { sanitizeTags } from "../../lib/contact-tags.js";

export default function LeadTags({ id, tags = [] }) {
  const [text, setText] = useState((tags || []).join(", "));
  const [saved, setSaved] = useState(null);
  const save = async () => {
    const next = sanitizeTags(text);
    const same = next.join(", ") === (tags || []).join(", ");
    setText(next.join(", "));
    if (same || !db) return;
    try {
      await setDoc(doc(db, "lead_inbox", id), { tags: next, tagsAt: new Date().toISOString() }, { merge: true });
      setSaved("Saved");
    } catch {
      setSaved("Could not save the tags. Try again.");
    }
  };
  return (
    <div className="mt-2">
      <label htmlFor={`tags-${id}`} className="text-xs text-gray-600 dark:text-gray-300">Tags (comma separated)</label>
      <input id={`tags-${id}`} className="w-full min-h-[44px] mt-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" value={text} onChange={(e) => { setText(e.target.value); setSaved(null); }} onBlur={save} placeholder="vip, referral, spring-promo" />
      {saved ? <p role="status" className="text-xs text-gray-500 dark:text-gray-400 mt-1">{saved}</p> : null}
    </div>
  );
}
