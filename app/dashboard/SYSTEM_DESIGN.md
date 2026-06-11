┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       SAAS LEAD GENERATION & EMAIL AUTOMATION SYSTEM                              │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                           EXTERNAL DATA SOURCES                                              │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │   Crunchbase   │  │   LinkedIn     │  │   Company      │  │   Funding      │  │   Industry     │ │ │
│  │  │   API          │  │   Sales Nav    │  │   Websites     │  │   Databases    │  │   APIs         │ │ │
│  │  │   (Funding)    │  │   (Contacts)   │  │   (Tech Stack) │  │   (Deals)      │  │   (Signals)    │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       AI RESEARCH & INTELLIGENCE LAYER                                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │  Company       │  │  Decision Maker │  │  Technology    │  │  Hiring        │  │  Product       │ │ │
│  │  │  Discovery     │  │  Finder         │  │  Stack Analysis│  │  Patterns      │  │  Launch        │ │ │
│  │  │  (GPT-4)       │  │  (Multi-Source) │  │  (AI-Powered)  │  │  (AI-Research) │  │  Detection     │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       LEAD PROCESSING & CRAFTING LAYER                                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │  Lead          │  │  AI Email       │  │  Personalization│  │  Context       │  │  Thread        │ │ │
│  │  │  Qualification │  │  Crafter        │  │  Engine         │  │  Awareness     │  │  Management    │ │ │
│  │  │  (Scoring)     │  │  (GPT-4)        │  │  (Dynamic)      │  │  (History)     │  │  (Continuity)  │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       AUTOMATION & COMMUNICATION LAYER                                       │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │  Gmail API     │  │  WhatsApp API  │  │  Email Thread   │  │  Auto-Reply     │  │  Followup      │ │ │
│  │  │  (OAuth2)      │  │  (Twilio)      │  │  Management     │  │  System         │  │  Scheduler     │ │ │
│  │  │  (Rate Limited)│  │  (Templates)   │  │  (Conversation) │  │  (AI-Powered)   │  │  (Dynamic)     │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       BACKGROUND PROCESSING & QUEUES                                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │  Queue         │  │  Scheduler      │  │  Rate Limiter   │  │  Error Handler  │  │  Health        │ │ │
│  │  │  Management    │  │  (Cron Jobs)    │  │  (API Limits)   │  │  (Retries)      │  │  Monitor       │ │ │
│  │  │  (Redis/Bull)  │  │  (Every 6hrs)   │  │  (50/hr Email)  │  │  (Graceful)     │  │  (Alerts)      │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       DATABASE & STORAGE LAYER                                               │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │  Supabase      │  │  Companies      │  │  Decision      │  │  Research      │  │  Email         │ │ │
│  │  │  PostgreSQL    │  │  Table          │  │  Makers         │  │  Insights      │  │  Threads       │ │ │
│  │  │  (RLS Enabled) │  │  (saas_companies)│  │  (decision_makers)│  │  (research_insights)│  │  (email_threads)│ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       ANALYTICS & DASHBOARD LAYER                                            │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │  Performance   │  │  Email Metrics  │  │  Success Rates  │  │  Real-time     │  │  ROI Tracking  │ │ │
│  │  │  Monitoring    │  │  (Open/Click)   │  │  (Reply Rates)  │  │  Charts         │  │  (Campaigns)   │ │ │
│  │  │  (Real-time)   │  │  (Tracking)     │  │  (Analytics)    │  │  (Dashboards)   │  │  (Reports)     │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       USER INTERFACE & CONTROL LAYER                                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │  Next.js       │  │  React          │  │  Dashboard      │  │  Settings       │  │  Campaign      │ │ │
│  │  │  Frontend      │  │  Components     │  │  (Real-time)    │  │  Management     │  │  Controls      │ │ │
│  │  │  (SSR/SSG)     │  │  (Tailwind)     │  │  (Analytics)    │  │  (AI Config)    │  │  (Scheduling)  │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       INFRASTRUCTURE & DEPLOYMENT                                            │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │ │
│  │  │  Vercel        │  │  Load Balancer  │  │  Redis Cluster  │  │  CDN           │  │  Monitoring     │ │ │
│  │  │  Deployment    │  │  (Nginx)        │  │  (Queues)       │  │  (Assets)      │  │  (APM/Logs)    │ │ │
│  │  │  (Serverless)  │  │  (Cloudflare)   │  │  (Bull)         │  │  (Static)      │  │  (Sentry)      │ │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                       DATA FLOW & WORKFLOWS                                                   │ │
│  │                                                                                                             │ │
│  │  EXTERNAL SOURCES ──▶ INGESTION ──▶ AI RESEARCH ──▶ LEAD PROCESSING ──▶ EMAIL CRAFTING ──▶ AUTOMATION ──▶ │ │
│  │                                                                                                             │ │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │ │
│  │  │  Scheduler  │───▶│  Discovery  │───▶│  Research   │───▶│  Crafting   │───▶│  Sending    │───▶│ │
│  │  │  (6hr Cycle)│    │  (Companies)│    │  (AI)       │    │  (Personal) │    │  (Gmail API)│    │ │
│  │  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    │ │
│  │                                                                                                             │ │
│  │  ◀───────────────────────────────────────────────────────────────────────────────────────────── │ │
│  │                          FEEDBACK LOOP: REPLIES → AI ANALYSIS → AUTO-RESPONSES → FOLLOWUPS                   │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

