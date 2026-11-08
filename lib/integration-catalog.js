// lib/integration-catalog.js - every key the Integrations screen shows, grouped by connection. Client-safe: it only lists names.
// A test checks this list matches the server's list of owner keys exactly, so no key can be stored without a place to enter it.
export const CATALOG_GROUPS = [
  {
    "title": "Google Ads",
    "items": [
      [
        "GOOGLE_ADS_CLIENT_ID",
        "Google ADS client ID",
        false
      ],
      [
        "GOOGLE_ADS_CLIENT_SECRET",
        "Google ADS client secret",
        true
      ],
      [
        "GOOGLE_ADS_CONVERSION_ACTION",
        "Google ADS conversion action",
        false
      ],
      [
        "GOOGLE_ADS_CUSTOMER_ID",
        "Google ADS customer ID",
        false
      ],
      [
        "GOOGLE_ADS_DEVELOPER_TOKEN",
        "Google ADS developer token",
        true
      ],
      [
        "GOOGLE_ADS_LEAD_KEY",
        "Google ADS lead key",
        true
      ],
      [
        "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
        "Google ADS login customer ID",
        false
      ],
      [
        "GOOGLE_ADS_REFRESH_TOKEN",
        "Google ADS refresh token",
        true
      ]
    ]
  },
  {
    "title": "Google Analytics (GA4)",
    "items": [
      [
        "GA4_API_SECRET",
        "GA4 API secret",
        true
      ],
      [
        "GA4_MEASUREMENT_ID",
        "GA4 measurement ID",
        false
      ]
    ]
  },
  {
    "title": "Meta (Lead Ads, pages, purchase events)",
    "items": [
      [
        "META_ACCESS_TOKEN",
        "Meta access token",
        true
      ],
      [
        "META_AD_ACCOUNT_ID",
        "Meta ad account ID",
        false
      ],
      [
        "META_APP_SECRET",
        "Meta app secret",
        true
      ],
      [
        "META_CAPI_TOKEN",
        "Meta capi token",
        true
      ],
      [
        "META_DATASET_ID",
        "Meta dataset ID",
        false
      ],
      [
        "META_PAGE_ACCESS_TOKEN",
        "Meta page access token",
        true
      ],
      [
        "META_PAGE_ID",
        "Meta page ID",
        false
      ],
      [
        "META_VERIFY_TOKEN",
        "Meta verify token",
        true
      ]
    ]
  },
  {
    "title": "TikTok",
    "items": [
      [
        "TIKTOK_EVENTS_TOKEN",
        "Tiktok events token",
        true
      ],
      [
        "TIKTOK_LEAD_KEY",
        "Tiktok lead key",
        true
      ],
      [
        "TIKTOK_PIXEL_CODE",
        "Tiktok pixel code",
        false
      ]
    ]
  },
  {
    "title": "Shopify store",
    "items": [
      [
        "SHOPIFY_ACCESS_TOKEN",
        "Shopify access token",
        true
      ],
      [
        "SHOPIFY_STORE_DOMAIN",
        "Shopify store domain",
        false
      ]
    ]
  },
  {
    "title": "eBay",
    "items": [
      [
        "EBAY_REFRESH_TOKEN",
        "Ebay refresh token",
        true
      ],
      [
        "EBAY_USER_TOKEN",
        "Ebay user token",
        true
      ]
    ]
  },
  {
    "title": "Voice agent (Vapi)",
    "items": [
      [
        "VAPI_API_KEY",
        "Vapi API key",
        true
      ],
      [
        "VAPI_PHONE_NUMBER_ID",
        "Vapi phone number ID",
        false
      ],
      [
        "VAPI_WEBHOOK_SECRET",
        "Vapi webhook secret",
        true
      ]
    ]
  },
  {
    "title": "Twilio (SMS, WhatsApp, calls)",
    "items": [
      [
        "TWILIO_ACCOUNT_SID",
        "Twilio account SID",
        true
      ],
      [
        "TWILIO_AUTH_TOKEN",
        "Twilio auth token",
        true
      ],
      [
        "TWILIO_PHONE_NUMBER",
        "Twilio phone number",
        true
      ],
      [
        "TWILIO_WA_TEMPLATE_FOLLOWUP",
        "Twilio WA template followup",
        true
      ],
      [
        "TWILIO_WA_TEMPLATE_INVOICE",
        "Twilio WA template invoice",
        true
      ],
      [
        "TWILIO_WA_TEMPLATE_QUOTE",
        "Twilio WA template quote",
        true
      ],
      [
        "TWILIO_WHATSAPP_FROM",
        "Twilio whatsapp from",
        false
      ]
    ]
  },
  {
    "title": "Stripe",
    "items": [
      [
        "STRIPE_PAYMENTS_SECRET_KEY",
        "Stripe payments secret key",
        true
      ],
      [
        "STRIPE_PAYMENTS_WEBHOOK_SECRET",
        "Stripe payments webhook secret",
        true
      ]
    ]
  },
  {
    "title": "Companies House (deal sourcing)",
    "items": [
      [
        "COMPANIES_HOUSE_API_KEY",
        "Companies house API key",
        true
      ],
      [
        "COMPANIES_HOUSE_KEY",
        "Companies house key",
        true
      ]
    ]
  },
  {
    "title": "Contact enrichment",
    "items": [
      [
        "APOLLO_API_KEY",
        "Apollo API key",
        true
      ],
      [
        "HUNTER_API_KEY",
        "Hunter API key",
        true
      ],
      [
        "PDL_API_KEY",
        "PDL API key",
        true
      ]
    ]
  },
  {
    "title": "LinkedIn lead forms",
    "items": [
      [
        "LINKEDIN_LEAD_KEY",
        "Linkedin lead key",
        true
      ]
    ]
  },
  {
    "title": "Form tools",
    "items": [
      [
        "TALLY_SIGNING_SECRET",
        "Tally signing secret",
        true
      ],
      [
        "TYPEFORM_WEBHOOK_SECRET",
        "Typeform webhook secret",
        true
      ]
    ]
  },
  {
    "title": "Calendar",
    "items": [
      [
        "OWNER_CALENDAR_ICS",
        "Owner calendar ICS",
        true
      ]
    ]
  },
  {
    "title": "AI",
    "items": [
      [
        "ANTHROPIC_API_KEY",
        "Anthropic API key",
        true
      ],
      [
        "DEEPSEEK_API_KEY",
        "Deepseek API key",
        true
      ],
      [
        "OPENAI_API_KEY",
        "Openai API key",
        true
      ]
    ]
  },
  {
    "title": "Other connections",
    "items": [
      [
        "EASYPOST_API_KEY",
        "Easypost API key",
        true
      ]
    ]
  }
];

export const CATALOG_NAMES = CATALOG_GROUPS.flatMap((g) => g.items.map((i) => i[0]));
