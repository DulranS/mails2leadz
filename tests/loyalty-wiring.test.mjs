// Loyalty points are wired end to end: redeemed on the invoice form, returned when an invoice is voided or cancelled, and earned on
// payments recorded by hand (capped at the invoice amount). Checked on the source: the routes need Firebase to run here.
import fs from 'node:fs'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const root = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(root + p, 'utf8');

const loyalty = read('lib/server/loyalty.js');
assert.match(loyalty, /export async function restorePoints\(db, uid, email, points\)/);
assert.match(loyalty, /increment\(n\)/, 'restore adds points atomically');

const create = read('app/api/invoices/create/route.js');
assert.match(create, /r\.write\.loyaltyPointsUsed = loyaltyUse\?\.ok \? loyaltyUse\.pointsUsed : 0/, 'create remembers the points used');

const cancel = read('app/api/invoices/cancel/route.js');
assert.match(cancel, /pointsUsed: Number\(inv\.loyaltyPointsUsed\) \|\| 0/);
assert.match(cancel, /restorePoints\(db, uid, result\.email, result\.pointsUsed\)/, 'cancel gives points back');

const voidR = read('app/api/invoices/void/route.js');
assert.match(voidR, /identify\(request, body\?\.userId\)/); assert.match(voidR, /guardTenant\(db, uid\)/);
assert.match(voidR, /snap\.data\(\)\.userId !== uid/, 'owner check');
assert.match(voidR, /status === 'paid'\) return json/, 'paid refused');
assert.match(voidR, /Number\(inv\.amountPaid\) > 0\) return json/, 'part-paid refused');
assert.match(voidR, /restorePoints\(db, uid, inv\.email, pts\)/, 'void gives points back');

const earn = read('app/api/loyalty/earn/route.js');
assert.match(earn, /identify\(request, body\?\.userId\)/); assert.match(earn, /guardTenant\(db, uid\)/);
assert.match(earn, /snap\.data\(\)\.userId !== uid/, 'owner check');
assert.match(earn, /soFar \+ amount > \(Number\(inv\.amount\) \|\| 0\) \+ 0\.005/, 'cap at the invoice amount');
const hook = read('app/api/payments/webhook/route.js');
assert.match(hook, /loyaltyEarnedAmount: Math\.round\(\(\(Number\(invoice\.loyaltyEarnedAmount\) \|\| 0\) \+ gotBase\)/, 'card payments count toward the cap');
assert.match(earn, /earnLoyalty\(db, uid, \{ email: inv\.email \}, amount\)/);

const billing = read('app/billing/page.js');
assert.match(billing, /redeemPoints: form\.redeemPoints, saleLines/, 'form sends points to use');
assert.match(billing, /Points to use \(100 points = 1 unit off\)/, 'points field on the form');
assert.match(billing, /fetch\(`\/api\/loyalty\?email=/, 'balance read for the customer');
assert.match(billing, /fetch\("\/api\/invoices\/void"/, 'void goes through the server');
assert.match(billing, /earnFor\(inv\.id, balanceOf\(inv\)\)/, 'mark paid earns');
assert.match(billing, /earnFor\(inv\.id, Math\.round\(Number\(raw\) \* 100\) \/ 100\)/, 'part payment earns');
assert.doesNotMatch(billing, /patchInvoice\(inv, \{ status: "void" \}/, 'no client-side void left');

// Every changed file must at least parse (TypeScript reads JSX here). Skipped when the tool is not installed.
let ts = null;
try { ts = createRequire(import.meta.url)('/opt/npm-tools/node_modules/typescript'); } catch { ts = null; }
if (ts) {
  for (const p of ['app/billing/page.js', 'app/api/loyalty/earn/route.js', 'app/api/invoices/void/route.js', 'app/api/invoices/cancel/route.js', 'app/api/invoices/create/route.js', 'lib/server/loyalty.js', 'app/api/payments/webhook/route.js']) {
    const out = ts.transpileModule(read(p), { reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, allowJs: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } });
    assert.equal((out.diagnostics || []).length, 0, `${p} does not parse`);
  }
  console.log('syntax ok (6 files)');
} else console.log('syntax check skipped (typescript not installed here)');
console.log('loyalty wiring ok');