## 📈 System Architecture Diagram (Mermaid)

```mermaid
flowchart LR
  subgraph UI [User Interface]
    A[Next.js Dashboard] -->|REST/JSON| B[API Gateway]
    A -->|Websocket/Event| C[Real-time Metrics]
  end

  subgraph API [Backend Services]
    B --> D[Email Service (/api/send-email)]
    B --> E[Follow-up Service (/api/send-followup)]
    B --> F[AI Research (/api/ai-smart-outreach)]
    B --> G[Auto-reply (/api/auto-reply-processor)]
    B --> H[Scheduler (/api/followup-scheduler)]
    B --> I[SMS/Call Service (/api/send-sms /api/make-call)]
  end

  subgraph External [Third-Party Integrations]
    D -->|Gmail OAuth2| J[Gmail API]
    I -->|Twilio APIs| K[Twilio]
    F -->|OpenAI| L[OpenAI GPT-4o]
  end

  subgraph Data [Persistence]
    D --> M[Firestore: sent_emails, activity]
    H --> N[Supabase/PostgreSQL: schedule, leads]
    G --> M
    F --> M
  end

  subgraph Cron [Background Processing]
    H -->|every 6h| O[Cron Jobs]
    O --> D
    O --> E
  end

  subgraph Analytics [Dashboard & Reporting]
    M --> P[Analytics / Reporting]
    N --> P
    P --> A
  end

  classDef external fill:#f0f0f0,stroke:#333,stroke-width:1px;
  class J,K,L external;
```

### 📌 Presentation Notes

- User interacts through `Next.js` app and uploads leads/sets campaign rules.
- API routes process input, validate, enforce quotas, and call communication engines.
- `send-email`, `send-followup`, `send-new-leads` all share duplicate-prevention logic.
- `followup-scheduler` handles timed follow-ups and prevents over-engagement (max 3, 2 days min).
- `auto-reply-processor` handles incoming replies, marks processed, triggers AI suggestions.
- All events are stored in Firestore/Supabase and exposed in dashboard analytics.
- Monitoring includes quotas (500 daily email, 50 SMS, 30 calls), logging, and failure/retry.

---

Key Technologies: Next.js 16 • React 19 • Node.js • Supabase • PostgreSQL • GPT-4 • Gmail API • Twilio • Redis • Vercel
System Scale: 1000+ Companies/Day • Zero Manual Intervention • Enterprise-Grade • Fully Automated