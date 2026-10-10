"use client";
// Review window for an AI (or template) draft that goes out from the owner's OWN email app.
// Nothing is sent from here: "Open in my email app" hands the text to the mail program, the owner presses Send there.
import React, { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";

const MAILTO_SAFE_LENGTH = 1800; // many mail apps cut longer links

export function buildMailto(to, subject, body) {
  const oneLine = String(subject || "").replace(/[\r\n]+/g, " ");
  return `mailto:${encodeURIComponent(String(to || "").trim())}?subject=${encodeURIComponent(oneLine)}&body=${encodeURIComponent(body || "")}`;
}

/**
 * draft = { to, title, subject, body, note?, source? } or null (closed)
 * onOpened({ subject, body }) runs after the mail app was opened or the text was copied (the caller records the contact).
 */
export default function DraftModal({ draft, onClose, onOpened }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (draft) { setSubject(draft.subject || ""); setBody(draft.body || ""); setCopied(false); }
  }, [draft]);

  if (!draft) return null;
  const link = buildMailto(draft.to, subject, body);
  const tooLong = link.length > MAILTO_SAFE_LENGTH;
  const field = "mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";

  const open = () => {
    window.open(link, "_blank");
    onOpened?.({ subject, body });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      onOpened?.({ subject, body });
    } catch { setCopied(false); }
  };

  return (
    <Modal isOpen={!!draft} onClose={onClose} title={draft.title || "Review draft"} size="lg">
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          To: <span className="font-medium break-all">{draft.to}</span>
        </p>
        {draft.note && <p className="text-xs rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 p-2">{draft.note}</p>}
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} maxLength={200} />
        </label>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={field} maxLength={4000} />
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {draft.source === "template" ? "Plain template (AI was not used). " : "AI draft: it can be wrong, so read it before sending. "}
          Nothing is sent from here: it opens in your own email app and you press Send.
        </p>
        {tooLong && <p className="text-xs text-amber-700 dark:text-amber-300">This is long. If your email app cuts it off, use Copy text and paste it in.</p>}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Cancel</button>
          <button type="button" onClick={copy} className="min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">{copied ? "Copied" : "Copy text"}</button>
          <button type="button" onClick={open} disabled={!subject.trim() || !body.trim()} className="min-h-[44px] px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">Open in my email app</button>
        </div>
      </div>
    </Modal>
  );
}
