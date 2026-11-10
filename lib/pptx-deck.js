// lib/pptx-deck.js - the pitch deck as a real PowerPoint file, from the same slides as the printable version. Server-side.
import PptxGenJS from 'pptxgenjs';

export async function deckPptx(slides, title = 'Pitch deck') {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  pptx.author = 'AutoLeads';
  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.addText(String(s.title), { x: 0.7, y: 0.6, w: 11.9, h: 1.1, fontSize: 36, bold: true, color: '111111', fontFace: 'Arial' });
    slide.addText(s.body.map((b) => ({ text: String(b), options: { bullet: s.body.length > 1, breakLine: true } })), { x: 0.7, y: 2.0, w: 11.9, h: 4.6, fontSize: 22, color: '222222', fontFace: 'Arial', valign: 'top' });
    slide.addText('Every figure came from the owner\'s own records. Anything in [square brackets] is yours to write.', { x: 0.7, y: 6.9, w: 11.9, h: 0.4, fontSize: 10, color: '777777', fontFace: 'Arial' });
  }
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }));
}
