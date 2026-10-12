#!/usr/bin/env python3
"""
autoleads_worker.py - the whole lead machine in one file.

    OpenStreetMap search (free, no key) -> website crawl -> score and filter -> your AutoLeads Lead Inbox, every morning.

You only need two commands:
    python autoleads_worker.py setup      # asks a few questions, checks the connections, can schedule itself
    python autoleads_worker.py run        # one run (the schedule does this for you every morning)

Everything else is optional:
    check      test the free map servers, the AutoLeads connection and the webhook
    plan       show what the next run would do (calls nothing)
    status     budget used and which searches pay off
    schedule   print or install the daily schedule (--install, --remove, --time 09:00)
    find       one-off: search + crawl + import file for a single query
    enrich     crawl the websites in a CSV you already have
    search     OpenStreetMap search only

Sending stays with you: the worker fills your Lead Inbox, you review and press Send in AutoLeads.

Needs Python 3.9+. Missing packages (aiohttp, beautifulsoup4, lxml) are offered for install automatically.
Settings, keys and campaigns live in autoleads.json next to this file (keep it private).
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import heapq
import html as html_lib
import io
import json
import logging
import math
import os
import random
import re
import shlex
import socket
import subprocess
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, FrozenSet, Iterable, List, Mapping, Optional, Sequence, Set, Tuple
from urllib.parse import parse_qsl, unquote, urlencode, urldefrag, urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

REQUIRED_PACKAGES = {"aiohttp": "aiohttp", "bs4": "beautifulsoup4"}
OPTIONAL_PACKAGES = {"lxml": "lxml"}  # faster HTML parser; the crawler falls back to the built-in one without it
try:
    import aiohttp
except ImportError:  # offered for install in main()
    aiohttp = None  # type: ignore
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None  # type: ignore

logger = logging.getLogger("autoleads")
crawl_logger = logging.getLogger("autoleads.crawl")  # one line per website; quieter during scheduled runs


# ============================================================================
# 1. WEBSITE CRAWLER AND SCORING (was lead_enrichment_pro.py)
# ============================================================================

# CONFIG
# ----------------------------------------------------------------------------

ROBOT_TOKEN = "LeadEnrichmentBot"
DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; LeadEnrichmentBot/3.0)"


@dataclass(frozen=True)
class Config:
    max_pages: int = 18  # page requests per site, including failed ones
    concurrency: int = 20  # leads processed at the same time
    per_host: int = 2  # pages of one site fetched at the same time
    delay: float = 1.0  # minimum seconds between requests to the same host
    request_timeout: float = 10.0
    robots_timeout: float = 5.0
    retries: int = 2
    site_timeout: float = 120.0  # soft time budget per site; partial results are kept
    user_agent: str = DEFAULT_USER_AGENT
    retry_unreachable: bool = False
    checkpoint_every: int = 10  # fsync the checkpoint after this many finished rows


MAX_HTML_BYTES = 2_000_000
MAX_TEXT_CHARS = 300_000
MAX_SITEMAP_CHARS = 400_000
MAX_LINKS_PER_PAGE = 80
MAX_URL_LENGTH = 2_000
MAX_CRAWL_DEPTH = 3
MAX_DELAY_FROM_ROBOTS = 10.0
RETRYABLE_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})
HTML_TYPES = ("text/html", "application/xhtml+xml", "text/plain")
XML_TYPES = ("xml", "text/plain")
GUESSED_SLUGS = ("/contact", "/contact-us", "/about", "/about-us", "/team")

# Query parameters that create duplicate or tracking URLs.
TRACKING_PARAMS = frozenset(
    {
        "gclid", "fbclid", "dclid", "msclkid", "mc_cid", "mc_eid", "ref", "ref_",
        "source", "campaign", "trk", "tracking", "vero_id", "_ga", "_gl",
    }
)
SKIP_QUERY_KEYS = frozenset({"s", "replytocom", "share", "print"})

SKIP_EXTENSIONS = frozenset(
    {
        ".pdf", ".zip", ".rar", ".7z", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico",
        ".mp4", ".mp3", ".wav", ".mov", ".avi", ".css", ".js", ".mjs", ".map", ".woff", ".woff2",
        ".ttf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".xml", ".json",
    }
)

# Matched against whole path segments, never substrings.
SKIP_SEGMENTS = frozenset(
    {
        "wp-admin", "wp-login.php", "wp-json", "cdn-cgi", "login", "signin", "sign-in", "signup",
        "sign-up", "register", "account", "my-account", "cart", "checkout", "basket", "logout",
        "search", "tag", "tags", "author", "feed", "rss",
    }
)

# Each keyword is a phrase of path tokens; the number is how important the page is (lower = earlier).
PRIORITY_KEYWORDS: Tuple[Tuple[Tuple[str, ...], int], ...] = (
    (("contact",), 0),
    (("get", "in", "touch"), 0),
    (("reach", "us"), 0),
    (("about",), 1),
    (("team",), 1),
    (("leadership",), 1),
    (("management",), 1),
    (("founder",), 1),
    (("director",), 1),
    (("staff",), 1),
    (("people",), 1),
    (("who", "we", "are"), 1),
    (("company",), 2),
    (("service",), 2),
    (("product",), 2),
    (("solution",), 2),
    (("career",), 3),
    (("location",), 3),
    (("office",), 3),
    (("blog",), 5),
    (("news",), 5),
    (("privacy",), 8),
)
CONTACT_PHRASES: Tuple[Tuple[str, ...], ...] = (("contact",), ("get", "in", "touch"), ("reach", "us"))

EMAIL_SCORE_MAP = {
    "high": frozenset({"contact", "info", "hello", "hi", "sales", "inquiries", "enquiries", "business"}),
    "mid": frozenset({"support", "help", "service", "admin", "office"}),
    "low": frozenset({"noreply", "no-reply", "donotreply", "mailer-daemon", "notifications", "newsletter"}),
}

BAD_EMAIL_TLDS = frozenset(
    {
        "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "css", "js", "json", "woff", "woff2",
        "ttf", "otf", "eot", "ico", "pdf", "php", "html", "htm", "xml", "mp4", "mp3", "map", "zip",
    }
)
FREEMAIL_DOMAINS = frozenset(
    {
        "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "hotmail.com",
        "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me",
        "protonmail.com", "gmx.com", "mail.com", "zoho.com", "yandex.com", "rediffmail.com",
    }
)
# Placeholder and platform addresses that appear in templates and footers.
VENDOR_EMAIL_DOMAINS = frozenset(
    {
        "sentry.io", "wixpress.com", "wix.com", "wordpress.com", "wordpress.org", "squarespace.com",
        "shopify.com", "godaddy.com", "cloudflare.com", "google.com", "gstatic.com", "w3.org",
        "schema.org", "domain.com", "email.com", "yourdomain.com", "yoursite.com", "mysite.com",
        "website.com", "company.com", "example.com", "example.org", "example.net",
    }
)
SECOND_LEVEL_LABELS = frozenset({"co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go"})

SOCIAL_FIELDS = ("instagram", "twitter", "linkedin_company", "linkedin_ceo", "linkedin_founder", "facebook", "youtube")
SOCIAL_HOSTS = {
    "instagram.com": "instagram",
    "twitter.com": "twitter",
    "x.com": "twitter",
    "linkedin.com": "linkedin",
    "facebook.com": "facebook",
    "fb.com": "facebook",
    "youtube.com": "youtube",
}
FB_SKIP = frozenset(
    {
        "sharer", "sharer.php", "share", "share.php", "dialog", "plugins", "tr", "login", "login.php",
        "policies", "help", "privacy", "legal", "about", "ads", "business", "watch", "groups", "events",
        "marketplace", "gaming", "hashtag", "l.php", "photo", "photos", "permalink.php", "story.php",
        "reel", "reels", "stories", "public", "ajax", "pages", "profile.php", "people", "p",
    }
)
IG_SKIP = frozenset(
    {
        "p", "reel", "reels", "explore", "accounts", "stories", "tv", "about", "directory", "developer",
        "legal", "privacy", "web", "direct", "share", "tags", "locations", "create",
    }
)
TW_SKIP = frozenset(
    {
        "share", "intent", "search", "home", "i", "hashtag", "explore", "settings", "login", "signup",
        "tos", "privacy", "about", "download", "compose", "messages", "notifications", "widgets.js",
        "oauth", "lists", "topics",
    }
)

TECH_STACK: Dict[str, Tuple[str, ...]] = {
    "shopify": ("cdn.shopify.com", "myshopify.com", "shopifyanalytics"),
    "woocommerce": ("woocommerce", "wc-add-to-cart"),
    "wordpress": ("wp-content", "wp-includes", "wp-json"),
    "elementor": ("elementor",),
    "wix": ("static.wixstatic.com", "wixsite.com"),
    "squarespace": ("static1.squarespace.com", "squarespace-cdn.com", "sqsp.net"),
    "webflow": ("data-wf-site", "data-wf-page", "assets.website-files.com"),
    "next.js": ("/_next/", "__next_data__"),
    "react": ("react-dom", "data-reactroot", "__reactfiber"),
    "angular": ("ng-version=",),
    "vue": ("vue.min.js", "vue.global", "vue.runtime", "nuxt"),
    "google-tag-manager": ("googletagmanager.com",),
    "google-analytics": ("google-analytics.com", "gtag/js"),
    "meta-pixel": ("connect.facebook.net", "fbevents.js"),
    "hubspot": ("hs-scripts.com", "hsforms.net", "js.hs-analytics.net"),
    "mailchimp": ("chimpstatic.com", "list-manage.com"),
    "klaviyo": ("klaviyo.com",),
    "intercom": ("widget.intercom.io", "intercomcdn.com"),
    "tawk.to": ("embed.tawk.to",),
    "crisp": ("client.crisp.chat",),
    "zendesk": ("static.zdassets.com", "zopim"),
    "calendly": ("calendly.com",),
    "stripe": ("js.stripe.com",),
    "contact-form-7": ("contact-form-7", "wpcf7"),
}

OUTPUT_ENRICHMENT_FIELDS = [
    "email", "email_primary", "instagram", "twitter", "linkedin_company", "linkedin_ceo",
    "linkedin_founder", "facebook", "youtube", "phone_primary", "phones_all", "contact_page_found",
    "contact_page_url", "social_media_score", "lead_quality_score", "contact_confidence",
    "best_contact_method", "decision_maker_found", "decision_maker_name", "decision_maker_title",
    "tech_stack_detected", "company_size_indicator", "pages_crawled", "enrichment_status",
]
LEGACY_OUTPUT_COLUMNS = [
    "place_id", "business_name", "rating", "reviews", "category", "address", "whatsapp_number",
    "website", "email", "instagram", "twitter", "linkedin_company", "linkedin_ceo", "linkedin_founder",
    "phone_primary", "email_primary", "contact_page_found", "social_media_score", "lead_quality_score",
    "contact_confidence", "best_contact_method", "decision_maker_found", "tech_stack_detected",
    "company_size_indicator", "facebook", "youtube",
]
WEBSITE_ALIASES = ("website", "web site", "website url", "url", "site", "homepage", "web", "domain")

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b", re.I)
OBFUSCATED_EMAIL_RE = re.compile(
    r"\b([A-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\{at\})\s*"
    r"((?:[A-Z0-9-]+\s*(?:\.|\[dot\]|\(dot\)|\{dot\})\s*)+[A-Z]{2,63})\b",
    re.I,
)
PHONE_RE = re.compile(r"(?<!\d)(\+?\(?\d[\d\s().\-]{6,22}\d)(?!\d)")
PHONE_CONTEXT_RE = re.compile(r"(?:tel|telephone|phone|call|mobile|cell|whatsapp|hotline|contact|reach us|text us|ph\b)", re.I)
DATE_LIKE_RE = re.compile(r"^(?:\d{4}[-./ ]\d{1,2}[-./ ]\d{1,2}|\d{1,2}[-./ ]\d{1,2}[-./ ]\d{2,4})$")
YEAR_RUN_RE = re.compile(r"^(?:(?:19|20)\d{2}[\s\-/]*){2,}$")
THOUSANDS_RE = re.compile(r"(?<=\d),(?=\d{3})")

EMPLOYEE_RANGE_RE = re.compile(
    r"(?<![\d.])(\d{1,5})\s*(?:-|to|\u2013|\u2014)\s*(\d{1,5})\+?\s*(?:employees|team members|staff members|staff)\b"
)
EMPLOYEE_OVER_RE = re.compile(
    r"\b(?:over|more than|approximately|about|around)\s+(\d{1,5})\+?\s*(?:employees|team members|staff members|staff)\b"
)
EMPLOYEE_SINGLE_RE = re.compile(r"(?<![\d.])(\d{1,6})\+?\s*(?:employees|team members|staff members)\b")
TEAM_OF_RE = re.compile(r"\bteam of (\d{1,5})\b")
SMALL_WORDS_RE = re.compile(r"\b(?:startup|start-up|boutique|small team|family[- ]owned|family[- ]run|solo (?:founder|practitioner|entrepreneur))\b")
LARGE_WORDS_RE = re.compile(r"\b(?:multinational|fortune 500|offices worldwide|offices in \d+ countries)\b")

# Decision maker detection: a person's name next to a leadership title. Plain mentions of
# "owner" or "partner" in marketing text do not count.
_NAME_TOKEN = r"(?:[A-Z][a-zA-Z'\u2019\-]+|[A-Z]\.)"
_NAME = _NAME_TOKEN + r"(?:\s+" + _NAME_TOKEN + r"){1,3}"
_TITLE = (
    r"(?i:chief executive officer|chief executive|chief operating officer|chief financial officer|"
    r"chief technology officer|managing director|managing partner|co-?founder|founder|owner|president|"
    r"principal|partner|ceo|cfo|cto|coo|vice president|head of [a-z]+|director(?: of [a-z]+)?)"
)
_SEP = r"[,|:()\-\u2013\u2014\u2022\u00b7/]"
DM_PATTERN_A = re.compile(r"(?P<name>" + _NAME + r")\s*" + _SEP + r"*\s*(?P<title>" + _TITLE + r")\b")
DM_PATTERN_B = re.compile(r"(?P<title>" + _TITLE + r")\s*[:\-\u2013\u2014|,]\s*(?P<name>" + _NAME + r")")
DM_PATTERN_C = re.compile(r"(?P<kw>(?i:founded|owned|started|established))\s+(?i:by)\s+(?P<name>" + _NAME + r")")
TITLE_WORDS = frozenset(
    {"founder", "co-founder", "cofounder", "ceo", "cfo", "cto", "coo", "owner", "director", "president",
     "principal", "partner", "managing", "chief", "executive", "officer", "head", "vice"}
)
STOP_NAME_TOKENS = frozenset(
    {"our", "the", "meet", "about", "contact", "us", "team", "read", "more", "privacy", "policy", "terms",
     "services", "service", "home", "company", "limited", "ltd", "inc", "llc", "group", "solutions", "get",
     "in", "touch", "for", "and", "with", "your", "we", "are", "a", "an", "of", "to", "from", "by", "at",
     "on", "is", "it", "this", "that", "hello", "hi", "welcome", "manager", "email", "phone", "call",
     "address", "copyright", "all", "rights", "reserved", "best", "top", "why", "how", "what", "new",
     "latest", "news", "blog", "managing", "chief", "executive", "officer", "director", "owner", "founder",
     "partner", "president", "principal", "head", "vice"}
)
TITLE_RANK = (("owner", 0), ("founder", 0), ("ceo", 1), ("chief executive", 1), ("managing director", 1),
              ("president", 2), ("principal", 2), ("managing partner", 2), ("partner", 3), ("director", 4),
              ("cfo", 5), ("cto", 5), ("coo", 5), ("chief", 5), ("vice president", 5), ("head of", 6))
CEO_CONTEXT_RE = re.compile(r"\b(?:ceo|chief executive|managing director)\b", re.I)
FOUNDER_CONTEXT_RE = re.compile(r"\b(?:co-?founder|founder|owner)\b", re.I)


# ----------------------------------------------------------------------------
# DATA OBJECTS
# ----------------------------------------------------------------------------

def empty_socials() -> Dict[str, str]:
    return {k: "" for k in SOCIAL_FIELDS}


@dataclass
class PageData:
    url: str
    emails: Set[str] = field(default_factory=set)
    phones: Set[str] = field(default_factory=set)
    whatsapp: Set[str] = field(default_factory=set)
    socials: Dict[str, str] = field(default_factory=empty_socials)
    internal_links: List[Tuple[str, int]] = field(default_factory=list)
    is_contact: bool = False
    decision_makers: List[Tuple[str, str]] = field(default_factory=list)  # (name, title)
    tech: Set[str] = field(default_factory=set)
    size: Tuple[str, int] = ("unknown", 0)  # (small|medium|large|unknown, evidence strength)


@dataclass
class SiteData:
    emails: Set[str] = field(default_factory=set)
    phones: Set[str] = field(default_factory=set)
    whatsapp: Set[str] = field(default_factory=set)
    socials: Dict[str, str] = field(default_factory=empty_socials)
    contact_page_url: str = ""
    decision_maker: Optional[Tuple[str, str]] = None
    tech: Set[str] = field(default_factory=set)
    size: str = "unknown"
    size_strength: int = 0
    pages_crawled: int = 0
    pages_ok: int = 0
    final_url: str = ""
    hosts: Set[str] = field(default_factory=set)
    status: str = "ok"  # ok | no_website | social_only | blocked_by_robots | unreachable


@dataclass
class FetchResult:
    ok: bool
    reason: str = "ok"
    text: str = ""
    final_url: str = ""
    status: int = 0


# ----------------------------------------------------------------------------
# TEXT / URL UTILITIES
# ----------------------------------------------------------------------------

def clean_text(value: Any) -> str:
    return str(value or "").strip()


def host_key(netloc: str) -> str:
    n = (netloc or "").lower().split("@")[-1]
    if n.startswith("["):
        host = n[1:].split("]")[0]
    else:
        host = n.split(":")[0]
    host = host.strip(".")
    return host[4:] if host.startswith("www.") else host


def same_site(url: str, hosts: Iterable[str]) -> bool:
    h = host_key(urlparse(url).netloc)
    return bool(h) and any(h == r or h.endswith("." + r) for r in hosts)


def path_tokens(path: str) -> List[str]:
    return [t for t in re.split(r"[^a-z0-9]+", path.lower()) if t]


def has_phrase(tokens: Sequence[str], phrase: Sequence[str]) -> bool:
    n = len(phrase)
    for i in range(len(tokens) - n + 1):
        if all(tokens[i + j] in (phrase[j], phrase[j] + "s") for j in range(n)):
            return True
    return False


def is_contact_path(path: str) -> bool:
    toks = path_tokens(path)
    return any(has_phrase(toks, p) for p in CONTACT_PHRASES)


def path_priority(url: str, depth: int) -> int:
    path = urlparse(url).path
    if path.strip("/") == "":
        return 0
    toks = path_tokens(path)
    best = 20 + depth * 8
    for phrase, bonus in PRIORITY_KEYWORDS:
        if has_phrase(toks, phrase):
            best = min(best, 2 + bonus + depth * 2)
    return best


def should_skip_url(url: str) -> bool:
    p = urlparse(url)
    path = p.path.lower()
    if any(path.endswith(ext) for ext in SKIP_EXTENSIONS):
        return True
    if any(seg in SKIP_SEGMENTS for seg in path.split("/") if seg):
        return True
    return any(k.lower() in SKIP_QUERY_KEYS for k, _ in parse_qsl(p.query, keep_blank_values=True))


def normalise_url(url: str, base: str = "") -> Optional[str]:
    if not url:
        return None
    raw = url.strip().strip("\"'<>")
    if raw.lower().startswith(("javascript:", "mailto:", "tel:", "sms:", "data:")):
        return None
    absolute = urljoin(base, raw) if base else raw
    absolute, _ = urldefrag(absolute)
    if not absolute.lower().startswith(("http://", "https://")):
        return None
    try:
        p = urlparse(absolute)
        port = p.port
    except ValueError:
        return None
    host = (p.hostname or "").lower().rstrip(".")
    if not host or len(host) < 3 or p.username or p.password:
        return None
    if host in {"maps.google.com", "goo.gl", "g.page", "maps.app.goo.gl"} or (
        host in {"google.com", "www.google.com"} and p.path.lower().startswith("/maps")
    ):
        return None

    scheme = p.scheme.lower()
    netloc = f"[{host}]" if ":" in host else host
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc += f":{port}"

    path = re.sub(r"/{2,}", "/", p.path or "/")
    path = re.sub(r"/index\.(?:html?|php|aspx?)$", "/", path, flags=re.I)
    if path != "/":
        path = path.rstrip("/")

    items = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not (k.lower().startswith("utm_") or k.lower() in TRACKING_PARAMS)]
    items.sort()
    out = urlunparse((scheme, netloc, path, "", urlencode(items, doseq=True), ""))
    return out if len(out) <= MAX_URL_LENGTH else None


def prepare_website(raw: Any) -> Optional[str]:
    """Turn whatever is in the website cell into a crawlable URL, or None."""
    value = clean_text(raw)
    if not value or value.lower() in {"n/a", "na", "none", "null", "-", "no website", "nil"}:
        return None
    value = re.split(r"[\s;|]+", value)[0].strip(",")
    if "@" in value and "/" not in value:
        return None  # an email in the website column
    if value.startswith("//"):
        value = "https:" + value
    elif not re.match(r"^[a-z][a-z0-9+.\-]*://", value, re.I):
        value = "https://" + value
    url = normalise_url(value)
    if not url:
        return None
    host = host_key(urlparse(url).netloc)
    return url if ("." in host or host == "localhost") else None


def url_variants(seed: str) -> List[str]:
    """The seed first, then the same site with the other scheme, the www toggled, and the site root."""
    p = urlparse(seed)
    host = p.netloc
    alt_host = host[4:] if host.startswith("www.") else "www." + host
    cands = [
        seed,
        urlunparse(("http" if p.scheme == "https" else "https",) + tuple(p)[1:]),
        urlunparse((p.scheme, alt_host) + tuple(p)[2:]),
    ]
    if p.path not in ("", "/"):
        cands.append(urlunparse((p.scheme, host, "/", "", "", "")))
    seen: List[str] = []
    for c in cands:
        n = normalise_url(c)
        if n and n not in seen:
            seen.append(n)
    return seen


# ----------------------------------------------------------------------------
# EMAIL / PHONE
# ----------------------------------------------------------------------------

def clean_phone(raw: str) -> Optional[str]:
    """Canonical compact form: +digits when international, digits otherwise. None if it does not look like a phone."""
    value = clean_text(raw).replace("\u00a0", " ")
    digits = re.sub(r"\D", "", value)
    if not 8 <= len(digits) <= 15 or len(set(digits)) <= 2 or re.fullmatch(r"[01]+", digits):
        return None
    if value.lstrip().startswith("+"):
        return "+" + digits
    if digits.startswith("00") and len(digits) > 10:
        return "+" + digits[2:]
    return digits


def phone_key(phone: str) -> str:
    return re.sub(r"\D", "", phone)


def extract_phones_from_text(text: str) -> Set[str]:
    """Phones in visible text. Plain digit groups are only accepted with a leading + or ( or a
    phone word just before them, so dates, year lists and IDs are not mistaken for numbers."""
    out: Set[str] = set()
    for m in PHONE_RE.finditer(text):
        raw = m.group(1).strip()
        if DATE_LIKE_RE.match(raw) or YEAR_RUN_RE.match(raw):
            continue
        before = text[max(0, m.start() - 30):m.start()].lower()
        if "fax" in before[-14:]:
            continue
        if not (raw.startswith(("+", "(")) or PHONE_CONTEXT_RE.search(before)):
            continue
        p = clean_phone(raw)
        if p:
            out.add(p)
    return out


def normalise_email(raw: str) -> Optional[str]:
    email = clean_text(raw).lower().strip("<>[](){}.,;:")
    if not EMAIL_RE.fullmatch(email):
        return None
    local, _, domain = email.partition("@")
    if not local or len(local) > 64 or ".." in email or local.startswith(".") or local.endswith("."):
        return None
    if domain.rsplit(".", 1)[-1] in BAD_EMAIL_TLDS:
        return None
    if re.fullmatch(r"[0-9a-f]{24,}", local) or any(t in email for t in ("youremail", "your-email", "test@", "dummy@", "fake@")):
        return None
    return email


def extract_emails(text: str) -> Set[str]:
    found = {e for e in (normalise_email(x) for x in EMAIL_RE.findall(text)) if e}
    for m in OBFUSCATED_EMAIL_RE.finditer(text):
        domain = re.sub(r"\s*(?:\[dot\]|\(dot\)|\{dot\})\s*", ".", m.group(2))
        domain = re.sub(r"\s+", "", domain)
        e = normalise_email(m.group(1) + "@" + domain)
        if e:
            found.add(e)
    return found


def decode_cfemail(hexstr: str) -> Optional[str]:
    """Cloudflare email protection: the address is XOR-encoded with the first byte."""
    try:
        key = int(hexstr[:2], 16)
        return "".join(chr(int(hexstr[i:i + 2], 16) ^ key) for i in range(2, len(hexstr), 2))
    except (ValueError, IndexError):
        return None


def core_label(host: str) -> str:
    parts = host.lower().split(".")
    if len(parts) >= 3 and len(parts[-1]) == 2 and parts[-2] in SECOND_LEVEL_LABELS:
        return parts[-3]
    return parts[-2] if len(parts) >= 2 else parts[0]


def on_site_domain(domain: str, hosts: Iterable[str]) -> bool:
    return any(domain == h or domain.endswith("." + h) for h in hosts)


def related_domain(domain: str, hosts: Iterable[str]) -> bool:
    c = core_label(domain)
    return len(c) >= 4 and any(core_label(h) == c for h in hosts)


def email_acceptable(email: str, hosts: Iterable[str]) -> bool:
    """Own domain, a related domain (acme.com / acme.co.uk) or a free mailbox. Other domains are
    nearly always web agencies, partners or template leftovers."""
    domain = email.rsplit("@", 1)[1]
    if domain in VENDOR_EMAIL_DOMAINS or any(domain.endswith("." + v) for v in VENDOR_EMAIL_DOMAINS):
        return False
    return on_site_domain(domain, hosts) or related_domain(domain, hosts) or domain in FREEMAIL_DOMAINS


def email_score(email: str) -> int:
    local = email.split("@", 1)[0].lower()
    if any(k in local for k in EMAIL_SCORE_MAP["low"]):
        return 1
    if any(k == local or local.startswith(k + ".") or local.startswith(k + "-") for k in EMAIL_SCORE_MAP["high"]):
        return 10
    if any(k in local for k in EMAIL_SCORE_MAP["mid"]):
        return 6
    return 8 if "." in local or len(local) > 3 else 4


def choose_primary_email(emails: Iterable[str], hosts: Iterable[str] = ()) -> str:
    hosts = list(hosts)

    def rank(e: str) -> Tuple[int, int, str]:
        d = e.rsplit("@", 1)[1]
        bonus = 3 if (on_site_domain(d, hosts) or related_domain(d, hosts)) else 0
        return (-(email_score(e) + bonus), len(e), e)

    ordered = sorted(set(emails), key=rank)
    return ordered[0] if ordered else ""


def choose_primary_phone(phones: Iterable[str], whatsapp: Iterable[str]) -> str:
    wa = {phone_key(p) for p in whatsapp}
    ordered = sorted(
        set(phones),
        key=lambda p: (0 if phone_key(p) in wa else 1, 0 if p.startswith("+") else 1, -len(phone_key(p)), p),
    )
    return ordered[0] if ordered else ""


# ----------------------------------------------------------------------------
# SOCIAL
# ----------------------------------------------------------------------------

def _platform(host: str) -> str:
    for domain, name in SOCIAL_HOSTS.items():
        if host == domain or host.endswith("." + domain):
            return name
    return ""


def social_from_url(url: str) -> Tuple[str, str]:
    try:
        p = urlparse(url)
        platform = _platform(host_key(p.netloc))
        parts = [x for x in p.path.split("/") if x]
        if not platform or not parts:
            return "", ""
        first = parts[0].lstrip("@")

        if platform == "instagram":
            u = first.lower()
            if u not in IG_SKIP and re.fullmatch(r"[a-z0-9._]{2,30}", u):
                return "instagram", f"https://www.instagram.com/{u}/"
        elif platform == "twitter":
            u = first.lower()
            if u not in TW_SKIP and re.fullmatch(r"[a-z0-9_]{1,15}", u):
                return "twitter", f"https://x.com/{u}/"
        elif platform == "linkedin":
            if len(parts) >= 2 and parts[0].lower() == "company":
                return "linkedin_company", f"https://www.linkedin.com/company/{parts[1]}/"
            if len(parts) >= 2 and parts[0].lower() == "in":
                return "linkedin_person", f"https://www.linkedin.com/in/{parts[1]}/"
        elif platform == "facebook":
            low = parts[0].lower()
            if low == "pages" and len(parts) >= 3:
                return "facebook", f"https://www.facebook.com/pages/{parts[1]}/{parts[2]}"
            if low == "profile.php":
                ids = dict(parse_qsl(p.query)).get("id", "")
                if ids.isdigit():
                    return "facebook", f"https://www.facebook.com/profile.php?id={ids}"
            elif low not in FB_SKIP:
                return "facebook", f"https://www.facebook.com/{parts[0]}/"
        elif platform == "youtube":
            if parts[0].startswith("@"):
                return "youtube", f"https://www.youtube.com/{parts[0]}/"
            if parts[0].lower() in {"channel", "user", "c"} and len(parts) >= 2:
                return "youtube", f"https://www.youtube.com/{parts[0]}/{parts[1]}"
    except Exception:
        pass
    return "", ""


def merge_social(socials: Dict[str, str], kind: str, value: str, context: str = "") -> None:
    if kind == "linkedin_person":
        if not socials["linkedin_ceo"] and CEO_CONTEXT_RE.search(context):
            socials["linkedin_ceo"] = value
        elif not socials["linkedin_founder"] and FOUNDER_CONTEXT_RE.search(context):
            socials["linkedin_founder"] = value
        return
    if kind in socials and not socials[kind]:
        socials[kind] = value


def person_context(tag: Any, max_len: int = 250) -> str:
    """Text of the smallest enclosing block (a team card) around a link, if it is short enough."""
    node = tag
    for _ in range(4):
        node = node.parent
        if node is None:
            break
        text = node.get_text(" ", strip=True)
        if text and len(text) <= max_len:
            return text
        if len(text) > max_len:
            break
    return ""


def social_score(socials: Dict[str, str]) -> int:
    weights = {"linkedin_company": 2, "instagram": 1, "facebook": 1, "youtube": 1, "twitter": 1}
    return sum(weights.get(k, 0) for k, v in socials.items() if v)


# ----------------------------------------------------------------------------
# DECISION MAKER / COMPANY SIZE / TECH
# ----------------------------------------------------------------------------

def title_rank(title: str) -> int:
    t = title.lower()
    for key, rank in TITLE_RANK:
        if key in t:
            return rank
    return 9


def _clean_person_name(name: str) -> str:
    toks = name.split()
    while toks and toks[-1].lower().strip(".") in TITLE_WORDS:
        toks.pop()
    while toks and toks[0].lower().strip(".,") in STOP_NAME_TOKENS:
        toks.pop(0)
    if not 2 <= len(toks) <= 4 or any(t.lower().strip(".,") in STOP_NAME_TOKENS for t in toks):
        return ""
    return " ".join(toks)


def find_decision_makers(text: str, limit: int = 3) -> List[Tuple[str, str]]:
    text = text[:MAX_TEXT_CHARS]
    found: Dict[str, str] = {}
    for pat in (DM_PATTERN_A, DM_PATTERN_B):
        for m in pat.finditer(text):
            name = _clean_person_name(m.group("name"))
            if name:
                found.setdefault(name, " ".join(m.group("title").split()))
    for m in DM_PATTERN_C.finditer(text):
        name = _clean_person_name(m.group("name"))
        if name:
            found.setdefault(name, "Owner" if m.group("kw").lower() == "owned" else "Founder")
    return sorted(found.items(), key=lambda kv: title_rank(kv[1]))[:limit]


def _size_from_count(n: float) -> str:
    return "small" if n < 50 else "medium" if n < 250 else "large"


def estimate_company_size(text_lower: str) -> Tuple[str, int]:
    """(size, strength). 2 = an explicit headcount, 1 = a weak wording hint, 0 = nothing."""
    text = THOUSANDS_RE.sub("", text_lower[:MAX_TEXT_CHARS])
    m = EMPLOYEE_RANGE_RE.search(text)
    if m:
        return _size_from_count((int(m.group(1)) + int(m.group(2))) / 2), 2
    m = EMPLOYEE_OVER_RE.search(text)
    if m:
        return _size_from_count(int(m.group(1)) * 1.25), 2
    for rx in (EMPLOYEE_SINGLE_RE, TEAM_OF_RE):
        m = rx.search(text)
        if m:
            return _size_from_count(int(m.group(1))), 2
    if LARGE_WORDS_RE.search(text):
        return "large", 1
    if SMALL_WORDS_RE.search(text):
        return "small", 1
    return "unknown", 0


def detect_tech_stack(html_lower: str, generator: str = "") -> Set[str]:
    found = {name for name, marks in TECH_STACK.items() if any(m in html_lower for m in marks)}
    g = generator.lower()
    for name in ("wordpress", "wix", "squarespace", "webflow", "shopify", "joomla", "drupal"):
        if name in g:
            found.add(name)
    return found


# ----------------------------------------------------------------------------
# SCORING
# ----------------------------------------------------------------------------

def calculate_lead_score(row: Dict[str, Any]) -> int:
    score = 0.0
    email = clean_text(row.get("email_primary"))
    phone = clean_text(row.get("phone_primary"))
    company_li = clean_text(row.get("linkedin_company"))
    dm = clean_text(row.get("decision_maker_found")) == "Yes"
    contact = clean_text(row.get("contact_page_found")) == "Yes"
    if email:
        score += min(email_score(email) * 2.5, 25)
    if phone:
        score += 18
    if company_li:
        score += 13
    if dm:
        score += 18
    if contact:
        score += 6
    score += min(int(row.get("social_media_score", 0) or 0) * 2.0, 12)
    if clean_text(row.get("website")):
        score += 5
    if sum(bool(x) for x in (email, phone, company_li, dm, contact)) >= 4:
        score += 3
    return min(100, int(round(score)))


def calculate_confidence(row: Dict[str, Any]) -> str:
    e = 0
    e += 3 if clean_text(row.get("email_primary")) else 0
    e += 3 if clean_text(row.get("phone_primary")) else 0
    e += 2 if clean_text(row.get("linkedin_company")) else 0
    e += 2 if clean_text(row.get("linkedin_ceo")) or clean_text(row.get("linkedin_founder")) else 0
    e += 1 if clean_text(row.get("contact_page_found")) == "Yes" else 0
    e += 1 if int(row.get("social_media_score", 0) or 0) >= 2 else 0
    return "High" if e >= 8 else "Medium" if e >= 5 else "Low"


def best_contact(row: Dict[str, Any]) -> str:
    methods: List[str] = []
    if clean_text(row.get("email_primary")):
        methods.append("Email")
    if clean_text(row.get("phone_primary")):
        methods.append("Phone")
    if any(clean_text(row.get(k)) for k in ("linkedin_ceo", "linkedin_founder", "linkedin_company")):
        methods.append("LinkedIn")
    if clean_text(row.get("instagram")):
        methods.append("Instagram DM")
    if clean_text(row.get("facebook")):
        methods.append("Facebook Message")
    if clean_text(row.get("youtube")):
        methods.append("YouTube")
    if methods:
        return " > ".join(methods[:2])
    return "Website Form" if clean_text(row.get("contact_page_url")) or clean_text(row.get("website")) else "Unknown"


def dedupe_join(values: Iterable[str]) -> str:
    seen: Set[str] = set()
    out: List[str] = []
    for v in values:
        v = clean_text(v)
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return "; ".join(out)


def split_list(value: Any) -> List[str]:
    return [x.strip() for x in re.split(r"[;,]", clean_text(value)) if x.strip()]


# ----------------------------------------------------------------------------
# ROBOTS + RATE LIMITING
# ----------------------------------------------------------------------------

class RobotsCache:
    """robots.txt per host. Follows RFC 9309: a 4xx answer means no rules, a 5xx answer means do not crawl."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._cache: Dict[str, RobotFileParser] = {}
        self._tasks: Dict[str, "asyncio.Task[RobotFileParser]"] = {}

    async def _load(self, session: aiohttp.ClientSession, base: str) -> RobotFileParser:
        rp = RobotFileParser()
        for attempt in range(2):
            try:
                async with session.get(
                    f"{base}/robots.txt",
                    timeout=aiohttp.ClientTimeout(total=self.cfg.robots_timeout),
                    headers={"User-Agent": self.cfg.user_agent},
                    allow_redirects=True,
                ) as resp:
                    if resp.status == 200:
                        rp.parse((await resp.text(errors="replace")).splitlines())
                        return rp
                    if resp.status >= 500 and attempt == 0:
                        await asyncio.sleep(1.0)
                        continue
                    if resp.status >= 500:
                        rp.disallow_all = True
                        return rp
                    rp.allow_all = True  # 4xx: no usable robots.txt, nothing is restricted
                    return rp
            except Exception:
                break  # unreachable host: the page request will fail the same way
        rp.allow_all = True
        return rp

    async def get(self, session: aiohttp.ClientSession, url: str) -> RobotFileParser:
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}"
        if base in self._cache:
            return self._cache[base]
        task = self._tasks.get(base)
        if task is None:
            task = asyncio.ensure_future(self._load(session, base))
            self._tasks[base] = task
        rp = await task
        self._cache[base] = rp
        self._tasks.pop(base, None)
        return rp

    async def allowed(self, session: aiohttp.ClientSession, url: str) -> bool:
        return (await self.get(session, url)).can_fetch(ROBOT_TOKEN, url)

    async def crawl_delay(self, session: aiohttp.ClientSession, url: str) -> Optional[float]:
        try:
            d = (await self.get(session, url)).crawl_delay(ROBOT_TOKEN)
            return float(d) if d is not None else None
        except Exception:
            return None

    async def sitemaps(self, session: aiohttp.ClientSession, url: str) -> List[str]:
        try:
            return list((await self.get(session, url)).site_maps() or [])
        except Exception:
            return []


