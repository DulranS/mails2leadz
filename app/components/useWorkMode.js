// app/components/useWorkMode.js - the signed-in owner's work mode ("sales" or "recruitment"), live from their business settings.
// Sales until the settings say otherwise, so the screens never wait on it.
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { useAuthUser } from "./AuthProvider";
import { DEFAULT_WORK_MODE, normalizeWorkMode } from "../../lib/work-mode.js";

export function useWorkMode() {
  const { user } = useAuthUser();
  const uid = user?.uid;
  const [mode, setMode] = useState(DEFAULT_WORK_MODE);
  useEffect(() => {
    if (!uid) return undefined;
    try {
      return onSnapshot(
        doc(db, "users", uid, "settings", "business"),
        (snap) => setMode(normalizeWorkMode(snap.data()?.workMode)),
        () => setMode(DEFAULT_WORK_MODE)
      );
    } catch {
      return undefined;
    }
  }, [uid]);
  return mode;
}
