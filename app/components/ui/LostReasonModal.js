"use client";
import React from "react";
import { Modal } from "./Modal";
import { LOST_REASONS } from "../../../lib/deal-utils.js";

/**
 * Asks WHY a deal is being marked Lost (one tap). Feeds "Why deals are lost" on the Business Value page.
 * `target` = { email, ... } or null (closed). onPick(reasonId) / onSkip() / onCancel().
 */
export default function LostReasonModal({ target, onPick, onSkip, onCancel }) {
  return (
    <Modal isOpen={!!target} onClose={onCancel} title="Why was this deal lost?" size="sm">
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        {target?.email ? <span className="font-medium break-all">{target.email}</span> : null}
        {target?.email ? " — " : ""}one tap helps you see what to fix. A Lost deal stops all follow-ups; you can reopen it later.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LOST_REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.id)}
            className="min-h-[44px] text-left text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-4 text-sm">
        <button type="button" onClick={onCancel} className="min-h-[44px] px-3 text-gray-500 hover:underline">Cancel</button>
        <button type="button" onClick={onSkip} className="min-h-[44px] px-3 text-gray-500 hover:underline">Skip, mark Lost</button>
      </div>
    </Modal>
  );
}
