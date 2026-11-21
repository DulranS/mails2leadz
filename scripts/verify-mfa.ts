// Two-step sign-in (v319): the pure helpers (lib/mfa.ts), the Account page card, and its mount on the settings Account tab.
import fs from "node:fs";
import path from "node:path";
import { isValidOtp, mfaErrorMessage, mfaStatusLine, mfaFactorName, MFA_FACTOR_NAME } from "../lib/mfa";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};
const root = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

ok(isValidOtp("123456") && isValidOtp(" 654321 "), "a six-digit code is accepted (spaces trimmed)");
ok(!isValidOtp("12345") && !isValidOtp("1234567") && !isValidOtp("12a456") && !isValidOtp(""), "short, long, or non-digit codes are refused");
ok(mfaErrorMessage("auth/operation-not-allowed").includes("Firebase console"), "the operator-side case says what to switch on");
ok(!mfaErrorMessage("auth/operation-not-allowed").includes("auth/"), "the raw Firebase code is never shown");
ok(mfaErrorMessage("auth/requires-recent-login").startsWith("Sign in again"), "a stale sign-in asks the person to sign in again");
ok(mfaErrorMessage("auth/invalid-verification-code").includes("wrong or has expired"), "a wrong code says so");
ok(mfaErrorMessage(undefined).length > 0 && mfaErrorMessage("auth/something-new").startsWith("Two-step sign-in couldn't"), "an unknown error gets a plain fallback");
ok(mfaStatusLine([]).includes("off"), "with no factor the card says it is off");
ok(mfaStatusLine([{ displayName: null, enrollmentTime: "2026-11-01T10:00:00Z" }]).includes(MFA_FACTOR_NAME), "an unnamed factor shows the default name");
ok(mfaFactorName({ displayName: "Phone" }) === "Phone" && mfaFactorName({}) === MFA_FACTOR_NAME, "a factor shows its own name, else the default");

const card = read("components/MfaCard.tsx");
ok(card.includes("TotpMultiFactorGenerator.generateSecret(") && card.includes("assertionForEnrollment(") && card.includes("multiFactor(user).enroll("), "the card uses Firebase's TOTP enrolment (generate, assert, enrol)");
ok(card.includes("multiFactor(user).unenroll(") && card.includes("window.confirm("), "removing a factor asks first and then unenrols");
ok(!/secretKey.*console\.|console\.\w+\([^)]*secret/.test(card), "the secret key is never logged");
ok(card.includes("if (!user) return null"), "the card shows nothing when signed out");
const settings = read("app/settings/page.tsx");
ok(settings.includes('{tab === "account" && <MfaCard />}') && settings.includes('import MfaCard from "@/components/MfaCard"'), "the card is mounted on the settings Account tab only");

console.log(failed === 0 ? "verify-mfa: all checks passed" : `verify-mfa: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
