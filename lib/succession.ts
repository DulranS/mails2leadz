// Succession and the organisation (v233): who reports to whom, and who covers for whom. A person who is the only one qualified on a procedure, or
// who leads several people, is a key person; a key person with no named deputy is a risk. Reporting lines that loop back on themselves are found
// and reported, not followed forever. Pure: no I/O.

export interface OrgMember { id: string; name: string; active: boolean }
export interface OrgLink { reportsToId?: string; deputyId?: string }
export interface SoleProcedure { title: string; qualified: string[] } // from coverage: procedures with exactly one qualified person
export const MANY_REPORTS = 3;

export interface OrgNode { id: string; name: string; depth: number; reports: string[] }

export function buildOrg(members: OrgMember[], links: Record<string, OrgLink>) {
  const active = members.filter((m) => m.active);
  const byId = new Map(active.map((m) => [m.id, m]));
  const parentOf = new Map<string, string>();
  for (const m of active) {
    const p = links[m.id]?.reportsToId;
    if (p && p !== m.id && byId.has(p)) parentOf.set(m.id, p);
  }
  // A line that loops back on itself is cut where it closes, and reported.
  const cycles: string[] = [];
  for (const m of active) {
    const seen = new Set<string>([m.id]);
    let cur = parentOf.get(m.id);
    while (cur) {
      if (seen.has(cur)) {
        cycles.push(m.name);
        parentOf.delete(m.id);
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }
  const children = new Map<string, string[]>();
  for (const [child, parent] of parentOf) children.set(parent, [...(children.get(parent) ?? []), child]);
  const nodes: OrgNode[] = [];
  const visit = (id: string, depth: number) => {
    const kids = (children.get(id) ?? []).sort((a, b) => (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? ""));
    nodes.push({ id, name: byId.get(id)?.name ?? "", depth, reports: kids });
    for (const k of kids) visit(k, depth + 1);
  };
  active.filter((m) => !parentOf.has(m.id)).sort((a, b) => a.name.localeCompare(b.name)).forEach((m) => visit(m.id, 0));
  return { nodes, cycles };
}

export function keyPersonRisks(members: OrgMember[], links: Record<string, OrgLink>, soleProcedures: SoleProcedure[]) {
  const active = members.filter((m) => m.active);
  const reportCount = new Map<string, number>();
  for (const m of active) {
    const p = links[m.id]?.reportsToId;
    if (p && active.some((x) => x.id === p) && p !== m.id) reportCount.set(p, (reportCount.get(p) ?? 0) + 1);
  }
  const risks: { id: string; name: string; reasons: string[] }[] = [];
  for (const m of active) {
    // Only a procedure with exactly one qualified person is a single point of failure; shared ones are not counted against anyone.
    const sole = soleProcedures.filter((p) => p.qualified.length === 1 && p.qualified[0] === m.name).map((p) => p.title);
    const reports = reportCount.get(m.id) ?? 0;
    const deputy = links[m.id]?.deputyId;
    const deputyValid = !!deputy && deputy !== m.id && active.some((x) => x.id === deputy);
    const reasons: string[] = [];
    if (sole.length > 0) reasons.push(`the only qualified person for ${sole.length} procedure${sole.length === 1 ? "" : "s"}: ${sole.join(", ")}`);
    if (reports >= MANY_REPORTS) reasons.push(`leads ${reports} people`);
    if (reasons.length > 0 && !deputyValid) risks.push({ id: m.id, name: m.name, reasons });
  }
  return risks.sort((a, b) => b.reasons.length - a.reasons.length);
}
