// Connections: the outside services this app can use, and whether each one is switched on. Keys are never typed into the app.
// They go in the hosting provider's environment variables (the same place DEEPSEEK_API_KEY and RESEND_API_KEY already live), so
// they never reach a browser and never appear in a page, a log or a saved record. Each service is optional: until its keys are
// set, the feature that uses it shows "Not connected" and nothing else changes. Pure, so it can be tested with a plain object.

export type ConnectionId = "ai-assistant" | "email" | "ad-spend" | "google-ads" | "market-data" | "market-prices";

export interface ConnectionDef {
  id: ConnectionId;
  name: string;
  unlocks: string;
  // Environment variables that must all be set. Empty = works without a key.
  requires: string[];
  // Optional settings with a default.
  optional?: string[];
}

export const CONNECTIONS: ConnectionDef[] = [
  {
    id: "ai-assistant",
    name: "AI assistant and suggestions",
    unlocks: "The assistant, draft messages and price suggestions. Each reply is still yours to confirm.",
    requires: ["DEEPSEEK_API_KEY"],
    optional: ["AI_MODEL"],
  },
  {
    id: "email",
    name: "Email sending",
    unlocks: "Emails you send from the app, such as receipts and reminders. Each one is sent when you press send.",
    requires: ["RESEND_API_KEY", "TRIAL_NOTIFICATION_FROM_EMAIL"],
  },
  {
    id: "ad-spend",
    name: "Ad spend import (Meta Ads)",
    unlocks: "Fills in what each promo campaign cost, from your ad account, for the month you choose. You review the amounts and press Save.",
    requires: ["META_ADS_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
    optional: ["META_GRAPH_VERSION"],
  },
  {
    id: "google-ads",
    name: "Ad spend import (Google Ads)",
    unlocks: "Fills in what each promo campaign cost on Google Ads, for the month you choose. You review the amounts and press Save.",
    requires: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"],
    optional: ["GOOGLE_ADS_LOGIN_CUSTOMER_ID", "GOOGLE_ADS_API_VERSION"],
  },
  {
    id: "market-prices",
    name: "Share and fund prices (investments)",
    unlocks: "Refreshes the latest price of up to five listed investments at a time, on Investments, when you press Refresh prices. You keep the prices by pressing the button.",
    requires: ["MARKET_DATA_API_KEY"],
  },
  {
    id: "market-data",
    name: "Exchange rates (live reference)",
    unlocks: "Today's reference rates for currencies on the Money owed and FX pages. Free, and it needs no key.",
    requires: [],
  },
];

export interface ConnectionStatus {
  id: ConnectionId;
  name: string;
  unlocks: string;
  configured: boolean;
  missing: string[]; // names of the variables still to add. Names only, never values.
}

export function connectionStatuses(env: Record<string, string | undefined> = process.env): ConnectionStatus[] {
  return CONNECTIONS.map((c) => {
    const missing = c.requires.filter((k) => !(env[k] ?? "").trim());
    return { id: c.id, name: c.name, unlocks: c.unlocks, configured: missing.length === 0, missing };
  });
}

export function isConfigured(id: ConnectionId, env: Record<string, string | undefined> = process.env): boolean {
  return connectionStatuses(env).find((s) => s.id === id)?.configured ?? false;
}
