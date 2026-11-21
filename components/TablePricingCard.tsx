"use client";

// Owner: how table time is priced when a Done booking is recorded as a sale. A minimum charge, billing in blocks, and a
// per-person rate. These only shape the SUGGESTED price on an hourly service; the owner can always type a different figure.
import { useState } from "react";
import { deleteField } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { cleanPricingRules } from "@/lib/bookings";
import { Button, Card, Field, Input, Label } from "@/components/ui";

export default function TablePricingCard() {
  const { role } = useAuth();
  const { settings, updateSettings } = useData();
  const toast = useToast();
  const [min, setMin] = useState(settings.bookingMinMinutes ? String(settings.bookingMinMinutes) : "");
  const [block, setBlock] = useState(settings.bookingBlockMinutes ? String(settings.bookingBlockMinutes) : "");
  const [perPerson, setPerPerson] = useState(settings.bookingPerPerson ?? false);
  const [busy, setBusy] = useState(false);
  if (role !== "owner") return null; // saving settings is the owner's permission

  async function save() {
    const rules = cleanPricingRules({ minMinutes: min.trim() ? Number(min) : undefined, blockMinutes: block.trim() ? Number(block) : undefined, perPerson });
    if ((min.trim() && !rules.minMinutes) || (block.trim() && !rules.blockMinutes)) {
      toast.error("Table-time pricing", "Enter whole minutes (a minimum up to 1440, a block up to 240), or leave blank.");
      return;
    }
    setBusy(true);
    try {
      // Firestore ignores undefined, so a cleared box has to be an explicit delete or the old value would stay.
      await updateSettings({
        bookingMinMinutes: rules.minMinutes ?? deleteField(),
        bookingBlockMinutes: rules.blockMinutes ?? deleteField(),
        bookingPerPerson: rules.perPerson === true ? true : deleteField(),
      } as never);
      toast.success("Table-time pricing saved");
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="!p-3.5 mb-4">
      <div className="text-sm font-medium">Table-time pricing</div>
      <div className="text-xs text-muted mt-0.5 mb-3">
        Shapes the suggested price when you record a Done booking as a sale, for services priced per hour. Leave blank for plain hourly pricing. You can always type a different price.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field><Label>Minimum charge (minutes)</Label><Input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} placeholder="e.g. 60" /></Field>
        <Field><Label>Bill in blocks of (minutes)</Label><Input inputMode="numeric" value={block} onChange={(e) => setBlock(e.target.value)} placeholder="e.g. 30" /></Field>
        <label className="flex items-end gap-2 text-sm pb-2"><input type="checkbox" checked={perPerson} onChange={(e) => setPerPerson(e.target.checked)} />Rate is per person</label>
      </div>
      <div className="flex justify-end mt-3"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
    </Card>
  );
}
