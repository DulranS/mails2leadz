"use client";
// Your own fields for each customer (pass 338). You set the field list once (saved on your settings); each customer's values
// are kept on their deal, since there is one deal per customer. Rules are in lib/custom-fields.js.
import React, { useState } from "react";
import { doc, setDoc } from "../../lib/client-firestore.js";
import { updateDealExtras } from "../../lib/deal-client.js";
import { dealDocId } from "../../lib/deal-utils.js";
import { CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS, sanitizeDefinitions, sanitizeCustomValues, customFieldRows } from "../../lib/custom-fields.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const TYPE_LABEL = { text: "Text", number: "Number", date: "Date", yesno: "Yes or no" };

// The owner's field list: set it up, change it, save it.
export function CustomFieldsEditor({ db, uid, defs, onSaved }) {
  const [draft, setDraft] = useState(null); // null while the list is only shown
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const fields = sanitizeDefinitions(draft);
      await setDoc(doc(db, "users", uid, "settings", "custom_fields"), { fields, updatedAt: new Date().toISOString() }, { merge: true });
      onSaved(fields);
      setDraft(null);
      setMsg("Saved.");
    } catch (e) {
      console.error(e);
      setMsg("Could not save the fields. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={card} aria-label="Your customer fields">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Your customer fields</p>
        {draft === null ? (
          <button type="button" className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white`} onClick={() => setDraft(defs.map((d) => ({ label: d.label, type: d.type })))}>Edit fields</button>
        ) : null}
      </div>
      {draft === null ? (
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">{defs.length ? defs.map((d) => `${d.label} (${TYPE_LABEL[d.type] || d.type})`).join(" · ") : "Add up to 10 things you want to record for each customer, such as renewal month or account manager."}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {draft.map((row, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center">
              <label className="sr-only" htmlFor={`cf-label-${i}`}>Field name</label>
              <input id={`cf-label-${i}`} className={`${field} flex-1 min-w-[10rem]`} value={row.label} maxLength={60} placeholder="Field name" onChange={(e) => setDraft(draft.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} />
              <label className="sr-only" htmlFor={`cf-type-${i}`}>Field type</label>
              <select id={`cf-type-${i}`} className={field} value={row.type} onChange={(e) => setDraft(draft.map((r, j) => (j === i ? { ...r, type: e.target.value } : r)))}>
                {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <button type="button" className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white`} onClick={() => setDraft(draft.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white`} disabled={draft.length >= MAX_CUSTOM_FIELDS} onClick={() => setDraft([...draft, { label: "", type: "text" }])}>Add field</button>
            <button type="button" className={`${btn} bg-teal-600 hover:bg-teal-500 text-white`} disabled={saving} onClick={save}>{saving ? "Saving..." : "Save fields"}</button>
            <button type="button" className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white`} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
      {msg ? <p role="status" className="text-xs text-gray-700 dark:text-gray-200 mt-2">{msg}</p> : null}
    </section>
  );
}

const toInput = (type, v) => {
  if (v === null || v === undefined) return "";
  if (type === "yesno") return v === true ? "yes" : v === false ? "no" : "";
  return String(v);
};

// One customer's values, edited on their expanded row. Mount it with a key per customer.
export function CustomFieldValues({ db, uid, email, defs, values, onSaved }) {
  const rows = customFieldRows(defs, values);
  const [vals, setVals] = useState(() => Object.fromEntries(rows.map((r) => [r.key, toInput(r.type, r.value)])));
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  if (!defs.length) return <p className="text-xs text-gray-600 dark:text-gray-300">Set up your customer fields above to record them here.</p>;

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const clean = sanitizeCustomValues(vals, defs);
      // With a deal, the values sit on it. Without one (pass 339), they sit on the customer's own record, so nothing is created in the pipeline.
      const updated = await updateDealExtras(db, uid, email, { customFields: clean });
      if (!updated) {
        await setDoc(doc(db, "users", uid, "customer_fields", dealDocId(uid, email)), { email, userId: uid, customFields: clean, updatedAt: new Date().toISOString() });
      }
      onSaved(clean);
      setMsg("Saved.");
    } catch (e) {
      console.error(e);
      setMsg("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="This customer's fields" className="space-y-2">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">Your fields for this customer</p>
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center gap-2">
          <label htmlFor={`cfv-${email}-${r.key}`} className="text-sm text-gray-700 dark:text-gray-200 min-w-[8rem]">{r.label}</label>
          {r.type === "yesno" ? (
            <select id={`cfv-${email}-${r.key}`} className={field} value={vals[r.key] ?? ""} onChange={(e) => setVals({ ...vals, [r.key]: e.target.value })}>
              <option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          ) : (
            <input id={`cfv-${email}-${r.key}`} className={`${field} flex-1 min-w-[10rem]`} type={r.type === "number" ? "number" : r.type === "date" ? "date" : "text"} step={r.type === "number" ? "any" : undefined} maxLength={r.type === "text" ? 200 : undefined} value={vals[r.key] ?? ""} onChange={(e) => setVals({ ...vals, [r.key]: e.target.value })} />
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${btn} bg-teal-600 hover:bg-teal-500 text-white`} disabled={saving} onClick={save}>{saving ? "Saving..." : "Save fields"}</button>
        {msg ? <span role="status" className="text-xs text-gray-700 dark:text-gray-200">{msg}</span> : null}
      </div>
    </section>
  );
}
