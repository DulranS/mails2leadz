// Integrations: the places where outside services plug in (banks, card payments, email, WhatsApp, SMS, live exchange rates,
// accounting software, calendars, an online shop, maps). Each one is a catalogue entry with the key fields it needs. The owner
// fills the keys in on the Integrations page; nothing is sent anywhere until a service is switched on and its code path is used.
//
// Pure: no I/O. Keys are stored in an owner-only document per service (firestore.rules), never in the backup, and are shown back
// only as a masked tail. See scripts/verify-integrations.ts.

export type IntegrationCategory = "banking" | "payments" | "messaging" | "accounting" | "sales" | "data" | "ai" | "documents" | "reputation";

export interface IntegrationField {
  key: string;
  label: string;
  secret: boolean; // secret values are masked after saving and never shown back in full
  required: boolean; // a service is "ready" only when its required fields are filled in
  placeholder?: string;
}

export interface IntegrationProvider {
  id: string;
  name: string;
  category: IntegrationCategory;
  purpose: string; // what it would do for the business, in plain words
  fields: IntegrationField[];
  planned?: boolean; // a key slot with no provider chosen yet: the key is stored, and no code path uses it until one is
}

export const MAX_INTEGRATION_VALUE = 300;

export const INTEGRATION_CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  banking: "Banking",
  payments: "Card payments",
  messaging: "Messages",
  accounting: "Accounting",
  sales: "Online sales",
  data: "Data",
  ai: "AI assistant",
  documents: "Documents and signing",
  reputation: "Reviews",
};

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    // Strategy (Nov 2026): each business takes card payments into its own PayHere merchant account. Balancr never holds the money.
    id: "payhere",
    name: "PayHere (card payments)",
    category: "payments",
    purpose: "Lets customers pay their invoices by card, straight into your own PayHere merchant account. Balancr does not hold the money. Use your merchant ID and secret from PayHere, and switch it on once tested.",
    fields: [
      { key: "merchantId", label: "PayHere merchant ID", secret: false, required: true },
      { key: "merchantSecret", label: "PayHere merchant secret", secret: true, required: true },
      { key: "mode", label: "Mode (sandbox or live)", secret: false, required: false, placeholder: "sandbox" },
    ],
  },
  {
    // Strategy (Nov 2026): SaaS accounts run the AI Assistant on their own key. See lib/aiKey.ts for the rule.
    id: "ai_assistant",
    name: "AI assistant (DeepSeek)",
    category: "ai",
    purpose: "Runs the AI Assistant on your own DeepSeek account, so its usage is billed to you. Without it the assistant stays off for this business.",
    fields: [{ key: "apiKey", label: "DeepSeek API key", secret: true, required: true, placeholder: "sk-..." }],
  },
  {
    id: "email",
    name: "Email sending",
    category: "messaging",
    purpose: "Send invoices, statements and reminders from your own address instead of copying them into an email by hand.",
    fields: [
      { key: "fromAddress", label: "From address", secret: false, required: true, placeholder: "billing@yourbusiness.com" },
      { key: "apiKey", label: "Email service API key", secret: true, required: true },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "messaging",
    purpose: "Send the message links you already draft straight to customers' WhatsApp.",
    fields: [
      { key: "phoneNumberId", label: "Phone number ID", secret: false, required: true },
      { key: "accessToken", label: "Access token", secret: true, required: true },
    ],
  },
  {
    id: "sms",
    name: "SMS",
    category: "messaging",
    purpose: "Send reminders by text message where WhatsApp is not used.",
    fields: [
      { key: "userId", label: "Notify.lk user ID", secret: false, required: true },
      { key: "senderId", label: "Sender name", secret: false, required: true },
      { key: "apiKey", label: "SMS service API key", secret: true, required: true },
    ],
  },
  {
    // v176b: inbound leads. Zapier, Make, n8n, a form tool or a Meta lead form (through Zapier) posts a lead in; a tool can also
    // read new leads back. One key per business; Generate makes one, paste it into the tool, and regenerate to replace it.
    id: "lead_api",
    name: "Lead API (Zapier, Make, n8n, forms)",
    category: "sales",
    purpose: "Lets Zapier, Make, n8n or a form tool send new leads straight into Leads, and read new leads back. Generate a key, paste it into the tool as a bearer token, and point the tool at your leads address (shown on this page). Duplicates are merged, not filed twice. Nothing is sent to anyone.",
    fields: [{ key: "apiKey", label: "Lead API key", secret: true, required: true, placeholder: "Press Generate, or paste a key" }],
  },
  {
    // v319: the AutoLeads user who owns this business's leads. Balancr signs an invoice.paid event to AutoLeads with the server's shared secret.
    id: "autoleads",
    name: "AutoLeads (paid invoices)",
    category: "sales",
    purpose: "Tells AutoLeads when an invoice is fully paid, so the deal can close there. Paste the AutoLeads user ID of the owner of this business. The shared secret stays on the server.",
    fields: [{ key: "ownerUid", label: "AutoLeads user ID", secret: false, required: true, placeholder: "The user ID shown in AutoLeads" }],
  },
  {
    id: "royalty_head",
    name: "Royalty to head office",
    category: "accounting",
    purpose: "Send this site's monthly royalty statement to the head office that receives it. Paste the head office's business ID and the key it gave you.",
    fields: [
      { key: "headBusinessId", label: "Head office business ID", secret: false, required: true },
      { key: "apiKey", label: "Key from head office", secret: true, required: true },
    ],
  },
  {
    id: "esign",
    planned: true,
    name: "E-signature",
    category: "documents",
    purpose: "Have customers and staff sign contracts and quotes electronically. Paste the key from the signing provider you use; the signed copy is then kept with the contract record.",
    fields: [
      { key: "provider", label: "Provider name (for your records)", secret: false, required: true, placeholder: "e.g. DocuSign, Adobe Sign" },
      { key: "apiKey", label: "API key from the provider", secret: true, required: true },
    ],
  },
  {
    id: "review_posting",
    planned: true,
    name: "Review replies",
    category: "reputation",
    purpose: "Post replies to customer reviews from Balancr. Paste the key for the review platform you use; replies are still drafted and approved by you first.",
    fields: [
      { key: "platform", label: "Review platform (for your records)", secret: false, required: true, placeholder: "e.g. Google Business Profile" },
      { key: "apiKey", label: "API key from the platform", secret: true, required: true },
    ],
  },
  {
    id: "market_prices",
    planned: true,
    name: "Market prices",
    category: "data",
    purpose: "Fill the market rate on products and services from a price source you choose. Nothing changes a price; the figure is shown beside yours for you to decide.",
    fields: [
      { key: "source", label: "Price source (for your records)", secret: false, required: true, placeholder: "e.g. a supplier's price list" },
      { key: "apiKey", label: "API key for the source", secret: true, required: false },
    ],
  },
  {
    id: "distance_routing",
    planned: true,
    name: "Distance routing",
    category: "data",
    purpose: "Order delivery stops by distance rather than by address text. Paste the maps key; each customer address is then located once.",
    fields: [
      { key: "provider", label: "Maps provider (for your records)", secret: false, required: true, placeholder: "e.g. Google Maps" },
      { key: "apiKey", label: "Maps API key", secret: true, required: true },
    ],
  },
];