class DomainLimiter:
    """At least `delay` seconds between requests to one host. The delay grows after 429/503 answers."""

    def __init__(self, delay: float) -> None:
        self.base = max(0.0, delay)
        self._delay: Dict[str, float] = {}
        self._last: Dict[str, float] = {}
        self._locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def set_min(self, host: str, delay: float) -> None:
        self._delay[host] = max(self._delay.get(host, self.base), min(delay, MAX_DELAY_FROM_ROBOTS))

    def penalize(self, host: str) -> None:
        self._delay[host] = min(max(self._delay.get(host, self.base) * 2, 2.0), 15.0)

    async def wait(self, host: str) -> None:
        async with self._locks[host]:
            loop = asyncio.get_running_loop()
            gap = self._delay.get(host, self.base) - (loop.time() - self._last.get(host, -1e9))
            if gap > 0:
                await asyncio.sleep(gap)
            self._last[host] = loop.time()


# ----------------------------------------------------------------------------
# HTML PARSING
# ----------------------------------------------------------------------------

def extract_jsonld(soup: Any, hosts: Iterable[str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"emails": set(), "phones": set(), "socials": {}, "people": []}
    budget = [3000]

    def walk(node: Any, depth: int = 0) -> None:
        budget[0] -= 1
        if budget[0] < 0 or depth > 12:
            return
        if isinstance(node, list):
            for item in node:
                walk(item, depth + 1)
            return
        if not isinstance(node, dict):
            return
        email = normalise_email(str(node.get("email", "")).replace("mailto:", ""))
        if email and email_acceptable(email, hosts):
            out["emails"].add(email)
        phone = clean_phone(str(node.get("telephone", "")))
        if phone:
            out["phones"].add(phone)
        same_as = node.get("sameAs", [])
        same_as = [same_as] if isinstance(same_as, str) else same_as if isinstance(same_as, list) else []
        person_li = ""
        for raw in same_as:
            if isinstance(raw, str):
                kind, value = social_from_url(raw)
                if kind == "linkedin_person":
                    person_li = value
                elif kind:
                    out["socials"][kind] = value
        title, name = clean_text(node.get("jobTitle")), clean_text(node.get("name"))
        if name and title and title_rank(title) < 9:
            out["people"].append((name, title, person_li))
        for value in node.values():
            walk(value, depth + 1)

    for tag in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)}):
        raw = tag.string or tag.get_text(" ", strip=True)
        if raw:
            try:
                walk(json.loads(raw))
            except Exception:
                continue
    return out


