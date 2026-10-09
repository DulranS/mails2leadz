// lib/default-templates.js - neutral STARTER wording that ships with the app.
//
// Every customer sells something different, so these say nothing about any particular business, person,
// phone number or link. They are honest, short and safe to send as they are, but they are only a starting
// point: customers should put their own offer in (Dashboard > Templates) or use "✨ AI draft" per lead,
// which writes from their Account > "Your business" profile.
//
// Placeholders understood by the sender: {{business_name}} and {{sender_name}}.

const now = () => new Date().toISOString();

export const DEFAULT_TEMPLATE_A = {
  id: 'template_a',
  name: 'Initial Outreach',
  subject: 'Quick question for {{business_name}}',
  body: `Hi {{business_name}},

I'm {{sender_name}}. I'm getting in touch to see whether we might be able to help {{business_name}}.

Would you be open to a short conversation this week? A one-line reply is plenty, and no pressure at all if the timing isn't right.

Best regards,
{{sender_name}}
`,
  channel: 'email',
  enabled: true,
  createdAt: now(),
  updatedAt: now(),
};

export const DEFAULT_TEMPLATE_B = {
  id: 'template_b',
  name: 'Alternative Outreach',
  subject: '{{business_name}}, a quick idea',
  body: `Hi {{business_name}},

I came across your business and had a quick idea I think could be useful to you.

If you're open to it, I'd be glad to share it in a short call or by email, whichever you prefer.

Best,
{{sender_name}}
`,
  channel: 'email',
  enabled: true,
  createdAt: now(),
  updatedAt: now(),
};

export const DEFAULT_FOLLOW_UP_TEMPLATES = [
  {
    id: 'followup_1',
    name: 'Follow-Up 1 (Day 2)',
    channel: 'email',
    enabled: true,
    delayDays: 2,
    subject: 'Quick question for {{business_name}}',
    body: `Hi {{business_name}},

Just circling back in case my last note got buried. Is this something you'd like to talk about, or is the timing not right?

Either answer is fine, and a one-word reply is plenty.

Best,
{{sender_name}}
`,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'followup_2',
    name: 'Follow-Up 2 (Day 5)',
    channel: 'email',
    enabled: true,
    delayDays: 5,
    subject: '{{business_name}}, still interested?',
    body: `Hi {{business_name}},

I know inboxes get busy, so I'll keep this short. If a quick call or a few more details would help, just tell me what would be most useful and I'll send it over.

Thanks,
{{sender_name}}
`,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'followup_3',
    name: 'Last note (Day 10)',
    channel: 'email',
    enabled: true,
    delayDays: 10,
    subject: 'Closing the loop',
    body: `Hi {{business_name}},

I'll stop here so I don't clutter your inbox. If things change, or you'd like to pick this up later, just reply and I'll be happy to help.

Wishing you all the best,
{{sender_name}}
`,
    createdAt: now(),
    updatedAt: now(),
  },
];

// Post-sale reminders. Only the timing lives here: when one comes due, "✨ Draft check-in" writes the email
// from the customer's own business profile, so nothing about a specific business is baked in.
export const POST_CLOSE_TEMPLATES = [
  { id: 'onboarding', name: 'Onboarding check-in (Day 1)', channel: 'email', enabled: true, delayDays: 1 },
  { id: 'delivery', name: 'Delivery check-in (Week 1)', channel: 'email', enabled: true, delayDays: 7 },
  { id: 'upsell', name: 'Retention check-in (Day 30)', channel: 'email', enabled: true, delayDays: 30 },
  { id: 'retention', name: 'Quarterly review (Day 90)', channel: 'email', enabled: true, delayDays: 90 },
];
// The follow-up stage names the dashboard stores on those reminders.
export const POST_SALE_STAGES = ['onboarding', 'delivery_check', 'upsell_opportunity', 'quarterly_review'];

export const DEFAULT_WHATSAPP_FOLLOW_UP_TEMPLATES = [
  {
    id: 'whatsapp_followup_1',
    name: 'WhatsApp Follow-Up 1 (Day 3)',
    channel: 'whatsapp',
    enabled: true,
    delayDays: 3,
    body: `Hi {{business_name}} 👋
Just following up on my previous message. Did you get a chance to think about it?
No pressure at all, I just wanted to check whether you'd like to talk.
Best,
{{sender_name}}`,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'whatsapp_followup_2',
    name: 'WhatsApp Follow-Up 2 (Day 7)',
    channel: 'whatsapp',
    enabled: true,
    delayDays: 7,
    body: `Hi {{business_name}} 👋
Hope you're doing well!
I have a quick idea that might help your business, no strings attached.
Would you be open to a short chat about it?
Cheers,
{{sender_name}}`,
    createdAt: now(),
    updatedAt: now(),
  },
];

export const DEFAULT_WHATSAPP_TEMPLATE = `Hi {{business_name}} 👋
I'm {{sender_name}}. I'd love to see if we can help {{business_name}}.
Would you be open to a quick chat? No pressure at all.`;

export const DEFAULT_SMS_TEMPLATE = `Hi {{business_name}}, this is {{sender_name}}. I'd love to see if we can help your business. Open to a quick chat? Reply YES or NO.`;

export const DEFAULT_INSTAGRAM_TEMPLATE = `Hi {{business_name}} 👋
I'm {{sender_name}}. I think we could help your business. Would you be open to a quick chat? No pressure at all.`;

export const DEFAULT_TWITTER_TEMPLATE = `Hi {{business_name}} 👋 I'm {{sender_name}}. Would you be open to a quick chat about how we might help?`;

export const DEFAULT_LINKEDIN_TEMPLATE = `Hi {{business_name}},
I came across your company and would like to connect.
I think we may be able to help, and I'd be glad to share more if you're open to it.
Best,
{{sender_name}}`;
