import { resolveAccess } from "../lib/accountAccess";
import { chooseAiKey } from "../lib/aiKeyRule";

let fails = 0;
const check = (name: string, ok: boolean) => { if (!ok) { fails++; console.log("FAIL:", name); } };
const past = "2020-01-01";

// Billing: an admin account is never locked by trial or renewal; suspension still applies.
check("expired trial locks a normal account", resolveAccess({ trialEndsAt: past }).locked === true);
check("admin account not locked by expired trial", resolveAccess({ trialEndsAt: past, adminAccount: true }).locked === false);
check("admin account not locked by overdue renewal", resolveAccess({ autoLockOverdue: true, renewalDueDate: past, adminAccount: true }).locked === false);
check("suspension still locks an admin account", resolveAccess({ suspended: true, adminAccount: true }).locked === true);
check("missing account data does not lock", resolveAccess(null).locked === false);

// AI key: only listed or admin accounts get the operator key; a saved own key still wins.
const none = new Set<string>();
check("unlisted account gets no operator key", chooseAiKey({ businessId: "demo", operatorIds: none, operatorKey: "sk-op" }) === null);
check("admin account gets the operator key", chooseAiKey({ businessId: "x", adminAccount: true, operatorIds: none, operatorKey: "sk-op" })?.source === "operator");
check("own key still wins for admin account", chooseAiKey({ businessId: "x", adminAccount: true, ownKey: "sk-own", enabled: true, operatorIds: none, operatorKey: "sk-op" })?.source === "own");
check("listed business still gets the operator key", chooseAiKey({ businessId: "y", operatorIds: new Set(["y"]), operatorKey: "sk-op" })?.source === "operator");

console.log(fails === 0 ? "Admin accounts and operator key: all checks passed" : `Admin accounts: ${fails} failed`);
process.exit(fails ? 1 : 0);