def parse_page(html: str, page_url: str, hosts: FrozenSet[str], depth: int) -> PageData:
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception:
        soup = BeautifulSoup(html, "html.parser")

    hosts = frozenset(hosts) | {host_key(urlparse(page_url).netloc)}
    page = PageData(url=page_url)

    gen = soup.find("meta", attrs={"name": re.compile(r"^generator$", re.I)})
    page.tech = detect_tech_stack(html.lower(), clean_text(gen.get("content")) if gen else "")

    ld = extract_jsonld(soup, hosts)
    page.emails |= ld["emails"]
    page.phones |= ld["phones"]
    for k, v in ld["socials"].items():
        if k in page.socials and v:
            page.socials[k] = v

    tw = soup.find("meta", attrs={"name": re.compile(r"^twitter:site$", re.I)})
    if tw and clean_text(tw.get("content")).startswith("@"):
        kind, value = social_from_url("https://x.com/" + clean_text(tw.get("content"))[1:])
        if kind and not page.socials["twitter"]:
            page.socials["twitter"] = value

    # Cloudflare-protected addresses show as "[email protected]" in text; decode them.
    for tag in soup.find_all(attrs={"data-cfemail": True}):
        decoded = decode_cfemail(clean_text(tag.get("data-cfemail")))
        e = normalise_email(decoded or "")
        if e and email_acceptable(e, hosts):
            page.emails.add(e)

    seen_links: Set[str] = set()
    for a in soup.find_all("a", href=True):
        href = clean_text(a.get("href"))
        if not href:
            continue
        hl = href.lower()
        if hl.startswith("mailto:"):
            for part in re.split(r"[,;]", unquote(href[7:].split("?", 1)[0])):
                e = normalise_email(part)
                if e and email_acceptable(e, hosts):
                    page.emails.add(e)
            continue
        if hl.startswith("tel:"):
            p = clean_phone(unquote(href[4:]))
            if p:
                page.phones.add(p)
            continue
        if "/cdn-cgi/l/email-protection#" in hl:
            e = normalise_email(decode_cfemail(href.split("#", 1)[1]) or "")
            if e and email_acceptable(e, hosts):
                page.emails.add(e)
            continue
        if "wa.me/" in hl or "whatsapp.com/send" in hl:
            m = re.search(r"(?:wa\.me/|phone=)\+?(\d{8,15})", hl)
            p = clean_phone("+" + m.group(1)) if m else None
            if p:
                page.phones.add(p)
                page.whatsapp.add(p)
            continue

        absolute = normalise_url(href, page_url)
        if not absolute:
            continue
        kind, value = social_from_url(absolute)
        if kind == "linkedin_person":
            merge_social(page.socials, kind, value, person_context(a))
            continue
        if kind:
            merge_social(page.socials, kind, value)
            continue
        if not same_site(absolute, hosts) or should_skip_url(absolute) or absolute in seen_links:
            continue
        seen_links.add(absolute)
        pr = path_priority(absolute, depth + 1)
        if is_contact_path(urlparse(absolute).path):
            pr -= 4
        page.internal_links.append((absolute, pr))

    # Contact page: the URL says so, or it is titled "contact" and holds a real message form.
    title_text = clean_text(soup.title.get_text(" ", strip=True)) if soup.title else ""
    h1 = soup.find("h1")
    heading = f"{title_text} {h1.get_text(' ', strip=True) if h1 else ''}".lower()
    has_form = any(f.find("textarea") for f in soup.find_all("form"))
    page.is_contact = is_contact_path(urlparse(page_url).path) or ("contact" in heading and has_form)

    for tag in soup(["script", "style", "noscript", "svg", "iframe", "template"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)[:MAX_TEXT_CHARS]

    for e in extract_emails(text):
        if email_acceptable(e, hosts):
            page.emails.add(e)
    page.phones |= extract_phones_from_text(text)

    dms = find_decision_makers(text)
    for name, title, li in ld["people"]:
        dms.append((name, title))
        if li:
            merge_social(page.socials, "linkedin_person", li, title)
    page.decision_makers = sorted(dms, key=lambda x: title_rank(x[1]))[:3]
    page.size = estimate_company_size(text.lower())
    page.internal_links = sorted(page.internal_links, key=lambda x: (x[1], len(urlparse(x[0]).path)))[:MAX_LINKS_PER_PAGE]
    return page


# ----------------------------------------------------------------------------
# HTTP FETCHING
# ----------------------------------------------------------------------------

async def read_limited_response(resp: aiohttp.ClientResponse) -> str:
    chunks: List[bytes] = []
    remaining = MAX_HTML_BYTES
    while remaining > 0:
        chunk = await resp.content.read(min(64 * 1024, remaining))
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    raw = b"".join(chunks)
    enc = resp.charset
    if not enc:
        m = re.search(rb"charset=[\"']?([A-Za-z0-9_\-]+)", raw[:4096])
        enc = m.group(1).decode("ascii", "ignore") if m else "utf-8"
    try:
        return raw.decode(enc, errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def retry_after_seconds(resp: aiohttp.ClientResponse) -> Optional[float]:
    value = resp.headers.get("Retry-After")
    if not value:
        return None
    if value.isdigit():
        return min(float(value), 30.0)
    try:
        return max(0.0, min(parsedate_to_datetime(value).timestamp() - time.time(), 30.0))
    except Exception:
        return None


async def http_get(
    session: aiohttp.ClientSession,
    url: str,
    cfg: Config,
    robots: RobotsCache,
    limiter: DomainLimiter,
    allowed_types: Tuple[str, ...] = HTML_TYPES,
) -> FetchResult:
    if not await robots.allowed(session, url):
        return FetchResult(False, "robots")
    host = host_key(urlparse(url).netloc)
    delay = await robots.crawl_delay(session, url)
    if delay:
        limiter.set_min(host, delay)
    headers = {"User-Agent": cfg.user_agent, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "en-US,en;q=0.8"}
    reason = "network"

    for attempt in range(cfg.retries + 1):
        await limiter.wait(host)
        backoff = min(8.0, (2 ** attempt) * 0.5 + random.uniform(0.0, 0.4))
        try:
            async with session.get(
                url, headers=headers, timeout=aiohttp.ClientTimeout(total=cfg.request_timeout),
                allow_redirects=True, max_redirects=5,
            ) as resp:
                if resp.status == 200:
                    ctype = resp.headers.get("Content-Type", "").lower()
                    if ctype and not any(t in ctype for t in allowed_types):
                        return FetchResult(False, "non_html", status=200)
                    return FetchResult(True, "ok", await read_limited_response(resp), str(resp.url), 200)
                reason = f"http_{resp.status}"
                if resp.status not in RETRYABLE_STATUSES:
                    return FetchResult(False, reason, status=resp.status)
                if resp.status in (429, 503):
                    limiter.penalize(host)
                backoff = retry_after_seconds(resp) or backoff
        except aiohttp.ClientSSLError:
            return FetchResult(False, "ssl")
        except aiohttp.ClientConnectorError as exc:
            if isinstance(getattr(exc, "os_error", None), socket.gaierror):
                return FetchResult(False, "dns")
            reason = "network"
        except (aiohttp.TooManyRedirects, aiohttp.InvalidURL, ValueError):
            return FetchResult(False, "bad_url")
        except (asyncio.TimeoutError, aiohttp.ClientError) as exc:
            reason = "timeout" if isinstance(exc, asyncio.TimeoutError) else "network"
        except Exception as exc:  # never let one page kill a row
            crawl_logger.debug("unexpected fetch error %s: %s", url, exc)
            return FetchResult(False, "error")
        if attempt < cfg.retries:
            await asyncio.sleep(backoff)
    return FetchResult(False, reason)


async def fetch_page(
    session: aiohttp.ClientSession, url: str, hosts: FrozenSet[str], robots: RobotsCache,
    limiter: DomainLimiter, cfg: Config, depth: int,
) -> Tuple[Optional[PageData], FetchResult]:
    res = await http_get(session, url, cfg, robots, limiter)
    if not res.ok:
        return None, res
    final = normalise_url(res.final_url) or url
    try:
        page = await asyncio.to_thread(parse_page, res.text, final, hosts, depth)
    except Exception as exc:
        crawl_logger.debug("parse failed %s: %s", url, exc)
        return None, FetchResult(False, "parse_error")
    return page, res


async def sitemap_candidates(
    session: aiohttp.ClientSession, root_url: str, hosts: Set[str], robots: RobotsCache,
    limiter: DomainLimiter, cfg: Config,
) -> List[str]:
    """High-value URLs (contact, about, team...) from the sitemap, for sites whose menu is built by JavaScript."""
    p = urlparse(root_url)
    base = f"{p.scheme}://{p.netloc}"
    sitemaps = (await robots.sitemaps(session, root_url))[:2] or [f"{base}/sitemap.xml"]

    def locs(xml: str) -> List[str]:
        return [html_lib.unescape(u) for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml[:MAX_SITEMAP_CHARS], re.I)]

    found: List[str] = []
    for sm in sitemaps:
        res = await http_get(session, sm, cfg, robots, limiter, XML_TYPES)
        if not res.ok:
            continue
        urls = locs(res.text)
        children = [u for u in urls if u.lower().endswith(".xml")]
        pages = [u for u in urls if not u.lower().endswith(".xml")]
        if children and not pages:
            pick = next((c for c in children if re.search(r"page", c, re.I)), children[0])
            res2 = await http_get(session, pick, cfg, robots, limiter, XML_TYPES)
            if res2.ok:
                pages = [u for u in locs(res2.text) if not u.lower().endswith(".xml")]
        found += pages
    scored: Dict[str, int] = {}
    for u in found:
        n = normalise_url(u)
        if n and same_site(n, hosts) and not should_skip_url(n):
            pr = path_priority(n, 1)
            if pr <= 5:
                scored[n] = pr
    return [u for u, _ in sorted(scored.items(), key=lambda kv: (kv[1], len(kv[0])))[:8]]


# ----------------------------------------------------------------------------
# SITE CRAWLER
# ----------------------------------------------------------------------------

async def scrape_site(
    session: aiohttp.ClientSession, website: str, robots: RobotsCache, limiter: DomainLimiter, cfg: Config,
) -> SiteData:
    data = SiteData()
    seed = prepare_website(website)
    if not seed:
        data.status = "no_website"
        return data

    kind, value = social_from_url(seed)
    if kind:  # the "website" is really a social profile: record it, do not crawl a social network
        if kind != "linkedin_person":
            data.socials[kind] = value
        data.status = "social_only"
        return data

    hosts: Set[str] = {host_key(urlparse(seed).netloc)}
    data.hosts = hosts
    deadline = time.monotonic() + cfg.site_timeout
    reasons: Counter = Counter()
    frontier: List[Tuple[int, int, int, str]] = []
    queued: Set[str] = set()
    visited: Set[str] = set()
    counter = 0

    def enqueue(url: str, depth: int, priority: Optional[int] = None) -> None:
        nonlocal counter
        n = normalise_url(url)
        if not n or n in queued or n in visited or depth > MAX_CRAWL_DEPTH or not same_site(n, hosts) or should_skip_url(n):
            return
        heapq.heappush(frontier, (path_priority(n, depth) if priority is None else priority, counter, depth, n))
        queued.add(n)
        counter += 1

    def absorb(page: PageData) -> None:
        data.pages_ok += 1
        data.emails |= page.emails
        data.phones |= page.phones
        data.whatsapp |= page.whatsapp
        for k, v in page.socials.items():
            if v and not data.socials.get(k):
                data.socials[k] = v
        if page.is_contact and not data.contact_page_url:
            data.contact_page_url = page.url
        for dm in page.decision_makers:
            if data.decision_maker is None or title_rank(dm[1]) < title_rank(data.decision_maker[1]):
                data.decision_maker = dm
        data.tech |= page.tech
        if page.size[1] > data.size_strength:
            data.size, data.size_strength = page.size

    # 1. First page: try the URL as given, then other schemes, www, and the site root.
    first: Optional[PageData] = None
    for variant in url_variants(seed):
        visited.add(variant)
        data.pages_crawled += 1
        page, res = await fetch_page(session, variant, frozenset(hosts), robots, limiter, cfg, 0)
        if page:
            first = page
            break
        reasons[res.reason] += 1
        if res.reason == "robots":
            break
    if first is None:
        data.status = "blocked_by_robots" if reasons and set(reasons) == {"robots"} else "unreachable"
        return data

    data.final_url = first.url
    fk, fv = social_from_url(first.url)
    if fk:  # redirected to a social profile
        if fk != "linkedin_person":
            data.socials[fk] = fv
        data.status = "social_only"
        return data
    hosts.add(host_key(urlparse(first.url).netloc))  # a redirect to another domain is still the same business
    absorb(first)
    for link, pr in first.internal_links:
        enqueue(link, 1, pr)
    origin = urlparse(first.url)
    enqueue(f"{origin.scheme}://{origin.netloc}/", 0, 1)

    # 2. No obvious contact/about links on the first page: ask the sitemap, then try common slugs.
    if not any(item[0] <= 5 for item in frontier):
        candidates = await sitemap_candidates(session, first.url, hosts, robots, limiter, cfg)
        for u in candidates:
            enqueue(u, 1)
        if not candidates:
            for slug in GUESSED_SLUGS:
                enqueue(urljoin(first.url, slug), 1)

    # 3. Best pages first, a couple at a time.
    while frontier and data.pages_crawled < cfg.max_pages and time.monotonic() < deadline:
        batch: List[Tuple[int, str]] = []
        while frontier and len(batch) < cfg.per_host and data.pages_crawled + len(batch) < cfg.max_pages:
            _p, _s, depth, url = heapq.heappop(frontier)
            queued.discard(url)
            if url not in visited:
                visited.add(url)
                batch.append((depth, url))
        if not batch:
            break
        results = await asyncio.gather(
            *(fetch_page(session, u, frozenset(hosts), robots, limiter, cfg, d) for d, u in batch),
            return_exceptions=True,
        )
        data.pages_crawled += len(batch)
        for (depth, _url), r in zip(batch, results):
            if isinstance(r, BaseException):
                reasons["error"] += 1
                continue
            page, res = r
            if not page:
                reasons[res.reason] += 1
                continue
            absorb(page)
            for link, pr in page.internal_links:
                enqueue(link, depth + 1, pr)
        # Enough independent evidence: stop early instead of burning the page budget.
        if data.emails and data.phones and data.contact_page_url and (data.decision_maker or data.pages_ok >= 6):
            break
    return data


# ----------------------------------------------------------------------------
# ROW PROCESSING
# ----------------------------------------------------------------------------

def initial_row_defaults(row: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    for f in OUTPUT_ENRICHMENT_FIELDS:
        out.setdefault(f, "")
    out.setdefault("whatsapp_number", "")
    for k, v in (("contact_page_found", "No"), ("social_media_score", "0"), ("lead_quality_score", "0"),
                 ("contact_confidence", "Low"), ("best_contact_method", "Unknown"),
                 ("decision_maker_found", "No"), ("company_size_indicator", "unknown")):
        if not clean_text(out.get(k)):
            out[k] = v
    return out


def finalise_scores(out: Dict[str, Any]) -> None:
    out["lead_quality_score"] = str(calculate_lead_score(out))
    out["contact_confidence"] = calculate_confidence(out)
    out["best_contact_method"] = best_contact(out)


def merge_site_into_row(out: Dict[str, Any], site: SiteData) -> None:
    """Combine what the row already had with what the crawl found. Existing input values are never overwritten."""
    hosts = site.hosts
    emails = dedupe_join(
        [e.lower() for e in split_list(out.get("email"))] + [e.lower() for e in split_list(out.get("email_primary"))] + sorted(site.emails)
    )
    out["email"] = emails
    out["email_primary"] = choose_primary_email(emails.split("; ") if emails else [], hosts)

    existing = [p for p in (clean_phone(x) for x in split_list(out.get("whatsapp_number")) + split_list(out.get("phone_primary"))) if p]
    merged: Dict[str, str] = {}
    for p in existing + sorted(site.phones):
        merged.setdefault(phone_key(p), p)
    phones = list(merged.values())
    out["phones_all"] = "; ".join(phones)
    out["phone_primary"] = choose_primary_phone(phones, site.whatsapp) if phones else clean_text(out.get("phone_primary"))
    if not clean_text(out.get("whatsapp_number")) and site.whatsapp:
        out["whatsapp_number"] = sorted(site.whatsapp)[0]

    for k, v in site.socials.items():
        if v and not clean_text(out.get(k)):
            out[k] = v
    out["social_media_score"] = str(social_score({k: clean_text(out.get(k)) for k in SOCIAL_FIELDS}))

    if site.contact_page_url and not clean_text(out.get("contact_page_url")):
        out["contact_page_url"] = site.contact_page_url
    if site.contact_page_url:
        out["contact_page_found"] = "Yes"
    if site.decision_maker:
        out["decision_maker_found"] = "Yes"
        if not clean_text(out.get("decision_maker_name")):
            out["decision_maker_name"], out["decision_maker_title"] = site.decision_maker
    out["tech_stack_detected"] = dedupe_join(split_list(out.get("tech_stack_detected")) + sorted(site.tech))
    if site.size != "unknown":
        out["company_size_indicator"] = site.size
    out["pages_crawled"] = str(site.pages_crawled)
    out["enrichment_status"] = site.status


class SiteCache:
    """One crawl per distinct start URL, shared by every row that has it (chains, branches, duplicates)."""

    def __init__(self) -> None:
        self._tasks: Dict[str, "asyncio.Future[SiteData]"] = {}

    async def get(self, key: str, factory: Callable[[], Awaitable[SiteData]]) -> SiteData:
        task = self._tasks.get(key)
        if task is None:
            task = asyncio.ensure_future(factory())
            self._tasks[key] = task
        return await task


async def process_row(
    row: Dict[str, Any], index: int, session: aiohttp.ClientSession, robots: RobotsCache,
    limiter: DomainLimiter, cache: SiteCache, cfg: Config,
) -> Tuple[int, Dict[str, Any]]:
    out = initial_row_defaults(row)
    name = clean_text(out.get("business_name")) or f"Row {index + 1}"
    seed = prepare_website(out.get("website"))
    try:
        if seed:
            site = await cache.get(seed, lambda: scrape_site(session, seed, robots, limiter, cfg))
        else:
            site = SiteData(status="no_website")
        merge_site_into_row(out, site)
        finalise_scores(out)
        crawl_logger.info(
            "%-6s %-30s Q=%3s C=%-6s pages=%2d email=%-3s phone=%-3s LI=%-3s DM=%-3s",
            site.status[:6].upper(), name[:30], out["lead_quality_score"], out["contact_confidence"],
            site.pages_crawled, "yes" if out.get("email_primary") else "no", "yes" if out.get("phone_primary") else "no",
            "yes" if out.get("linkedin_company") else "no", out.get("decision_maker_found", "No").lower(),
        )
    except Exception as exc:
        crawl_logger.exception("row %d (%s) failed: %s", index + 1, name, exc)
        out["enrichment_status"] = "error"
        finalise_scores(out)
    return index, out


# ----------------------------------------------------------------------------
# CSV + CHECKPOINT
# ----------------------------------------------------------------------------

def read_csv(path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    raw = Path(path).read_bytes()
    text = ""
    for enc in ("utf-8-sig", "cp1252"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text, newline=""), dialect=dialect)
    fields = [f.strip() for f in (reader.fieldnames or [])]
    reader.fieldnames = fields
    rows = [{k: (v if v is not None else "") for k, v in r.items() if k is not None} for r in reader]
    if "website" not in fields:
        alias = next((f for f in fields if f.lower() in WEBSITE_ALIASES), None)
        if alias:
            for r in rows:
                r["website"] = r.get(alias, "")
            fields.append("website")
    return rows, fields


def build_output_columns(input_columns: Sequence[str]) -> List[str]:
    cols: List[str] = []
    for c in list(input_columns) + LEGACY_OUTPUT_COLUMNS + OUTPUT_ENRICHMENT_FIELDS:
        if c and c not in cols:
            cols.append(c)
    return cols


def row_key(row: Dict[str, Any]) -> str:
    """Identity of an input row. A checkpoint row is reused only if this still matches, so editing the CSV between runs is safe."""
    basis = "|".join(clean_text(row.get(k)).lower() for k in ("place_id", "business_name", "website"))
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:16]


def checkpoint_path(output_path: str) -> str:
    return str(Path(output_path).with_name(Path(output_path).stem + "_checkpoint.jsonl"))


def make_output_path(input_file: str) -> str:
    p = Path(input_file)
    stable = p.with_name(f"{p.stem}_enriched.csv")
    if not stable.exists() or os.path.exists(checkpoint_path(str(stable))):
        return str(stable)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate, i = p.with_name(f"{p.stem}_enriched_{ts}.csv"), 1
    while candidate.exists():
        candidate = p.with_name(f"{p.stem}_enriched_{ts}_{i}.csv")
        i += 1
    return str(candidate)


class Checkpoint:
    """Append-only JSON lines: one line per finished row. Cheap, crash-safe, and a half-written last line is ignored."""

    def __init__(self, path: str, sync_every: int = 10) -> None:
        self.path = path
        self.sync_every = max(1, sync_every)
        self._fh: Any = None
        self._pending = 0

    def load(self, keys: Sequence[str]) -> Dict[int, Dict[str, Any]]:
        out: Dict[int, Dict[str, Any]] = {}
        stale = 0
        if not os.path.exists(self.path):
            return out
        with open(self.path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    rec = json.loads(line)
                    i, key, row = int(rec["i"]), rec["k"], rec["row"]
                except Exception:
                    continue
                if 0 <= i < len(keys) and keys[i] == key and isinstance(row, dict):
                    out[i] = row
                else:
                    stale += 1
        if stale:
            crawl_logger.warning("ignored %d checkpoint rows that no longer match the input file", stale)
        return out

    def open(self, fresh: bool = False) -> None:
        if fresh and os.path.exists(self.path):
            os.remove(self.path)
        needs_newline = False
        if os.path.exists(self.path) and os.path.getsize(self.path) > 0:
            with open(self.path, "rb") as f:
                f.seek(-1, os.SEEK_END)
                needs_newline = f.read(1) != b"\n"
        self._fh = open(self.path, "a", encoding="utf-8")
        if needs_newline:
            self._fh.write("\n")

    def write(self, index: int, key: str, row: Dict[str, Any]) -> None:
        if self._fh is None:
            return
        self._fh.write(json.dumps({"i": index, "k": key, "row": row}, ensure_ascii=False) + "\n")
        self._pending += 1
        if self._pending >= self.sync_every:
            self.sync()

    def sync(self) -> None:
        if self._fh is not None:
            self._fh.flush()
            try:
                os.fsync(self._fh.fileno())
            except OSError:
                pass
            self._pending = 0

    def close(self) -> None:
        if self._fh is not None:
            self.sync()
            self._fh.close()
            self._fh = None

    def remove(self) -> None:
        self.close()
        try:
            os.remove(self.path)
        except OSError:
            pass


def write_final_csv(path: str, rows: Sequence[Dict[str, Any]], columns: Sequence[str]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(columns), restval="", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(tmp, path)


# ----------------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------------

def fmt_duration(seconds: float) -> str:
    s = int(max(0, seconds))
    return f"{s // 60}m {s % 60:02d}s"


async def run(input_file: str, output_file: Optional[str] = None, resume: bool = True, cfg: Optional[Config] = None) -> Optional[str]:
    cfg = cfg or Config()
    try:
        rows, input_columns = read_csv(input_file)
    except Exception as exc:
        crawl_logger.error("cannot read input: %s", exc)
        return None
    if "website" not in input_columns:
        crawl_logger.error("input CSV needs a 'website' column (also accepted: url, site, homepage, domain)")
        return None

    output_path = output_file or make_output_path(input_file)
    columns = build_output_columns(input_columns)
    total = len(rows)
    keys = [row_key(r) for r in rows]
    results: List[Optional[Dict[str, Any]]] = [None] * total

    ckpt = Checkpoint(checkpoint_path(output_path), cfg.checkpoint_every)
    if resume:
        for i, r in ckpt.load(keys).items():
            if cfg.retry_unreachable and r.get("enrichment_status") == "unreachable":
                continue
            results[i] = r
    done = sum(r is not None for r in results)
    crawl_logger.info("loaded %d leads | output=%s | already done=%d", total, output_path, done)
    ckpt.open(fresh=not resume)

    robots, limiter, cache = RobotsCache(cfg), DomainLimiter(cfg.delay), SiteCache()
    connector = aiohttp.TCPConnector(limit=cfg.concurrency * 2, limit_per_host=cfg.per_host, ttl_dns_cache=300, enable_cleanup_closed=True)
    sem = asyncio.Semaphore(cfg.concurrency)
    start = time.perf_counter()
    todo = total - done

    try:
        async with aiohttp.ClientSession(connector=connector, timeout=aiohttp.ClientTimeout(total=cfg.request_timeout), trust_env=True) as session:

            async def bounded(i: int) -> Tuple[int, Dict[str, Any]]:
                async with sem:
                    return await process_row(rows[i], i, session, robots, limiter, cache, cfg)

            tasks = [asyncio.ensure_future(bounded(i)) for i in range(total) if results[i] is None]
            finished = 0
            for fut in asyncio.as_completed(tasks):
                try:
                    i, enriched = await fut
                except Exception as exc:
                    crawl_logger.exception("task failed unexpectedly: %s", exc)
                    continue
                results[i] = enriched
                ckpt.write(i, keys[i], enriched)
                finished += 1
                if finished % 25 == 0 or finished == todo:
                    rate = finished / max(1e-6, time.perf_counter() - start)
                    crawl_logger.info("progress %d/%d (%.0f%%) eta %s", done + finished, total, 100 * (done + finished) / max(1, total), fmt_duration((todo - finished) / max(rate, 1e-6)))
    finally:
        ckpt.close()

    if any(r is None for r in results):
        crawl_logger.warning("%d rows did not finish; checkpoint kept, run again to resume", sum(r is None for r in results))
        return None
    final_rows = [r for r in results if r is not None]
    try:
        write_final_csv(output_path, final_rows, columns)
    except Exception as exc:
        crawl_logger.error("final write failed (checkpoint kept): %s", exc)
        return None
    ckpt.remove()

    elapsed, n = time.perf_counter() - start, max(1, len(final_rows))
    pct = lambda c: f"{c} ({100 * c / n:.0f}%)"  # noqa: E731
    statuses = Counter(clean_text(r.get("enrichment_status")) or "unknown" for r in final_rows)
    print(
        "\n" + "=" * 64
        + "\nLEAD ENRICHMENT COMPLETE\n" + "=" * 64
        + f"\nOutput             : {output_path}"
        + f"\nLeads              : {len(final_rows)}"
        + f"\nElapsed            : {fmt_duration(elapsed)} ({elapsed / n:.1f}s per lead)"
        + f"\nHigh quality (70+) : {pct(sum(int(r.get('lead_quality_score') or 0) >= 70 for r in final_rows))}"
        + f"\nWith email         : {pct(sum(bool(clean_text(r.get('email_primary'))) for r in final_rows))}"
        + f"\nWith phone         : {pct(sum(bool(clean_text(r.get('phone_primary'))) for r in final_rows))}"
        + f"\nWith LinkedIn      : {pct(sum(bool(clean_text(r.get('linkedin_company'))) for r in final_rows))}"
        + f"\nDecision makers    : {pct(sum(clean_text(r.get('decision_maker_found')) == 'Yes' for r in final_rows))}"
        + "\nStatus             : " + ", ".join(f"{k}={v}" for k, v in sorted(statuses.items()))
        + "\n" + "=" * 64
    )
    return output_path


# ============================================================================
# 2. OPENSTREETMAP SEARCH (free: no key, no card, no billing; replaces the Google Places search)
# ============================================================================
#
# Businesses come from OpenStreetMap through two free public services:
#   * Nominatim turns "Colombo, Sri Lanka" into a map rectangle (one request per place name, remembered).
#   * Overpass lists the businesses inside that rectangle (one request per search; no 60-results cap).
# The price of "free" is politeness: the public servers ask for about one request a second, an honest
# User-Agent and well under 10,000 queries a day. Requests are spaced out and capped (limits in autoleads.json).
# OpenStreetMap has no ratings or reviews, and some businesses are missing or have no phone or website: the
# website crawl and the phone-only path in the Lead Inbox make up for that. You can also feed the worker your
# own CSV (`enrich`). Data (c) OpenStreetMap contributors, ODbL: keep that credit wherever you show or share it.

API_BASE = ""  # empty = the public servers. A test or your own server: one base URL that serves /search and /api/interpreter
NOMINATIM_URL = "https://nominatim.openstreetmap.org"
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
OSM_ATTRIBUTION = "(c) OpenStreetMap contributors (ODbL)"
MIN_CELL_DEGREES = 0.003  # about 300 m: never split an area smaller than this
OVERPASS_LIMIT = 800  # elements per query; a full answer means "crowded area": it is split into four and asked again
OVERPASS_TIMEOUT = 90  # seconds the server may spend on one query
MAP_PAUSE = 1.0  # seconds between requests to the same free server (tests set this to 0)

OUTPUT_COLUMNS = [
    "place_id", "business_name", "rating", "reviews", "review_count", "category", "address",
    "whatsapp_number", "website", "email", "facebook", "instagram", "maps_url", "latitude", "longitude", "search_query",
]

# What to look for, by the words people type. (words, OpenStreetMap tags, name stems).
# A tag is "key=value" or "key=value1|value2". A name stem finds businesses whose name contains it
# (only among things tagged as a shop, craft, office, amenity, healthcare, tourism or leisure place).
# A search that matches nothing here still works: it looks for businesses with the search words in their name.
CATEGORIES: Tuple[Tuple[Tuple[str, ...], Tuple[str, ...], Tuple[str, ...]], ...] = (
    (("plumber", "plumbing"), ("craft=plumber",), ("plumb",)),
    (("electrician", "electrical", "electric contractor"), ("craft=electrician", "shop=electrical"), ("electrical", "electrician")),
    (("carpenter", "carpentry", "woodwork", "joinery"), ("craft=carpenter", "craft=joiner"), ("carpent", "joiner")),
    (("painter", "painting contractor"), ("craft=painter",), ("painter", "painting")),
    (("roofer", "roofing"), ("craft=roofer",), ("roofing", "roofer")),
    (("builder", "construction", "contractor", "civil engineer"), ("craft=builder", "office=construction_company"), ("construction", "builders")),
    (("air conditioning", "air conditioner", "ac repair", "hvac", "refrigeration"), ("craft=hvac", "shop=hvac"), ("air condition", "hvac", "refrigerat")),
    (("welding", "welder", "fabrication", "metal work"), ("craft=metal_construction", "craft=welder"), ("welding", "fabricat")),
    (("mechanic", "garage", "auto repair", "car repair", "workshop"), ("shop=car_repair",), ("garage", "auto service", "motors")),
    (("car dealer", "car sale", "vehicle sale"), ("shop=car",), ("motors", "auto sales")),
    (("tyre", "tire"), ("shop=tyres",), ("tyre",)),
    (("car wash", "vehicle wash"), ("amenity=car_wash",), ("car wash",)),
    (("driving school",), ("amenity=driving_school",), ("driving school",)),
    (("restaurant", "eatery", "diner"), ("amenity=restaurant",), ("restaurant",)),
    (("cafe", "coffee shop", "coffee"), ("amenity=cafe",), ("cafe", "coffee")),
    (("bakery", "bakeries", "cake shop"), ("shop=bakery", "shop=pastry"), ("bakery", "bake")),
    (("bar", "pub"), ("amenity=bar|pub",), ()),
    (("fast food", "takeaway", "take away"), ("amenity=fast_food",), ()),
    (("catering", "caterer"), ("craft=caterer",), ("cater",)),
    (("hotel", "guest house", "guesthouse", "hostel", "villa", "resort", "homestay"), ("tourism=hotel|guest_house|hostel|motel|apartment|chalet",), ("hotel", "resort", "villa", "guest house")),
    (("travel agency", "travel agent", "tour operator", "tours"), ("shop=travel_agency", "office=travel_agent"), ("travels", "tours")),
    (("dentist", "dental"), ("amenity=dentist", "healthcare=dentist"), ("dental", "dentist")),
    (("doctor", "clinic", "medical centre", "medical center", "gp"), ("amenity=doctors|clinic", "healthcare=doctor|clinic"), ("clinic", "medical")),
    (("pharmacy", "chemist", "drugstore"), ("amenity=pharmacy",), ("pharmacy",)),
    (("hospital",), ("amenity=hospital",), ()),
    (("vet", "veterinary", "veterinarian", "pet clinic"), ("amenity=veterinary",), ("veterinar", "pet care")),
    (("optician", "optical", "eye care", "spectacles"), ("shop=optician",), ("optical", "optician")),
    (("physiotherapy", "physio", "physiotherapist"), ("healthcare=physiotherapist",), ("physio",)),
    (("laboratory", "medical lab", "diagnostic"), ("healthcare=laboratory",), ("laborator",)),
    (("salon", "hairdresser", "barber", "hair salon", "beauty salon", "beauty parlour", "beauty parlor"), ("shop=hairdresser|beauty",), ("salon", "beauty", "barber")),
    (("spa", "massage"), ("shop=massage", "leisure=spa", "amenity=spa"), ("massage",)),
    (("gym", "fitness", "fitness centre", "fitness center"), ("leisure=fitness_centre|sports_centre",), ("gym", "fitness")),
    (("yoga", "pilates"), ("sport=yoga|pilates",), ("yoga", "pilates")),
    (("lawyer", "attorney", "law firm", "solicitor", "notary"), ("office=lawyer|notary",), ("attorney", "law firm")),
    (("accountant", "accounting", "auditor", "audit", "bookkeeping", "tax"), ("office=accountant|tax_advisor",), ("accountant", "accounting", "auditor")),
    (("insurance",), ("office=insurance",), ("insurance",)),
    (("estate agent", "real estate", "property", "realtor"), ("office=estate_agent",), ("properties", "real estate", "realty")),
    (("architect", "architecture", "interior design", "interior designer"), ("office=architect", "craft=interior_designer"), ("architect", "interior")),
    (("engineer", "engineering", "surveyor"), ("office=engineer|surveyor",), ("engineering",)),
    (("consultant", "consulting", "consultancy"), ("office=consulting",), ("consult",)),
    (("marketing", "advertising", "digital agency", "seo", "branding", "media agency", "web design"), ("office=advertising_agency|marketing",), ("marketing", "advertising")),
    (("software", "it company", "it service", "web development", "tech company", "app development"), ("office=it|software",), ("software", "technolog")),
    (("computer shop", "computer repair", "laptop"), ("shop=computer",), ("computer",)),
    (("mobile phone", "phone shop", "cellphone", "mobile shop"), ("shop=mobile_phone",), ("mobile",)),
    (("electronics", "electronic shop"), ("shop=electronics",), ("electronic",)),
    (("school", "tuition", "tutor", "academy", "institute", "education", "training"), ("amenity=school|college|language_school|music_school|training|prep_school", "office=educational_institution"), ("academy", "institute", "tuition", "college")),
    (("kindergarten", "preschool", "pre school", "day care", "daycare", "nursery"), ("amenity=kindergarten|childcare",), ("montessori", "preschool", "kindergarten")),
    (("bank",), ("amenity=bank",), ()),
    (("supermarket", "grocery", "grocer", "convenience store", "mini market"), ("shop=supermarket|convenience|greengrocer|general",), ("supermarket",)),
    (("clothing", "clothes", "boutique", "fashion", "garment", "apparel", "textile"), ("shop=clothes|boutique|fabric|tailor",), ("fashion", "boutique", "textile", "garment")),
    (("tailor", "tailoring", "seamstress"), ("craft=tailor", "shop=tailor"), ("tailor",)),
    (("shoe", "footwear"), ("shop=shoes",), ("shoe", "footwear")),
    (("jewellery", "jewelry", "jeweller", "jeweler", "gold"), ("shop=jewelry",), ("jewel",)),
    (("furniture", "home decor", "interior shop"), ("shop=furniture|interior_decoration",), ("furniture",)),
    (("hardware", "building material", "paint shop", "diy"), ("shop=hardware|doityourself|trade|paint",), ("hardware", "building material")),
    (("florist", "flower", "flowers"), ("shop=florist",), ("florist", "flower")),
    (("book shop", "bookshop", "bookstore", "stationery", "stationer"), ("shop=books|stationery",), ("bookshop", "book shop", "stationer")),
    (("printing", "printer", "print shop", "copy shop", "digital printing"), ("shop=copyshop|printing", "craft=printer"), ("print",)),
    (("photographer", "photography", "photo studio", "videographer"), ("craft=photographer", "shop=photo|photo_studio"), ("photo",)),
    (("laundry", "dry clean", "dry cleaner", "dry cleaning"), ("shop=laundry|dry_cleaning",), ("laundry", "dry clean")),
    (("cleaning", "cleaning service", "pest control", "janitorial"), ("shop=cleaning", "office=cleaning"), ("cleaning", "pest")),
    (("courier", "logistics", "freight", "shipping", "transport", "cargo", "delivery"), ("office=logistics|courier|freight_forwarder",), ("logistics", "courier", "cargo", "freight")),
    (("event", "wedding", "event planner", "party"), ("shop=wedding|party", "craft=caterer"), ("wedding", "event")),
    (("gift shop", "gift", "toy shop", "toys"), ("shop=gift|toys",), ("gift", "toys")),
    (("pet shop", "pet store", "pet supplies"), ("shop=pet",), ("pet shop", "pet care", "pet store")),
    (("motorcycle", "motorbike", "bike shop", "bicycle"), ("shop=motorcycle|bicycle",), ("motor cycle", "motorcycle", "bike")),
    (("farm", "agriculture", "agro", "nursery plants", "plant nursery"), ("shop=garden_centre|agrarian", "craft=gardener"), ("agro", "farm", "nursery")),
    (("manufacturer", "factory", "manufacturing", "industrial"), ("industrial=factory", "man_made=works", "office=company"), ("manufactur", "industries", "factory")),
    (("ngo", "charity", "foundation"), ("office=ngo|association|foundation",), ("foundation", "society")),
    (("church", "temple", "mosque", "kovil"), ("amenity=place_of_worship",), ()),
)

SOCIAL_TAG_KEYS = {"facebook": ("contact:facebook", "facebook"), "instagram": ("contact:instagram", "instagram")}
PHONE_TAG_KEYS = ("phone", "contact:phone", "mobile", "contact:mobile", "contact:whatsapp", "whatsapp")
WEBSITE_TAG_KEYS = ("website", "contact:website", "url", "contact:url")
EMAIL_TAG_KEYS = ("email", "contact:email")
CATEGORY_TAG_KEYS = ("amenity", "shop", "craft", "office", "healthcare", "tourism", "leisure", "industrial")


class ApiError(Exception):
    """A problem retrying will not fix (bad request, area not found, servers refusing us)."""


class BudgetExceeded(Exception):
    """The request limit for this search was reached."""


class AreaTooHeavy(Exception):
    """The server could not answer for an area this big (timeout / too many results). Split it and ask again."""


@dataclass(frozen=True)
class Rect:
    south: float
    west: float
    north: float
    east: float

    def split4(self) -> List["Rect"]:
        mid_lat, mid_lng = (self.south + self.north) / 2, (self.west + self.east) / 2
        return [Rect(self.south, self.west, mid_lat, mid_lng), Rect(self.south, mid_lng, mid_lat, self.east),
                Rect(mid_lat, self.west, self.north, mid_lng), Rect(mid_lat, mid_lng, self.north, self.east)]

    @property
    def small(self) -> bool:
        return (self.north - self.south) < MIN_CELL_DEGREES or (self.east - self.west) < MIN_CELL_DEGREES

    @staticmethod
    def from_nominatim(box: Sequence[Any]) -> "Rect":
        """Nominatim's boundingbox is [south, north, west, east] as text."""
        south, north, west, east = (float(x) for x in box)
        return Rect(south, west, north, east)

    @staticmethod
    def parse(text: str) -> "Rect":
        parts = [float(x) for x in text.split(",")]
        if len(parts) != 4:
            raise ValueError("--bbox needs south,west,north,east")
        r = Rect(*parts)
        if not (-90 <= r.south < r.north <= 90 and -180 <= r.west < r.east <= 180):
            raise ValueError("--bbox must be south,west,north,east with south < north and west < east")
        return r


@dataclass
class SearchConfig:
    max_requests: int = 80
    max_depth: int = 2
    concurrency: int = 1  # the free servers want one request at a time
    pause: float = field(default_factory=lambda: MAP_PAUSE)  # seconds between requests to one server (Nominatim: at least 1.1 when above 0)
    limit: int = OVERPASS_LIMIT
    region: str = ""  # two-letter country code, e.g. LK: keeps the area lookup inside that country
    language: str = ""
    min_reviews: int = 0  # kept so old settings files still load: OpenStreetMap has no reviews, so it is ignored
    require_website: bool = False
    timeout: float = 120.0


@dataclass
class SearchStats:
    requests: int = 0
    returned: int = 0  # every element the server returned, duplicates included
    unique: int = 0
    filtered: Counter = field(default_factory=Counter)
    already_seen: int = 0
    budget_hit: bool = False


def user_agent() -> str:
    """Honest, per-installation User-Agent (the free servers block anonymous or shared ones).
    Set AUTOLEADS_CONTACT to your email to be reachable if your usage ever causes a problem."""
    who = hashlib.sha1(socket.gethostname().encode("utf-8", "replace")).hexdigest()[:8]
    contact = os.environ.get("AUTOLEADS_CONTACT", "").strip()
    return f"AutoLeadsWorker/1.0 (lead search tool; install {who}" + (f"; {contact}" if contact else "") + ")"


def _singular(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and re.search(r"(ses|xes|ches|shes)$", word):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def normalise_term(text: str) -> str:
    words = re.sub(r"[^\w\s]|_", " ", str(text).lower()).split()
    return " ".join(_singular(w) for w in words)


def split_area_from_query(query: str) -> Tuple[str, str]:
    """'plumbers in Colombo, Sri Lanka' -> ('plumbers', 'Colombo, Sri Lanka'). No ' in ' -> (query, '')."""
    m = re.match(r"^(.*?)\s+in\s+(.+)$", query.strip(), re.I)
    return (m.group(1).strip(), m.group(2).strip()) if m and m.group(1).strip() else (query.strip(), "")


def category_filters(term: str) -> Tuple[List[str], List[str]]:
    """(tags, name stems) to search for a free-text term such as 'plumbers' or 'dental clinics'."""
    norm = normalise_term(term)
    tags: List[str] = []
    stems: List[str] = []
    padded = f" {norm} "
    for words, entry_tags, entry_stems in CATEGORIES:
        if any(f" {normalise_term(w)} " in padded for w in words):
            tags.extend(t for t in entry_tags if t not in tags)
            stems.extend(s for s in entry_stems if s not in stems)
    if not tags and len(norm) >= 3:
        stems.append(norm)  # unknown kind of business: look for the words in business names
    return tags, [s for s in stems if len(s) >= 3 and re.fullmatch(r"[\w ]+", s)]


def _tag_filter(tag: str) -> str:
    key, _, value = tag.partition("=")
    if "|" in value:
        return f'["{key}"~"^({value})$"]'
    return f'["{key}"="{value}"]'


def overpass_query(tags: Sequence[str], stems: Sequence[str], rect: Rect, limit: int = OVERPASS_LIMIT, timeout: int = OVERPASS_TIMEOUT) -> str:
    bbox = f"({rect.south:.6f},{rect.west:.6f},{rect.north:.6f},{rect.east:.6f})"
    business = '["name"][~"^(shop|craft|office|amenity|healthcare|tourism|leisure|industrial)$"~"."]'
    parts = [f"nwr{_tag_filter(t)}[\"name\"]{bbox};" for t in tags]
    parts += [f'nwr{business}["name"~"{s}",i]{bbox};' for s in stems]
    if not parts:
        raise ApiError("Nothing to search for: the search text is empty.")
    return f"[out:json][timeout:{int(timeout)}];\n(\n  " + "\n  ".join(parts) + f"\n);\nout tags center {int(limit)};"


def _error_message(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()[:300]


class OsmClient:
    """Talks to Nominatim and Overpass one request at a time, spaced out, with retries and server fallback."""

    def __init__(self, session: Any, cfg: SearchConfig, base: str = "") -> None:
        base = (base or "").rstrip("/")
        self.session, self.cfg = session, cfg
        self.nominatim = base or os.environ.get("NOMINATIM_URL", "").rstrip("/") or NOMINATIM_URL
        override = os.environ.get("OVERPASS_URL", "").strip()
        self.overpass = [base + "/api/interpreter"] if base else ([override] if override else list(OVERPASS_URLS))
        self.requests = 0
        self._sem = asyncio.Semaphore(max(1, cfg.concurrency))
        self._last: Dict[str, float] = {}
        self._headers = {"User-Agent": user_agent(), "Accept": "application/json"}
        if cfg.language:
            self._headers["Accept-Language"] = cfg.language

    async def _wait_turn(self, server: str, interval: float) -> None:
        if interval > 0:
            gap = interval - (time.monotonic() - self._last.get(server, -1e9))
            if gap > 0:
                await asyncio.sleep(gap)
        self._last[server] = time.monotonic()

    def _count(self) -> None:
        if self.requests >= self.cfg.max_requests:
            raise BudgetExceeded()
        self.requests += 1

    async def geocode(self, place: str) -> Rect:
        """The map rectangle for a place name."""
        params = {"q": place, "format": "jsonv2", "limit": "1"}
        if re.fullmatch(r"[A-Za-z]{2}", self.cfg.region or ""):
            params["countrycodes"] = self.cfg.region.lower()
        interval = max(self.cfg.pause, 1.1) if self.cfg.pause > 0 else 0.0
        last_problem = ""
        async with self._sem:
            for attempt in range(3):
                self._count()
                await self._wait_turn("nominatim", interval)
                try:
                    async with self.session.get(self.nominatim + "/search", params=params, headers=self._headers,
                                                timeout=aiohttp.ClientTimeout(total=self.cfg.timeout)) as resp:
                        if resp.status == 200:
                            data = await resp.json(content_type=None)
                            if isinstance(data, list) and data and data[0].get("boundingbox"):
                                return Rect.from_nominatim(data[0]["boundingbox"])
                            raise ApiError(f"Could not find the area {place!r} on OpenStreetMap. Try a fuller name (city, country) or pass --bbox.")
                        last_problem = f"{resp.status} {_error_message(await resp.text())}"
                        if resp.status in (403, 400, 401):
                            raise ApiError(f"The OpenStreetMap place lookup refused the request ({last_problem}). "
                                           "If this keeps happening, set AUTOLEADS_CONTACT to your email address and try again later.")
                except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
                    last_problem = str(exc) or exc.__class__.__name__
                await asyncio.sleep(min(2.0 ** attempt * 2.0, 20.0) if self.cfg.pause > 0 else 0)
        raise ApiError(f"The OpenStreetMap place lookup is not answering ({last_problem}). Try again in a few minutes.")

    async def interpret(self, ql: str) -> Dict[str, Any]:
        """Run one Overpass query. Tries the other public servers when one is busy. Raises AreaTooHeavy when the
        query is too big for the server (the caller splits the area), ApiError for anything retrying will not fix."""
        heavy = 0
        last_problem = ""
        async with self._sem:
            for attempt in range(2 * len(self.overpass) + 1):
                server = self.overpass[attempt % len(self.overpass)]
                self._count()
                await self._wait_turn(server, self.cfg.pause)
                wait = min(2.0 ** (attempt // len(self.overpass)) * 3.0, 30.0) if self.cfg.pause > 0 else 0.0
                try:
                    async with self.session.post(server, data={"data": ql}, headers=self._headers,
                                                 timeout=aiohttp.ClientTimeout(total=self.cfg.timeout)) as resp:
                        if resp.status == 200:
                            try:
                                data = await resp.json(content_type=None)
                            except ValueError:
                                data = None
                            if isinstance(data, dict):
                                remark = str(data.get("remark") or "")
                                if "runtime error" in remark or "out of memory" in remark.lower():
                                    heavy += 1
                                    last_problem = remark[:200]
                                else:
                                    return data
                            else:
                                last_problem = "the server sent something that is not a result"
                        else:
                            text = _error_message(await resp.text())
                            last_problem = f"{resp.status} {text}"
                            if resp.status == 400:
                                raise ApiError(f"Overpass rejected the search: {text}")
                            if resp.status == 504:
                                heavy += 1
                            retry_after = resp.headers.get("Retry-After", "")
                            if retry_after.isdigit():
                                wait = min(float(retry_after), 30.0) if self.cfg.pause > 0 else 0.0
                except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                    last_problem = str(exc) or exc.__class__.__name__
                if heavy >= 2:
                    raise AreaTooHeavy(last_problem)
                await asyncio.sleep(wait)
        if heavy:
            raise AreaTooHeavy(last_problem)
        raise ApiError(f"The OpenStreetMap servers are busy or unreachable right now ({last_problem}). Try again in a few minutes.")


def _first_tag(tags: Mapping[str, Any], keys: Sequence[str]) -> str:
    for k in keys:
        v = clean_text(tags.get(k))
        if v:
            return v
    return ""


def _first_phone(tags: Mapping[str, Any]) -> str:
    for k in PHONE_TAG_KEYS:
        for part in re.split(r"[;,/]", clean_text(tags.get(k))):
            p = clean_phone(part)
            if p:
                return p
    return ""


def _address(tags: Mapping[str, Any]) -> str:
    full = clean_text(tags.get("addr:full"))
    if full:
        return full
    street = " ".join(x for x in (clean_text(tags.get("addr:housenumber")), clean_text(tags.get("addr:street"))) if x)
    parts = [street, clean_text(tags.get("addr:suburb")) or clean_text(tags.get("addr:neighbourhood")),
             clean_text(tags.get("addr:city")) or clean_text(tags.get("addr:town")) or clean_text(tags.get("addr:village")),
             clean_text(tags.get("addr:postcode"))]
    return ", ".join(p for p in parts if p)


def _category(tags: Mapping[str, Any]) -> str:
    for k in CATEGORY_TAG_KEYS:
        v = clean_text(tags.get(k))
        if v and v not in ("yes", "no"):
            return v.split(";")[0].replace("_", " ").title()
    return ""


class Collector:
    """Receives every element the server returns, applies the filters, keeps one row per place id."""

    def __init__(self, cfg: SearchConfig, seen: Dict[str, str], stats: SearchStats) -> None:
        self.cfg, self.seen, self.stats = cfg, seen, stats
        self.rows: Dict[str, Dict[str, Any]] = {}

    def add(self, el: Dict[str, Any], query: str) -> None:
        self.stats.returned += 1
        kind, oid = el.get("type"), el.get("id")
        if kind not in ("node", "way", "relation") or oid is None:
            return
        pid = f"osm:{kind}/{oid}"
        if pid in self.rows:
            return
        if pid in self.seen:
            self.stats.already_seen += 1
            self.rows.setdefault(pid, {})  # remember it so a second sighting is not counted again
            return
        tags = el.get("tags") or {}
        name = _first_tag(tags, ("name", "name:en", "brand", "operator"))
        if not name:
            self.stats.filtered["no_name"] += 1
            self.rows[pid] = {}
            return
        socials = {"facebook": "", "instagram": ""}
        for k, keys in SOCIAL_TAG_KEYS.items():
            socials[k] = _first_tag(tags, keys)
        website = ""
        for raw in (clean_text(tags.get(k)) for k in WEBSITE_TAG_KEYS):
            url = prepare_website(raw) if raw else None
            if not url:
                continue
            platform, value = social_from_url(url)
            if platform in socials:  # a Facebook/Instagram page is not a website to crawl: keep it as the social link
                socials[platform] = socials[platform] or value
            elif not platform:
                website = url
                break
        if self.cfg.require_website and not website:
            self.stats.filtered["no_website"] += 1
            self.rows[pid] = {}
            return
        center = el.get("center") or {}
        lat, lon = el.get("lat", center.get("lat", "")), el.get("lon", center.get("lon", ""))
        email = ""
        for part in re.split(r"[;,\s]+", _first_tag(tags, EMAIL_TAG_KEYS)):
            email = normalise_email(part) or ""
            if email:
                break
        self.rows[pid] = {
            "place_id": pid,
            "business_name": name,
            "rating": "",
            "reviews": "",
            "review_count": "",
            "category": _category(tags),
            "address": _address(tags),
            "whatsapp_number": _first_phone(tags),
            "website": website,
            "email": email,
            "facebook": socials["facebook"],
            "instagram": socials["instagram"],
            "maps_url": f"https://www.openstreetmap.org/{kind}/{oid}",
            "latitude": lat,
            "longitude": lon,
            "search_query": query,
        }

    def result_rows(self) -> List[Dict[str, Any]]:
        return [r for r in self.rows.values() if r]


async def search_area(client: OsmClient, collector: Collector, tags: Sequence[str], stems: Sequence[str], query: str,
                      rect: Rect, depth: int) -> None:
    cfg = client.cfg
    ql = overpass_query(tags, stems, rect, cfg.limit)
    try:
        data = await client.interpret(ql)
    except AreaTooHeavy as exc:
        if depth < cfg.max_depth and not rect.small:
            logger.info("area too big for the server (%s), splitting: depth %d, query %r", exc, depth + 1, query)
            for child in rect.split4():
                await search_area(client, collector, tags, stems, query, child, depth + 1)
            return
        raise ApiError("The area is too big for the free OpenStreetMap server to answer. Use a smaller area "
                       "(a city or district instead of a whole country) or raise max_depth.")
    elements = data.get("elements") or []
    for el in elements:
        collector.add(el, query)
    if len(elements) >= cfg.limit and depth < cfg.max_depth and not rect.small:
        logger.info("area full (%d results), splitting: depth %d, query %r", len(elements), depth + 1, query)
        for child in rect.split4():
            await search_area(client, collector, tags, stems, query, child, depth + 1)


_AREA_CACHE: Dict[Tuple[str, str, str], Rect] = {}  # place name -> rectangle, for the life of the process (one lookup per place per run)


async def resolve_area(client: OsmClient, location: str) -> Rect:
    key = (client.nominatim, location.strip().lower(), (client.cfg.region or "").lower())
    if key not in _AREA_CACHE:
        _AREA_CACHE[key] = await client.geocode(location)
    return _AREA_CACHE[key]


def load_seen(path: str) -> Dict[str, str]:
    if not path or not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        logger.warning("could not read %s, starting without it", path)
        return {}


def save_seen(path: str, seen: Dict[str, str]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(seen, f)
    os.replace(tmp, path)


def write_csv(path: str, rows: Sequence[Dict[str, Any]], columns: Optional[Sequence[str]] = None) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(columns or OUTPUT_COLUMNS), extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)


async def search(
    queries: Sequence[str], location: str = "", bbox: Optional[Rect] = None,
    cfg: Optional[SearchConfig] = None, seen: Optional[Dict[str, str]] = None, base: str = API_BASE,
) -> Tuple[List[Dict[str, Any]], SearchStats]:
    cfg = cfg or SearchConfig()
    seen = seen if seen is not None else {}
    stats = SearchStats()
    collector = Collector(cfg, seen, stats)
    if cfg.min_reviews:
        logger.info("min_reviews is ignored: OpenStreetMap has no reviews")
    async with aiohttp.ClientSession(trust_env=True) as session:
        client = OsmClient(session, cfg, base)
        try:
            for q in queries:
                term, in_place = (q, "") if (location or bbox) else split_area_from_query(q)
                area = bbox
                if area is None:
                    place = location or in_place
                    if not place:
                        raise ApiError("OpenStreetMap needs an area to search: give a location (for example "
                                       "\"Colombo, Sri Lanka\") or a bounding box, or write the search as \"plumbers in Colombo\".")
                    area = await resolve_area(client, place)
                    logger.info("area %r = %.4f,%.4f to %.4f,%.4f", place, area.south, area.west, area.north, area.east)
                tags, stems = category_filters(term)
                await search_area(client, collector, tags, stems, q, area, 0)
        except BudgetExceeded:
            stats.budget_hit = True
            logger.warning("request limit reached (%d); saving what was found", cfg.max_requests)
        finally:
            stats.requests = client.requests
    rows = collector.result_rows()
    stats.unique = len(rows) + stats.already_seen + sum(stats.filtered.values())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for r in rows:
        seen[r["place_id"]] = now
    return rows, stats


# ============================================================================
# 3. PIPELINE: ENRICH, FILTER, IMPORT FILE (was lead_pipeline.py)
# ============================================================================

HOT_SCORE = 70
WARM_SCORE = 40
OWNER_TITLE_MAX_RANK = 2  # owner / founder / CEO / managing director / president / principal
IMPORT_EXTRA_COLUMNS = [
    "email", "all_emails", "first_name", "last_name", "lead_quality", "lead_quality_score", "decision_maker_name",
    "decision_maker_title", "contact_confidence", "best_contact_method", "phones_all", "contact_page_url",
    "tech_stack_detected", "company_size_indicator", "enrichment_status",
]


def _split_name(full: str) -> Tuple[str, str]:
    parts = [p for p in re.split(r"\s+", clean_text(full)) if p]
    if len(parts) < 2:
        return "", ""
    return parts[0], " ".join(parts[1:])


def quality_label(score: int) -> str:
    return "HOT" if score >= HOT_SCORE else "WARM" if score >= WARM_SCORE else "COLD"


def prepare_app_import(
    rows: Sequence[Dict[str, Any]], min_score: int = WARM_SCORE, phone_only_min_score: int = 0,
    thresholds: Optional[Callable[[Dict[str, Any]], Tuple[int, int]]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Counter]:
    """Split enriched rows into (import, review). Import rows are best first, one email per business, and an
    email address is used for only one row even when branches of a chain share it. The score minimum protects
    email sending (deliverability); leads with only a phone number have their own, lower minimum.
    `thresholds(row)` may return (min_score, phone_only_min_score) per row, e.g. per campaign."""
    scored = sorted(rows, key=lambda r: -int(clean_text(r.get("lead_quality_score")) or 0))
    ready: List[Dict[str, Any]] = []
    review: List[Dict[str, Any]] = []
    used_emails: set = set()
    used_phones: set = set()
    reasons: Counter = Counter()

    def leave_out(row: Dict[str, Any], reason: str) -> None:
        reasons[reason] += 1
        review.append({**row, "excluded_reason": reason})

    for row in scored:
        score = int(clean_text(row.get("lead_quality_score")) or 0)
        min_score, phone_only_min_score = thresholds(row) if thresholds else (min_score, phone_only_min_score)
        email = clean_text(row.get("email_primary")).lower()
        if email and email_score(email) <= 1:  # noreply@ and friends are not a person
            email = ""
        phone = clean_phone(clean_text(row.get("whatsapp_number"))) or clean_phone(clean_text(row.get("phone_primary"))) or ""

        if not email and not phone:
            leave_out(row, "no_email_or_phone")
            continue
        if email and score < min_score:
            email = ""  # too weak to email (deliverability), but the phone number may still be worth using
            if not phone:
                leave_out(row, "score_below_minimum")
                continue
        if not email and score < phone_only_min_score:
            leave_out(row, "score_below_minimum")
            continue
        if email and email in used_emails:
            # a chain's branches share one inbox: contact it once, via the best-scored branch
            if phone and phone_key(phone) not in used_phones:
                email = ""
            else:
                leave_out(row, "duplicate_email")
                continue
        if not email and phone and phone_key(phone) in used_phones:
            leave_out(row, "duplicate_phone")
            continue

        out = dict(row)
        out["all_emails"] = clean_text(row.get("email"))
        out["email"] = email
        if email:
            used_emails.add(email)
        if phone:
            used_phones.add(phone_key(phone))
            out["whatsapp_number"] = phone
        name, title = clean_text(row.get("decision_maker_name")), clean_text(row.get("decision_maker_title"))
        first, last = _split_name(name) if name and title_rank(title) <= OWNER_TITLE_MAX_RANK else ("", "")
        out["first_name"], out["last_name"] = first, last
        out["lead_quality"] = quality_label(score)
        ready.append(out)
    return ready, review, reasons


def read_rows(path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    return read_csv(path)


def write_rows(path: str, rows: Sequence[Dict[str, Any]], columns: Sequence[str]) -> None:
    write_final_csv(path, list(rows), list(columns))


def import_columns(sample_columns: Sequence[str]) -> List[str]:
    first = ["email", "business_name", "whatsapp_number", "first_name", "last_name", "lead_quality", "lead_quality_score"]
    cols: List[str] = []
    for c in first + list(sample_columns) + IMPORT_EXTRA_COLUMNS:
        if c and c not in cols:
            cols.append(c)
    return cols


def funnel(raw: Sequence[Dict[str, Any]], enriched: Sequence[Dict[str, Any]], ready: Sequence[Dict[str, Any]], reasons: Counter) -> str:
    n = max(1, len(enriched))
    status = Counter(clean_text(r.get("enrichment_status")) or "unknown" for r in enriched)
    with_site = sum(bool(prepare_website(r.get("website"))) for r in enriched)
    crawled = status.get("ok", 0)
    with_email = sum(bool(clean_text(r.get("email_primary"))) for r in enriched)
    with_phone = sum(bool(clean_text(r.get("phone_primary")) or clean_text(r.get("whatsapp_number"))) for r in enriched)
    ready_email = sum(bool(clean_text(r.get("email"))) for r in ready)
    pct = lambda c: f"{c:>4} ({100 * c / n:3.0f}%)"  # noqa: E731
    lines = [
        "", "=" * 60, "PIPELINE FUNNEL", "=" * 60,
        f"Found on Maps        : {len(raw):>4}",
        f"  with a website     : {pct(with_site)}",
        f"  crawled OK         : {pct(crawled)}   ({', '.join(f'{k}={v}' for k, v in sorted(status.items()) if k != 'ok') or 'no failures'})",
        f"  with an email      : {pct(with_email)}",
        f"  with a phone       : {pct(with_phone)}",
        f"Ready for AutoLeads  : {pct(len(ready))}   (email {ready_email}, phone-only {len(ready) - ready_email})",
        f"  HOT                : {sum(r['lead_quality'] == 'HOT' for r in ready):>4}",
        f"  WARM               : {sum(r['lead_quality'] == 'WARM' for r in ready):>4}",
        f"  COLD               : {sum(r['lead_quality'] == 'COLD' for r in ready):>4}",
        "Left out             : " + (", ".join(f"{k}={v}" for k, v in sorted(reasons.items())) or "none"),
        "=" * 60,
    ]
    return "\n".join(lines)


def merge_into(path: str, new_rows: Sequence[Dict[str, Any]], new_columns: Sequence[str]) -> int:
    """Add a batch to the cumulative enriched file (same business replaces its old row). Returns total rows."""
    old_rows, old_columns = read_rows(path) if os.path.exists(path) else ([], [])
    merged: Dict[str, Dict[str, Any]] = {row_key(r): r for r in old_rows}
    for r in new_rows:
        merged[row_key(r)] = r
    columns = list(old_columns) + [c for c in new_columns if c not in old_columns]
    write_rows(path, list(merged.values()), columns)
    return len(merged)


def mark_seen(seen_file: str, raw_rows: Sequence[Dict[str, Any]], no_seen: bool) -> None:
    """Only called once a batch is fully enriched, so a crash never makes search results disappear unprocessed."""
    if no_seen:
        return
    seen = load_seen(seen_file)
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for r in raw_rows:
        if clean_text(r.get("place_id")):
            seen.setdefault(r["place_id"], stamp)
    save_seen(seen_file, seen)


async def run_pipeline(args: argparse.Namespace) -> int:
    base = args.name
    raw_path, enriched_path = f"{base}_raw.csv", f"{base}_enriched.csv"
    batch_path, import_path, review_path = f"{base}_batch_enriched.csv", f"{base}_app_import.csv", f"{base}_review.csv"
    cfg_le = Config(max_pages=args.max_pages, concurrency=args.concurrency, delay=args.delay)
    searching = bool(args.query or args.input)

    if not searching:
        # Re-filter a finished run: use everything in the cumulative enriched file.
        if not os.path.exists(enriched_path):
            logger.error("nothing to do: give --query (with --location) or --input, or an existing %s", enriched_path)
            return 2
        logger.info("re-filtering %s (no search, no crawling)", enriched_path)
        batch_rows, columns = read_rows(enriched_path)
        raw_rows = batch_rows
    else:
        # A batch whose crawl was interrupted comes first: its businesses are already paid for.
        pending = os.path.exists(checkpoint_path(batch_path)) and os.path.exists(raw_path)
        if pending:
            logger.warning("an unfinished batch was found (%s): finishing it first. Run the same command again afterwards for a new search.", raw_path)
        elif args.input:
            raw_path = args.input
            logger.info("step 1/3 search: skipped, using %s", raw_path)
        else:
            cfg_gs = SearchConfig(max_requests=args.max_requests, max_depth=args.max_depth, min_reviews=args.min_reviews,
                                  require_website=args.require_website, region=args.region)
            seen = {} if args.no_seen else load_seen(args.seen_file)
            bbox = Rect.parse(args.bbox) if args.bbox else None
            logger.info("step 1/3 search: %s", ", ".join(args.query))
            try:
                rows, stats = await search(args.query, args.location, bbox, cfg_gs, seen, args.api_base)
            except ApiError as exc:
                logger.error("%s", exc)
                return 1
            logger.info("search: %d new businesses (%d already collected earlier, %d requests)", len(rows), stats.already_seen, stats.requests)
            if not rows:
                print("\nNothing new found for this search. Your existing files were not touched.\n"
                      "Try another query, a wider area, or --no-seen to include businesses collected before.")
                return 0
            write_csv(raw_path, rows)

        logger.info("step 2/3 enrich: crawling websites")
        out = await run(raw_path, batch_path, resume=not args.no_resume, cfg=cfg_le)
        if not out:
            logger.error("enrichment did not finish; run the same command again to resume")
            return 1
        batch_rows, columns = read_rows(batch_path)
        raw_rows = read_rows(raw_path)[0]
        total = merge_into(enriched_path, batch_rows, columns)
        os.remove(batch_path)
        if not args.input:
            mark_seen(args.seen_file, raw_rows, args.no_seen)
        logger.info("%s now holds %d businesses in total", enriched_path, total)

    ready, review, reasons = prepare_app_import(batch_rows, args.min_score, args.min_score_phone_only)
    write_rows(import_path, ready, import_columns(columns))
    write_rows(review_path, review, list(columns) + ["excluded_reason"])
    print(funnel(raw_rows, batch_rows, ready, reasons))
    print(f"\nImport this into AutoLeads : {import_path}   (this run only)\nWhat was left out and why  : {review_path}\nEverything ever collected  : {enriched_path}")
    return 0


# ============================================================================
# 4. AUTOPILOT: PLANNING, BUDGETS, DELIVERY (was lead_autopilot.py)
# ============================================================================

SECRET_ENV = {"autoleads_url": "AUTOLEADS_URL",
              "autoleads_ingest_key": "AUTOLEADS_INGEST_KEY", "webhook_url": "AUTOPILOT_WEBHOOK_URL"}  # an environment variable beats the settings file
REST_DAYS = 30  # a combination that found nothing new twice in a row rests this long
EMPTY_STREAK_TO_REST = 2
MIN_BUDGET = 3  # fewer map requests than this cannot complete a useful search (area lookup + one query)
LOCK_MAX_AGE_HOURS = 6
PUSH_CHUNK = 250
PUSH_RETRY_DELAY = 1.5  # seconds, multiplied by the attempt number
HOT_WEIGHT = 3

DEFAULT_CONFIG: Dict[str, Any] = {
    "output_dir": "autopilot_data",
    "campaigns": [],
    "limits": {"requests_per_run": 40, "requests_per_day": 60, "requests_per_month": 800, "combos_per_run": 3, "max_depth": 2},
    "enrichment": {"max_pages": 12, "concurrency": 20, "delay": 1.0},
    "secrets": {"autoleads_url": "", "autoleads_ingest_key": "", "webhook_url": ""},
    "notify": {"when": "leads_and_errors"},
}

SAMPLE_CONFIG: Dict[str, Any] = {
    **DEFAULT_CONFIG,
    "campaigns": [
        {
            "name": "trades-colombo",
            "queries": ["plumbers", "electricians"],
            "locations": ["Colombo, Sri Lanka", "Dehiwala-Mount Lavinia, Sri Lanka"],
            "region": "LK",
            "min_reviews": 0,
            "require_website": False,
            "min_score": 40,
            "min_score_phone_only": 0,
        }
    ],
}


class ConfigError(Exception):
    pass


# ----------------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------------

def _int(value: Any, name: str, low: int, high: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        raise ConfigError(f"{name} must be a whole number")
    if not low <= v <= high:
        raise ConfigError(f"{name} must be between {low} and {high}")
    return v


def validate_config(raw: Mapping[str, Any]) -> Dict[str, Any]:
    cfg: Dict[str, Any] = json.loads(json.dumps(DEFAULT_CONFIG))
    for section in ("limits", "enrichment", "notify"):
        if isinstance(raw.get(section), dict):
            cfg[section].update(raw[section])
    if raw.get("output_dir"):
        cfg["output_dir"] = str(raw["output_dir"])
    given = raw.get("secrets") if isinstance(raw.get("secrets"), dict) else {}
    cfg["secrets"] = {k: str(given.get(k) or "").strip() for k in SECRET_ENV}
    cfg["secrets"]["autoleads_url"] = cfg["secrets"]["autoleads_url"].rstrip("/")
    lim = cfg["limits"]
    for name, lo, hi in (("requests_per_run", 1, 2000), ("requests_per_day", 1, 5000), ("requests_per_month", 1, 100000),
                         ("combos_per_run", 1, 50), ("max_depth", 0, 4)):
        lim[name] = _int(lim[name], f"limits.{name}", lo, hi)
    when = cfg["notify"].get("when")
    if when not in ("never", "errors_only", "leads", "leads_and_errors", "always"):
        raise ConfigError('notify.when must be one of: never, errors_only, leads, leads_and_errors, always')
    en = cfg["enrichment"]
    en["max_pages"] = _int(en["max_pages"], "enrichment.max_pages", 1, 60)
    en["concurrency"] = _int(en["concurrency"], "enrichment.concurrency", 1, 100)
    try:
        en["delay"] = max(0.0, float(en["delay"]))
    except (TypeError, ValueError):
        raise ConfigError("enrichment.delay must be a number")

    camps = raw.get("campaigns")
    if not isinstance(camps, list) or not camps:
        raise ConfigError('"campaigns" must be a list with at least one campaign (run --init for an example)')
    seen_names = set()
    out: List[Dict[str, Any]] = []
    for i, c in enumerate(camps, 1):
        if not isinstance(c, dict):
            raise ConfigError(f"campaign {i} must be an object")
        name = str(c.get("name") or "").strip()
        if not name or "|" in name:
            raise ConfigError(f"campaign {i} needs a name (no | character)")
        if name in seen_names:
            raise ConfigError(f"campaign name {name!r} is used twice")
        seen_names.add(name)
        queries = [str(q).strip() for q in (c.get("queries") or []) if str(q).strip()]
        if not queries:
            raise ConfigError(f"campaign {name!r} needs at least one query")
        locations = [str(x).strip() for x in (c.get("locations") or []) if str(x).strip()]
        out.append({
            "name": name, "queries": queries, "locations": locations, "region": str(c.get("region") or ""),
            "language": str(c.get("language") or ""), "min_reviews": _int(c.get("min_reviews", 0), f"{name}.min_reviews", 0, 100000),
            "require_website": bool(c.get("require_website", False)),
            "min_score": _int(c.get("min_score", WARM_SCORE), f"{name}.min_score", 0, 101),
            "min_score_phone_only": _int(c.get("min_score_phone_only", 0), f"{name}.min_score_phone_only", 0, 101),
        })
    cfg["campaigns"] = out
    return cfg


def load_config(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        raise ConfigError(f"{path} not found. Run: python autoleads_worker.py setup")
    except ValueError as exc:
        raise ConfigError(f"{path} is not valid JSON: {exc}")
    return validate_config(raw)


# ----------------------------------------------------------------------------
# STATE + PLANNING
# ----------------------------------------------------------------------------

@dataclass
class Combo:
    key: str
    campaign: str
    query: str
    location: str
    campaign_index: int
    position: int


def all_combos(cfg: Mapping[str, Any]) -> List[Combo]:
    out: List[Combo] = []
    for ci, c in enumerate(cfg["campaigns"]):
        pos = 0
        for q in c["queries"]:
            for loc in (c["locations"] or [""]):
                out.append(Combo(f"{c['name']}|{q}|{loc}", c["name"], q, loc, ci, pos))
                pos += 1
    return out


def empty_state() -> Dict[str, Any]:
    return {"version": 1, "combos": {}, "usage": {"days": {}, "months": {}}, "pending_pushes": [], "last_run": None, "runs": 0}


def load_state(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return empty_state()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        base = empty_state()
        base.update({k: data[k] for k in base if k in data})
        return base
    except (OSError, ValueError):
        logger.warning("could not read %s; starting with a fresh state (budget counters reset)", path)
        return empty_state()


def save_state(path: Path, state: Dict[str, Any], now: datetime) -> None:
    cutoff = (now - timedelta(days=62)).strftime("%Y-%m-%d")
    state["usage"]["days"] = {d: n for d, n in state["usage"]["days"].items() if d >= cutoff}
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def day_key(now: datetime) -> str:
    return now.strftime("%Y-%m-%d")


def month_key(now: datetime) -> str:
    return now.strftime("%Y-%m")


def budget_left(cfg: Mapping[str, Any], state: Mapping[str, Any], now: datetime) -> Tuple[int, str]:
    lim = cfg["limits"]
    day_used = state["usage"]["days"].get(day_key(now), 0)
    month_used = state["usage"]["months"].get(month_key(now), 0)
    left = min(lim["requests_per_run"], lim["requests_per_day"] - day_used, lim["requests_per_month"] - month_used)
    if left >= MIN_BUDGET:
        return left, ""
    if lim["requests_per_month"] - month_used < MIN_BUDGET:
        return max(left, 0), f"monthly budget used ({month_used}/{lim['requests_per_month']})"
    return max(left, 0), f"daily budget used ({day_used}/{lim['requests_per_day']})"


def record_usage(state: Dict[str, Any], requests: int, now: datetime) -> None:
    state["usage"]["days"][day_key(now)] = state["usage"]["days"].get(day_key(now), 0) + requests
    state["usage"]["months"][month_key(now)] = state["usage"]["months"].get(month_key(now), 0) + requests


def combo_yield(st: Mapping[str, Any]) -> float:
    return (st.get("hot_total", 0) * HOT_WEIGHT + st.get("new_total", 0)) / max(1, st.get("requests", 0))


@dataclass
class Plan:
    combos: List[Combo] = field(default_factory=list)
    budget: int = 0
    reason: str = ""


def plan_run(cfg: Mapping[str, Any], state: Mapping[str, Any], now: datetime) -> Plan:
    budget, why = budget_left(cfg, state, now)
    if why:
        return Plan([], budget, why)
    eligible: List[Combo] = []
    for c in all_combos(cfg):
        st = state["combos"].get(c.key, {})
        until = st.get("exhausted_until")
        if until and datetime.fromisoformat(until) > now:
            continue
        eligible.append(c)
    if not eligible:
        return Plan([], budget, f"every search combination is resting (nothing new found twice in a row); they retry after {REST_DAYS} days. Add queries or locations in the config")

    def order(c: Combo) -> Tuple:
        st = state["combos"].get(c.key)
        if not st or not st.get("runs"):
            return (0, c.position, c.campaign_index, 0.0, "")  # untried: round-robin across campaigns, config order
        return (1, 0, 0, -combo_yield(st), st.get("last_run") or "")

    eligible.sort(key=order)
    return Plan(eligible[: cfg["limits"]["combos_per_run"]], budget, "")


# ----------------------------------------------------------------------------
# OUTSIDE WORLD: inbox push + notification
# ----------------------------------------------------------------------------

@dataclass
class PushResult:
    ok: bool
    added: int = 0
    skipped: int = 0
    error: str = ""


async def push_rows(url: str, key: str, rows: Sequence[Dict[str, Any]], batch_id: str) -> PushResult:
    endpoint = url.rstrip("/") + "/api/lead-inbox/ingest"
    added = skipped = 0
    async with aiohttp.ClientSession() as session:
        for i in range(0, len(rows), PUSH_CHUNK):
            chunk = list(rows[i:i + PUSH_CHUNK])
            body = {"source": "autopilot", "batchId": batch_id, "leads": chunk}
            last_error = ""
            for attempt in range(3):
                try:
                    async with session.post(endpoint, json=body, headers={"Authorization": f"Bearer {key}"},
                                            timeout=aiohttp.ClientTimeout(total=60)) as resp:
                        data = await resp.json(content_type=None)
                        if resp.status == 200 and data.get("success"):
                            added += int(data.get("added", 0))
                            skipped += sum(int(v) for v in (data.get("skipped") or {}).values())
                            break
                        last_error = f"{resp.status}: {data.get('error', 'unknown error')}"
                        if resp.status in (400, 401, 403, 413):
                            return PushResult(False, added, skipped, last_error)  # retrying cannot fix these
                except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
                    last_error = f"network problem: {exc}"
                await asyncio.sleep(PUSH_RETRY_DELAY * (attempt + 1))
            else:
                return PushResult(False, added, skipped, last_error)
    return PushResult(True, added, skipped)


async def notify(webhook: str, text: str, title: str = "Lead autopilot") -> None:
    if not webhook:
        return
    try:
        async with aiohttp.ClientSession() as session:
            if "ntfy" in urlparse(webhook).netloc:
                await session.post(webhook, data=text.encode("utf-8"), headers={"Title": title}, timeout=aiohttp.ClientTimeout(total=15))
            else:  # Slack reads "text", Discord reads "content"
                await session.post(webhook, json={"text": f"{title}\n{text}", "content": f"**{title}**\n{text}"}, timeout=aiohttp.ClientTimeout(total=15))
    except Exception as exc:
        logger.warning("notification failed: %s", exc)


# ----------------------------------------------------------------------------
# LOCK
# ----------------------------------------------------------------------------

def acquire_lock(path: Path) -> bool:
    if path.exists():
        age_h = (time.time() - path.stat().st_mtime) / 3600
        if age_h < LOCK_MAX_AGE_HOURS:
            return False
        logger.warning("removing a stale lock (%.0f hours old)", age_h)
        path.unlink(missing_ok=True)
    try:
        fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        return True
    except FileExistsError:
        return False


# ----------------------------------------------------------------------------
# THE RUN
# ----------------------------------------------------------------------------

@dataclass
class RunSummary:
    code: int = 0  # 0 ok, 1 error, 3 another run in progress
    message: str = ""
    new_businesses: int = 0
    ready: int = 0
    hot: int = 0
    warm: int = 0
    cold: int = 0
    with_email: int = 0
    requests: int = 0
    pushed: int = 0
    push_error: str = ""
    outbox_file: str = ""
    combos: List[str] = field(default_factory=list)


def _ts(now: datetime) -> str:
    return now.strftime("%Y%m%d_%H%M%S")


def _write_report(out_dir: Path, cfg: Mapping[str, Any], state: Mapping[str, Any], s: RunSummary, now: datetime) -> None:
    month_used = state["usage"]["months"].get(month_key(now), 0)
    day_used = state["usage"]["days"].get(day_key(now), 0)
    lines = ["# Lead autopilot report", "", f"Last run: {now.strftime('%Y-%m-%d %H:%M')} UTC", "",
             f"- New businesses found: {s.new_businesses}", f"- Ready for review: {s.ready} (hot {s.hot}, warm {s.warm}, cold {s.cold}; with email {s.with_email})",
             f"- Delivered to the inbox: {s.pushed}" + (f" (problem: {s.push_error})" if s.push_error else ""),
             f"- Map requests this run: {s.requests}; today {day_used}/{cfg['limits']['requests_per_day']}; this month {month_used}/{cfg['limits']['requests_per_month']}",
             "", "## Searches, best first", "", "| search | runs | new | hot | requests | yield | status |", "|---|---|---|---|---|---|---|"]
    for key, st in sorted(state["combos"].items(), key=lambda kv: -combo_yield(kv[1])):
        resting = st.get("exhausted_until") and datetime.fromisoformat(st["exhausted_until"]) > now
        lines.append(f"| {key.replace('|', ' / ')} | {st.get('runs', 0)} | {st.get('new_total', 0)} | {st.get('hot_total', 0)} | {st.get('requests', 0)} | {combo_yield(st):.2f} | {'resting' if resting else 'active'} |")
    (out_dir / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def summary_text(s: RunSummary, cfg: Mapping[str, Any], env: Mapping[str, str]) -> str:
    base = secret(cfg, env, "autoleads_url")
    parts = [f"{s.new_businesses} new businesses found, {s.ready} ready for review (hot {s.hot}, warm {s.warm}, cold {s.cold}; {s.with_email} with email)."]
    if s.pushed:
        parts.append(f"{s.pushed} delivered to your Lead Inbox." + (f" Open {base}/inbox" if base else ""))
    elif s.ready and s.push_error:
        parts.append(f"Could not deliver to the inbox ({s.push_error}). The batch is saved in the outbox and retries next run.")
    elif s.ready:
        parts.append(f"Saved in {s.outbox_file}.")
    parts.append(f"{s.requests} map requests used.")
    return " ".join(parts)


async def run_once(
    cfg: Mapping[str, Any], base_dir: Path, env: Optional[Mapping[str, str]] = None, api_base: str = API_BASE,
    now: Optional[datetime] = None, push_enabled: bool = True, notify_enabled: bool = True,
) -> RunSummary:
    env = env if env is not None else os.environ
    now = now or datetime.now(timezone.utc)
    out_dir = (base_dir / cfg["output_dir"]).resolve()
    work, outbox = out_dir / "work", out_dir / "outbox"
    for d in (out_dir, work, outbox):
        d.mkdir(parents=True, exist_ok=True)
    summary = RunSummary()
    lock = out_dir / ".lock"
    if not acquire_lock(lock):
        summary.code, summary.message = 3, "another autopilot run is in progress (or crashed less than 6 hours ago): if you are sure, delete " + str(lock)
        logger.warning(summary.message)
        return summary
    try:
        return await _run_locked(cfg, out_dir, work, outbox, env, api_base, now, push_enabled, notify_enabled, summary)
    finally:
        lock.unlink(missing_ok=True)


async def _run_locked(cfg, out_dir: Path, work: Path, outbox: Path, env, api_base, now, push_enabled, notify_enabled, summary: RunSummary) -> RunSummary:
    state_path = out_dir / "state.json"
    state = load_state(state_path)
    enriched_path, seen_path = str(out_dir / "enriched.csv"), str(out_dir / "seen_places.json")
    raw_path, batch_path = str(work / "batch_raw.csv"), str(work / "batch_enriched.csv")
    push_url, push_key = secret(cfg, env, "autoleads_url"), secret(cfg, env, "autoleads_ingest_key")
    webhook = secret(cfg, env, "webhook_url") if notify_enabled else ""
    do_push = push_enabled and bool(push_url and push_key)
    camp_by_name = {c["name"]: c for c in cfg["campaigns"]}
    when = cfg["notify"].get("when", "leads_and_errors")

    async def finish(code: int, message: str) -> RunSummary:
        summary.code, summary.message = code, message
        record_usage(state, summary.requests, now)
        state["last_run"] = now.isoformat(timespec="seconds")
        state["runs"] = state.get("runs", 0) + 1
        save_state(state_path, state, now)
        _write_report(out_dir, cfg, state, summary, now)
        if code != 0:
            should = when != "never"
        else:
            should = when == "always" or (summary.ready > 0 and when in ("leads", "leads_and_errors"))
        if webhook and should:
            await notify(webhook, message or summary_text(summary, cfg, env), "Lead autopilot" + (" problem" if code else ""))
        return summary

    # 1. Deliver batches that could not be delivered before.
    if do_push and state["pending_pushes"]:
        still: List[str] = []
        for name in state["pending_pushes"]:
            path = outbox / name
            if not path.exists():
                continue
            rows, _ = read_csv(str(path))
            res = await push_rows(push_url, push_key, rows, name)
            if res.ok:
                logger.info("delivered earlier batch %s (%d added)", name, res.added)
                summary.pushed += res.added
            else:
                logger.warning("still cannot deliver %s: %s", name, res.error)
                summary.push_error = res.error
                still.append(name)
        state["pending_pushes"] = still

    # 2. An interrupted batch is finished first: its businesses are already paid for.
    combo_of: Dict[str, str] = {}
    interrupted = os.path.exists(checkpoint_path(batch_path)) and os.path.exists(raw_path)
    searched_rows: List[Dict[str, Any]] = []
    if interrupted:
        logger.warning("an interrupted batch was found: finishing it before searching again")
        searched_rows = read_csv(raw_path)[0]
    else:
        plan = plan_run(cfg, state, now)
        if not plan.combos:
            logger.info("nothing to search: %s", plan.reason)
            return await finish(0, f"No search this run: {plan.reason}.")
        seen = load_seen(seen_path)
        remaining = plan.budget
        per_combo = max(5, math.ceil(plan.budget / len(plan.combos)))
        logger.info("plan: %d searches, budget %d requests: %s", len(plan.combos), plan.budget, "; ".join(c.key for c in plan.combos))
        for combo in plan.combos:
            if remaining < MIN_BUDGET:
                break
            camp = camp_by_name[combo.campaign]
            scfg = SearchConfig(max_requests=min(per_combo, remaining), max_depth=cfg["limits"]["max_depth"], region=camp["region"],
                                   language=camp["language"], min_reviews=camp["min_reviews"], require_website=camp["require_website"])
            try:
                rows, stats = await search([combo.query], combo.location, None, scfg, seen, api_base)
            except ApiError as exc:
                summary.requests += scfg.max_requests  # unknown how many were made: count the cap
                return await finish(1, f"Map search failed: {exc}")
            remaining -= stats.requests
            summary.requests += stats.requests
            st = state["combos"].setdefault(combo.key, {"runs": 0, "new_total": 0, "hot_total": 0, "requests": 0, "empty_streak": 0})
            st["runs"] += 1
            st["requests"] += stats.requests
            st["new_total"] += len(rows)
            st["last_run"] = now.isoformat(timespec="seconds")
            if rows:
                st["empty_streak"], st["exhausted_until"] = 0, None
            elif not stats.budget_hit:
                st["empty_streak"] = st.get("empty_streak", 0) + 1
                if st["empty_streak"] >= EMPTY_STREAK_TO_REST:
                    st["exhausted_until"] = (now + timedelta(days=REST_DAYS)).isoformat(timespec="seconds")
            for r in rows:
                r["campaign"] = combo.campaign
                combo_of[r["place_id"]] = combo.key
            searched_rows.extend(rows)
            summary.combos.append(f"{combo.key}: {len(rows)} new")
            logger.info("%s -> %d new (%d requests)", combo.key, len(rows), stats.requests)
        if not searched_rows:
            return await finish(0, "Nothing new found this run. Searches that find nothing twice in a row are rested automatically.")
        write_rows(raw_path, searched_rows, OUTPUT_COLUMNS + ["campaign"])

    # 3. Crawl, merge into the cumulative file, mark businesses as collected.
    summary.new_businesses = len(searched_rows)
    en = cfg["enrichment"]
    done = await run(raw_path, batch_path, resume=True, cfg=Config(max_pages=en["max_pages"], concurrency=en["concurrency"], delay=en["delay"]))
    if not done:
        return await finish(1, "The website crawl did not finish. It resumes on the next run; no results were lost.")
    batch_rows, columns = read_rows(batch_path)
    merge_into(enriched_path, batch_rows, columns)
    os.remove(batch_path)
    mark_seen(seen_path, searched_rows, False)

    # 4. Score gates per campaign, one email per business.
    def thresholds(row: Dict[str, Any]) -> Tuple[int, int]:
        c = camp_by_name.get(clean_text(row.get("campaign")))
        return (c["min_score"], c["min_score_phone_only"]) if c else (WARM_SCORE, 0)

    ready, review, _reasons = prepare_app_import(batch_rows, thresholds=thresholds)
    for r in batch_rows:
        k = combo_of.get(clean_text(r.get("place_id")))
        if k and quality_label(int(clean_text(r.get("lead_quality_score")) or 0)) == "HOT":
            state["combos"][k]["hot_total"] = state["combos"][k].get("hot_total", 0) + 1
    summary.ready = len(ready)
    summary.hot = sum(r["lead_quality"] == "HOT" for r in ready)
    summary.warm = sum(r["lead_quality"] == "WARM" for r in ready)
    summary.cold = sum(r["lead_quality"] == "COLD" for r in ready)
    summary.with_email = sum(bool(r["email"]) for r in ready)
    stamp = _ts(now)
    if ready:
        name = f"{stamp}_app_import.csv"
        write_rows(str(outbox / name), ready, import_columns(columns))
        write_rows(str(outbox / "latest_app_import.csv"), ready, import_columns(columns))
        summary.outbox_file = str(outbox / name)
        if do_push:
            res = await push_rows(push_url, push_key, ready, name)
            summary.pushed += res.added
            if not res.ok:
                summary.push_error = res.error
                state["pending_pushes"].append(name)
                logger.warning("could not deliver to the inbox (%s); the batch is kept in the outbox and retried next run", res.error)
    write_rows(str(outbox / f"{stamp}_review.csv"), review, list(columns) + ["excluded_reason"])
    return await finish(0, "")


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------


def cmd_plan(cfg: Mapping[str, Any], base_dir: Path, now: datetime) -> int:
    state = load_state(base_dir / cfg["output_dir"] / "state.json")
    plan = plan_run(cfg, state, now)
    lim = cfg["limits"]
    print(f"Budget this run: {plan.budget} map requests "
          f"(today used {state['usage']['days'].get(day_key(now), 0)}/{lim['requests_per_day']}, "
          f"month used {state['usage']['months'].get(month_key(now), 0)}/{lim['requests_per_month']})")
    if not plan.combos:
        print(f"Nothing would run: {plan.reason}")
        return 0
    for i, c in enumerate(plan.combos, 1):
        st = state["combos"].get(c.key)
        print(f"  {i}. {c.query!r} in {c.location or 'anywhere'}  [{c.campaign}]  " + ("new" if not st else f"seen before: {st.get('new_total', 0)} found, yield {combo_yield(st):.2f}"))
    print("No API calls were made.")
    return 0


def cmd_status(cfg: Mapping[str, Any], base_dir: Path, now: datetime) -> int:
    state = load_state(base_dir / cfg["output_dir"] / "state.json")
    print(f"Runs: {state.get('runs', 0)}   last: {state.get('last_run') or 'never'}")
    print(f"Requests today {state['usage']['days'].get(day_key(now), 0)}/{cfg['limits']['requests_per_day']}, month {state['usage']['months'].get(month_key(now), 0)}/{cfg['limits']['requests_per_month']}")
    print(f"Batches waiting for delivery: {len(state['pending_pushes'])}")
    for key, st in sorted(state["combos"].items(), key=lambda kv: -combo_yield(kv[1]))[:15]:
        resting = st.get("exhausted_until") and datetime.fromisoformat(st["exhausted_until"]) > now
        print(f"  {combo_yield(st):5.2f}  found {st.get('new_total', 0):>4}  hot {st.get('hot_total', 0):>3}  {key.replace('|', ' / ')}{'  (resting)' if resting else ''}")
    return 0


# ============================================================================
# SETTINGS FILE, SECRETS, SETUP WIZARD
# ============================================================================

SCRIPT_PATH = Path(__file__).resolve()
DEFAULT_CONFIG_PATH = SCRIPT_PATH.parent / "autoleads.json"
TASK_NAME = "AutoLeadsWorker"
DEFAULT_RUN_TIME = "09:00"


def secret(cfg: Mapping[str, Any], env: Mapping[str, str], name: str) -> str:
    """A secret from the environment if set there, otherwise from autoleads.json."""
    return (env.get(SECRET_ENV[name]) or cfg.get("secrets", {}).get(name, "") or "").strip()


def split_places(text: Any) -> List[str]:
    """Several places are separated with ; (a place name itself contains commas: "Colombo, Sri Lanka")."""
    return [x.strip() for x in re.split(r"[;|\n]", str(text or "")) if x.strip()]


def build_config(answers: Mapping[str, Any]) -> Dict[str, Any]:
    """The settings file for a first campaign. Raises ConfigError if something essential is missing."""
    queries, locations = split_list(answers.get("query")), split_places(answers.get("location"))
    url = str(answers.get("app_url") or "").strip().rstrip("/")
    if url and not re.match(r"^https?://", url):
        raise ConfigError("the AutoLeads address must start with https:// (for example https://my-app.vercel.app)")
    raw = json.loads(json.dumps(SAMPLE_CONFIG))
    raw["secrets"] = {
        "autoleads_url": url,
        "autoleads_ingest_key": str(answers.get("ingest_key") or "").strip(), "webhook_url": str(answers.get("webhook") or "").strip(),
    }
    raw["campaigns"] = [{
        "name": "main", "queries": queries, "locations": locations, "region": str(answers.get("region") or "").strip().upper(),
        "min_reviews": 0, "require_website": False, "min_score": int(answers.get("min_score") or WARM_SCORE), "min_score_phone_only": 0,
    }]
    return validate_config(raw) and raw


def write_config(path: Path, raw: Mapping[str, Any]) -> None:
    path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
    try:
        os.chmod(path, 0o600)  # it holds keys: readable by you only (best effort on Windows)
    except OSError:
        pass


def _ask(prompt: str, default: str = "", assume_yes: bool = False) -> str:
    if assume_yes:
        return default
    try:
        shown = f" [{default}]" if default else ""
        return input(f"{prompt}{shown}: ").strip() or default
    except EOFError:
        return default


def _confirm(prompt: str, default: bool, assume_yes: bool) -> bool:
    if assume_yes:
        return default
    ans = _ask(prompt + (" [Y/n]" if default else " [y/N]"), "")
    return default if not ans else ans.lower().startswith("y")


def run_setup(args: argparse.Namespace, env: Optional[Mapping[str, str]] = None, ask: Callable[..., str] = _ask,
              confirm: Callable[..., bool] = _confirm, runner: Callable[..., Any] = subprocess.run) -> int:
    env = env if env is not None else os.environ
    path = Path(args.config)
    if path.exists() and not args.force:
        print(f"{path} already exists, so setup is already done.\n"
              f"Edit it to change searches or limits, or run: python autoleads_worker.py setup --force\nNext: python autoleads_worker.py run")
        return 0
    yes = args.yes
    print("Let's set up your lead machine. Press Enter to skip anything you do not have yet.\n")
    app_url = args.app_url or env.get("AUTOLEADS_URL", "") or ask("Your AutoLeads address (e.g. https://my-app.vercel.app)", "", yes)
    ingest = args.ingest_key or env.get("AUTOLEADS_INGEST_KEY", "") or (ask("Ingest key (AutoLeads: Account, Lead inbox connection)", "", yes) if app_url else "")
    webhook = args.webhook or env.get("AUTOPILOT_WEBHOOK_URL", "") or ask("Slack/Discord/ntfy link for a message after each run (optional)", "", yes)
    query = args.query or ask("What kind of business do you want to find? (e.g. plumbers, electricians)", "", yes)
    location = args.location if args.location is not None else ask("Where? (e.g. Colombo, Sri Lanka. Several places: separate with ;)", "", yes)
    region = args.region or ""
    if not split_list(query):
        print("Tell me what to find, for example: --query \"plumbers\"")
        return 2
    try:
        raw = build_config({"app_url": app_url, "ingest_key": ingest, "webhook": webhook, "query": query,
                            "location": location, "region": region, "min_score": args.min_score})
    except ConfigError as exc:
        print(f"Problem: {exc}")
        return 2
    write_config(path, raw)
    print(f"\nSaved {path} (keep this file private: it holds your keys).")
    print("Finding businesses uses OpenStreetMap: free, no key and no card needed.")

    ok = True
    if not args.skip_check:
        print("\nChecking the connections...")
        ok = asyncio.run(run_check_and_print(validate_config(raw), env))
    if args.install_schedule or (not yes and confirm(f"\nRun it automatically every morning at {args.time}?", True, False)):
        good, msg = install_schedule(args.time, str(path.resolve()), runner=runner)
        print(msg)
    print("\nDone. Try it now:  python autoleads_worker.py run\nSee the plan first:  python autoleads_worker.py plan")
    return 0 if ok else 1


# ============================================================================
# CONNECTION CHECK
# ============================================================================

async def run_check(cfg: Mapping[str, Any], env: Mapping[str, str], api_base: str = API_BASE) -> List[Tuple[str, Optional[bool], str]]:
    """[(what, ok, message)] where ok is None when that part is not configured."""
    results: List[Tuple[str, Optional[bool], str]] = []
    camp = cfg["campaigns"][0]
    place = (camp["locations"] or [split_area_from_query(camp["queries"][0])[1]])[0]
    if not place:
        results.append(("Map data", None, "no area set yet: add a location to a campaign"))
    else:
        try:
            async with aiohttp.ClientSession(trust_env=True) as session:
                client = OsmClient(session, SearchConfig(max_requests=2, region=camp["region"]), api_base)
                await client.geocode(place)
            results.append(("Map data", True, f"OpenStreetMap answered for {place!r} (free, no key)"))
        except ApiError as exc:
            results.append(("Map data", False, str(exc)))
        except BudgetExceeded:
            results.append(("Map data", False, "could not reach OpenStreetMap"))
    url, ikey = secret(cfg, env, "autoleads_url"), secret(cfg, env, "autoleads_ingest_key")
    if not (url and ikey):
        results.append(("AutoLeads inbox", None, "not set: batches are saved as CSV files only"))
    else:
        results.append(("AutoLeads inbox", *await ping_inbox(url, ikey)))
    hook = secret(cfg, env, "webhook_url")
    if not hook:
        results.append(("Webhook", None, "not set: no messages after runs"))
    else:
        try:
            async with aiohttp.ClientSession() as session:
                if "ntfy" in urlparse(hook).netloc:
                    resp = await session.post(hook, data=b"Lead autopilot is connected.", headers={"Title": "Lead autopilot"}, timeout=aiohttp.ClientTimeout(total=15))
                else:
                    resp = await session.post(hook, json={"text": "Lead autopilot is connected.", "content": "Lead autopilot is connected."}, timeout=aiohttp.ClientTimeout(total=15))
                results.append(("Webhook", resp.status < 300, "test message sent" if resp.status < 300 else f"answered {resp.status}"))
        except Exception as exc:
            results.append(("Webhook", False, f"could not send: {exc}"))
    return results


async def ping_inbox(url: str, key: str) -> Tuple[bool, str]:
    """Sends an empty batch: proves the address, the key and the server's database connection without adding anything."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url.rstrip("/") + "/api/lead-inbox/ingest", json={"source": "check", "leads": []},
                                    headers={"Authorization": f"Bearer {key}"}, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    return True, "connected"
                if resp.status == 401:
                    return False, "the ingest key was rejected. Create a new one in the app (Account, Lead inbox connection)"
                if resp.status == 503:
                    return False, "the server has no database service account yet (set FIREBASE_SERVICE_ACCOUNT_JSON)"
                if resp.status == 404:
                    return False, "that address does not have the lead inbox yet. Deploy the latest version of the app"
                return False, f"unexpected answer {resp.status}"
    except Exception as exc:
        return False, f"could not reach {url}: {exc}"


async def run_check_and_print(cfg: Mapping[str, Any], env: Mapping[str, str], api_base: str = API_BASE) -> bool:
    results = await run_check(cfg, env, api_base)
    for name, ok, message in results:
        print(f"  {'OK  ' if ok else 'skip' if ok is None else 'FAIL'}  {name}: {message}")
    return all(ok is not False for _n, ok, _m in results)


# ============================================================================
# DAILY SCHEDULE (Windows Task Scheduler, cron on Mac/Linux)
# ============================================================================

def _parse_time(text: str) -> Tuple[int, int]:
    m = re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)", str(text).strip())
    if not m:
        raise ConfigError("time must look like 09:00 (24 hour clock)")
    return int(m.group(1)), int(m.group(2))


def schedule_commands(config_path: str, run_time: str = DEFAULT_RUN_TIME, python: Optional[str] = None, script: Optional[str] = None) -> Dict[str, Any]:
    python, script = python or sys.executable, script or str(SCRIPT_PATH)
    hour, minute = _parse_time(run_time)
    workdir = str(Path(script).parent)
    task_run = f'"{python}" "{script}" run --config "{config_path}"'
    return {
        "windows_create": ["schtasks", "/Create", "/SC", "DAILY", "/ST", f"{hour:02d}:{minute:02d}", "/TN", TASK_NAME, "/TR", task_run, "/F"],
        "windows_delete": ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"],
        "cron_line": f"{minute} {hour} * * * cd {shlex.quote(workdir)} && {shlex.quote(python)} {shlex.quote(script)} run --config {shlex.quote(config_path)} "
                     f">> {shlex.quote(str(Path(config_path).parent / 'autoleads_cron.log'))} 2>&1  # {TASK_NAME}",
    }


def _cron_lines(runner: Callable[..., Any]) -> List[str]:
    res = runner(["crontab", "-l"], capture_output=True, text=True)
    return [] if res.returncode != 0 else [l for l in res.stdout.split("\n") if l.strip()]


def install_schedule(run_time: str, config_path: str, runner: Callable[..., Any] = subprocess.run, platform: Optional[str] = None) -> Tuple[bool, str]:
    cmds = schedule_commands(config_path, run_time)
    platform = platform or sys.platform
    try:
        if platform.startswith("win"):
            res = runner(cmds["windows_create"], capture_output=True, text=True)
            ok = res.returncode == 0
            return ok, (f"Scheduled: runs every day at {run_time}. (Remove with: python autoleads_worker.py schedule --remove)" if ok
                        else f"Could not create the task: {(res.stderr or res.stdout or '').strip()}")
        lines = [l for l in _cron_lines(runner) if TASK_NAME not in l] + [cmds["cron_line"]]
        res = runner(["crontab", "-"], input="\n".join(lines) + "\n", capture_output=True, text=True)
        ok = res.returncode == 0
        return ok, (f"Scheduled: runs every day at {run_time}. (Remove with: python autoleads_worker.py schedule --remove)" if ok
                    else f"Could not edit your crontab: {(res.stderr or '').strip()}")
    except (OSError, ConfigError) as exc:
        return False, f"Could not schedule it: {exc}"


def remove_schedule(runner: Callable[..., Any] = subprocess.run, platform: Optional[str] = None) -> Tuple[bool, str]:
    platform = platform or sys.platform
    try:
        if platform.startswith("win"):
            res = runner(schedule_commands("x")["windows_delete"], capture_output=True, text=True)
            return res.returncode == 0, "Schedule removed." if res.returncode == 0 else f"Nothing to remove ({(res.stderr or '').strip()})"
        lines = _cron_lines(runner)
        kept = [l for l in lines if TASK_NAME not in l]
        if len(kept) == len(lines):
            return True, "There was no schedule to remove."
        res = runner(["crontab", "-"], input="\n".join(kept) + ("\n" if kept else ""), capture_output=True, text=True)
        return res.returncode == 0, "Schedule removed." if res.returncode == 0 else "Could not edit your crontab."
    except OSError as exc:
        return False, f"Could not remove it: {exc}"


# ============================================================================
# COMMAND LINE
# ============================================================================

def missing_dependencies() -> List[str]:
    return [pkg for mod, pkg in REQUIRED_PACKAGES.items() if (aiohttp is None if mod == "aiohttp" else BeautifulSoup is None)]


def offer_install(assume_yes: bool) -> bool:
    """Missing packages: offer to install them, then restart. Returns False if the run should stop."""
    missing = missing_dependencies()
    pkgs = list(REQUIRED_PACKAGES.values()) + list(OPTIONAL_PACKAGES.values())
    cmd = [sys.executable, "-m", "pip", "install", *pkgs]
    print(f"Missing packages: {', '.join(missing)}.")
    if not _confirm("Install them now?", True, assume_yes):
        print("Install them yourself with:  " + " ".join(shlex.quote(c) for c in cmd))
        return False
    if subprocess.run(cmd).returncode != 0:
        print("The install did not work. Try:  " + " ".join(shlex.quote(c) for c in cmd) + "\n(On some Linux systems use a virtual environment first: python3 -m venv venv)")
        return False
    os.execv(sys.executable, [sys.executable, *sys.argv])  # restart with the packages available
    return True  # pragma: no cover


def setup_logging(level: str, log_file: Optional[Path] = None) -> None:
    handlers: List[logging.Handler] = [logging.StreamHandler()]
    if log_file:
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    logging.basicConfig(level=getattr(logging, level), format="%(asctime)s | %(levelname)-7s | %(message)s", datefmt="%H:%M:%S", handlers=handlers, force=True)


def _common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Settings file (default: autoleads.json next to this script)")
    p.add_argument("--log-level", choices=("DEBUG", "INFO", "WARNING", "ERROR"), default="INFO")
    p.add_argument("--yes", action="store_true", help="Answer yes / use defaults to every question")


def _search_options(p: argparse.ArgumentParser) -> None:
    d = SearchConfig()
    p.add_argument("-q", "--query", action="append", help='What to find, e.g. "plumbers". Repeat for several.')
    p.add_argument("--location", default="", help='Area, e.g. "Colombo, Sri Lanka". Enables automatic area splitting.')
    p.add_argument("--bbox", help="Area as south,west,north,east instead of --location")
    p.add_argument("--max-requests", type=int, default=d.max_requests, help=f"Hard cap on map requests (default {d.max_requests})")
    p.add_argument("--max-depth", type=int, default=d.max_depth, help=f"How often a full area is split in four (default {d.max_depth})")
    p.add_argument("--min-reviews", type=int, default=0)
    p.add_argument("--require-website", action="store_true", help="Only keep businesses that list a website")
    p.add_argument("--region", default="", help="Two-letter country code that keeps the area lookup in that country, e.g. LK")
    p.add_argument("--language", default="")
    p.add_argument("--seen-file", default="seen_places.json", help="Remembers collected places so repeat runs return only new ones")
    p.add_argument("--no-seen", action="store_true", help="Do not skip or record previously collected places")
    p.add_argument("--api-key", default="", help=argparse.SUPPRESS)  # no key is needed any more; accepted so old commands keep working
    p.add_argument("--api-base", default=API_BASE, help=argparse.SUPPRESS)


def _crawl_options(p: argparse.ArgumentParser) -> None:
    d = Config()
    p.add_argument("--max-pages", type=int, default=d.max_pages, help=f"Page requests per website (default {d.max_pages})")
    p.add_argument("--concurrency", type=int, default=d.concurrency, help=f"Websites at the same time (default {d.concurrency})")
    p.add_argument("--delay", type=float, default=d.delay, help=f"Seconds between requests to one host (default {d.delay})")
    p.add_argument("--no-resume", action="store_true", help="Ignore and delete any saved progress")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    ap_ = argparse.ArgumentParser(prog="autoleads_worker.py", description="OpenStreetMap leads to your AutoLeads Lead Inbox, on a schedule (free, no key).")
    sub = ap_.add_subparsers(dest="command")

    p = sub.add_parser("setup", help="Ask a few questions, save the settings, check the connections")
    _common(p)
    p.add_argument("--force", action="store_true", help="Overwrite an existing settings file")
    p.add_argument("--google-key", default="", help=argparse.SUPPRESS)  # no longer needed; accepted so old commands keep working
    p.add_argument("--app-url", default="")
    p.add_argument("--ingest-key", default="")
    p.add_argument("--webhook", default="")
    p.add_argument("--query", default="", help='What to find, e.g. "plumbers, electricians"')
    p.add_argument("--location", default=None, help='Where, e.g. "Colombo, Sri Lanka". Several places: separate with ;')
    p.add_argument("--region", default="")
    p.add_argument("--min-score", type=int, default=WARM_SCORE)
    p.add_argument("--skip-check", action="store_true")
    p.add_argument("--install-schedule", action="store_true", help="Also schedule the daily run without asking")
    p.add_argument("--time", default=DEFAULT_RUN_TIME, help="Daily run time, 24h (default 09:00)")

    p = sub.add_parser("check", help="Test the free map servers, the AutoLeads connection and the webhook")
    _common(p)
    p.add_argument("--api-base", default=API_BASE, help=argparse.SUPPRESS)

    p = sub.add_parser("run", help="One run: search, crawl, score, deliver to the inbox")
    _common(p)
    p.add_argument("--no-push", action="store_true", help="Do not deliver to the inbox (the CSV is still written)")
    p.add_argument("--no-notify", action="store_true", help="Do not send the webhook message")
    p.add_argument("--loop-hours", type=float, default=0, help="Keep running, once every N hours (leave the window open)")
    p.add_argument("--api-base", default=API_BASE, help=argparse.SUPPRESS)

    for name, text in (("plan", "Show what the next run would do (calls nothing)"), ("status", "Budget used and best performing searches")):
        _common(sub.add_parser(name, help=text))

    p = sub.add_parser("schedule", help="Print or install the daily schedule")
    _common(p)
    p.add_argument("--install", action="store_true")
    p.add_argument("--remove", action="store_true")
    p.add_argument("--time", default=DEFAULT_RUN_TIME)

    p = sub.add_parser("find", help="One-off: search + crawl + import file for a single query")
    _common(p)
    _search_options(p)
    _crawl_options(p)
    p.add_argument("--input", help="Enrich this CSV instead of searching the map")
    p.add_argument("--name", default="leads", help="Name prefix for the files (default leads)")
    p.add_argument("--min-score", type=int, default=WARM_SCORE, help=f"Lowest score to import (default {WARM_SCORE}; HOT is {HOT_SCORE}+)")
    p.add_argument("--min-score-phone-only", type=int, default=0)

    p = sub.add_parser("enrich", help="Crawl the websites in a CSV you already have")
    _common(p)
    p.add_argument("input", help="Input CSV (needs a website column)")
    p.add_argument("-o", "--output", help="Output CSV")
    _crawl_options(p)
    p.add_argument("--retry-unreachable", action="store_true", help="On resume, crawl again rows that were unreachable last time")
    p.add_argument("--timeout", type=float, default=Config().request_timeout)
    p.add_argument("--site-timeout", type=float, default=Config().site_timeout)
    p.add_argument("--user-agent", default=DEFAULT_USER_AGENT)

    p = sub.add_parser("search", help="OpenStreetMap search only")
    _common(p)
    _search_options(p)
    p.add_argument("-o", "--out", default="map_leads.csv")

    return ap_.parse_args(argv)


def _load_cfg_or_explain(path: str) -> Optional[Dict[str, Any]]:
    try:
        return load_config(path)
    except ConfigError as exc:
        print(f"Settings problem: {exc}", file=sys.stderr)
        return None


def _prepare_windows() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    if sys.platform.startswith("win") and hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # avoids "Event loop is closed" noise


def main(argv: Optional[Sequence[str]] = None) -> int:
    _prepare_windows()
    args = parse_args(argv)
    command = args.command
    if command is None:  # double-clicked or run with no words: do the sensible thing
        command = "run" if DEFAULT_CONFIG_PATH.exists() else "setup"
        args = parse_args([command])
    if missing_dependencies() and not offer_install(getattr(args, "yes", False)):
        return 2
    cfg_path = Path(args.config)
    setup_logging(args.log_level, None)

    if command == "setup":
        return run_setup(args)
    if command == "schedule":
        if args.remove:
            ok, msg = remove_schedule()
            print(msg)
            return 0 if ok else 1
        try:
            cmds = schedule_commands(str(cfg_path.resolve()), args.time)
        except ConfigError as exc:
            print(exc)
            return 2
        if args.install:
            ok, msg = install_schedule(args.time, str(cfg_path.resolve()))
            print(msg)
            return 0 if ok else 1
        print("Run it every day. The easy way:  python autoleads_worker.py schedule --install\n")
        print("Windows (Command Prompt):\n  " + subprocess.list2cmdline(cmds["windows_create"]) + "\n")
        print("Mac / Linux (add with crontab -e):\n  " + cmds["cron_line"])
        return 0

    if command in ("find", "enrich", "search"):
        return _run_oneoff(command, args, str(cfg_path))

    cfg = _load_cfg_or_explain(str(cfg_path))
    if cfg is None:
        print("(Run: python autoleads_worker.py setup)", file=sys.stderr)
        return 2
    base_dir = cfg_path.resolve().parent
    out_dir = base_dir / cfg["output_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(args.log_level, out_dir / "autopilot.log")
    now = datetime.now(timezone.utc)
    if command == "plan":
        return cmd_plan(cfg, base_dir, now)
    if command == "status":
        return cmd_status(cfg, base_dir, now)
    if command == "check":
        print("Checking the connections...")
        return 0 if asyncio.run(run_check_and_print(cfg, os.environ, args.api_base)) else 1

    # run
    crawl_logger.setLevel(logging.WARNING)  # per-website lines would bury the run summary

    async def cycle() -> RunSummary:
        s = await run_once(cfg, base_dir, api_base=args.api_base, push_enabled=not args.no_push, notify_enabled=not args.no_notify)
        print("\n" + (s.message or summary_text(s, cfg, os.environ)))
        return s

    try:
        if args.loop_hours > 0:
            while True:
                asyncio.run(cycle())
                logger.info("next run in %.1f hours (Ctrl+C to stop)", args.loop_hours)
                time.sleep(args.loop_hours * 3600)
        return asyncio.run(cycle()).code
    except KeyboardInterrupt:
        logger.warning("stopped; an interrupted batch is finished on the next run")
        return 130


def _run_oneoff(command: str, args: argparse.Namespace, cfg_path: str) -> int:
    if command == "enrich":
        if not os.path.exists(args.input):
            print(f"file not found: {args.input}")
            return 2
        cfg = Config(max_pages=args.max_pages, concurrency=args.concurrency, delay=args.delay, request_timeout=args.timeout,
                     site_timeout=args.site_timeout, user_agent=args.user_agent, retry_unreachable=args.retry_unreachable)
        try:
            out = asyncio.run(run(args.input, args.output, resume=not args.no_resume, cfg=cfg))
        except KeyboardInterrupt:
            logger.warning("interrupted; finished rows are saved, run the same command again to resume")
            return 130
        return 0 if out else 1

    if command == "find":
        if args.query and args.input:
            print("use either --query or --input, not both")
            return 2
        try:
            return asyncio.run(run_pipeline(args))
        except KeyboardInterrupt:
            logger.warning("interrupted; run the same command again to resume")
            return 130

    # search
    if not args.query:
        print("give at least one -q/--query")
        return 2
    try:
        bbox = Rect.parse(args.bbox) if args.bbox else None
    except ValueError as exc:
        print(exc)
        return 2
    scfg = SearchConfig(max_requests=args.max_requests, max_depth=args.max_depth, region=args.region,
                        language=args.language, min_reviews=args.min_reviews, require_website=args.require_website)
    seen = {} if args.no_seen else load_seen(args.seen_file)
    try:
        rows, stats = asyncio.run(search(args.query, args.location, bbox, scfg, seen, args.api_base))
    except ApiError as exc:
        print(exc)
        return 1
    write_csv(args.out, rows)
    if not args.no_seen:
        save_seen(args.seen_file, seen)
    print(f"\nMap data: {OSM_ATTRIBUTION}\nRequests used: {stats.requests} of {scfg.max_requests}{' (limit hit, more may exist)' if stats.budget_hit else ''}\n"
          f"Found: {stats.unique} (already collected {stats.already_seen}, filtered {sum(stats.filtered.values())}, new and saved {len(rows)})\nOutput: {args.out}")
    return 0 if rows or not stats.budget_hit else 1


if __name__ == "__main__":
    raise SystemExit(main())
