// Testimonials (lib/testimonials.ts): who may be shown, the consent gate, what the public sees, and the wiring to the enquiry page,
// the feedback page, the public route and its cache. Run: npx tsx scripts/verify-testimonials.ts
import fs from "node:fs";
import { canFeature, displayNameFrom, publicTestimonial, validateTestimonial } from "../lib/testimonials";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const good = { score: 9, displayName: "Amal P.", quote: "Fast delivery and friendly staff.", consent: true };

ok(canFeature(8) && canFeature(10) && !canFeature(7) && !canFeature(8.5), "only whole scores of 8 or more can be shown");
ok(displayNameFrom("  amal   perera ") === "amal P." && displayNameFrom("Amal") === "Amal" && displayNameFrom("") === "", "the name shown is the first name and the last initial");
ok(validateTestimonial(good) === null, "a high score, consent, a name and words pass");
ok(validateTestimonial({ ...good, score: 6 }) !== null, "a low score is never shown");
ok(validateTestimonial({ ...good, consent: false }) !== null, "nothing is shown without the customer's agreement");
ok(validateTestimonial({ ...good, quote: "ok" }) !== null, "the words must say something");
ok(validateTestimonial({ ...good, quote: "x".repeat(301) }) !== null, "the words are capped at 300 characters");
ok(validateTestimonial({ ...good, displayName: "A" }) !== null, "the name shown must be real");

const approved = publicTestimonial({ approved: true, quote: "Great service", displayName: "Amal P.", approvedAt: 5 });
ok(approved !== null && Object.keys(approved).sort().join() === "approvedAt,author,quote", "the public sees only the words, the name and the approval time");
ok(publicTestimonial({ approved: false, quote: "x", displayName: "y", approvedAt: 1 }) === null, "an entry not approved is never shown");
ok(publicTestimonial(undefined) === null, "an entry with no testimonial shows nothing");

const route = read("app/api/public/testimonials/route.ts");
ok(route.includes('where("testimonial.approved", "==", true)') && route.includes("s-maxage=300"), "the public route reads only approved entries and is cached at the edge");
ok(!/score|contact|customerName/.test(route.replace(/\/\/.*$/gm, "")), "the public route returns no score, contact or customer name");
ok(read("app/enquire/[businessId]/page.tsx").includes("/api/public/testimonials") && read("app/enquire/[businessId]/page.tsx").includes("What customers say"), "the enquiry page shows the approved words");
ok(read("components/TestimonialControl.tsx").includes("validateTestimonial") && read("components/TestimonialControl.tsx").includes('"manage:support"'), "the owner's control checks the rules and needs manage:support");
ok(read("app/feedback/page.tsx").includes("<TestimonialControl f={f} />"), "the feedback list shows the control");
ok(read("contexts/DataContext.tsx").includes("setFeedbackTestimonial: async") && read("contexts/DataContext.tsx").includes("deleteField()"), "approving writes only the testimonial field, and taking down removes it");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
