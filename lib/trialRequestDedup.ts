// Decides what happens to an *existing* open (pending/contacted) trial
// request when the same email submits the form again. See
// app/api/trial-requests/route.ts for how this fits into the request: it
// only runs once an open match has already been found, so this function is
// purely "what should the merged record look like", kept separate from the
// Firestore read/write around it so it can be tested without a database.
import type { TrialRequest } from "./types";

export interface FollowUpMerge {
  status: TrialRequest["status"];
  message?: string;
}

// `status` stays "contacted" once the admin has made contact — a visitor
// resubmitting hasn't undone that conversation, it's just a reason to look
// again soon (the caller bumps createdAt for that). Anything still "pending"
// stays "pending". `message` concatenates only when the new text actually
// says something the old one didn't: identical resubmissions (someone
// hitting submit twice on the same page load) don't produce a duplicated
// wall of text, and a blank follow-up message never erases a real one from
// the first submission.
export function mergeFollowUpTrialRequest(
  prior: Pick<TrialRequest, "status" | "message">,
  incomingMessage: string | undefined
): FollowUpMerge {
  const status: TrialRequest["status"] = prior.status === "contacted" ? "contacted" : "pending";
  if (incomingMessage && prior.message && incomingMessage !== prior.message) {
    return { status, message: `${prior.message}\n\n— follow-up —\n${incomingMessage}` };
  }
  return { status };
}
