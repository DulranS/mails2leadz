// Set password (pass 305): admin-only route, minimum length, Admin SDK update, and the row on the Manage card.
import fs from "fs";
const route = fs.readFileSync("app/api/admin/businesses/[businessId]/set-password/route.ts", "utf8");
const page = fs.readFileSync("app/admin/new-business/page.tsx", "utf8");
let failed = 0;
const ok = (c: boolean, w: string) => { if (!c) failed++; console.log(`${c ? "ok  " : "FAIL"} - ${w}`); };
ok(/requireAdminPasscode\(req\)/.test(route), "the route checks the admin passcode first");
ok(/MIN_LENGTH = 8/.test(route) && /password\.length < MIN_LENGTH/.test(route), "passwords shorter than 8 characters are refused");
ok(/getAdminAuth\(\)\.updateUser\(businessId, \{ password \}\)/.test(route), "the password is set through the Admin SDK");
ok(!/console\.(log|error|warn)\([^)]*password/.test(route), "the password is never logged");
ok(/<SetPasswordRow /.test(page) && /function SetPasswordRow/.test(page), "the Manage card shows the password row");
console.log(failed ? `${failed} failed` : "Set password: all checks passed");
process.exit(failed ? 1 : 0);
