// Empirical check for lib/trialRequestDedup.ts — the merge decision made
// when the same email submits /request-trial again while an earlier
// submission is still open (pending/contacted). Nothing here touches
// Firestore; app/api/trial-requests/route.ts owns finding the existing
// record and writing the result, this only checks what that result should
// be.
//
// Run: npx tsx scripts/verify-trial-request-dedup.ts

import { mergeFollowUpTrialRequest } from "../lib/trialRequestDedup";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}

// ---- still pending, no message either time --------------------------------
{
  const r = mergeFollowUpTrialRequest({ status: "pending" }, undefined);
  assert(r.status === "pending", "pending stays pending with no message on either submission");
  assert(r.message === undefined, "no message field invented out of nothing");
}

// ---- admin already made contact: resubmitting doesn't undo that -----------
{
  const r = mergeFollowUpTrialRequest({ status: "contacted" }, undefined);
  assert(r.status === "contacted", "a follow-up doesn't revert 'contacted' back to 'pending'");
}

// ---- identical resubmission (e.g. accidental double-click) doesn't --------
// ---- duplicate the message text -------------------------------------------
{
  const r = mergeFollowUpTrialRequest({ status: "pending", message: "Need this for my bakery" }, "Need this for my bakery");
  assert(r.message === undefined, "identical message text isn't re-appended to itself");
}

// ---- a blank follow-up message never erases a real earlier one ------------
{
  const r = mergeFollowUpTrialRequest({ status: "pending", message: "Need this for my bakery" }, undefined);
  assert(r.message === undefined, "caller keeps the prior message untouched when this update carries none");
}

// ---- genuinely new information gets appended, not lost or overwritten -----
{
  const r = mergeFollowUpTrialRequest(
    { status: "pending", message: "Need this for my bakery" },
    "Also have a second location now"
  );
  assert(
    r.message === "Need this for my bakery\n\n— follow-up —\nAlso have a second location now",
    "new message is appended to the old one, not replacing it"
  );
}

// ---- first-ever message on what had none before still gets recorded -------
{
  const r = mergeFollowUpTrialRequest({ status: "pending" }, "Actually, a message now");
  assert(r.message === undefined, "with no prior message to append to, caller's `fields` carries the new one instead");
}

if (process.exitCode === 1) {
  console.log("\nFAIL — see above.");
} else {
  console.log("\nALL CHECKS PASSED");
}
