import { signPosRequest, verifyPosSignature, validatePosSales, posSaleDocId, validatePosDayTotal, reconcileDay, summarisePostedPos } from "../lib/pos-ingest";

let fails = 0;
const check = (name: string, ok: boolean) => { if (!ok) { fails++; console.log("FAIL:", name); } };
const secret = "a".repeat(64);
const now = 1_800_000_000_000;
const line = { txId: "T-1001", date: "2026-11-17", product: "Flat white", qty: 2, unitPrice: 450, paymentMethod: "card" };
const good = JSON.stringify({ sales: [line, { ...line, txId: "T-1002", paymentMethod: "cash" }] });
const sig = signPosRequest(secret, String(now), good);

// Signatures
check("valid signature accepted", verifyPosSignature({ secret, timestamp: String(now), body: good, signature: sig, nowMs: now }).ok === true);
check("wrong secret refused", verifyPosSignature({ secret: "b".repeat(64), timestamp: String(now), body: good, signature: sig, nowMs: now }).ok === false);
check("tampered body refused", verifyPosSignature({ secret, timestamp: String(now), body: good.replace("450", "9"), signature: sig, nowMs: now }).ok === false);
check("stale timestamp refused", verifyPosSignature({ secret, timestamp: String(now), body: good, signature: sig, nowMs: now + 10 * 60 * 1000 }).ok === false);
check("missing timestamp refused", verifyPosSignature({ secret, timestamp: "", body: good, signature: sig, nowMs: now }).ok === false);
check("uppercase hex signature accepted", verifyPosSignature({ secret, timestamp: String(now), body: good, signature: sig.toUpperCase(), nowMs: now }).ok === true);
check("empty signature refused", verifyPosSignature({ secret, timestamp: String(now), body: good, signature: "", nowMs: now }).ok === false);

// Sales lines
const ok = validatePosSales(JSON.parse(good));
check("valid lines accepted", ok.ok === true);
check("two lines parsed", ok.ok === true && ok.value.length === 2);
check("missing sales array refused", validatePosSales({}).ok === false);
check("empty list refused", validatePosSales({ sales: [] }).ok === false);
check("over 500 refused", validatePosSales({ sales: new Array(501).fill(line) }).ok === false);
check("missing txId refused", validatePosSales({ sales: [{ ...line, txId: undefined }] }).ok === false);
check("txId with spaces refused", validatePosSales({ sales: [{ ...line, txId: "T 1" }] }).ok === false);
check("bad date refused", validatePosSales({ sales: [{ ...line, date: "17/11/2026" }] }).ok === false);
check("zero qty refused", validatePosSales({ sales: [{ ...line, qty: 0 }] }).ok === false);
check("negative price refused", validatePosSales({ sales: [{ ...line, unitPrice: -1 }] }).ok === false);
check("credit payment refused from POS", validatePosSales({ sales: [{ ...line, paymentMethod: "credit" }] }).ok === false);
check("missing payment refused", validatePosSales({ sales: [{ ...line, paymentMethod: undefined }] }).ok === false);
check("missing product refused", validatePosSales({ sales: [{ ...line, product: "  " }] }).ok === false);
check("product name trimmed", validatePosSales({ sales: [{ ...line, product: " Tea " }] }).ok === true && (validatePosSales({ sales: [{ ...line, product: " Tea " }] }) as { value: { product: string }[] }).value[0].product === "Tea");

// Stable ids: the same line gets the same id; a different line or business gets a different one.
const a = posSaleDocId("biz1", "T-1001", 0);
check("same line, same id", a === posSaleDocId("biz1", "T-1001", 0));
check("different line index, different id", a !== posSaleDocId("biz1", "T-1001", 1));
check("different business, different id", a !== posSaleDocId("biz2", "T-1001", 0));
check("id is a plain document id", /^pos_[0-9a-f]{40}$/.test(a));

// Daily reconciliation
check("day total accepted", validatePosDayTotal({ date: "2026-11-17", expectedTotal: 1200.5, expectedTransactions: 3 }).ok === true);
check("day total: bad date refused", validatePosDayTotal({ date: "x", expectedTotal: 1, expectedTransactions: 1 }).ok === false);
check("day total: fractional count refused", validatePosDayTotal({ date: "2026-11-17", expectedTotal: 1, expectedTransactions: 1.5 }).ok === false);
check("day total: negative refused", validatePosDayTotal({ date: "2026-11-17", expectedTotal: -1, expectedTransactions: 1 }).ok === false);
const same = reconcileDay({ expectedTotal: 1200.5, expectedTransactions: 3, postedTotal: 1200.5, postedTransactions: 3 });
check("equal day matches", same.status === "matched" && same.difference === 0);
const off = reconcileDay({ expectedTotal: 1200.5, expectedTransactions: 3, postedTotal: 1100, postedTransactions: 3 });
check("amount gap is a mismatch", off.status === "mismatch" && off.difference === 100.5);
const cnt = reconcileDay({ expectedTotal: 500, expectedTransactions: 2, postedTotal: 500, postedTransactions: 1 });
check("count gap is a mismatch", cnt.status === "mismatch");
const cent = reconcileDay({ expectedTotal: 10.004, expectedTransactions: 1, postedTotal: 10, postedTransactions: 1 });
check("under a cent is matched", cent.status === "matched");

const posted = summarisePostedPos([{ qty: 2, unitPrice: 5, posRef: "t1" }, { qty: 1, unitPrice: 3, posRef: "t1" }, { qty: 4, unitPrice: 2.5, posRef: "t2" }, { qty: 1, unitPrice: 1 }]);
check("posted summary: sums lines, counts distinct till transactions", posted.postedTotal === 24 && posted.postedTransactions === 2);
check("posted summary: empty day is zero", summarisePostedPos([]).postedTotal === 0 && summarisePostedPos([]).postedTransactions === 0);

console.log(fails === 0 ? "POS sales ingest: all checks passed" : `POS ingest: ${fails} failed`);
process.exit(fails ? 1 : 0);
