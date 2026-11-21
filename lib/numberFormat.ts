// Thousands separators for number entry (v224b). What the person sees is grouped ("500,000"); what the screen stores is plain ("500000"),
// so every place that parses a number keeps working. Grouping starts at four digits, so 1,000 and 10,000 read clearly. Pure.

// The plain form of whatever was typed: commas and spaces removed, one leading minus, one decimal point, digits only.
export function plainNumber(raw: string): string {
  let s = raw.replace(/[,\s]/g, "");
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  s = s.replace(/[^0-9.]/g, "");
  return (negative ? "-" : "") + s;
}

// The grouped form of a plain number, as it is shown while typing. Decimals and a trailing point are kept exactly as typed.
export function groupedNumber(plain: string): string {
  const p = plainNumber(plain);
  if (p === "" || p === "-") return p;
  const negative = p.startsWith("-");
  const body = negative ? p.slice(1) : p;
  const dot = body.indexOf(".");
  const whole = dot >= 0 ? body.slice(0, dot) : body;
  const frac = dot >= 0 ? body.slice(dot) : "";
  const grouped = whole.length >= 4 ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return (negative ? "-" : "") + grouped + frac;
}
