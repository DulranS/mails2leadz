// lib/server-login.js - settings for "server login": the server signs in to Firebase Auth as one dedicated email/password user
// (instead of holding a service-account key). Pure, so it is tested. Both variables must be set; otherwise this mode is off.
/** @returns {{ email: string, password: string } | null} */
export function serverLoginConfig(env = process.env) {
  const email = String(env.FIREBASE_SERVER_EMAIL || '').trim();
  const password = String(env.FIREBASE_SERVER_PASSWORD || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) return null; // Firebase needs 6+ characters
  return { email, password };
}
