"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import {
  hasContact, markDuplicates, OSM_CREDIT, PROSPECT_CATEGORIES, prospectContact, prospectToLead, type Prospect,
} from "@/lib/prospectFinder";
import { Badge, Button, Field, Input, Label, Modal, Select } from "@/components/ui";

// "Find prospects": businesses of one kind in one area from OpenStreetMap (free, no key). Shown for review; the owner ticks
// which to add and they become ordinary New leads. Nothing is contacted, enriched from other sites or sent anywhere.
export default function ProspectFinder() {
  const { user, role, businessId: activeBusinessId } = useAuth();
  const { leads, customers, bulkAddLeads } = useData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(PROSPECT_CATEGORIES[0].value);
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [found, setFound] = useState<{ prospects: Prospect[]; place: string; categoryLabel: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const marked = useMemo(
    () => (found ? markDuplicates(found.prospects, leads, customers) : []),
    [found, leads, customers]
  );
  if (role !== "owner" && role !== "manager") return null;

  const keyOf = (p: Prospect, i: number) => p.osmId || `${p.name}#${i}`;
  const withContact = marked.filter((m) => hasContact(m.prospect)).length;
  const already = marked.filter((m) => m.duplicate).length;

  function close() {
    setOpen(false);
  }

  async function search() {
    if (!user || !area.trim()) return;
    setBusy(true);
    setFound(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/prospects/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(activeBusinessId ? { [BUSINESS_ID_HEADER]: activeBusinessId } : {}) },
        body: JSON.stringify({ category, area }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't search.");
      const prospects = (payload.prospects ?? []) as Prospect[];
      setFound({ prospects, place: String(payload.place ?? area), categoryLabel: String(payload.categoryLabel ?? "") });
      // Pre-tick the ones worth contacting and not already yours.
      const dup = markDuplicates(prospects, leads, customers);
      setPicked(new Set(dup.filter((m) => !m.duplicate && hasContact(m.prospect)).map((m) => keyOf(m.prospect, prospects.indexOf(m.prospect)))));
    } catch (err) {
      toast.error("Couldn't search", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!found) return;
    const chosen = marked.filter((m, i) => !m.duplicate && picked.has(keyOf(m.prospect, i))).map((m) => prospectToLead(m.prospect, found.categoryLabel));
    if (chosen.length === 0) return;
    setAdding(true);
    try {
      await bulkAddLeads(chosen);
      toast.success(`${chosen.length} lead${chosen.length === 1 ? "" : "s"} added`, "They start as New. Nothing has been sent to them.");
      setFound(null);
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't add them", toastableErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  const pickedCount = marked.filter((m, i) => !m.duplicate && picked.has(keyOf(m.prospect, i))).length;

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>Find prospects</Button>
      <Modal open={open} onClose={close} title="Find prospects">
        {open && (
          <div className="space-y-4">
            <p className="text-xs text-muted">
              Look up businesses on the free OpenStreetMap, pick the ones worth a message, and add them as new leads. Only businesses someone has put on the map appear,
              and many list no phone number. Make sure each is one you may contact.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <Label>Kind of business</Label>
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {PROSPECT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>City or district</Label>
                <Input value={area} maxLength={100} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Dehiwala, Sri Lanka" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} />
              </Field>
            </div>
            <Button type="button" disabled={busy || area.trim().length < 2} onClick={search}>{busy ? "Searching…" : "Search"}</Button>

            {found && (
              <div>
                <div className="text-sm font-medium">
                  {found.prospects.length === 0 ? "Nothing found" : `${found.prospects.length} found`} <span className="text-muted font-normal">near {found.place}</span>
                </div>
                {found.prospects.length === 0 ? (
                  <div className="text-xs text-muted mt-1">The map has no {found.categoryLabel.toLowerCase()} listed there. Try a nearby district or a broader kind of business.</div>
                ) : (
                  <>
                    <div className="text-xs text-muted mt-0.5 mb-2">
                      {withContact} with a phone or email{already > 0 ? ` · ${already} already in your books` : ""}. Ticked: the ones you can reach and do not have yet.
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-line border border-line rounded-lg">
                      {marked.map((m, i) => {
                        const k = keyOf(m.prospect, i);
                        return (
                          <label key={k} className={`flex items-start gap-3 p-3 text-sm ${m.duplicate ? "opacity-60" : "cursor-pointer"}`}>
                            <input
                              type="checkbox"
                              className="mt-1"
                              disabled={!!m.duplicate}
                              checked={!m.duplicate && picked.has(k)}
                              onChange={(e) =>
                                setPicked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(k);
                                  else next.delete(k);
                                  return next;
                                })
                              }
                            />
                            <span className="min-w-0 break-words">
                              <span className="font-medium">{m.prospect.name}</span>{" "}
                              {m.duplicate && <Badge>{m.duplicate === "customer" ? "Already a customer" : "Already a lead"}</Badge>}
                              <span className="block text-xs text-muted">
                                {prospectContact(m.prospect) || "no phone or email listed"}
                                {m.prospect.address ? ` · ${m.prospect.address}` : ""}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-3">
                      <Button type="button" disabled={adding || pickedCount === 0} onClick={add}>
                        {adding ? "Adding…" : `Add ${pickedCount} as new lead${pickedCount === 1 ? "" : "s"}`}
                      </Button>
                      <span className="text-[11px] text-muted">Map data {OSM_CREDIT}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
