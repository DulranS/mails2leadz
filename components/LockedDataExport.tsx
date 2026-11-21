"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { downloadFullBackupZip } from "@/lib/backup";
import { buildBackupPayload } from "@/lib/backupPayload";
import { Button } from "@/components/ui";

// Shown on the "trial has ended" lockout screen, owner only. The screen tells
// people their data is safe; this lets them prove it by taking a copy — which
// is also what makes an SME comfortable trying the product at all. It reuses
// the exact same full-backup file as Import / export (nothing new to
// maintain) and, unlike that page, writes nothing back to the business.
export default function LockedDataExport() {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      await downloadFullBackupZip(buildBackupPayload(data));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <Button variant="ghost" onClick={download} disabled={busy || data.loading}>
        {data.loading ? "Preparing your data…" : busy ? "Preparing download…" : "Download a copy of my data"}
      </Button>
      {failed && (
        <div className="text-xs text-bad mt-2">Couldn&apos;t build the download — please try again.</div>
      )}
    </div>
  );
}
