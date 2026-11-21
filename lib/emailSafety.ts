// Anything a stranger typed that we are about to print inside an email WE send, from OUR domain, to
// an address that has not yet proved it is theirs.
//
// The trial form lets a visitor enter any name and any Gmail address. The confirmation email greets
// "Hi <first word of name>". Without a check, a troll types the name "http://evil.example/claim-prize"
// (no spaces, so it is all one "first word") and a stranger's inbox receives a message from our
// verified sending domain that says "Hi http://evil.example/claim-prize," — our reputation lending
// credibility to their link. So only something that looks like a real first name is ever echoed back;
// anything else becomes "there". Letters in any script (Sinhala, Tamil, Latin...) are fine.
//
// Pure — scripts/verify-email-abuse.ts proves it offline.

const NAME_TOKEN = /^[\p{L}\p{M}][\p{L}\p{M}'’-]{0,29}$/u;

export function safeFirstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  // Letters, combining marks, apostrophes and hyphens only: no dots (so "evil.com" can never pass), no
  // digits, no "@", ":" or "/" — nothing that can form a link or an address.
  return NAME_TOKEN.test(first) ? first : "there";
}
