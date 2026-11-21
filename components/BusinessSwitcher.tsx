"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { activeBusinessKey, listBusinesses } from "@/lib/activeBusiness";

// "Which of my businesses am I looking at?" Shown only to a login that belongs to more than one business (it renders
// nothing otherwise, so a single-business login sees no change at all). It only chooses among businesses the person is
// an active member of; what they may do in each is still decided by their member record there.
// Switching is a full page load on purpose: it drops every open listener of the old business in one go.
export default function BusinessSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, businessId } = useAuth();
  const [items, setItems] = useState<{ id: string; name: string; isPrimary: boolean }[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { db } = getFirebase();
        const pointer = await getDoc(doc(db, "memberships", user.uid));
        const linked = await getDocs(collection(db, "memberships", user.uid, "linked"));
        const list = listBusinesses(
          pointer.exists() ? ((pointer.data() as { businessId?: string }).businessId ?? null) : null,
          linked.docs.map((d) => d.id)
        );
        if (list.length < 2) return;
        const named = await Promise.all(
          list.map(async (b, i) => {
            let name = "";
            try {
              const s = await getDoc(doc(db, "users", b.businessId, "meta", "settings"));
              name = ((s.data() as { businessName?: string } | undefined)?.businessName ?? "").trim();
            } catch {
              /* unreadable: fall back to a number */
            }
            return { id: b.businessId, name: name || `Business ${i + 1}`, isPrimary: b.isPrimary };
          })
        );
        if (!cancelled) setItems(named);
      } catch {
        /* no list: the switcher simply stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || items.length < 2) return null;
  return (
    <select
      aria-label="Switch business"
      value={businessId ?? ""}
      onChange={(e) => {
        const next = items.find((i) => i.id === e.target.value);
        if (!next || next.id === businessId) return;
        try {
          if (next.isPrimary) localStorage.removeItem(activeBusinessKey(user.uid));
          else localStorage.setItem(activeBusinessKey(user.uid), next.id);
        } catch {
          return; // cannot remember the choice in this browser: stay where we are rather than switch and bounce back
        }
        window.location.assign("/dashboard");
      }}
      className={`${compact ? "max-w-[9rem] text-xs" : "w-full text-sm"} rounded-md border border-line bg-panel2 px-2 py-1.5 text-fg`}
    >
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </select>
  );
}
