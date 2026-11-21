// Prospect finder: businesses of one kind in one area, from OpenStreetMap, shown for review before any become leads.
//
// Why OpenStreetMap: it is free, needs no account, key or deposit, and its data licence allows exactly this use with credit
// ("© OpenStreetMap contributors"). The honest limit is coverage: a business appears only if someone mapped it, and many
// have no phone number on the map. The page says so and shows how many results have a way to contact them.
//
// Nothing here writes anything. The route (app/api/prospects/search/route.ts) fetches; this file builds the question, reads
// the answer defensively, and marks what the business already knows. The owner ticks which to add, and they become ordinary
// New leads through the same path as a CSV import. Nothing is contacted, enriched from other sites, or sent anywhere.
import { normalizeLeadContact, normalizeLeadName } from "./leadImport";

export interface ProspectCategory {
  value: string;
  label: string;
  tags: [string, string][]; // OpenStreetMap key/value pairs: any of them matches
}

export const PROSPECT_CATEGORIES: ProspectCategory[] = [
  { value: "plumber", label: "Plumbers", tags: [["craft", "plumber"], ["shop", "plumbing"]] },
  { value: "electrician", label: "Electricians", tags: [["craft", "electrician"], ["shop", "electrical"]] },
  { value: "carpenter", label: "Carpenters and furniture makers", tags: [["craft", "carpenter"], ["shop", "furniture"]] },
  { value: "restaurant", label: "Restaurants and cafes", tags: [["amenity", "restaurant"], ["amenity", "cafe"], ["amenity", "fast_food"]] },
  { value: "bakery", label: "Bakeries and sweet shops", tags: [["shop", "bakery"], ["shop", "confectionery"], ["shop", "pastry"]] },
  { value: "hotel", label: "Hotels and guesthouses", tags: [["tourism", "hotel"], ["tourism", "guest_house"], ["tourism", "hostel"]] },
  { value: "salon", label: "Salons and barbers", tags: [["shop", "hairdresser"], ["shop", "beauty"]] },
  { value: "health", label: "Clinics, dentists and pharmacies", tags: [["amenity", "clinic"], ["amenity", "dentist"], ["amenity", "doctors"], ["amenity", "pharmacy"]] },
  { value: "hardware", label: "Hardware and building supplies", tags: [["shop", "hardware"], ["shop", "doityourself"], ["shop", "trade"]] },
  { value: "clothing", label: "Clothing shops and tailors", tags: [["shop", "clothes"], ["shop", "boutique"], ["shop", "tailor"]] },
  { value: "grocery", label: "Groceries and supermarkets", tags: [["shop", "supermarket"], ["shop", "convenience"], ["shop", "greengrocer"]] },
  { value: "car", label: "Garages, car sales and tyres", tags: [["shop", "car_repair"], ["shop", "car"], ["shop", "tyres"]] },
  { value: "electronics", label: "Electronics, phones and computers", tags: [["shop", "electronics"], ["shop", "mobile_phone"], ["shop", "computer"]] },
  { value: "office", label: "Accountants, lawyers and agents", tags: [["office", "accountant"], ["office", "lawyer"], ["office", "estate_agent"], ["office", "insurance"]] },
  { value: "gym", label: "Gyms and sports centres", tags: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]] },
  { value: "travel", label: "Travel agents", tags: [["shop", "travel_agency"], ["office", "travel_agent"]] },
  { value: "school", label: "Schools, tuition and driving schools", tags: [["amenity", "school"], ["amenity", "language_school"], ["amenity", "driving_school"], ["amenity", "college"]] },
  { value: "print", label: "Printers and copy shops", tags: [["shop", "copyshop"], ["craft", "printer"]] },
  { value: "laundry", label: "Laundry and dry cleaning", tags: [["shop", "laundry"], ["shop", "dry_cleaning"]] },
  { value: "vet", label: "Vets and pet shops", tags: [["amenity", "veterinary"], ["shop", "pet"]] },
];

export const MAX_PROSPECTS = 100;
export const MAX_AREA_SPAN_DEGREES = 0.6; // about 65 km: a city or a district, never a country
export const OSM_CREDIT = "© OpenStreetMap contributors";

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function categoryByValue(v: unknown): ProspectCategory | undefined {
  return PROSPECT_CATEGORIES.find((c) => c.value === v);
}

// A place name typed by the owner, tidied. Null when unusable.
export function cleanArea(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 100) return null;
  return t;
}

// OpenStreetMap's geocoder returns boundingbox as [south, north, west, east] strings.
export function bboxFromGeocode(result: unknown): BBox | null {
  const b = (result as { boundingbox?: unknown } | null)?.boundingbox;
  if (!Array.isArray(b) || b.length !== 4) return null;
  const [south, north, west, east] = b.map((x) => Number(x));
  const box = { south, west, north, east };
  return bboxProblem(box) === "bad" ? null : box;
}

// null = fine; "bad" = not a usable box; otherwise a sentence for the owner.
export function bboxProblem(b: BBox): string | null {
  const vals = [b.south, b.west, b.north, b.east];
  if (!vals.every((v) => Number.isFinite(v))) return "bad";
  if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180 || b.south >= b.north || b.west >= b.east) return "bad";
  if (b.north - b.south > MAX_AREA_SPAN_DEGREES + 1e-9 || b.east - b.west > MAX_AREA_SPAN_DEGREES + 1e-9) {
    return "That area is too big to search. Name a city or a district (for example Dehiwala, Sri Lanka), not a whole region or country.";
  }
  return null;
}

