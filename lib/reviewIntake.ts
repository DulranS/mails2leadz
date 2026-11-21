// Online reviews (v181): reviews that arrive from outside (Google Business Profile, Facebook, a review site) through the lead API key,
// and are filed as customer feedback. Pure: no I/O. The caller passes the day.
//
// A review is a star rating from 1 to 5. Balancr's feedback scores run 0 to 10 (the NPS scale), so a star rating maps onto it as
// 1 star = 2, 2 = 4, 3 = 6, 4 = 8, 5 = 10. That mapping is the only conversion, and it is shown to the owner on the review.
// Nothing here replies to anyone; a low review raises an alert for the owner, who answers it on the platform itself.
import { isIsoDay } from "./operations";

export const MAX_REVIEW_COMMENT = 1000;

export function starsToScore(stars: number): number {
  return stars * 2;
}

// Low reviews are one or two stars: the ones worth an answer today.
export function isLowReview(score: number): boolean {
  return score <= 4;
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export interface ReviewInput {
  customerName: string;
  stars?: number;
  score: number; // always set once a review is accepted (stars are converted to it)
  comment?: string;
  source: string;
  receivedOn: string;
  contact?: string;
  externalId?: string;
}

// Checks and cleans one review. Give either stars (1 to 5) or a score (0 to 10). Errors are plain sentences.
export function cleanReview(body: Record<string, unknown>, today: string): { ok: true; value: ReviewInput } | { ok: false; error: string } {
  const customerName = clip(body.customerName, 120) || "Online reviewer";
  const hasStars = body.stars !== undefined && body.stars !== null && body.stars !== "";
  const hasScore = body.score !== undefined && body.score !== null && body.score !== "";
  let stars: number | undefined;
  let score: number | undefined;
  if (hasStars) {
    stars = Number(body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, error: "Stars must be a whole number from 1 to 5." };
    score = starsToScore(stars);
  } else if (hasScore) {
    score = Number(body.score);
    if (!Number.isInteger(score) || score < 0 || score > 10) return { ok: false, error: "The score must be a whole number from 0 to 10." };
  } else {
    return { ok: false, error: "Give the review's stars (1 to 5) or a score (0 to 10)." };
  }
  const receivedOn = clip(body.receivedOn, 10) || today;
  if (!isIsoDay(receivedOn)) return { ok: false, error: "The date the review was written is not a valid date." };
  return {
    ok: true,
    value: {
      customerName,
      ...(stars !== undefined ? { stars } : {}),
      score: score as number,
      comment: clip(body.comment, MAX_REVIEW_COMMENT) || undefined,
      source: clip(body.source, 60) || "Online review",
      receivedOn,
      contact: clip(body.contact, 200) || undefined,
      externalId: clip(body.externalId, 120) || undefined,
    } as ReviewInput,
  };
}

// The feedback record a review becomes. Stored in the same place as feedback entered by hand; the channel says where it came from.
export function reviewFeedbackDoc(r: ReviewInput, now: number): Record<string, unknown> {
  return {
    customerName: r.customerName,
    score: r.score,
    ...(r.comment ? { comment: r.comment } : {}),
    receivedOn: r.receivedOn,
    channel: "online_review",
    ...(r.contact ? { contact: r.contact } : {}),
    ...(r.externalId ? { externalId: r.externalId } : {}),
    ...(r.stars !== undefined ? { reviewStars: r.stars } : {}),
    reviewSource: r.source,
    followedUp: false,
    createdByName: `Review API (${r.source})`,
    createdAt: now,
    updatedAt: now,
  };
}
