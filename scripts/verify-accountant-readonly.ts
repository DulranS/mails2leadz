// The Accountant login must be strictly view-only. Three independent layers, all checked here:
//   1. lib/permissions.ts   - the role holds no write-type permission
//   2. firestore.rules      - no create/update/delete rule can be satisfied by an accountant,
//                              and the owner-only data stays owner-only
//   3. lib/readOnlyGuard.ts - every DataContext method that mutates is refused for the role
// Run: npx tsx scripts/verify-accountant-readonly.ts
import { readFileSync } from "fs";
import { join } from "path";
import { can } from "../lib/permissions";
import { isMutationName, withReadOnly, READ_ONLY_MESSAGE } from "../lib/readOnlyGuard";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const ROOT = join(__dirname, "..");

// ---- 1. permissions
const perms = ["manage:products","manage:sales","delete:sales","manage:expenses","delete:records","manage:loans","manage:budgets","manage:employees","manage:capital","manage:tax","manage:team","manage:settings","manage:notifications","create:sale","create:cashCount","create:receivablePayment","create:timeEntry","manage:timeEntries","manage:fixedAssets","manage:projects","create:customer","manage:customers","manage:suppliers","correct:ledgerEntries","manage:journal","manage:opportunities","manage:reconciliation","manage:writeOffs","view:payroll","view:settings","view:team","view:auditLog"] as const;
for (const p of perms) assert(!can("accountant", p), `accountant lacks ${p}`);
assert(can("accountant", "view:reports") && can("accountant", "view:dashboard"), "accountant can view reports and dashboard");
assert(!can("nonsense" as never, "view:reports"), "an unknown role string gets no permissions and does not throw");

// ---- 2. firestore.rules
const rules = readFileSync(join(ROOT, "firestore.rules"), "utf8");
const code = rules.split("\n").filter((l) => !l.trim().startsWith("//"));
const writeLines = code.filter((l) => /allow\s+(create|update|delete|write)/.test(l) || /allow\s+read,\s*write/.test(l));
assert(writeLines.length > 40, `scanned ${writeLines.length} write rules`);
assert(!writeLines.some((l) => /isOwnerOrActiveMember|canReadBooks|isAccountant/.test(l)), "no write rule admits an accountant (isOwnerOrActiveMember / canReadBooks / isAccountant never appear in a write rule)");
// multi-line write rules: check continuation lines until ';'
const text = code.join("\n");
for (const m of text.matchAll(/allow\s+(?:create|update|delete|write)[^;]*;/g)) {
  assert(!/isOwnerOrActiveMember|canReadBooks|isAccountant/.test(m[0]), `write rule is accountant-proof: ${m[0].replace(/\s+/g, " ").slice(0, 90)}`);
}
function block(name: string): string {
  const i = text.indexOf(`match /${name}`);
  if (i < 0) return "";
  const lineEnd = text.indexOf("\n", i);
  let j = text.lastIndexOf("{", lineEnd) + 1; // the brace that opens the body, not the {docId} wildcard
  let depth = 1;
  const start = j;
  for (; j < text.length && depth > 0; j++) {
    if (text[j] === "{") depth++;
    if (text[j] === "}") depth--;
  }
  return text.slice(start, j);
}
for (const col of ["sales", "purchases", "expenses", "receivablePayments", "payablePayments", "billPayments", "capitalEntries", "loans", "fixedAssets", "securities", "investmentTxns", "lentLoans", "lentLoanTxns", "customers", "products"]) {
  assert(/canReadBooks|isOwnerOrActiveMember/.test(block(`${col}/{docId}`)), `accountant can read ${col}`);
}
for (const col of ["employees/{docId}", "journalEntries/{docId}", "opportunities/{docId}", "auditLog/{docId}", "members/{uid}", "invites/{inviteId}", "meta/billingHistory", "notifications/{docId}", "aiChatSessions/{sessionId}", "aiMemory/{noteId}"]) {
  const b = block(col);
  assert(b.length > 0 && !/canReadBooks|isOwnerOrActiveMember|isAccountant/.test(b), `${col} stays closed to an accountant`);
}
assert(/function isOwnerOrOperatingMember[\s\S]*?isStaff\(businessId\);/.test(text) && !/function isOwnerOrOperatingMember[^}]*isAccountant/.test(text), "isOwnerOrOperatingMember excludes the accountant");

// ---- 3. read-only guard
assert(isMutationName("addSale") && isMutationName("bulkAddPurchases") && isMutationName("clockIn") && isMutationName("setBooksClosedThrough"), "mutation names recognised");
assert(!isMutationName("monthlyPnL") && !isMutationName("balanceSheet") && !isMutationName("loading"), "read values are not mutations");
const ctx = readFileSync(join(ROOT, "contexts/DataContext.tsx"), "utf8");
const iface = ctx.slice(ctx.indexOf("interface DataContextValue"), ctx.indexOf("const DataContext = createContext"));
const fnKeys = [...iface.matchAll(/^\s{2}([a-zA-Z]+)\??:\s*(?:<[^>]*>)?\(/gm)].map((m) => m[1]);
assert(fnKeys.length > 100, `found ${fnKeys.length} functions on the data context`);
const unguarded = fnKeys.filter((k) => !isMutationName(k));
assert(unguarded.length === 0, `every function on the data context is covered by the guard${unguarded.length ? " - NOT covered: " + unguarded.join(", ") : ""}`);
const wrapped = withReadOnly({ addSale: async () => "x", deleteSale: async () => "x", monthlyPnL: [1], cheap: () => 1 });
(async () => {
  for (const f of ["addSale", "deleteSale"] as const) {
    let msg = "";
    try { await (wrapped as any)[f](); } catch (e) { msg = (e as Error).message; }
    assert(msg === READ_ONLY_MESSAGE, `${f} is refused with the plain view-only message`);
  }
  assert((wrapped as any).monthlyPnL[0] === 1 && (wrapped as any).cheap() === 1, "reads pass through untouched");
})();
