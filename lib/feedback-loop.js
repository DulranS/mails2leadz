// lib/feedback-loop.js - what customers keep asking support about, turned into marketing and answer-library actions. Pure.
const STOP = new Set(['the','and','for','you','your','are','can','how','what','when','with','this','that','have','does','will','from','about','they','there','order','please','hi','hello','thanks','thank','need','want','just','some','any','was','not','but','its','it','is','to','a','an','of','in','on','my','me','i','do','if','get','got']);

/** The words customers use most in their questions, with how often each came up. */
export function topTopics(tickets = [], { minCount = 3, limit = 3 } = {}) {
  const counts = new Map();
  for (const t of Array.isArray(tickets) ? tickets : []) {
    const text = String(t?.question || t?.summary || '').toLowerCase().replace(/[^a-z\s]/g, ' ');
    const seen = new Set(text.split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)));
    for (const w of seen) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([topic, count]) => ({ topic, count }));
}

/** The action for a repeated topic: answer it in the library, or make it the subject of the next campaign. */
export function feedbackActions(tickets = []) {
  return topTopics(tickets).map((t) => `- Customers asked about "${t.topic}" ${t.count} times: add an answer to your library, and consider it as the subject of your next email or video.`);
}
