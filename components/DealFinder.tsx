"use client";

// Deal finder on the Leads page: "Work these next" ranks your open leads by expected value (value times the win rate of their
// source) and says why, and "Paste a list" adds leads from a list you already have, after the same checks as a spreadsheet import.
// Nothing is fetched from other sites; every lead comes from you or from the open-data prospect finder beside it.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { parsePastedList, rankOpenLeads } from "@/lib/dealFinder";
import { leadsFromRows, type LeadImportResult } from "@/lib/leadImport";
import { Badge, Button, Card, Field, Label, Modal, Textarea } from "@/components/ui";

const SHOW = 8;

export default function DealFinder() {
  const { role } = useAuth();
  const { leads, settings, bulkAddLeads } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);
  const canAdd = can(role, "manage:sales") || can(role, "create:sale");
  const today = todayIso();

  const ranked = useMemo(() => rankOpenLeads(leads, today), [leads, today]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<LeadImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  function check() {
    const result = leadsFromRows(parsePastedList(text), leads.map((l) => ({ name: l.name, contact: l.contact })));
    setChecked(result);
  }

  async function add() {
    if (!checked || checked.rows.length === 0 || checked.errors.length > 0) return;
    setBusy(true);
    try {
      await bulkAddLeads(checked.rows);
      toast.success(`${checked.rows.length} leads added`, checked.skippedDuplicates > 0 ? `${checked.skippedDuplicates} were already on your list.` : undefined);
      setText("");
      setChecked(null);
      setOpen(false);
    } catch (e) {
      toast.error("Couldn't add the leads", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  return (
    <>
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <div className="text-sm font-medium">Work these next</div>
            <div className="text-xs text-muted">Open leads by expected value: the estimated value times how often leads from that source are won.</div>
          </div>
          {canAdd && <Button variant="ghost" onClick={() => { setChecked(null); setOpen(true); }}>Paste a list</Button>}
        </div>
        {ranked.length === 0 ? (
          <div className="text-xs text-muted">No open leads yet. Add some, or paste a list.</div>
        ) : (
          <div className="divide-y divide-line">
            {ranked.slice(0, SHOW).map((r) => (
              <div key={r.lead.name + (r.lead.contact ?? "")} className="flex flex-wrap items-start justify-between gap-2 py-2 text-xs">
                <div className="min-w-0">
                  <div className="text-sm break-words">{r.lead.name}</div>
                  <div className="text-muted mt-0.5">{r.reasons.length > 0 ? r.reasons.join(" · ") : "Ready to work"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="num">{r.expectedValue > 0 ? money(r.expectedValue) : "—"}</div>
                  <Badge tone={r.score >= 60 ? "good" : "default"}>Score {r.score}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Paste a list of leads">
        <div className="space-y-4">
          <div className="text-xs text-muted">
            One lead per line: name, contact, source, estimated value, notes, separated by commas or tabs. Or start with a header line that names the columns. Nothing is added until you press Add.
          </div>
          <Field>
            <Label>The list</Label>
            <Textarea rows={8} value={text} onChange={(e) => { setText(e.target.value); setChecked(null); }} placeholder={"Acme Ltd, 0771234567, Referral, 5000\nBo Shop, bo@shop.lk, Cold call"} />
          </Field>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={check} disabled={!text.trim()}>Check the list</Button>
          </div>
          {checked && (
            <div className="space-y-2 text-xs">
              <div>{checked.rows.length} new {checked.rows.length === 1 ? "lead" : "leads"} ready.{checked.skippedDuplicates > 0 ? ` ${checked.skippedDuplicates} already on your list, skipped.` : ""}</div>
              {checked.errors.length > 0 && (
                <div className="text-bad">
                  Fix these first, then check again. Nothing has been added:
                  <ul className="list-disc ml-5 mt-1">
                    {checked.errors.slice(0, 8).map((e, i) => (
                      <li key={i}>{e.row > 0 ? `Line ${e.row - 1}: ` : ""}{e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {checked.rows.length > 0 && checked.errors.length === 0 && (
                <div className="flex justify-end">
                  <Button onClick={add} disabled={busy}>{busy ? "Adding…" : `Add ${checked.rows.length} ${checked.rows.length === 1 ? "lead" : "leads"}`}</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
