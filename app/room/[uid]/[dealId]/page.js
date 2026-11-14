// /room/{uid}/{dealId}?k=KEY - a read-only view of the steps of one deal, for the customer. Only with the private key.
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { checkKey } from '../../../../lib/customer-links.js';

export const dynamic = 'force-dynamic';

export default async function DealRoom({ params, searchParams }) {
  const { uid, dealId } = await params;
  const { k } = await searchParams;
  const db = getDb();
  const d = (await getDoc(doc(db, 'deals', String(dealId))).then((s) => s.data()).catch(() => null));
  if (!d || d.userId !== String(uid) || !checkKey(d.dealRoomKey, k)) return <main className="mx-auto max-w-xl px-4 py-10"><p className="text-sm">We could not find that deal room.</p></main>;
  const steps = Array.isArray(d.dealSteps) ? d.dealSteps : [];
  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-4">
      <h1 className="text-2xl font-bold">Your next steps</h1>
      {steps.length === 0 ? <p className="text-sm">No steps have been added yet.</p> : (
        <ul className="space-y-2">
          {steps.map((s) => (<li key={s.label} className="text-sm">{s.done ? "Done" : "To do"}: {s.label}</li>))}
        </ul>
      )}
    </main>
  );
}
