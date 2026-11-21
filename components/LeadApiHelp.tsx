"use client";

// The lead API's address, a key generator and ready-to-paste examples, shown under the Lead API entry on the Integrations page.
// The key itself is saved with the rest of the page's keys (owner only, masked after saving). Generating one fills the box; it
// takes effect when you press Save, and a new key replaces the old one.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { generateLeadApiKey } from "@/lib/leadIntake";

export default function LeadApiHelp({
  businessId,
  draftKey,
  onGenerate,
}: {
  businessId: string | null;
  draftKey: string | undefined;
  onGenerate: (key: string) => void;
}) {
  const [origin, setOrigin] = useState("https://your-balancr-address");
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  const endpoint = `${origin}/api/v1/businesses/${businessId ?? "YOUR_BUSINESS_ID"}/leads`;
  const key = draftKey?.trim() || "YOUR_LEAD_API_KEY";
  const post = `curl -X POST "${endpoint}" \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Amal Perera","phone":"+94 77 123 4567","email":"amal@example.com","message":"Need 40 chairs","source":"Facebook ad","externalId":"fb-lead-8812"}'`;
  const get = `curl "${endpoint}?since=2026-11-01" -H "Authorization: Bearer ${key}"`;

  function copy(label: string, text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-line p-3 text-xs">
      <div>
        <div className="text-muted mb-1">Your leads address</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-panel px-2 py-1">{endpoint}</code>
          <Button type="button" variant="ghost" onClick={() => copy("endpoint", endpoint)}>{copied === "endpoint" ? "Copied" : "Copy"}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" onClick={() => onGenerate(generateLeadApiKey())}>Generate a key</Button>
        <span className="text-muted">Then press Save below. A new key replaces the old one, so update the tool that uses it.</span>
      </div>
      <div>
        <div className="text-muted mb-1">Send a lead (POST). Returns created, duplicate or merged, with the lead&apos;s id.</div>
        <pre className="overflow-x-auto rounded bg-panel p-2 whitespace-pre-wrap break-all">{post}</pre>
        <Button type="button" variant="ghost" onClick={() => copy("post", post)}>{copied === "post" ? "Copied" : "Copy example"}</Button>
      </div>
      <div>
        <div className="text-muted mb-1">Read new leads since a date or time (GET). Use the nextSince value to page on.</div>
        <pre className="overflow-x-auto rounded bg-panel p-2 whitespace-pre-wrap break-all">{get}</pre>
      </div>
      <div className="text-muted leading-relaxed">
        In Zapier or Make: use a Webhooks action (POST, JSON) for sending, or a polling trigger that calls the GET address. Put the key in the
        Authorization header as <span className="text-fg">Bearer</span> followed by the key. Include a stable <span className="text-fg">externalId</span> so a
        retried request never files the same lead twice. Only the key and the address are needed; nothing else is set up in Balancr.
      </div>
    </div>
  );
}
