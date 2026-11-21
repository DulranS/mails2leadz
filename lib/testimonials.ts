// Testimonials (v189b): a customer's own words, shown on the business's public enquiry page as social proof. Only a feedback entry the
// owner marks for display can be shown, and only when the score is high (8 or more) and the customer has agreed. Pure: no I/O.
export const TESTIMONIAL_MIN_SCORE = 8;
export const MAX_TESTIMONIAL_QUOTE = 300;
export const MAX_TESTIMONIAL_NAME = 40;
export const PUBLIC_TESTIMONIAL_LIMIT = 10;

export interface TestimonialRecord {
  approved: boolean;
  quote: string;
  displayName: string;
  approvedAt: number;
}

export function canFeature(score: number): boolean {
  return Number.isInteger(score) && score >= TESTIMONIAL_MIN_SCORE;
}

// First name and the first letter of the last name, e.g. "Amal Perera" -> "Amal P." A single name is kept as it is.
export function displayNameFrom(name: string): string {
  const parts = name.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, MAX_TESTIMONIAL_NAME);
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`.slice(0, MAX_TESTIMONIAL_NAME);
}

export function validateTestimonial(i: { score: number; displayName: string; quote: string; consent: boolean }): string | null {
  if (!canFeature(i.score)) return `Only feedback scored ${TESTIMONIAL_MIN_SCORE} or more can be shown on the website.`;
  if (!i.consent) return "Show a customer's words only once they have agreed to it. Tick the box to confirm.";
  const name = i.displayName.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > MAX_TESTIMONIAL_NAME) return `The name shown must be 2 to ${MAX_TESTIMONIAL_NAME} characters.`;
  const quote = i.quote.replace(/\s+/g, " ").trim();
  if (quote.length < 10 || quote.length > MAX_TESTIMONIAL_QUOTE) return `The words shown must be 10 to ${MAX_TESTIMONIAL_QUOTE} characters.`;
  return null;
}

// What the public page may show about one feedback entry: the chosen words and name only. Nothing about the score, the contact or the
// business's own records. Entries not approved for display return null.
export function publicTestimonial(t: TestimonialRecord | undefined): { quote: string; author: string; approvedAt: number } | null {
  if (!t || t.approved !== true || !t.quote || !t.displayName) return null;
  return { quote: t.quote, author: t.displayName, approvedAt: t.approvedAt };
}
