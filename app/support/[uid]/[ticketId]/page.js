// /support/{uid}/{ticketId}?k=KEY - a customer sees where their request stands. Only with the private key.
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { checkKey, ticketPaths } from '../../../../lib/customer-links.js';

export const dynamic = 'force-dynamic';
const LABEL = { open: 'Received', in_progress: 'Being looked at', resolved: 'Resolved' };

export default async function TicketStatus({ params, searchParams }) {
  const { uid, ticketId } = await params;
  const { k } = await searchParams;
  const db = getDb();
  const t = (await getDoc(doc(db, 'users', String(uid), 'support_tickets', String(ticketId))).then((s) => s.data()).catch(() => null));
  if (!t || !checkKey(t.accessKey, k)) return <main className="mx-auto max-w-xl px-4 py-10"><p className="text-sm">We could not find that request.</p></main>;
  const paths = ticketPaths(uid, ticketId, k);
  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-4">
      <h1 className="text-2xl font-bold">Your request</h1>
      <p className="text-sm"><strong>Status:</strong> {LABEL[t.status] || 'Received'}</p>
      {t.lastReply ? <p className="text-sm whitespace-pre-line"><strong>Latest reply:</strong> {t.lastReply}</p> : null}
      {t.status === 'resolved' ? <p className="text-sm"><a className="underline" href={paths.rate}>Rate how we did</a></p> : null}
    </main>
  );
}
