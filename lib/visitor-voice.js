// lib/visitor-voice.js - the public visitor's live voice: the business's own assistant, no tools, no prices, no payments. Pure.
import { liveVoiceInstructions } from './realtime-voice.js';

export function visitorInstructions({ businessName = '', offer = '' } = {}) {
  return [liveVoiceInstructions({ businessName, offer }), 'The visitor is on the public website. Help them find out what the business does and how to get in touch.'].join('\n');
}
