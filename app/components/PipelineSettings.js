import React, { useState } from "react";
import { doc, setDoc } from "../../lib/client-firestore.js";
import {
  DEFAULT_PIPELINE, MAX_CUSTOM_PIPELINES, createPipeline, renamePipeline, movePipeline, addStage, renameStage, moveStage, deletePipeline, deleteStage,
} from "../../lib/pipelines.js";

// Pipelines: create, rename, reorder and delete the custom pipelines and their stages. The default pipeline is fixed.
// Each change is checked by lib/pipelines.js, then only the `pipelines` field of the business settings is saved.
// `dealCounts` (lib/pipelines.js countDeals) tells a delete how many deals are in the pipeline or stage; a delete with deals is refused.
const field = "px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 disabled:opacity-50";
const danger = "px-3 py-2 text-sm rounded-md border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 disabled:opacity-50";
const dealsText = (n) => (n ? `${n} ${n === 1 ? "deal" : "deals"}` : "no deals");

export default function PipelineSettings({ db, uid, pipelines = [], onChange, dealCounts = { byPipeline: {}, byStage: {} } }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({}); // typed names not yet saved, by key
  const [newName, setNewName] = useState("");
  const [newStages, setNewStages] = useState("");

  const draft = (key, fallback) => (drafts[key] !== undefined ? drafts[key] : fallback);
  const setDraft = (key, value) => setDrafts((d) => ({ ...d, [key]: value }));

  // One place that saves. A refused change shows its reason and writes nothing.
  const apply = async (result, okText) => {
    if (!result.ok) { setMsg({ type: "error", text: result.error }); return; }
    setBusy(true); setMsg(null);
    try {
      await setDoc(doc(db, "users", uid, "settings", "business"), { pipelines: result.pipelines }, { merge: true });
      onChange?.(result.pipelines);
      setDrafts({});
      setMsg({ type: "ok", text: okText });
    } catch {
      setMsg({ type: "error", text: "Could not save. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  // A delete that is refused shows the reason at once. One that may go ahead asks first.
  const askDelete = (result, question, okText) => {
    if (result.ok && !window.confirm(question)) return;
    apply(result, okText);
  };

  const atCap = pipelines.length >= MAX_CUSTOM_PIPELINES;
  const stageNames = DEFAULT_PIPELINE.stages.map((s) => s.name).join(" > ");

  return (
    <div className="space-y-4 text-sm text-gray-800 dark:text-gray-100">
      <p className="text-gray-600 dark:text-gray-300">
        The default pipeline is fixed: {stageNames}. You can add up to {MAX_CUSTOM_PIPELINES} more (five pipelines in all). A stage marked [won] or [lost] counts in revenue and win rate like a default won or lost stage. To move a deal to another pipeline, open the deal: it starts at that pipeline&apos;s first stage.
      </p>

      {pipelines.map((p, i) => (
        <div key={p.id} className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={`Name of pipeline ${p.name}`} className={`${field} flex-1 min-w-[12rem]`} value={draft(`p:${p.id}`, p.name)} onChange={(e) => setDraft(`p:${p.id}`, e.target.value)} />
            <button type="button" className={btn} disabled={busy} onClick={() => apply(renamePipeline(pipelines, p.id, draft(`p:${p.id}`, p.name)), "Pipeline name saved.")}>Save name</button>
            <button type="button" className={btn} disabled={busy || i === 0} onClick={() => apply(movePipeline(pipelines, p.id, i - 1), "Pipeline order saved.")} aria-label={`Move ${p.name} up`}>Up</button>
            <button type="button" className={btn} disabled={busy || i === pipelines.length - 1} onClick={() => apply(movePipeline(pipelines, p.id, i + 1), "Pipeline order saved.")} aria-label={`Move ${p.name} down`}>Down</button>
            <button type="button" className={danger} disabled={busy} aria-label={`Delete pipeline ${p.name}`}
              onClick={() => askDelete(deletePipeline(pipelines, p.id, dealCounts.byPipeline?.[p.id] || 0), `Delete the pipeline "${p.name}" and its stages? This cannot be undone.`, "Pipeline deleted.")}>Delete pipeline</button>
          </div>

          <ol className="space-y-2">
            {p.stages.map((s, j) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="w-6 text-gray-500 dark:text-gray-400">{j + 1}.</span>
                <input aria-label={`Name of stage ${s.name}`} className={`${field} flex-1 min-w-[10rem]`} value={draft(`s:${s.id}`, s.name)} onChange={(e) => setDraft(`s:${s.id}`, e.target.value)} />
                {s.outcome ? <span className="text-xs text-gray-600 dark:text-gray-300">{s.outcome === "won" ? "Won" : "Lost"}</span> : null}
                <span className="text-xs text-gray-500 dark:text-gray-400">{dealsText(dealCounts.byStage?.[s.id] || 0)}</span>
                <button type="button" className={btn} disabled={busy} onClick={() => apply(renameStage(pipelines, p.id, s.id, draft(`s:${s.id}`, s.name)), "Stage name saved.")}>Save</button>
                <button type="button" className={btn} disabled={busy || j === 0} onClick={() => apply(moveStage(pipelines, p.id, s.id, j - 1), "Stage order saved.")} aria-label={`Move stage ${s.name} up`}>Up</button>
                <button type="button" className={btn} disabled={busy || j === p.stages.length - 1} onClick={() => apply(moveStage(pipelines, p.id, s.id, j + 1), "Stage order saved.")} aria-label={`Move stage ${s.name} down`}>Down</button>
                <button type="button" className={danger} disabled={busy} aria-label={`Delete stage ${s.name}`}
                  onClick={() => askDelete(deleteStage(pipelines, p.id, s.id, dealCounts.byStage?.[s.id] || 0), `Delete the stage "${s.name}"?`, "Stage deleted.")}>Delete</button>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={`New stage for ${p.name}`} placeholder="New stage (add [won] or [lost] to mark it)" className={`${field} flex-1 min-w-[10rem]`} value={draft(`add:${p.id}`, "")} onChange={(e) => setDraft(`add:${p.id}`, e.target.value)} />
            <button type="button" className={btn} disabled={busy} onClick={() => apply(addStage(pipelines, p.id, draft(`add:${p.id}`, "")), "Stage added.")}>Add stage</button>
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-500 dark:text-gray-400">The default pipeline cannot be deleted.</p>

      <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-md p-3 space-y-2">
        <p className="font-medium">New pipeline</p>
        {atCap ? (
          <p className="text-gray-600 dark:text-gray-300">Five pipelines is the most (the default one included). Delete one to add another.</p>
        ) : (
          <>
            <input aria-label="New pipeline name" placeholder="Pipeline name (2 to 40 characters)" className={`${field} w-full`} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <textarea aria-label="Stages, one per line" placeholder={"Stages, one per line (2 to 12). End a line with [won] or [lost] to mark it.\nIntro call\nProposal sent\nSigned [won]\nNot going ahead [lost]"} rows={5} className={`${field} w-full`} value={newStages} onChange={(e) => setNewStages(e.target.value)} />
            <button type="button" className={btn} disabled={busy} onClick={async () => {
              const r = createPipeline(pipelines, { name: newName, stages: newStages.split("\n").map((x) => x.trim()).filter(Boolean) });
              await apply(r, "Pipeline added.");
              if (r.ok) { setNewName(""); setNewStages(""); }
            }}>Add pipeline</button>
          </>
        )}
      </div>

      {msg && <p role="status" className={msg.type === "error" ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}>{msg.text}</p>}
    </div>
  );
}
