"use client";

// Owner or manager: the public link where customers ask for seats at events marked "Take seat requests online".
// A request arrives as a notification; it is not a sale and holds no seat.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Card, Button } from "@/components/ui";

export default function TicketLinkCard({ anyOpen }: { anyOpen: boolean }) {
  const { businessId, role } = useAuth();
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!businessId || !origin || (role !== "owner" && role !== "manager")) return null;
  const url = `${origin}/tickets/${businessId}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ticket link copied", "Put it on your website or social profile.");
    } catch {
      toast.success("Your ticket link", url);
    }
  }
  return (
    <Card className="!p-3.5 mb-4">
      <div className="text-sm font-medium">Online seat requests</div>
      <div className="text-xs text-muted mt-0.5 mb-2.5">
        {anyOpen
          ? "Customers pick an event and ask for seats. Each request arrives as a notification for you to confirm; it is not a sale and holds no seat until you sell it here."
          : "Tick \"Take seat requests online\" on an event to show it on this page. Until then the page lists nothing."}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input readOnly value={url} className="flex-1 min-w-0 rounded-md border border-line bg-panel2 px-3 py-2 text-xs num" onFocus={(e) => e.currentTarget.select()} />
        <Button onClick={copy}>Copy link</Button>
      </div>
    </Card>
  );
}
