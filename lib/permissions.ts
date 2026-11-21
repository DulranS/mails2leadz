import type { Role } from "./types";

// The single source of truth for "what can this role do" on the client side
// — used to decide what to show/hide/disable in the UI. This is a UX layer,
// not the security boundary: the real enforcement lives in firestore.rules,
// which encode the same matrix at the database level (see the comment block
// at the top of firestore.rules). If the two ever disagree, the rules win
// and the person just sees a failed write with a Firestore permission
// error — this file existing keeps that from being the normal experience.
//
// Deliberately coarse: Owner and Manager are treated identically almost
// everywhere except delete, team management, settings and payroll — the
// hard line in this app is Staff vs. everyone else, because Staff is the
// role handed to someone the business hasn't built years of trust with yet.

export type Permission =
  | "view:dashboard"
  | "view:reports" // profitability, statements, balance sheet
  | "view:payroll" // employees page (pay rates)
  | "view:settings"
  | "view:team"
  | "view:auditLog"
  | "view:products" // full product records, including cost prices
  | "view:catalog" // cost-stripped product list (name/price only)
  | "manage:products" // create/edit/delete products, purchases, purchase orders
  | "create:giftCard" // sell a gift card at the counter: create only, staff cannot read balances or use or refund a card
  | "manage:sales" // create/edit sales
  | "delete:sales"
  | "manage:expenses"
  | "delete:records" // purchases, expenses, capital entries, loans, purchase orders
  | "manage:loans"
  | "manage:budgets" // set/edit monthly revenue & expense targets
  | "manage:employees"
  | "manage:capital"
  | "manage:tax" // record/edit a payment made to the tax authority against Sales Tax Payable
  | "manage:team" // invite/deactivate/change roles
  | "manage:settings"
  | "manage:notifications" // create/read/dismiss notifications
  | "create:sale" // the one thing every role can do
  | "create:request" // ask for a spend, an expense claim or a shift change (every role that works in the business)
  | "manage:requests" // approve, decline and mark reimbursed (Owner and Manager; a Manager only within the owner's limit)
  | "manage:procedures" // write and edit procedures (Owner and Manager)
  | "ack:procedure" // confirm you have read the current version of a procedure (Owner, Manager, Staff)
  | "manage:operations" // compliance, KPIs, reviews, and deciding incidents (Owner and Manager)
  | "create:incident" // report an incident or near miss (every role that works in the business)
  | "log:maintenance" // record a service done (Owner, Manager, Staff)
  | "log:quality" // record a quality check (Owner, Manager, Staff)
  | "log:correspondence" // log a letter, email, call or message (Owner, Manager, Staff)
  | "log:demand" // add to the waitlist or log a backorder, and move them on (Owner, Manager, Staff)
  | "log:handover" // write a shift handover (Owner, Manager, Staff)
  | "log:leadContact" // record a contact attempt on a lead (staff, only on leads they created or are assigned); changes no stage or value
  | "create:cashCount"
  | "create:tillPayout" // write down cash taken out of the till for a small spend (every role that works in the business)
  | "create:receivablePayment"
  | "view:receivables"
  | "create:timeEntry" // clock in/out for yourself
  | "manage:timeEntries" // log time on someone else's behalf, edit/delete any entry
  | "view:allTimeEntries" // see everyone's hours, not just your own
  | "manage:fixedAssets" // create/edit/delete fixed assets
  | "manage:investments" // owner-only: record securities, trades, income and prices
  | "manage:projects" // create/edit/delete projects and their cost segments; tag purchases/expenses/sales to a project
  | "view:customers"
  | "create:customer" // add a new customer directory entry — every role can do this, same as create:sale
  | "manage:customers" // edit an existing customer's contact info/notes
  | "manage:suppliers" // add/edit/delete a supplier directory entry — Owner/Manager only, unlike customers: Purchases and Bills (the only things a supplier name ever shows up on) are already Owner/Manager-only, so Staff has no use for this either
  | "correct:ledgerEntries" // owner-only: edit/delete a saved cash count or receivable/payable payment to fix a data-entry mistake
  | "manage:journal" // owner-only: weekly lessons-learned reflection entries
  | "manage:opportunities" // owner-only: score/rank hypothetical ventures
  | "manage:reconciliation" // add/import/match/delete bank statement lines
  | "manage:writeOffs" // record/correct/delete a bad-debt write-off against a credit sale
  | "manage:collections" // log a call/message/visit to someone who owes money, with their promise and next follow-up
  | "manage:playbook" // write and edit procedures and contract dates (Owner/Manager); only the Owner deletes
  | "manage:support" // open, edit and resolve customer support cases (Owner/Manager); only the Owner deletes
  | "manage:tasks" // hand work to team members or outside freelancers, edit it, mark it done (Owner/Manager)
  | "manage:bookings" // book, move and mark appointments and reservations (Owner, Manager and Staff, the front desk)
  | "manage:rentals" // rent things out and record their return, deposits and damage (Owner and Manager; Accountant reads)
  | "manage:shipments" // record shipments, their stages and proof of delivery (Owner, Manager and Staff, the people receiving goods)
  | "manage:rota"; // set and change the staff rota: who works which shift (Owner and Manager; everyone on the team can read it)

