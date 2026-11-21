// ESC/POS receipt and kitchen printing (thermal printers, most 58mm and 80mm models). Pure: turns a list of lines into the bytes a
// printer understands. Sending the bytes is the job of lib/thermalPrint.ts and the print agent. Text is sent as plain ASCII: accents
// are folded (Café becomes Cafe) and anything else the printer cannot draw becomes "?".

export const PAPER_WIDTHS = [32, 42, 48] as const; // characters per line: 58mm paper is 32, 80mm is 42 or 48
export type PaperWidth = (typeof PAPER_WIDTHS)[number];

export type TicketLine =
  | { kind: "title"; text: string } // double size, bold, centred
  | { kind: "text"; text: string; bold?: boolean; align?: "left" | "center" | "right" }
  | { kind: "row"; left: string; right: string; bold?: boolean } // left text, right text, on one line
  | { kind: "rule" } // a line of dashes
  | { kind: "feed"; lines?: number }
  | { kind: "cut" }; // paper feed and partial cut

const ESC = 0x1b;
const GS = 0x1d;

// Folds accents, then keeps printable ASCII and turns the rest into "?".
export function asciiOnly(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

// Breaks text into lines no longer than width. A word longer than the width is split.
export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of asciiOnly(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > width) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= width) line += " " + w;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

// Left text on the left, right text on the right, padded to the full width. Long left text is cut so the right text always shows.
export function rowText(left: string, right: string, width: number): string {
  const r = asciiOnly(right);
  const maxLeft = Math.max(0, width - r.length - 1);
  const l = asciiOnly(left).slice(0, maxLeft);
  return l + " ".repeat(Math.max(1, width - l.length - r.length)) + r;
}

function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

// Turns the lines into printer bytes for a paper of the given width.
export function renderTicket(lines: TicketLine[], width: PaperWidth = 42): Uint8Array {
  const out: number[] = [ESC, 0x40]; // initialise the printer
  const text = (s: string) => out.push(...ascii(s + "\n"));
  const align = (a: 0 | 1 | 2) => out.push(ESC, 0x61, a);
  const bold = (on: boolean) => out.push(ESC, 0x45, on ? 1 : 0);
  for (const line of lines) {
    switch (line.kind) {
      case "title":
        align(1);
        bold(true);
        out.push(GS, 0x21, 0x11); // double width and height
        for (const l of wrapText(line.text, Math.floor(width / 2))) text(l);
        out.push(GS, 0x21, 0x00);
        bold(false);
        align(0);
        break;
      case "text": {
        const a = line.align === "center" ? 1 : line.align === "right" ? 2 : 0;
        align(a);
        bold(!!line.bold);
        for (const l of wrapText(line.text, width)) text(l);
        bold(false);
        align(0);
        break;
      }
      case "row":
        bold(!!line.bold);
        text(rowText(line.left, line.right, width));
        bold(false);
        break;
      case "rule":
        text("-".repeat(width));
        break;
      case "feed":
        out.push(ESC, 0x64, Math.max(1, Math.min(10, line.lines ?? 1)));
        break;
      case "cut":
        out.push(GS, 0x56, 0x42, 0x03); // feed, then partial cut
        break;
    }
  }
  return Uint8Array.from(out);
}

// The bytes of a kitchen ticket: the table in large type, the time sent, and each item in bold with its quantity.
export function kitchenTicketLines(table: string, sentAt: string, status: string, items: { qty: number; name: string }[]): TicketLine[] {
  return [
    { kind: "title", text: table },
    { kind: "text", text: `${sentAt} ${status}`, align: "center" },
    { kind: "rule" },
    ...items.map((i): TicketLine => ({ kind: "text", text: `${i.qty} x ${i.name}`, bold: true })),
    { kind: "feed", lines: 3 },
    { kind: "cut" },
  ];
}

// The bytes of a customer bill for a tab: each line with its quantity and amount, then the total.
export function billLines(params: {
  heading: string;
  table: string;
  date: string;
  items: { qty: number; name: string; unitPrice: number }[];
  total: number;
  currency: string;
  footer?: string;
}): TicketLine[] {
  const money = (n: number) => `${params.currency} ${n.toFixed(2)}`;
  return [
    { kind: "title", text: params.heading },
    { kind: "text", text: `${params.table} ${params.date}`, align: "center" },
    { kind: "rule" },
    ...params.items.map((i): TicketLine => ({ kind: "row", left: `${i.qty} x ${i.name}`, right: money(Math.round(i.qty * i.unitPrice * 100) / 100) })),
    { kind: "rule" },
    { kind: "row", left: "TOTAL", right: money(params.total), bold: true },
    ...(params.footer ? [{ kind: "text", text: params.footer, align: "center" } as TicketLine] : []),
    { kind: "feed", lines: 3 },
    { kind: "cut" },
  ];
}
