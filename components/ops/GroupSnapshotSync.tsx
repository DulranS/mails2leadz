"use client";

// Publishes this business's monthly summary for its group, while an owner or manager has it open. It writes only when the figures change, and at most
// once every five minutes, so opening the app does not cause a stream of writes. Renders nothing.
import { useEffect, useRef } from "react";
import { doc, setDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { getFirebase } from "@/lib/firebase";
import { todayIso } from "@/lib/format";
import { buildSnapshot } from "@/lib/groupSnapshot";

const MIN_GAP_MS = 5 * 60 * 1000;

export default function GroupSnapshotSync() {
  const { user, businessId, role } = useAuth();
  const { monthlyPnL, settings } = useData();
  const lastJson = useRef<string | null>(null);
  const lastWrite = useRef(0);

  useEffect(() => {
    if (!user || !businessId || (role !== "owner" && role !== "manager")) return;
    const snapshot = buildSnapshot(monthlyPnL, { businessName: settings.businessName ?? "", currency: settings.currency, today: todayIso() });
    const json = JSON.stringify(snapshot);
    if (json === lastJson.current) return;
    const now = Date.now();
    if (now - lastWrite.current < MIN_GAP_MS && lastJson.current !== null) return;
    lastJson.current = json;
    lastWrite.current = now;
    const { db } = getFirebase();
    setDoc(doc(db, "users", businessId, "groupSnapshots", "summary"), { ...snapshot, updatedAt: now }).catch(() => {
      lastJson.current = null; // try again next time
    });
  }, [user, businessId, role, monthlyPnL, settings.businessName, settings.currency]);

  return null;
}
