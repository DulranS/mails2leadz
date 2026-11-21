"use client";

// Accounting journal page (v319), under the Money menu. Owner only, as the operations tab was. The page is read only.
import { useRequireRole } from "@/lib/roleGuard";
import { PageHeader } from "@/components/ui";
import AccountingJournal from "@/components/ops/AccountingJournal";

export default function AccountingJournalPage() {
  const { allowed, loading } = useRequireRole(["owner"]);
  if (loading || !allowed) return null;
  return (
    <>
      <PageHeader title="Accounting journal" />
      <AccountingJournal />
    </>
  );
}
