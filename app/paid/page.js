// app/paid/page.js - where Stripe sends a customer after an invoice payment. Nothing here changes the invoice:
// the payments webhook does that, so this page is correct whether the payment succeeded or was cancelled.
export default function PaidPage() {
  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22 }}>Thank you</h1>
      <p>If you paid, the invoice is marked paid within a minute, and Stripe emails you the receipt. If you cancelled, nothing was charged.</p>
      <p>Questions about the invoice? Reply to the email it came in.</p>
    </main>
  );
}
