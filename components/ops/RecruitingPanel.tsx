"use client";

// Recruiting: candidates for each role, where each one is, how long hiring takes, who has waited too long, and which hires still need onboarding.
// Each move is dated when it is made. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso } from "@/lib/format";
import { pipelineSummary, STAGE_LABEL, CANDIDATE_STAGES, STALE_AFTER_DAYS, timeToHireDays, hireProblem, type CandidateStage } from "@/lib/recruiting";

const NEXT: Partial<Record<CandidateStage, CandidateStage[]>> = { applied: ["interview"], interview: ["offer", "hired"], offer: ["hired"] };

export default function RecruitingPanel() {
  const { candidates, addCandidate, moveCandidate, updateCandidateChecks } = useData();
  const toast = useToast();
  const today = todayIso();
  const summary = useMemo(() => pipelineSummary(candidates, today), [candidates, today]);
  const open = useMemo(() => candidates.filter((c) => c.stage !== "hired" && c.stage !== "rejected").sort((a, b) => (a.stageDates.applied ?? "").localeCompare(b.stageDates.applied ?? "")), [candidates]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [appliedOn, setAppliedOn] = useState(today);
  const [source, setSource] = useState("");
  const [contact, setContact] = useState("");

  async function add() {
    try {
      await addCandidate({ name, role, appliedOn, source, contact });
      setName(""); setRole(""); setSource(""); setContact("");
      toast.success("Candidate added", `Applied ${appliedOn}`);
    } catch (err) {
      toast.error("Couldn't add them", toastableErrorMessage(err));
    }
  }
  async function move(id: string, to: CandidateStage, label: string) {
    try {
      await moveCandidate(id, to);
      toast.success(label, STAGE_LABEL[to]);
    } catch (err) {
      toast.error("Couldn't move them", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Add a candidate</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
          <Field><Label>Role</Label><Input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} placeholder="Cashier, Driver, Chef" /></Field>
          <Field><Label>Applied on</Label><Input type="date" value={appliedOn} max={today} onChange={(e) => setAppliedOn(e.target.value)} /></Field>
          <Field><Label>Where they came from (optional)</Label><Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} /></Field>
          <Field><Label>Contact (optional)</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} /></Field>
        </div>
        <Button onClick={add} disabled={!name.trim() || !role.trim() || !appliedOn}>Add candidate</Button>
      </Card>

      {candidates.length === 0 ? (
        <EmptyState title="No candidates yet" body="Add each person who applies for a role. Move them through the stages as hiring goes on; the dates are kept, so time to hire is measured." />
      ) : (
        <>
          <Card className="p-4 space-y-2">
            <div className="text-sm font-medium">Pipeline</div>
            <div className="text-xs text-muted">
              {CANDIDATE_STAGES.map((s) => `${STAGE_LABEL[s]} ${summary.counts[s]}`).join(" · ")}
            </div>
            <div className="text-xs">
              {summary.averageTimeToHireDays !== null ? <>Average time to hire: <span className="num">{summary.averageTimeToHireDays}</span> days.</> : "Time to hire appears once someone is hired."}
            </div>
          </Card>

          {summary.stale.length > 0 && (
            <Card className="p-4 space-y-2">
              <div className="text-sm font-medium">Waiting too long (at least {STALE_AFTER_DAYS} days in one stage)</div>
              {summary.stale.map((x) => (
                <div key={x.candidate.id} className="text-xs flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{x.candidate.name}</span>
                  <span className="text-muted">{STAGE_LABEL[x.candidate.stage]} for {x.daysInStage} days, {x.candidate.role}</span>
                </div>
              ))}
            </Card>
          )}

          {summary.awaitingOnboarding.length > 0 && (
            <Card className="p-4 space-y-2">
              <div className="text-sm font-medium">Hired, onboarding not yet started</div>
              {summary.awaitingOnboarding.map((c) => (
                <div key={c.id} className="text-xs flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted">{c.role}{timeToHireDays(c) !== null && <> · hired in {timeToHireDays(c)} days</>}</span>
                  <button onClick={() => moveCandidate(c.id, "hired", true).then(() => toast.success("Onboarding started", c.name)).catch((err) => toast.error("Couldn't record it", toastableErrorMessage(err)))} className="text-amber-soft hover:underline min-h-[32px]">Onboarding started</button>
                </div>
              ))}
            </Card>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">Open candidates</div>
            {open.length === 0 && <div className="text-xs text-muted">No one is open right now.</div>}
            {open.map((c) => (
              <Card key={c.id} className="p-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{c.name}</span>
                  <Badge>{c.role}</Badge>
                  <Badge tone="amber">{STAGE_LABEL[c.stage]}</Badge>
                </div>
                <div className="text-xs text-muted mt-1">Applied {c.stageDates.applied}{c.source && <> · {c.source}</>}{c.contact && <> · {c.contact}</>}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field><Label>References checked on</Label><Input type="date" max={today} value={c.checks?.referencesCheckedOn ?? ""} onChange={(e) => updateCandidateChecks(c.id, { ...c.checks, referencesCheckedOn: e.target.value || undefined }).catch((err) => toast.error("Couldn't record it", toastableErrorMessage(err)))} /></Field>
                  <Field><Label>Right to work checked on</Label><Input type="date" max={today} value={c.checks?.rightToWorkCheckedOn ?? ""} onChange={(e) => updateCandidateChecks(c.id, { ...c.checks, rightToWorkCheckedOn: e.target.value || undefined }).catch((err) => toast.error("Couldn't record it", toastableErrorMessage(err)))} /></Field>
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  {(NEXT[c.stage] ?? []).map((to) => {
                    const blocked = to === "hired" ? hireProblem(c, today) : null;
                    return <Button key={to} variant="ghost" disabled={!!blocked} title={blocked ?? undefined} onClick={() => move(c.id, to, c.name)}>{to === "hired" ? "Hire" : `Move to ${STAGE_LABEL[to].toLowerCase()}`}</Button>;
                  })}
                  {(NEXT[c.stage] ?? []).includes("hired") && hireProblem(c, today) && <span className="text-xs text-muted self-center">{hireProblem(c, today)}</span>}
                  <button onClick={() => move(c.id, "rejected", c.name)} className="text-xs text-muted hover:text-fg min-h-[32px]">Not taken forward</button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
