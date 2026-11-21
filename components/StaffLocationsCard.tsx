"use client";

// Owner only, on the Team page: choose which locations each staff member works at. Nothing ticked means every location, which is
// how everyone worked before this existed. The owner is never restricted. See lib/locationScope.ts.
import { useEffect, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Button, Card } from "@/components/ui";
import type { Location, Member } from "@/lib/types";

export function StaffLocationsCard() {
  const { members, locations, setMemberLocations } = useData();
  const active = locations.filter((l) => l.active);
  const staff = members.filter((m) => m.active && m.role !== "owner");
  // Only worth showing once there is more than one branch and someone to assign.
  if (active.length < 2 || staff.length === 0) return null;
  return (
    <Card className="mb-6">
      <div className="font-medium">Work locations</div>
      <div className="text-xs text-muted mt-0.5 mb-3">
        Tick the locations each person works at. Nothing ticked means every location. A person with locations ticked sees, and records, sales and stock only at those.
      </div>
      <div className="divide-y divide-line">
        {staff.map((m) => (
          <StaffRow key={m.id} member={m} locations={active} onSave={setMemberLocations} />
        ))}
      </div>
    </Card>
  );
}

function StaffRow({
  member,
  locations,
  onSave,
}: {
  member: Member;
  locations: Location[];
  onSave: (uid: string, ids: string[]) => Promise<void>;
}) {
  const toast = useToast();
  const saved = member.locationIds ?? [];
  const [picked, setPicked] = useState<string[]>(saved);
  const [busy, setBusy] = useState(false);

  // Follow the saved value when it changes elsewhere (another owner session, or after a save).
  useEffect(() => {
    setPicked(member.locationIds ?? []);
  }, [member.locationIds]);

  const dirty = [...picked].sort().join("|") !== [...saved].sort().join("|");

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function save() {
    setBusy(true);
    try {
      await onSave(member.id, picked);
      toast.success(`${member.name} updated`, picked.length ? `${picked.length} location${picked.length === 1 ? "" : "s"}` : "Every location");
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    }
    setBusy(false);
  }

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{member.name}</div>
          <div className="text-xs text-muted">{saved.length ? `${saved.length} location${saved.length === 1 ? "" : "s"}` : "Every location"}</div>
        </div>
        <Button type="button" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {locations.map((l) => (
          <label key={l.id} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={picked.includes(l.id)}
              onChange={() => toggle(l.id)}
              className="w-4 h-4 accent-amber"
            />
            {l.name}
          </label>
        ))}
      </div>
    </div>
  );
}
