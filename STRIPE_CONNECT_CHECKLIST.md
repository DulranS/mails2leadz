# Stripe Connect: checklist before you switch it on

Stripe Connect is built behind the "Take card payments through Stripe Connect" switch, which is OFF by default.
Until it is on, card payments keep using the owner's own Stripe keys exactly as before.

## 1. Stripe (once, by the operator)
- Turn on Connect in your Stripe platform account, and choose Standard accounts.
- Under Connect settings, add the app's return address as a redirect URI: `<your base address>/api/connect/callback`.
- Copy the platform's client ID (ca_...) and secret key (sk_...) into the server settings:
  `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_PLATFORM_SECRET_KEY`.

## 2. Platform webhook (once, by the operator)
- Add a webhook endpoint at `<your base address>/api/payments/webhook`.
- Tick "Listen to events on Connected accounts" and include `checkout.session.completed`.
- Copy its signing secret into `STRIPE_PLATFORM_WEBHOOK_SECRET`.

## 3. Test mode first (do this before any real money)
- Use Stripe's test keys and a test account. Connect one test owner from Integrations ("Connect Stripe").
- Turn on "Take card payments through Stripe Connect" for that owner in Account.
- Create a test invoice, open its pay link, and pay with a test card (4242 4242 4242 4242).
- Check the invoice shows as paid, the loyalty points (if any) were added, and the payment appears in the connected account's Stripe dashboard.
- Pay the same invoice again through the same link, and check it is not counted twice.
- Pay an invoice that is already partly paid, and check the balance is right.

## 4. Live
- Repeat step 3 with one live invoice of small value, then refund it in Stripe.
- Only then turn the switch on for other owners.

## Rolling back
- Turn the switch off in Account. Card payments go back to the owner's own keys at once.
- Payments already taken through the connected account stay where Stripe put them; refunds are made in the connected account's Stripe dashboard.

## What this does not change
- Refunds, disputes and payouts are handled in Stripe, as before.
- A payment that does not fit the invoice's balance is flagged for review, not forced through.
