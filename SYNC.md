# Balancr ↔ AutoLeads: how the two stay in step

Two apps, one customer. **Balancr** is the book of record for money: sales, invoices, payments, stock and costs. **AutoLeads** is the sales engine:
leads, outreach, replies and the deal pipeline. Each keeps the decisions it owns, and they agree on the rest.

## Who decides what

| Thing | Owned by | How the other side learns it |
|---|---|---|
| Outreach stages (new, contacted, qualified, follow-up, proposal sent) | AutoLeads | Pushed to Balancr when a deal moves on in AutoLeads |
| Won and lost | Balancr | When Balancr marks a lead won or lost, the deal follows in AutoLeads |
| Invoice paid, overdue or open | Balancr | Read by AutoLeads from Balancr's invoice status |
| Inbound leads (web, forms, Zapier/Make/n8n) | Balancr | Pulled into AutoLeads' Lead Inbox |
| Customers, sales, costs, stock | Balancr | Not copied; AutoLeads reads only what it needs |

## The calls

Every call uses the business's **lead API key** from Balancr's Integrations page (`Authorization: Bearer …`).

- `POST /api/v1/businesses/{id}/leads`: AutoLeads sends a deal as a lead. A repeat is safe (one lead per external id). Returns the lead id.
- `GET /api/v1/businesses/{id}/leads?since=…`: AutoLeads pulls inbound leads it has not yet seen.
- `GET /api/v1/businesses/{id}/leads/item/{leadId}`: AutoLeads reads one lead's current stage.
- `PATCH /api/v1/businesses/{id}/leads/item/{leadId}` with `{ "stage": "…" }`: AutoLeads moves a lead's stage. Only real lead stages are accepted.
- `GET /api/v1/businesses/{id}/invoices/item/{invoiceId}`: AutoLeads reads an invoice's status: `paid`, `overdue` or `open`. Read only.

## The schedule

AutoLeads runs `/api/cron/balancr-sync` once a day. It pulls new inbound leads, reconciles each linked deal's stage with its Balancr lead, and checks open
invoices that were sent to Balancr. Each step only writes what changed, so running it more often is safe.

## What it does not do

- Balancr does not create a customer or a sale when a lead is won here. The owner does that in Balancr.
- AutoLeads does not change an invoice, a payment or a price. It only reads the invoice status.
- Nothing is sent to a prospect by either app because of the sync.
- The sync is one account at a time: each business connects its own Balancr under Integrations.
