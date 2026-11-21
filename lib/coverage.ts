// Coverage (v195b): for each written procedure, who has read and acknowledged its current version. A procedure that only one person
// is qualified for is a single point of failure: when that person is off, nobody can do it. Pure: no I/O.

export type CoverageStatus = "none" | "single" | "covered";

export interface ProcedureCoverage {
  procedureId: string;
  title: string;
  version: number;
  qualified: string[]; // names of active people who have acknowledged the current version
  notQualified: string[]; // active people who have not yet
  status: CoverageStatus;
}

export const MIN_QUALIFIED_PEOPLE = 2;

export function coverageFor(
  procedures: { id: string; title: string; version: number; acks?: Record<string, { name: string; version: number }> }[],
  members: { id: string; name: string; role: string; active: boolean }[],
): ProcedureCoverage[] {
  const people = members.filter((m) => m.active && m.role !== "accountant");
  return procedures
    .map((p) => {
      const qualified = people.filter((m) => p.acks?.[m.id]?.version === p.version).map((m) => m.name);
      const notQualified = people.filter((m) => p.acks?.[m.id]?.version !== p.version).map((m) => m.name);
      const status: CoverageStatus = qualified.length === 0 ? "none" : qualified.length < MIN_QUALIFIED_PEOPLE ? "single" : "covered";
      return { procedureId: p.id, title: p.title, version: p.version, qualified, notQualified, status };
    })
    .sort((a, b) => ({ none: 0, single: 1, covered: 2 })[a.status] - ({ none: 0, single: 1, covered: 2 })[b.status] || a.title.localeCompare(b.title));
}
