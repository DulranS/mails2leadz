"use client";

// The link a business puts on its website, Instagram bio or WhatsApp profile. Each enquiry it brings in lands on the Leads
// page as a "New / inbound" lead (see app/api/enquiry). Shown to people who can manage sales.
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Card, Button } from "@/components/ui";

export default function EnquiryLinkCard() {
  const { businessId } = useAuth();
  const toast = useToast();
  // The origin is only known in the browser, so it is read after mount: the server render and the first client render agree.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!businessId || !origin) return null;
  const url = `${origin}/enquire/${businessId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enquiry link copied", "Put it on your website, Instagram bio or WhatsApp profile.");
    } catch {
      toast.success("Your enquiry link", url);
    }
  }

  return (
    <Card className="!p-3.5 mb-4">
      <div className="text-sm font-medium">Website enquiry form</div>
      <div className="text-xs text-muted mt-0.5 mb-2.5">
        Anyone who fills it in becomes a New lead here, tagged &quot;Website enquiry&quot;, so Marketing by channel can show what the website brings in. Nothing is
        sent to them automatically.
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input readOnly value={url} className="flex-1 min-w-0 rounded-md border border-line bg-panel2 px-3 py-2 text-xs num" onFocus={(e) => e.currentTarget.select()} />
        <Button onClick={copy}>Copy link</Button>
      </div>
    </Card>
  );
}
