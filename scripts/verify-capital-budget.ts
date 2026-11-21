// Capital budgeting (lib/capitalBudget.ts): NPV, IRR, payback, profitability index, capital rationing, equivalent annual annuity, real rates,
// the terminal-value share, the post-investment review, and the parsing of projects; checked with worked numbers. Run: npx tsx scripts/verify-capital-budget.ts
import fs from "node:fs";
import { presentValue, npv, irr, paybackYears, profitabilityIndex, capitalRationing, equivalentAnnualAnnuity, realRate, terminalValueShare, TERMINAL_SHARE_WARN_PCT, postInvestmentAudit, parseProjects } from "../lib/capitalBudget";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const A = { name: "Van", outlay: 1000, flows: [600, 600, 600] };
ok(Math.abs(presentValue(A.flows, 0.1) - 1492.1) < 0.05, "the present value of 600 a year for three years at 10% is about 1,492.10");
ok(npv(A, 0.1) === 492.11, "the NPV is that present value less the outlay (492.11)");
const i = irr(A);
ok(i !== null && Math.abs(presentValue(A.flows, i) - A.outlay) < 0.01, "the IRR is the rate at which the present value equals the outlay");
ok(paybackYears(A) === 1.67, "payback counts the year it comes back, with the last year part-counted (1.67 years)");
ok(paybackYears({ name: "Weak", outlay: 1000, flows: [100, 100] }) === null, "a project that never returns its outlay has no payback");
ok(profitabilityIndex(A, 0.1) === 1.49, "the profitability index is the present value of what comes back per unit invested (1.49)");
ok(npv({ name: "NoNet", outlay: 1000, flows: [0] }, 0.1) < 0, "an investment returning nothing has a negative NPV");

const B = { name: "Till", outlay: 500, flows: [300, 300] };
const ration = capitalRationing([A, B], 0.1, 1000);
ok(ration.funded.length === 1 && ration.funded[0].name === "Van" && ration.skipped[0].name === "Till", "with 1,000 available, the van (higher profitability index) is funded and the till is skipped, not split");
ok(ration.unspent === 0, "the money is used in full where a whole project fits");
ok(capitalRationing([A, B], 0.1, 5000).funded.length === 2, "with enough money, every project that creates value is funded");
ok(capitalRationing([{ name: "Loss", outlay: 1000, flows: [100] }], 0.1, 5000).funded.length === 0, "a project that destroys value is never funded, however much money there is");

ok(Math.abs(equivalentAnnualAnnuity(A, 0.1) - 197.9) < 0.1, "the equivalent yearly value spreads the NPV over the project's life (about 197.90 a year)");
ok(Math.abs(realRate(0.12, 0.05) - 0.0667) < 0.0001, "the real rate removes inflation: 12% nominal with 5% inflation is about 6.67% real");
ok(terminalValueShare(400, 600) === 60 && (terminalValueShare(100, 900) ?? 0) > TERMINAL_SHARE_WARN_PCT, "the share of value that rests on the distant future is shown, and a high share is flagged");

const audit = postInvestmentAudit([800, 800], [700, 650]);
ok(audit.behindPlan === true && audit.finalVariance === -250, "the review shows the project is behind by the running difference (-250)");
ok(postInvestmentAudit([800, 800], [900, 850]).behindPlan === false, "a project ahead of its forecast is not behind");

const parsed = parseProjects("Van; 1000; 600, 600, 600\nbad line\n; 5; 1\nTill; 500; 300, 300");
ok(parsed.projects.length === 2 && parsed.errors.length === 2, "lines that are not 'name; outlay; cash flows' are reported, and the rest are read");
ok(parsed.projects[0].flows.join() === "600,600,600" && parsed.projects[0].outlay === 1000, "each project keeps its outlay and yearly cash flows");

ok(tabsForRole("owner").includes("appraisal") && tabsForRole("manager").includes("appraisal") && !tabsForRole("staff").includes("appraisal"), "investment appraisal is for the owner and manager");
ok(read("components/ops/AppraisalPanel.tsx").includes("nothing is saved or spent") || read("components/ops/AppraisalPanel.tsx").includes("Nothing is saved or spent"), "the appraisal says it saves and spends nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
