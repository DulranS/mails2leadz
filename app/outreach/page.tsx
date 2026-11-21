"use client";

// Outreach: who to contact this week, and what to say. The page never sends anything. WhatsApp and email open with the message
// filled in, the owner presses send in their own app, and then presses "Messaged" to note it. Offers go only to customers who
// agreed to receive them.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { todayIso } from "@/lib/format";
import { buildShareTargets } from "@/lib/share";
import {
  canSendTemplate,
  DEFAULT_TEMPLATES,
  MAX_MESSAGE_LENGTH,
  renderMessage,
  SEGMENT_LABEL,
  segmentCustomers,
  socialCaption,
  type OutreachSegment,
} from "@/lib/outreach";
import EmailCampaignCard from "@/components/EmailCampaignCard";
import { Button, Card, EmptyState, Field, Input, Label, PageHeader, Select, TableCardSkeleton, Textarea } from "@/components/ui";

const SEGMENT_TEMPLATE: Record<OutreachSegment, string> = { lapsed: "lapsed", birthdays: "birthday", new: "new", top: "thanks", review: "review", referrers: "referrer" };

export default function OutreachPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff"]);
  const { customers, sales, settings, loading, updateCustomer, updateSettings } = useData();
  const toast = useToast();
  const today = todayIso();
  const business = settings.businessName?.trim() || "us";

  const [segment, setSegment] = useState<OutreachSegment>("lapsed");
  const [templateKey, setTemplateKey] = useState<string>(SEGMENT_TEMPLATE.lapsed);
  const [offer, setOffer] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const template = DEFAULT_TEMPLATES.find((t) => t.key === templateKey) ?? DEFAULT_TEMPLATES[0];
  const rows = useMemo(() => segmentCustomers(customers, sales, today, segment), [customers, sales, today, segment]);
  const notAgreed = rows.filter((r) => !r.consented).length;
  const reviewLink = settings.reviewLink?.trim() || "";
  const [linkDraft, setLinkDraft] = useState(reviewLink);
  // One-message-at-a-time queue: you still press send in your own app for each customer. The app only moves to the next person.
  const [queueOn, setQueueOn] = useState(false);
  const [queueAt, setQueueAt] = useState(0);
  const queue = useMemo(() => rows.filter((r) => canSendTemplate(template, r, { reviewLink }).ok), [rows, template, reviewLink]);
  const current = queueOn ? queue[queueAt] : undefined;
  const names = useMemo(() => customers.map((c) => c.name).sort((a, b) => a.localeCompare(b)), [customers]);

  function messageFor(name: string, text?: string) {
    return renderMessage(text ?? template.text, { name, business, offer, review: reviewLink });
  }

  async function saveReviewLink() {
    const v = linkDraft.trim();
    if (v && !/^https?:\/\//i.test(v)) {
      toast.error("Review link", "Start it with https://, for example your Google review link.");
      return;
    }
    try {
      await updateSettings({ reviewLink: v || undefined });
      toast.success(v ? "Review link saved" : "Review link removed");
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    }
  }

  async function saveReferredBy(id: string, value: string) {
    try {
      await updateCustomer(id, { referredBy: value.trim() || undefined });
      toast.success("Saved", value.trim() ? `Referred by ${value.trim()}` : "Referral removed");
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    }
  }

  async function saveConsent(id: string, agreed: boolean) {
    try {
      await updateCustomer(id, { marketingOptIn: agreed });
      toast.success(agreed ? "Noted: they agreed to offers" : "Noted: no offers for them");
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    }
  }

  async function saveBirthday(id: string, value: string) {
    const v = value.trim();
    if (v && !/^(\d{4}-)?\d{2}-\d{2}$/.test(v)) {
      toast.error("Birthday format", "Use MM-DD, such as 11-04, or a full date.");
      return;
    }
    try {
      await updateCustomer(id, { birthday: v || undefined });
      toast.success("Birthday saved");
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    }
  }

  async function markMessaged(id: string, name: string) {
    try {
      await updateCustomer(id, template.key === "review" ? { lastContactedAt: today, reviewRequestedAt: today } : { lastContactedAt: today });
      toast.success("Noted", `${name} was messaged today`);
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Message copied");
    } catch {
      toast.error("Couldn't copy", "Select the message and copy it yourself.");
    }
  }

  if (guardLoading || !allowed) return null;
  if (loading) return <><PageHeader title="Outreach" /><TableCardSkeleton rows={4} cols={3} /></>;

  return (
    <>
      <PageHeader title="Outreach" />
      <div className="text-xs text-muted mb-4 max-w-2xl">
        Who to contact this week, and what to say. The templates send nothing themselves: WhatsApp or email opens with the message ready, you press
        send in that app, then press Messaged here to note it. The email campaign below is the one thing that sends, when you press its button. Offers go only to customers who agreed to receive them.
      </div>

      <EmailCampaignCard />

      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(SEGMENT_LABEL) as OutreachSegment[]).map((s) => (
          <Button
            key={s}
            variant={segment === s ? "primary" : "ghost"}
            className="text-xs min-h-[44px]"
            onClick={() => {
              setSegment(s);
              setTemplateKey(SEGMENT_TEMPLATE[s]);
            }}
          >
            {SEGMENT_LABEL[s]}
          </Button>
        ))}
      </div>

      <Card className="mb-4 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>Message</Label>
            <Select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
              {DEFAULT_TEMPLATES.map((t) => (<option key={t.key} value={t.key}>{t.label}{t.needsConsent ? " (offers)" : ""}</option>))}
            </Select>
          </Field>
          <Field>
            <Label>Offer wording (optional)</Label>
            <Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. 10% off your next visit this week" maxLength={200} />
          </Field>
        </div>
        <div className="text-[11px] text-muted mt-2">
          Preview: {messageFor("Sam", template.text).slice(0, MAX_MESSAGE_LENGTH)}
        </div>
        {template.needsConsent && notAgreed > 0 && (
          <div className="text-[11px] text-amber-soft mt-2">
            {notAgreed} customer{notAgreed === 1 ? "" : "s"} in this list {notAgreed === 1 ? "has" : "have"} not agreed to offers, so {notAgreed === 1 ? "this message" : "it"} will not go to {notAgreed === 1 ? "them" : "them"}. Use an order message for them instead.
          </div>
        )}
      </Card>

      <Card className="mb-4 max-w-3xl">
        <div className="text-sm font-medium mb-2">Review link and post caption</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
          <Field>
            <Label>Where customers leave a review (your Google review link)</Label>
            <Input value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="https://..." />
          </Field>
          <Button variant="ghost" onClick={saveReviewLink}>Save link</Button>
        </div>
        <div className="mt-3">
          <Textarea readOnly rows={3} value={socialCaption({ business, offer, reviewLink })} />
        </div>
        <div className="mt-2">
          <Button variant="ghost" onClick={() => copy(socialCaption({ business, offer, reviewLink }))}>Copy caption</Button>
        </div>
      </Card>

      <datalist id="outreach-names">
        {names.map((n) => (<option key={n} value={n} />))}
      </datalist>

      {queue.length > 0 && !queueOn && (
        <div className="mb-4">
          <Button variant="ghost" onClick={() => { setQueueOn(true); setQueueAt(0); }}>Work through {queue.length} message{queue.length === 1 ? "" : "s"} one at a time</Button>
        </div>
      )}

      {queueOn && (
        <Card className="mb-4 max-w-3xl">
          {!current ? (
            <div className="text-sm">All done for this list. Nothing was sent by the app: each message was sent by you.</div>
          ) : (
            <>
              <div className="text-[11px] text-muted mb-1">{queueAt + 1} of {queue.length}</div>
              <div className="text-sm font-medium">{current.name}</div>
              <div className="text-[11px] text-muted">{current.reason} · {current.contact}</div>
              <Textarea className="mt-2" readOnly rows={3} value={messageFor(current.name)} />
              <div className="mt-3 flex flex-wrap gap-2">
                {(() => {
                  const l = buildShareTargets(messageFor(current.name), business, current.contact);
                  const email = /@/.test(current.contact);
                  return email ? (
                    <a href={l.mailtoUrl} className="text-xs min-h-[44px] inline-flex items-center px-3 rounded-md border border-line hover:bg-panel2">Open email</a>
                  ) : (
                    <a href={l.whatsappUrl} target="_blank" rel="noreferrer" className="text-xs min-h-[44px] inline-flex items-center px-3 rounded-md border border-line hover:bg-panel2">Open WhatsApp</a>
                  );
                })()}
                <Button onClick={async () => { await markMessaged(current.customerId, current.name); setQueueAt((i) => i + 1); }}>Messaged, next</Button>
                <Button variant="ghost" onClick={() => setQueueAt((i) => i + 1)}>Skip</Button>
                <Button variant="ghost" onClick={() => setQueueOn(false)}>Stop</Button>
              </div>
            </>
          )}
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Nobody here right now" body="This list fills in as customers buy, have birthdays coming up, or reach the thresholds in Settings." />
      ) : (
        <div className="grid gap-3 max-w-3xl">
          {rows.map((r) => {
            const check = canSendTemplate(template, r, { reviewLink });
            const text = messageFor(r.name);
            const referredBy = customers.find((c) => c.id === r.customerId)?.referredBy ?? "";
            const links = r.contact ? buildShareTargets(text, `${business}`, r.contact) : null;
            const isEmail = /@/.test(r.contact);
            return (
              <Card key={r.customerId}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted">{r.reason}{r.contactedRecently ? " · messaged in the last week" : ""}</div>
                    <div className="text-[11px] text-muted">{r.contact || "No phone or email saved"} · {r.consented ? "agreed to offers" : "no offers"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {links && check.ok && !isEmail && (
                      <a href={links.whatsappUrl} target="_blank" rel="noreferrer" className="text-xs min-h-[44px] inline-flex items-center px-3 rounded-md border border-line hover:bg-panel2">WhatsApp</a>
                    )}
                    {links && check.ok && isEmail && (
                      <a href={links.mailtoUrl} className="text-xs min-h-[44px] inline-flex items-center px-3 rounded-md border border-line hover:bg-panel2">Email</a>
                    )}
                    <Button variant="ghost" className="text-xs min-h-[44px]" onClick={() => copy(text)}>Copy</Button>
                    <Button variant="ghost" className="text-xs min-h-[44px]" onClick={() => markMessaged(r.customerId, r.name)}>Messaged</Button>
                  </div>
                </div>
                {!check.ok && <div className="text-[11px] text-muted mt-2">{check.reason}</div>}

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field>
                    <Label>Consent</Label>
                    <Select value={r.consented ? "yes" : "no"} onChange={(e) => saveConsent(r.customerId, e.target.value === "yes")}>
                      <option value="no">Not agreed to offers</option>
                      <option value="yes">Agreed to receive offers</option>
                    </Select>
                  </Field>
                  <Field>
                    <Label>Birthday (MM-DD)</Label>
                    <div className="flex gap-2">
                      <Input
                        value={drafts[r.customerId] ?? ""}
                        placeholder="e.g. 11-04"
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.customerId]: e.target.value }))}
                      />
                      <Button variant="ghost" onClick={() => saveBirthday(r.customerId, drafts[r.customerId] ?? "")}>Save</Button>
                    </div>
                  </Field>
                </div>
                <div className="mt-3">
                  <Field>
                    <Label>Referred by (optional)</Label>
                    <Input
                      key={`${r.customerId}-${referredBy}`}
                      defaultValue={referredBy}
                      list="outreach-names"
                      placeholder="The customer who sent them"
                      onBlur={(e) => {
                        if (e.target.value.trim() !== referredBy) saveReferredBy(r.customerId, e.target.value);
                      }}
                    />
                  </Field>
                </div>
                <Textarea className="mt-3" readOnly value={text} rows={2} />
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
