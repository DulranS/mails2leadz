// Discount-code uses: a limited code can be taken only as many times as it allows, even when two buyers try at once.
import assert from 'node:assert/strict';
import { claimPromoUse, releasePromoUse } from '../lib/promo-tx.js';

// A small stand-in for a transactional database: transactions run one after another, as they do on the server.
let queue = Promise.resolve();
const fakeDb = {
  runTransaction(fn) {
    const run = queue.then(() => fn({
      get: async (ref) => ({ exists: () => ref.data !== undefined, data: () => ref.data }),
      update: (ref, patch) => { ref.data = { ...ref.data, ...patch }; },
    }));
    queue = run.catch(() => {});
    return run;
  },
};

// A limited code: two buyers race for the last of two uses. Exactly one of three attempts wins a third use.
const limited = { data: { uses: 0 } };
const results = await Promise.all([claimPromoUse(fakeDb, limited, 2), claimPromoUse(fakeDb, limited, 2), claimPromoUse(fakeDb, limited, 2)]);
assert.deepEqual(results, [true, true, false], 'two uses taken, the third refused');
assert.equal(limited.data.uses, 2, 'never more uses than allowed');

// An unlimited code takes every use.
const open = { data: { uses: 0 } };
assert.equal(await claimPromoUse(fakeDb, open, null), true);
assert.equal(await claimPromoUse(fakeDb, open, null), true);
assert.equal(open.data.uses, 2);

// A code that no longer exists is refused, not created.
assert.equal(await claimPromoUse(fakeDb, { data: undefined }, 5), false);

// When an invoice cannot be saved, the use it claimed is given back.
await releasePromoUse(fakeDb, limited);
assert.equal(limited.data.uses, 1);
assert.equal(await claimPromoUse(fakeDb, limited, 2), true, 'the released use can be taken again');
await releasePromoUse(fakeDb, { data: undefined });  // nothing to release: no error

console.log('promo-tx tests: all passed');
