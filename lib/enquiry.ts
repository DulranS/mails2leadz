// Website enquiries: the lead source they are filed under, and the one check on a business id from a public URL.
// Pure. The route (app/api/enquiry) does the Firestore reads.

// The lead source every website enquiry is filed under, so Marketing by channel can show what the website brings in.
export const WEBSITE_ENQUIRY_SOURCE = "Website enquiry";

// Firebase Auth uids (which are the business ids) are 28 letters and digits. Accept a little more, reject anything else,
// so a crafted id never reaches a Firestore path with slashes or dots in it.
const BUSINESS_ID_RE = /^[A-Za-z0-9]{10,128}$/;

export function isValidBusinessId(id: unknown): id is string {
  return typeof id === "string" && BUSINESS_ID_RE.test(id);
}
