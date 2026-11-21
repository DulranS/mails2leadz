// Process map (v214b): a procedure's numbered steps drawn as a flow, with the diagram code to take into a diagram tool for anything more
// detailed. Pure: it reads the steps the procedure already holds; it changes nothing.
export interface FlowStep {
  n: number;
  text: string;
}

// The numbered steps of a procedure ("1. Do this", "2) Then that"). Lines that are not numbered are kept as continuation of the step above.
export function parseFlowSteps(body: string): FlowStep[] {
  const out: FlowStep[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)[.)]\s*(.+)$/);
    if (m) out.push({ n: Number(m[1]), text: m[2].trim() });
    else if (out.length) out[out.length - 1].text += ` ${line}`;
  }
  return out;
}

// Diagram-tool code (Mermaid) for the flow. Quotes and brackets are removed from the text so the code always parses.
export function flowchartCode(steps: FlowStep[], title: string): string {
  const clean = (s: string) => s.replace(/["[\]{}()<>|`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const lines = ["flowchart TD", `  start([${clean(title) || "Start"}])`];
  steps.forEach((s, i) => lines.push(`  s${i}["${s.n}. ${clean(s.text)}"]`));
  lines.push(`  end_([Done])`);
  let prev = "start";
  steps.forEach((_, i) => {
    lines.push(`  ${prev} --> s${i}`);
    prev = `s${i}`;
  });
  lines.push(`  ${prev} --> end_`);
  return lines.join("\n");
}
