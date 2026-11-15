# Balancr ↔ AutoLeads: the contract, checked against Balancr v285

Checked against Balancr's own `SYNC.md`, its `app/api/v1/...` routes and `lib/types.ts` in the v285 release.

## Calls (all with the business's lead API key, `Authorization: Bearer …`)

| Call | Balancr returns | AutoLeads reads |
|---|---|---|
| `POST /api/v1/businesses/{id}/leads` | `{status, id}` (201 created, 200 duplicate or merged) | `id` (as `lead.id` or `id`) |
| `GET /api/v1/businesses/{id}/leads?since=…&limit=…` | `{leads, nextSince, count}`; each lead has `id`, `name`, `contact`, `stage`, `source`, `externalId`, `createdAt` | `leads`, `nextSince`, `contact`, `source` |
| `GET /api/v1/businesses/{id}/leads/item/{leadId}` | `{lead}` | `lead.stage` |
| `PATCH …/leads/item/{leadId}` with `{stage}` | `{lead}` | success only |
| `GET /api/v1/businesses/{id}/invoices/item/{invoiceId}` | `{invoice: {id, status, total, paid, dueDate}}`, status `paid`, `overdue` or `open` | `invoice.status` |

## Stages

Balancr: `new, contacted, qualified, follow_up, proposal_sent, won, lost`. AutoLeads uses the same seven (`BALANCR_STAGES`).

## Who sends what

- Stage change webhook: Balancr posts `{event: "lead.stage_changed", from, to, lead}` to the owner's webhook address, which is AutoLeads' `/api/balancr/webhook/{uid}?token=…`.
- `lead.contact` is free text: `phone · email`, or either one alone. AutoLeads splits it (`splitContact`).
- `lead.externalId` is `autoleads:<deal id>` for leads AutoLeads sent.

## Matching a Balancr lead to a deal (in this order)

1. The Balancr lead id stored on the deal when AutoLeads sent it (`balancrLeadId`).
2. The external id `autoleads:<deal id>`.
3. The contact: the e-mail, or the last nine digits of the phone.

## Still on Balancr's side

- Event-based sync is still listed as open in Balancr's changelog. The stage webhook and the daily sync both run; the daily sync is the fallback.
- Balancr does not create customers or sales from a won lead. The owner does that in Balancr.
