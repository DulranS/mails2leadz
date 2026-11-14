// /rate/{uid}/{ticketId}?k=KEY - a customer rates how their request was handled. Opens once the request is resolved.
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { checkKey } from '../../../../lib/customer-links.js';

export const dynamic = 'force-dynamic';

export default async function Rate({ params, searchParams }) {
  const { uid, ticketId } = await params;
  const { k } = await searchParams;
  const db = getDb();
  const t = (await getDoc(doc(db, 'users', String(uid), 'support_tickets', String(ticketId))).then((s) => s.data()).catch(() => null));
  if (!t || !checkKey(t.accessKey, k)) return <main className="mx-auto max-w-xl px-4 py-10"><p className="text-sm">We could not find that request.</p></main>;
  if (t.status !== 'resolved') return <main className="mx-auto max-w-xl px-4 py-10"><p className="text-sm">You can rate us once your request is resolved.</p></main>;
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">How did we do?</h1>
      <form method="post" action="/api/public/rate" className="mt-6 space-y-4">
        <input type="hidden" name="uid" value={uid} />
        <input type="hidden" name="ticketId" value={ticketId} />
        <input type="hidden" name="k" value={k} />
        <fieldset className="flex gap-2">
          <legend className="text-sm mb-2">Score, 1 (poor) to 5 (excellent)</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md border border-gray-300 cursor-pointer">
              <input type="radio" name="score" value={n} required className="sr-only" />{n}
            </label>
          ))}
        </fieldset>
        <textarea name="comment" rows={3} maxLength={200} className="w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="Anything we should know (optional)" />
        <button type="submit" className="min-h-[44px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm">Send rating</button>
      </form>
    </main>
  );
}
