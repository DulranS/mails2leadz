// Writes the sample books (lib/demoData.ts) into a demo business. Shared by the two things that
// need exactly the same result: creating a demo business (app/api/admin/demo) and putting the
// public demo back to its starting point (lib/demoServer.ts). Server-only (Admin SDK).
import type { Firestore } from "firebase-admin/firestore";
import { buildDemoData, DEMO_BUSINESS_NAME } from "./demoData";

const BATCH_LIMIT = 400;

export interface SeedOptions {
  email: string;
  // Marks the business as THE shared sandbox behind "Try it now" (AccountStatus.publicDemo). Private
  // demos an admin makes for their own sales calls never carry it.
  publicDemo?: boolean;
}

export function demoAccountDoc(publicDemo: boolean): Record<string, unknown> {
  return {
    suspended: false,
    complimentary: true,
    plan: "Demo",
    notes: `${DEMO_BUSINESS_NAME} — sample data for sales demos. Safe to delete.`,
    ...(publicDemo ? { publicDemo: true } : {}),
  };
}

// Every document a fresh demo business consists of, as { path, data }.
export function buildDemoWrites(uid: string, opts: SeedOptions, now = Date.now(), today = new Date().toISOString().slice(0, 10)) {
  const demo = buildDemoData(today);
  const writes: { path: string; data: Record<string, unknown> }[] = [
    { path: `memberships/${uid}`, data: { businessId: uid } },
    { path: `users/${uid}/members/${uid}`, data: { role: "owner", name: "Demo owner", email: opts.email, active: true, createdAt: now } },
    { path: `users/${uid}/meta/settings`, data: { ...demo.settings } },
    { path: `users/${uid}/meta/account`, data: demoAccountDoc(opts.publicDemo === true) },
  ];
  for (const [name, docs] of Object.entries(demo.collections)) {
    for (const d of docs) {
      writes.push({
        path: `users/${uid}/${name}/${d.id}`,
        data: { ...d.data, createdByUid: uid, createdByName: "Demo owner" },
      });
    }
  }
  return writes;
}

export async function seedDemoBusiness(db: Firestore, uid: string, opts: SeedOptions): Promise<number> {
  const writes = buildDemoWrites(uid, opts);
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH_LIMIT)) batch.set(db.doc(w.path), w.data);
    await batch.commit();
  }
  return writes.length;
}
