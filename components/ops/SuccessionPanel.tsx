"use client";

// Succession and the organisation: who reports to whom, who covers for whom, and where a person is the only one who can do something without a
// deputy. Reads the team and the procedures; records reporting lines and deputies only when the owner or manager sets them. Owner and manager only.
import { useMemo } from "react";
import { Badge, Card, EmptyState, Field, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { coverageFor } from "@/lib/coverage";
import { buildOrg, keyPersonRisks, type OrgLink } from "@/lib/succession";

export default function SuccessionPanel() {
  const { members, procedures, orgLinks, setOrgLink } = useData();
  const toast = useToast();
  const people = useMemo(() => members.filter((m) => m.active && m.role !== "accountant").map((m) => ({ id: m.id, name: m.name, active: m.active })), [members]);
  const org = useMemo(() => buildOrg(people, orgLinks), [people, orgLinks]);
  const sole = useMemo(() => coverageFor(procedures, members).filter((c) => c.status === "single").map((c) => ({ title: c.title, qualified: c.qualified })), [procedures, members]);
  const risks = useMemo(() => keyPersonRisks(people, orgLinks, sole), [people, orgLinks, sole]);
  const nameOf = (id?: string) => people.find((p) => p.id === id)?.name ?? "";

  async function change(memberId: string, patch: Partial<OrgLink>) {
    try {
      await setOrgLink(memberId, { ...orgLinks[memberId], ...patch });
    } catch (err) {
      toast.error("Couldn't save it", toastableErrorMessage(err));
    }
  }

  if (people.length === 0) return <EmptyState title="No team yet" body="Add people to the team, then set who reports to whom and who covers for each person." />;
  return (
    <div className="space-y-6">
      {risks.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Key people without a named deputy</div>
          {risks.map((r) => (
            <div key={r.id} className="text-xs"><span className="font-medium text-bad">{r.name}</span>: {r.reasons.join("; ")}. Name a deputy below.</div>
          ))}
        </Card>
      )}
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Organisation</div>
        {org.nodes.length === 0 && <div className="text-xs text-muted">No one is set up yet.</div>}
        {org.nodes.length > 0 && (
          <div className="overflow-x-auto space-y-4">
            {org.nodes.filter((n) => n.depth === 0).map((n) => (
              <OrgBranch key={n.id} id={n.id} nodes={org.nodes} deputy={(id) => (orgLinks[id]?.deputyId ? nameOf(orgLinks[id]?.deputyId) : "")} />
            ))}
          </div>
        )}
        {org.cycles.length > 0 && <div className="text-xs text-bad">Reporting lines loop back for: {org.cycles.join(", ")}. Fix one of them.</div>}
      </Card>
      <div className="space-y-2">
        <div className="text-sm font-medium">Reporting line and deputy for each person</div>
        {people.map((p) => (
          <Card key={p.id} className="p-3.5">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-sm font-medium">{p.name}</span>
              {risks.some((r) => r.id === p.id) && <Badge tone="bad">needs a deputy</Badge>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field><Label>Reports to</Label>
                <Select value={orgLinks[p.id]?.reportsToId ?? ""} onChange={(e) => change(p.id, { reportsToId: e.target.value || undefined })}>
                  <option value="">No one above them</option>
                  {people.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
              <Field><Label>Deputy (covers when they are away)</Label>
                <Select value={orgLinks[p.id]?.deputyId ?? ""} onChange={(e) => change(p.id, { deputyId: e.target.value || undefined })}>
                  <option value="">No deputy named</option>
                  {people.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
            </div>
          </Card>
        ))}
      </div>
      <div className="text-xs text-muted">Procedures are matched to people through their acknowledgement of the current version. A person is a key person when they are the only one qualified on a procedure, or lead three or more people.</div>
    </div>
  );
}

// v288: the organisation drawn as a chart. Each person is a box; the people who report to them hang below on a line. Read-only: the lines are set below.
function OrgBranch({ id, nodes, deputy }: { id: string; nodes: { id: string; name: string; reports: string[] }[]; deputy: (id: string) => string }) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const who = deputy(id);
  return (
    <div>
      <div className="inline-block rounded-lg border px-3 py-2 text-sm">
        <div className="font-medium">{node.name}</div>
        {who ? <div className="text-xs text-muted">deputy: {who}</div> : null}
      </div>
      {node.reports.length > 0 && (
        <div className="ml-5 mt-3 pl-5 border-l space-y-4">
          {node.reports.map((c) => (
            <OrgBranch key={c} id={c} nodes={nodes} deputy={deputy} />
          ))}
        </div>
      )}
    </div>
  );
}
