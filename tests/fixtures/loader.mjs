// Node module hook: any import of lib/server-firestore.js is answered by the in-memory fake (tests only).
export async function resolve(specifier, context, next) {
  if (/(^|\/)server-firestore\.js$/.test(specifier)) {
    return { url: new URL('./fake-firestore.mjs', import.meta.url).href, shortCircuit: true, format: 'module' };
  }
  // Next's server helpers are imported without an extension by the routes; Node needs the file name.
  if (specifier === 'next/server') return next('next/server.js', context);
  return next(specifier, context);
}
