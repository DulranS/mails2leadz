// /help/{uid} - the public help centre: the owner's answer library, shown only when published. No customer data is shown here.
import { doc, getDoc } from '../../../lib/server-firestore.js';
import { getDb } from '../../../lib/server/route-helpers.js';
import { publicHelpEntries } from '../../../lib/help-center.js';

export const dynamic = 'force-dynamic';

export default async function HelpCentre({ params }) {
  const { uid } = await params;
  const db = getDb();
  const biz = (await getDoc(doc(db, 'users', String(uid), 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
  const entries = publicHelpEntries(biz.supportLibrary, biz.helpPublished === true);
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Help</h1>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">Help is not published yet. Please contact us directly.</p>
      ) : (
        <ul className="mt-6 space-y-6">
          {entries.map((e) => (
            <li key={e.question}>
              <h2 className="font-semibold">{e.question}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{e.answer}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
