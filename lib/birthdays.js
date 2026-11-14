// lib/birthdays.js - birthdays for people who agreed to hear from you. Pure.
/** "email | MM-DD" lines. Bad lines are skipped. */
export function parseBirthdays(text = '') {
  const map = {}; let skipped = 0;
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [email = '', md = ''] = line.split('|').map((x) => x.trim());
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{2}-\d{2}$/.test(md)) { skipped++; continue; }
    map[email.toLowerCase()] = md;
    if (Object.keys(map).length >= 500) break;
  }
  return { map, skipped };
}

/** Who has a birthday today and has agreed to marketing messages (consent is a set of lower-case e-mails). */
export function birthdaysDueToday(map = {}, now = Date.now(), consent = new Set()) {
  const md = new Date(now).toISOString().slice(5, 10);
  return Object.entries(map || {}).filter(([email, d]) => d === md && consent.has(email)).map(([email]) => email);
}
