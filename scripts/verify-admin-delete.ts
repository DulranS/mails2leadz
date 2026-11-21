// Deleting a business (the admin delete route and the admin list button): only platform admins (the passcode) can call it; it refuses unless the business ID
// is repeated exactly; it removes only that business's tree; the admin list asks for the ID before it calls the route. Run: npx tsx scripts/verify-admin-delete.ts
import fs from "node:fs";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const route = read("app/api/admin/businesses/[businessId]/delete/route.ts");
ok(route.includes("await requireAdminPasscode(req)"), "the delete is for platform admins only: the admin passcode is checked first");
ok(route.includes("body?.confirm !== businessId") && route.includes("Type the business ID exactly"), "a delete is refused unless the business ID is repeated exactly");
ok(route.includes(`recursiveDelete(db.collection("users").doc(businessId))`), "only that business's tree is removed");
ok(!/recursiveDelete\(db\.collection\("users"\)\)|collection\("users"\)\.get|\.where\(/.test(route), "it never removes every business, or selects businesses to remove");
ok(route.includes("adminErrorResponse(err,"), "errors are answered with the admin error helper");
const page = read("app/admin/new-business/page.tsx");
ok(page.includes("async function deleteBusiness(") && page.includes("prompt(") && page.includes("typed.trim()"), "the admin list asks for the business ID before deleting");
ok(page.includes("onClick={() => deleteBusiness(b)}"), "the Delete button is on each business in the admin list");
ok(page.includes("/delete`, {") && page.includes("x-admin-passcode"), "the button calls the delete route with the admin passcode");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
