"use client";

// The link a business gives customers to request a booking. Requests land on the Bookings page as "booked" and the owner confirms them.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Card, Button } from "@/components/ui";

export default function BookingLinkCard() {
  const { businessId, role } = useAuth();
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!businessId || !origin || (role !== "owner" && role !== "manager")) return null;
  const url = `${origin}/book/${businessId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Booking link copied", "Put it on your website or social profile.");
    } catch {
      toast.success("Your booking link", url);
    }
  }

  return (
    <Card className="!p-3.5 mb-4">
      <div className="text-sm font-medium">Online booking requests</div>
      <div className="text-xs text-muted mt-0.5 mb-2.5">
        Customers pick a service, day and time. Each request arrives here as &quot;booked&quot; and waits for you to confirm it. Nothing is confirmed automatically.
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input readOnly value={url} className="flex-1 min-w-0 rounded-md border border-line bg-panel2 px-3 py-2 text-xs num" onFocus={(e) => e.currentTarget.select()} />
        <Button onClick={copy}>Copy link</Button>
      </div>
    </Card>
  );
}
