// Second signer on supplier payments (v283). A supplier payment above the owner's limit is not posted straight away: it becomes a request, and a different person
// (an owner, or a manager within their limit) must approve it before it is recorded. The person who recorded it can never approve it. Pure.
export function paymentRoute(amount: number, threshold: number | undefined): "record" | "second_signer" {
  if (threshold === undefined || !(threshold > 0)) return "record";
  return amount > threshold ? "second_signer" : "record";
}
export function canApprovePayment(requesterUid: string | undefined, approverUid: string | undefined): boolean {
  return !!approverUid && approverUid !== requesterUid;
}
