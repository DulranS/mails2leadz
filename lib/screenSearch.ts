// Quick jump to a screen (v245): typed letters find the screen by its name first, then by a word in its name, then by its group. Pure: the caller
// passes only the screens the person can already see.
export interface ScreenItem { href: string; label: string; group: string }

export function searchScreens(items: ScreenItem[], query: string, limit = 8): ScreenItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const scored = items
    .map((item, index) => {
      const label = item.label.toLowerCase();
      const words = label.split(/[\s&/-]+/);
      let score = -1;
      if (label.startsWith(q)) score = 3;
      else if (words.some((w) => w.startsWith(q))) score = 2;
      else if (label.includes(q)) score = 1;
      else if (item.group.toLowerCase().includes(q)) score = 0;
      return { item, score, index };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((x) => x.item);
}
