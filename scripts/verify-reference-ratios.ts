import { refOperatingCashFlowRatio, refCashFlowToNetProfit, refCashReturnOnAssetsPct, refInterestBurdenPct, refCashInterestCoverage, refEbitdaCoverage, refRetainedEarningsPct, refFixedAssetTurnover } from "../lib/ratios-reference";

let fails = 0;
const check = (name: string, ok: boolean) => { if (!ok) { fails++; console.log("FAIL:", name); } };
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-9;

check("operating cash flow ratio 200/100 = 2", near(refOperatingCashFlowRatio(200, 100), 2));
check("operating cash flow ratio, no cash flow = null", refOperatingCashFlowRatio(null, 100) === null);
check("operating cash flow ratio, zero liabilities = null", refOperatingCashFlowRatio(200, 0) === null);
check("cash flow to net profit 300/100 = 3", near(refCashFlowToNetProfit(300, 100), 3));
check("cash return on assets 50/1000 = 5%", near(refCashReturnOnAssetsPct(50, 1000), 5));
check("interest burden 100/400 = 25%", near(refInterestBurdenPct(100, 400), 25));
check("interest burden, no EBIT = null", refInterestBurdenPct(100, null) === null);
check("cash interest cover 600/200 = 3", near(refCashInterestCoverage(600, 200), 3));
check("cash interest cover, no interest = null", refCashInterestCoverage(600, 0) === null);
check("EBITDA cover 800/200 = 4", near(refEbitdaCoverage(800, 200), 4));
check("retained earnings 300/1000 = 30%", near(refRetainedEarningsPct(300, 1000), 30));
check("fixed asset turnover 5000/1000 = 5", near(refFixedAssetTurnover(5000, 1000), 5));
check("fixed asset turnover, no fixed assets = null", refFixedAssetTurnover(5000, 0) === null);

console.log(fails === 0 ? "Reference ratios: all checks passed" : `Reference ratios: ${fails} failed`);
process.exit(fails ? 1 : 0);
