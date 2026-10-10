"use client";
import React from "react";
import { Modal } from "./ui/Modal";

const CHIP = {
  draft: "",
  sending: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  sent: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};
const CHIP_TEXT = { sending: "Sending…", sent: "Sent", failed: "Not sent" };

/**
 * "Draft all due follow-ups, approve together". Presentational only: the dashboard owns the state and the send loop.
 * batch = { phase: 'preparing'|'review'|'sending'|'done', note, skipped: [string], items: [...] }
 */
export default function AutoBatchModal({ batch, onChangeItem, onSend, onClose }) {
  if (!batch) return null;
  const items = batch.items || [];
  const selected = items.filter((i) => i.selected && i.state === "draft");
  const sent = items.filter((i) => i.state === "sent").length;
  const failed = items.filter((i) => i.state === "failed").length;
  const busy = batch.phase === "preparing" || batch.phase === "sending";
  const field = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title="Today's follow-ups" size="xl" closeOnOverlayClick={false} showCloseButton={!busy}>
      {batch.phase === "preparing" && (
        <p className="text-sm text-gray-700 dark:text-gray-200" role="status">{batch.note || "Preparing…"}</p>
      )}

      {batch.phase !== "preparing" && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {batch.phase === "review" && "AI wrote these from what you actually sent. Edit anything, untick what you don't want, then send. Nothing goes out until you press Send."}
            {batch.phase === "sending" && "Sending one at a time. Keep this window open."}
            {batch.phase === "done" && `Finished: ${sent} sent${failed ? `, ${failed} not sent` : ""}.`}
          </p>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {items.map((it) => (
              <div key={it.id} className={`rounded-lg border p-3 ${it.state === "draft" && !it.selected ? "opacity-60" : ""} border-gray-200 dark:border-gray-700`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <label className="flex items-center gap-2 min-w-0 text-sm font-medium text-gray-900 dark:text-white">
                    <input type="checkbox" className="h-5 w-5 shrink-0" checked={it.selected} disabled={it.state !== "draft" || batch.phase !== "review"} onChange={(e) => onChangeItem(it.id, { selected: e.target.checked })} />
                    <span className="truncate">{it.business}</span>
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400 truncate">{it.email}</span>
                  </label>
                  <div className="shrink-0 flex items-center gap-1 text-xs">
                    <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">Follow-up #{it.number}{it.isFinal ? " · last" : ""}</span>
                    {CHIP_TEXT[it.state] && <span className={`px-2 py-0.5 rounded ${CHIP[it.state]}`}>{CHIP_TEXT[it.state]}</span>}
                  </div>
                </div>
                {it.state === "draft" && batch.phase === "review" ? (
                  <>
                    <input aria-label={`Subject for ${it.email}`} className={`${field} mb-2`} value={it.subject} onChange={(e) => onChangeItem(it.id, { subject: e.target.value })} />
                    <textarea aria-label={`Message for ${it.email}`} className={field} rows={5} value={it.body} onChange={(e) => onChangeItem(it.id, { body: e.target.value })} />
                  </>
                ) : (
                  <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line line-clamp-3">{it.error ? it.error : it.body}</p>
                )}
              </div>
            ))}
          </div>
          {(batch.skipped || []).length > 0 && (
            <details className="mt-3 text-xs text-gray-600 dark:text-gray-300">
              <summary className="cursor-pointer">{batch.skipped.length} skipped (nothing to send)</summary>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">{batch.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
            {batch.phase !== "sending" && (
              <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm">{batch.phase === "done" ? "Close" : "Cancel, send nothing"}</button>
            )}
            {batch.phase === "review" && (
              <button type="button" disabled={selected.length === 0} onClick={onSend} className="min-h-[44px] px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold">
                Send {selected.length} approved
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
