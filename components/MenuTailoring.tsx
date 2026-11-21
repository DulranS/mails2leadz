"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { activePreset, cleanHiddenPages, HIDABLE_PAGES, MENU_PRESETS } from "@/lib/navPrefs";
import { Button, Card, Checkbox } from "@/components/ui";

// Settings > Menu (Owner): choose which pages show in the side menu. Hidden pages still work and "Jump to" (Ctrl or Cmd + K) still
// finds them; nothing else changes. Applies to everyone in the business.
export default function MenuTailoring() {
  const { settings, updateSettings } = useData();
  const toast = useToast();
  const [hidden, setHidden] = useState<string[]>(() => cleanHiddenPages(settings.hiddenPages));
  const [busy, setBusy] = useState(false);
  const saved = cleanHiddenPages(settings.hiddenPages);
  const dirty = saved.join("|") !== cleanHiddenPages(hidden).join("|");
  const preset = activePreset(hidden);
  const groups = Array.from(new Set(HIDABLE_PAGES.map((p) => p.group)));

  async function save() {
    setBusy(true);
    try {
      await updateSettings({ hiddenPages: cleanHiddenPages(hidden) });
      toast.success("Menu saved", cleanHiddenPages(hidden).length === 0 ? "Every page is showing." : `${cleanHiddenPages(hidden).length} pages tucked away.`);
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <div className="font-medium">Tailor your menu</div>
      <div className="text-xs text-muted mt-0.5 mb-4">
        Hide the pages your business does not use, so the menu shows only what you need. Nothing is deleted: a hidden page still works, links to it still work, and
        Jump to (Ctrl or Cmd + K) finds it. This applies to everyone in your business. You can show a page again here at any time.
      </div>

      <div className="text-xs font-medium text-muted mb-2">Start from</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {MENU_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setHidden(cleanHiddenPages(p.hides))}
            className={`text-left rounded-lg border p-3 min-h-[44px] ${preset === p.id ? "border-amber/60 bg-amber/5" : "border-line hover:border-muted"}`}
          >
            <div className="text-sm font-medium">{p.label}</div>
            <div className="text-xs text-muted mt-0.5">{p.description}</div>
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g} className="mb-4">
          <div className="text-xs font-medium text-muted mb-1.5">{g}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            {HIDABLE_PAGES.filter((p) => p.group === g).map((p) => (
              <label key={p.href} className="flex items-center gap-2.5 py-2 text-sm cursor-pointer min-h-[44px] sm:min-h-0">
                <Checkbox
                  checked={!hidden.includes(p.href)}
                  onCheckedChange={(show) => setHidden((prev) => (show ? prev.filter((h) => h !== p.href) : [...prev, p.href]))}
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="text-[11px] text-muted mb-4">Home, Assistant, Notifications, Selling, Buying, Money owed, Reports, Profit, Cash count, Time, Team access and Settings always show.</div>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save menu"}</Button>
        {dirty && <span className="text-xs text-muted">Not saved yet</span>}
      </div>
    </Card>
  );
}
