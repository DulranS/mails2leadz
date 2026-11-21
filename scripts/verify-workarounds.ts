// Workarounds for the two partial gaps and the scheduling: the process map (lib/processMap.ts and its screen), the new-offering procedure in
// the starter set, and the scheduler file that calls the daily job for hosts without their own timer. Run: npx tsx scripts/verify-workarounds.ts
import fs from "node:fs";
import { parseFlowSteps, flowchartCode } from "../lib/processMap";
import { starterSetFor } from "../lib/starterSets";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const steps = parseFlowSteps("1. Check the seal\n2) Weigh five units\n   and record both figures\n3. Record the reading");
ok(steps.length === 3 && steps[0].n === 1 && steps[1].n === 2, "numbered steps are read in order, with either a dot or a bracket after the number");
ok(steps[1].text.includes("and record both figures"), "a line that is not numbered continues the step above it");
ok(parseFlowSteps("No numbers here at all").length === 0, "a procedure with no numbered steps draws no flow");

const code = flowchartCode(steps, "Weigh and record");
ok(code.startsWith("flowchart TD") && code.includes("start([Weigh and record])") && code.includes("end_([Done])"), "the diagram code starts at the procedure and ends at Done");
ok(code.includes("s0 --> s1") && code.includes("s1 --> s2") && code.includes("s2 --> end_"), "each step leads to the next, and the last leads to Done");
const tricky = flowchartCode(parseFlowSteps('1. Say "hi" [now] {x}'), 'Bad "title" (x)');
ok(!tricky.includes('"hi"') && !tricky.includes("[now]") && tricky.includes("s0[\"1. Say hi now x\"]"), "quotes and brackets in a step are removed so the diagram code still parses");

ok(starterSetFor("retail").procedures.some((p) => p.title === "Launching a new product or service" && p.body.includes("Record the approval as a decision")), "a new product or service has a standard launch procedure, with the approval recorded as a decision");
ok(read("components/ops/ProceduresPanel.tsx").includes("<ProcessFlow title={viewing.title} body={viewing.body} />"), "each procedure can be shown as a flow");

const wf = read(".github/workflows/daily-job.yml");
ok(wf.includes('cron: "0 3 * * *"') && wf.includes("/api/cron/daily") && wf.includes("Authorization: Bearer ${{ secrets.CRON_SECRET }}"), "the scheduler calls the daily job with the shared secret, every day");
ok(wf.includes("${{ secrets.SITE_URL }}") && !/CRON_SECRET\s*=\s*\S/.test(wf), "the secret and the site address come from the repository's secrets, not the file");
ok(read("lib/cronAuth.ts").includes("MIN_SECRET_LENGTH = 16") && read("app/api/cron/daily/route.ts").includes("requireCronSecret"), "the job the scheduler calls is protected by the same secret");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
