"use client";

import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { roleLabel } from "@/lib/permissions";
import { Select } from "@/components/ui";

// Picks a team member as the person who chases (or collected) money. The team list is only loaded for the Owner
// (see DataContext), so for anyone else this renders nothing and callers simply leave the collector alone.
// `value` is a member uid, "" for nobody. A person who has since been removed stays selectable while they are the
// stored value, so editing a record never silently reassigns it.
export function useCollectorChoices(currentUid?: string, currentName?: string) {
  const { members } = useData();
  return useMemo(() => {
    // No team list (anyone but the Owner): offer no choices at all, and never invent a "removed" one.
    if (members.length === 0) return [];
    const active = members.filter((m) => m.active).map((m) => ({ uid: m.id, name: m.name || m.email, role: m.role }));
    const list = [...active].sort((a, b) => a.name.localeCompare(b.name));
    if (currentUid && !list.some((m) => m.uid === currentUid)) {
      list.push({ uid: currentUid, name: `${currentName || "Former team member"} (removed)`, role: "staff" as const });
    }
    return list;
  }, [members, currentUid, currentName]);
}

export function CollectorSelect({
  value, onChange, choices, emptyLabel,
}: {
  value: string;
  onChange: (uid: string, name: string) => void;
  choices: { uid: string; name: string; role: "owner" | "manager" | "staff" | "accountant" }[];
  emptyLabel: string;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => {
        const uid = e.target.value;
        onChange(uid, choices.find((c) => c.uid === uid)?.name.replace(/ \(removed\)$/, "") ?? "");
      }}
    >
      <option value="">{emptyLabel}</option>
      {choices.map((c) => (
        <option key={c.uid} value={c.uid}>{c.name} · {roleLabel(c.role)}</option>
      ))}
    </Select>
  );
}