const OWNER_MANAGER_SHARED: Permission[] = [
  "view:dashboard",
  "log:quality",
  "log:correspondence",
  "log:demand",
  "log:handover",
  "log:leadContact",
  "create:request",
  "manage:requests",
  "manage:procedures",
  "ack:procedure",
  "manage:operations",
  "create:incident",
  "log:maintenance",
  "view:reports",
  "view:products",
  "manage:products",
  "manage:sales",
  "manage:expenses",
  "manage:loans",
  "manage:budgets",
  "manage:capital",
  "manage:tax",
  "manage:notifications",
  "create:sale",
  "create:cashCount",
  "create:tillPayout",
  "create:receivablePayment",
  "view:receivables",
  "create:timeEntry",
  "manage:timeEntries",
  "view:allTimeEntries",
  "manage:fixedAssets",
  "manage:projects",
  "view:customers",
  "create:customer",
  "manage:customers",
  "manage:suppliers",
  "manage:reconciliation",
  "manage:writeOffs",
  "manage:collections",
  "manage:playbook",
  "manage:support",
  "manage:tasks",
  "manage:bookings",
  "manage:shipments",
  "manage:rentals",
  "manage:rota",
];

const MATRIX: Record<Role, Permission[]> = {
  owner: [
    ...OWNER_MANAGER_SHARED,
    "view:payroll",
    "view:settings",
    "view:team",
    "view:auditLog",
    "delete:sales",
    "delete:records",
    "correct:ledgerEntries",
    "manage:employees",
    "manage:team",
    "manage:settings",
    "manage:journal",
    "manage:opportunities",
    "manage:investments",
  ],
  manager: [...OWNER_MANAGER_SHARED],
  // Read-only books access. Deliberately holds NO "manage:*", "create:*", "delete:*" or
  // "correct:*" permission - the same list that gates every write in DataContext - so even a
  // code path that forgot to hide a button is refused by requirePermission, and firestore.rules
  // refuse the write at the database. Only the view permissions the finance pages check.
  accountant: [
    "view:dashboard",
    "view:reports",
    "view:products",
    "view:customers",
    "view:receivables",
    "view:allTimeEntries",
  ],
  staff: [
    "view:catalog",
    "create:sale",
    "log:leadContact",
    "create:request",
    "log:quality",
    "log:correspondence",
    "log:demand",
    "log:handover",
    "ack:procedure",
    "create:incident",
    "log:maintenance",
    "create:cashCount",
    "create:tillPayout",
    "create:receivablePayment",
    "create:timeEntry",
    "view:customers",
    "create:customer",
    "create:giftCard",
    "manage:bookings",
    "manage:shipments",
  ],
};

// The shared public demo ("Try it now") is one business every stranger signs in to. Visitors can
// look around and log sales, expenses and so on — that IS the demo — but not do the things that
// spoil it for the next person: deleting or "correcting" records, editing settings or the team, or
// payroll. lib/guardrails.ts and firestore.rules (isPublicDemo) enforce the deletes and the
// settings/team writes at the database; this list is what hides the buttons so a visitor isn't
// offered things that will fail.
export const DEMO_BLOCKED_PERMISSIONS: readonly Permission[] = [
  "delete:sales",
  "delete:records",
  "correct:ledgerEntries",
  "manage:team",
  "manage:settings",
  "manage:employees",
];

// Module-level on purpose: can() is called from ~30 places, and threading a flag through every one
// would be 30 chances to miss one. AuthContext sets it once per auth/account change.
let demoRestricted = false;
export function setDemoRestrictions(on: boolean): void {
  demoRestricted = on;
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (demoRestricted && DEMO_BLOCKED_PERMISSIONS.includes(permission)) return false;
  // `?.` so an unrecognised role string on a member doc (e.g. a newer role written by a newer
  // deployment) means "no permissions", never a crash.
  return MATRIX[role]?.includes(permission) ?? false;
}

export function roleLabel(role: Role): string {
  return { owner: "Owner", manager: "Manager", staff: "Staff", accountant: "Accountant (view only)" }[role] ?? role;
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full access. Only the owner can manage the team, change settings, view the audit log, or delete records.",
  manager: "Can run day-to-day operations — sales, stock, expenses, orders — but can't delete records, see payroll, manage the team, or change settings.",
  staff: "Can log sales, record customer payments, count cash at the end of a shift, and clock in/out on jobs. Can't edit or delete anything once saved, and can't see cost prices, other reports, or payroll.",
  accountant: "For your bookkeeper or accountant. Can view and print the books - sales, purchases, bills, money owed, profit, balance sheet - but can't change anything, and can't see payroll, the team, settings or the AI assistant. Remove access any time.",
};