// A saved secret is stored as this prefix plus the sealed value (lib/secretBox.ts). The page only needs to know the prefix.
export const SEALED_VALUE_PREFIX = "enc:v1:";
export const isEncryptedValue = (v: string | undefined): boolean => !!v && v.startsWith(SEALED_VALUE_PREFIX);

export type IntegrationStatus = "not_set_up" | "partly_set_up" | "ready" | "off";

export interface SavedIntegration {
  enabled?: boolean;
  values?: Record<string, string>;
  hints?: Record<string, string>; // the last four characters of each saved secret (lib/secretBox.ts); the only part the page shows
  // The result of the last "Test connection" (written by the server, cleared when the keys are saved again).
  lastTest?: { ok: boolean; message: string; at: number };
}

export function integrationFor(id: string): IntegrationProvider | undefined {
  return INTEGRATION_PROVIDERS.find((p) => p.id === id);
}

// Keeps only the fields a service knows about, trims them, drops blanks (so clearing a field removes it) and caps their length.
export function cleanIntegrationValues(provider: IntegrationProvider, input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of provider.fields) {
    const raw = input[f.key];
    if (typeof raw !== "string") continue;
    const v = raw.trim().slice(0, MAX_INTEGRATION_VALUE);
    if (v) out[f.key] = v;
  }
  return out;
}

export function integrationStatus(provider: IntegrationProvider, saved: SavedIntegration | undefined): IntegrationStatus {
  const values = saved?.values ?? {};
  const required = provider.fields.filter((f) => f.required);
  const filled = required.filter((f) => (values[f.key] ?? "").length > 0).length;
  if (filled === 0) return "not_set_up";
  if (filled < required.length) return "partly_set_up";
  return saved?.enabled ? "ready" : "off";
}

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  not_set_up: "Not set up",
  partly_set_up: "Keys missing",
  ready: "Ready",
  off: "Keys saved, switched off",
};

// What the page shows for a saved value: a secret keeps only its last four characters, anything else is shown in full.
export function displayValue(field: IntegrationField, value: string | undefined): string {
  if (!value) return "";
  if (!field.secret) return value;
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

// v213b: the providers the app actually reads a saved key for. Every entry in the catalogue must be on this list, and each must be read
// on the server (checked by scripts/verify-integrations-keyed.ts), so an entry can never be offered that does nothing.
export const IMPLEMENTED_PROVIDERS = ["payhere", "ai_assistant", "email", "whatsapp", "sms", "lead_api", "royalty_head", "autoleads"] as const;
