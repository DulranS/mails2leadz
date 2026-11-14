// lib/battle-card.js - a short coaching card before a call: why the lead is here, points tied to real catalogue facts, two objections with scripts, one closer tip. Pure.
import { catalogBlock } from './catalog.js';

export function buildBattleCard({ customerName = '', customerMessage = '', history = '', keyword = '', catalogItems = [], now = Date.now() } = {}) {
  const stock = catalogBlock(catalogItems, now) || 'No catalogue items are listed yet. Do not invent any product, price or stock.';
  const system = 'You are a sales coach preparing a salesperson for a call. Plain English, direct, no markdown, no asterisks, no dashes as bullets. Never invent products, prices, stock or results. Never use fear, fake urgency or pressure. Keep the whole card under 300 words.';
  const prompt = `Customer name: ${customerName || 'unknown'}
Their latest message: ${String(customerMessage).slice(0, 1200)}
Earlier notes: ${String(history).slice(0, 1500) || 'none'}
What they are asking about: ${keyword || 'general'}

${stock}

Write the card in exactly this structure:

LEAD SNAPSHOT
One sentence: who they seem to be, what they want, any budget or timing signal.

TOP 3 SELLING POINTS
1. A concrete catalogue fact (price, stock or detail) tied to what they asked.
2. A specific second point, translated into what it means for them.
3. A third point framed around their situation.

OBJECTION 1: name it in five words or fewer
Why: one sentence on what is behind it.
Script: natural and warm, starting mid-thought, under three sentences.

OBJECTION 2: name it in five words or fewer
Why: one sentence.
Script: natural, under three sentences.

CLOSER TIP
One tactical observation about this lead, to watch for or lean into.`;
  return { system, prompt };
}

/** Reads the card into parts. Missing parts come back empty rather than made up. */
export function parseBattleCard(text = '') {
  const clean = String(text || '').replace(/\*\*/g, '').replace(/^\s*[-•]\s*/gm, '').trim();
  const section = (title, nextTitles) => {
    const re = new RegExp(`${title}\\s*\\n([\\s\\S]*?)(?=${nextTitles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}|$)`, 'i');
    const m = clean.match(re);
    return m ? m[1].trim() : '';
  };
  const snapshot = section('LEAD SNAPSHOT', ['TOP 3 SELLING POINTS', 'OBJECTION 1']);
  const points = section('TOP 3 SELLING POINTS', ['OBJECTION 1']).split(/\n/).map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean).slice(0, 3);
  const closer = section('CLOSER TIP', ['OBJECTION 1']) || (clean.match(/CLOSER TIP\s*\n([\s\S]*)$/i)?.[1] || '').trim();
  const objections = [];
  const re = /OBJECTION\s*\d+:\s*([^\n]+)\n\s*Why:\s*([^\n]*)\n\s*Script:\s*([\s\S]*?)(?=OBJECTION\s*\d+:|CLOSER TIP|$)/gi;
  let m;
  while ((m = re.exec(clean)) && objections.length < 2) objections.push({ name: m[1].trim(), why: m[2].trim(), script: m[3].trim() });
  return { leadSnapshot: snapshot, sellingPoints: points, objections, closerTip: closer.trim() };
}
