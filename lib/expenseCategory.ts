// Expense category suggestion (v187c): reads what an expense is called (or what a receipt's vendor says) and proposes a category from
// the fixed list. Keyword rules only: no outside service, no cost per use, and the same answer every time. The suggestion fills an
// empty category; the owner can change it, and a category they chose is never overwritten.
import { EXPENSE_CATEGORIES } from "./types";

type Category = (typeof EXPENSE_CATEGORIES)[number];

// Longest and most specific rules first, so "sales staff salary" hits Sales payroll before the general payroll words.
const RULES: { category: Category; words: string[] }[] = [
  { category: "Sales payroll", words: ["sales staff", "sales salary", "sales commission", "commission", "sales team"] },
  { category: "Payroll & labor", words: ["salary", "salaries", "wage", "wages", "payroll", "epf", "etf", "staff pay", "overtime", "casual labour", "casual labor"] },
  { category: "Rent & utilities", words: ["rent", "lease", "electricity", "power bill", "ceb", "water bill", "water board", "nwsdb", "gas bill", "utility", "utilities", "internet", "broadband", "dialog", "mobile bill", "phone bill", "airtel", "hutch", "slt", "wifi"] },
  { category: "Transport & logistics", words: ["fuel", "petrol", "diesel", "courier", "delivery", "shipping", "freight", "transport", "parking", "toll", "uber", "pickme", "logistics", "postage", "dhl", "fedex"] },
  { category: "Marketing", words: ["marketing", "advert", "advertising", "facebook ad", "google ad", "meta ad", "instagram ad", "boost", "promotion", "flyer", "banner", "print shop", "photographer", "brochure", "sponsor"] },
  { category: "Software & tools", words: ["software", "subscription", "saas", "license", "licence", "hosting", "domain", "google workspace", "microsoft", "office 365", "zoom", "canva", "chatgpt", "openai", "anthropic", "adobe", "shopify", "wordpress", "netflix"] },
  { category: "Professional fees", words: ["accountant", "accounting fee", "audit fee", "lawyer", "legal fee", "consultant", "consulting", "bookkeeper", "notary", "advisor", "advisory"] },
  { category: "Insurance", words: ["insurance", "premium", "policy"] },
  { category: "Bank & payment fees", words: ["bank fee", "bank charge", "service charge", "card fee", "transaction fee", "payhere", "stripe fee", "paypal fee", "wire fee", "commission charge"] },
  { category: "Other overhead", words: ["stationery", "cleaning", "repair", "maintenance", "supplies", "tea", "snacks", "office"] },
];

export function suggestExpenseCategory(text: string | undefined | null): Category | undefined {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  for (const rule of RULES) {
    if (rule.words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(t))) return rule.category;
  }
  return undefined;
}