// The question sent to the free Overpass service. Only fixed tag names from the table above are ever put in it, so nothing the
// user types can change the query. Unnamed places are left out: a lead needs a name.
export function buildOverpassQuery(categoryValue: string, box: BBox, limit = MAX_PROSPECTS): string | null {
  const cat = categoryByValue(categoryValue);
  if (!cat || bboxProblem(box) !== null) return null;
  const n = Math.max(1, Math.min(MAX_PROSPECTS, Math.floor(limit)));
  const area = `(${box.south.toFixed(5)},${box.west.toFixed(5)},${box.north.toFixed(5)},${box.east.toFixed(5)})`;
  const parts = cat.tags.map(([k, v]) => `nwr["${k}"="${v}"]["name"]${area};`).join("");
  return `[out:json][timeout:25];(${parts});out center tags ${n};`;
}

export interface Prospect {
  osmId: string; // "node/123", "way/456"
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

const clean = (s: unknown, max: number): string => {
  if (typeof s !== "string") return "";
  return s.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
};
const first = (s: string) => s.split(/[;,]/)[0].trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Reads the answer defensively: anything unexpected is skipped, never thrown. Sorted: reachable businesses first.
export function parseOverpass(json: unknown): Prospect[] {
  const els = (json as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: Prospect[] = [];
  const seen = new Set<string>();
  for (const el of els) {
    if (!el || typeof el !== "object") continue;
    const e = el as { type?: unknown; id?: unknown; tags?: unknown };
    const tags = (e.tags && typeof e.tags === "object" ? e.tags : {}) as Record<string, unknown>;
    const name = clean(tags["name"] ?? tags["name:en"], 100);
    if (!name) continue;
    const phone = clean(first(clean(tags["phone"] ?? tags["contact:phone"] ?? tags["mobile"] ?? tags["contact:mobile"], 120)), 40);
    const emailRaw = clean(first(clean(tags["email"] ?? tags["contact:email"], 200)), 100);
    const email = EMAIL.test(emailRaw) ? emailRaw : "";
    const siteRaw = clean(first(clean(tags["website"] ?? tags["contact:website"], 300)), 200);
    const website = /^https?:\/\/[^\s]+$/i.test(siteRaw) ? siteRaw : "";
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"], tags["addr:city"]]
      .map((x) => clean(x, 60))
      .filter(Boolean)
      .join(", ")
      .slice(0, 150);
    const id = typeof e.id === "number" && typeof e.type === "string" && /^(node|way|relation)$/.test(e.type) ? `${e.type}/${e.id}` : "";
    const key = `${normalizeLeadName(name)}|${normalizeLeadContact(phone || email)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      osmId: id,
      name,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(website ? { website } : {}),
      ...(address ? { address } : {}),
    });
    if (out.length >= MAX_PROSPECTS) break;
  }
  const reach = (p: Prospect) => (p.phone || p.email ? 0 : 1);
  return out.sort((a, b) => reach(a) - reach(b) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export const prospectContact = (p: Prospect): string => p.phone || p.email || "";
export const hasContact = (p: Prospect): boolean => !!(p.phone || p.email);

export interface MarkedProspect {
  prospect: Prospect;
  duplicate: "lead" | "customer" | null;
}

// A business the owner already has, by the same name or the same phone/email, is marked so it is not added twice.
export function markDuplicates(
  prospects: Prospect[],
  leads: { name: string; contact?: string }[],
  customers: { name: string; contact?: string }[]
): MarkedProspect[] {
  const leadNames = new Set(leads.map((l) => normalizeLeadName(l.name ?? "")));
  const leadContacts = new Set(leads.map((l) => normalizeLeadContact(l.contact ?? "")).filter(Boolean));
  const custNames = new Set(customers.map((c) => normalizeLeadName(c.name ?? "")));
  const custContacts = new Set(customers.map((c) => normalizeLeadContact(c.contact ?? "")).filter(Boolean));
  return prospects.map((p) => {
    const n = normalizeLeadName(p.name);
    const phone = p.phone ? normalizeLeadContact(p.phone) : "";
    const email = p.email ? normalizeLeadContact(p.email) : "";
    // Customers win: a business that already buys from you should not be pitched as a stranger.
    if (custNames.has(n) || (phone && custContacts.has(phone)) || (email && custContacts.has(email))) return { prospect: p, duplicate: "customer" };
    if (leadNames.has(n) || (phone && leadContacts.has(phone)) || (email && leadContacts.has(email))) return { prospect: p, duplicate: "lead" };
    return { prospect: p, duplicate: null };
  });
}

// The lead a ticked prospect becomes. No undefined fields; the source is the existing "Cold outreach" label so the
// channel tables work unchanged, and the note says where it came from and what the map listed.
export function prospectToLead(p: Prospect, categoryLabel: string): { name: string; contact?: string; source: string; notes: string } {
  const bits = [categoryLabel, p.address, p.website, p.phone && p.email ? p.email : "", "Found on OpenStreetMap"].filter(Boolean);
  const contact = prospectContact(p);
  return {
    name: p.name,
    ...(contact ? { contact } : {}),
    source: "Cold outreach",
    notes: bits.join(" · ").slice(0, 500),
  };
}
