#!/usr/bin/env python3
"""Tests for autoleads_worker.py. Run: python test_worker.py
No internet and no keys needed: a mock OpenStreetMap (Nominatim + Overpass), mock websites, a mock AutoLeads inbox
and a mock webhook run on 127.0.0.1."""

import asyncio
import contextlib
import csv
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unittest
import unittest.mock
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiohttp
from aiohttp import web

import autoleads_worker as w

# The program is one module now; the old names are kept as aliases so the tests read the same as before.
le = gs = lp = ap = w


FAST = le.Config(delay=0.02, retries=0, request_timeout=5, site_timeout=60, max_pages=18, concurrency=8)

HOME = """<html><head><title>Acme Plumbing</title><meta name="generator" content="WordPress 6.4"></head><body>
<nav><a href="/about-us">About</a> <a href="/accounting-services">Accounting</a> <a href="/steam-cleaning">Steam</a>
<a href="/contact">Contact Us</a> <a href="/login">Login</a> <a href="/private">Private</a> <a href="/old">Old</a>
<a href="/team/carter-smith">Carter</a></nav>
<a href="https://www.facebook.com/acmecorp"></a><a href="https://uk.linkedin.com/company/acme-plumbing"></a>
<a href="https://wa.me/94771234567">chat</a><a href="https://www.facebook.com/sharer/sharer.php?u=x"></a>
<p>Meet us @ Cafe . Open daily. Download icon@2x.png now.</p></body></html>"""
ABOUT = """<html><body><h1>About</h1><p>Jane Doe, Founder. We are a team of 25 employees. Partner with us today.
Our founder story is long. 10,000 people served.</p></body></html>"""
ACCOUNTING = """<html><body><p>Tel: 011 234 5678 | Fax: 011 234 5679. Since 2024 2025 2026. Updated 2024-05-12.
Also +94 77 123 4567. Invoice 1234567890.</p></body></html>"""
CONTACT = """<html><head><title>Contact</title></head><body><h1>Contact</h1>
<a href="mailto:sales@gmail.com?subject=hi">mail</a><a href="tel:+94 11 234 5678">call</a>
<form><textarea name="m"></textarea></form></body></html>"""
PRIVATE = "<html><body>secret@gmail.com</body></html>"


class MockSite:
    def __init__(self, routes=None):
        self.hits = Counter()
        self.routes = routes or {}
        self.runner = None
        self.port = 0

    def _handler(self, body, status=200, ctype="text/html"):
        async def h(request):
            self.hits[request.path] += 1
            return web.Response(text=body, status=status, content_type=ctype)
        return h

    async def start(self, pages):
        app = web.Application()
        for path, body in pages.items():
            if callable(body):
                app.router.add_get(path, body)
            else:
                ctype = "text/xml" if path.endswith(".xml") else "text/plain" if path == "/robots.txt" else "text/html"
                app.router.add_get(path, self._handler(body, ctype=ctype))
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        return self

    async def stop(self):
        await self.runner.cleanup()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}"


def site_pages(mock):
    async def old(request):
        mock.hits[request.path] += 1
        raise web.HTTPMovedPermanently("/contact")
    return {
        "/": HOME, "/about-us": ABOUT, "/accounting-services": ACCOUNTING, "/steam-cleaning": "<html><body>steam</body></html>",
        "/contact": CONTACT, "/private": PRIVATE, "/login": "<html><body>login@gmail.com</body></html>",
        "/team/carter-smith": "<html><body>Carter</body></html>", "/old": old,
        "/robots.txt": "User-agent: *\nDisallow: /private\n",
    }


def read_rows(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


async def crawl(url, cfg=FAST):
    connector = aiohttp.TCPConnector(limit=10)
    async with aiohttp.ClientSession(connector=connector) as session:
        return await le.scrape_site(session, url, le.RobotsCache(cfg), le.DomainLimiter(cfg.delay), cfg)


class UnitTests(unittest.TestCase):
    def test_prepare_website(self):
        self.assertEqual(le.prepare_website("acme.com"), "https://acme.com/")
        self.assertEqual(le.prepare_website("www.acme.com/about?utm_source=x"), "https://www.acme.com/about")
        self.assertEqual(le.prepare_website("//acme.com"), "https://acme.com/")
        for bad in ("", "N/A", "none", "info@acme.com", "https://maps.google.com/?cid=1", "localdomain"):
            self.assertIsNone(le.prepare_website(bad), bad)
        self.assertEqual(le.prepare_website("https://sites.google.com/view/acme"), "https://sites.google.com/view/acme")

    def test_normalise_url_dedupes(self):
        a = le.normalise_url("HTTP://Acme.com:80//a//b/index.html?b=2&a=1&utm_x=1#frag")
        self.assertEqual(a, "http://acme.com/a/b?a=1&b=2")
        self.assertIsNone(le.normalise_url("mailto:a@b.com"))
        self.assertIsNone(le.normalise_url("http://user:pw@acme.com/"))

    def test_skip_rules_use_whole_segments(self):
        self.assertFalse(le.should_skip_url("https://a.com/accounting-services"))
        self.assertFalse(le.should_skip_url("https://a.com/team/carter-smith"))
        self.assertFalse(le.should_skip_url("https://a.com/search-engine-optimization"))
        self.assertTrue(le.should_skip_url("https://a.com/account"))
        self.assertTrue(le.should_skip_url("https://a.com/cart/"))
        self.assertTrue(le.should_skip_url("https://a.com/x.pdf"))
        self.assertTrue(le.should_skip_url("https://a.com/?s=query"))

    def test_priority_uses_tokens(self):
        self.assertLess(le.path_priority("https://a.com/team", 1), le.path_priority("https://a.com/steam-cleaning", 1))
        self.assertEqual(le.path_priority("https://a.com/steam-cleaning", 1), 28)
        self.assertEqual(le.path_priority("https://a.com/", 0), 0)
        self.assertTrue(le.is_contact_path("/contact-us"))
        self.assertTrue(le.is_contact_path("/get-in-touch"))
        self.assertFalse(le.is_contact_path("/connectivity"))

    def test_emails(self):
        found = le.extract_emails("Mail info@acme.com or icon@2x.png or john[at]acme[dot]co[dot]uk or x@y.jpg  us @ cafe . open")
        self.assertEqual(found, {"info@acme.com", "john@acme.co.uk"})
        enc = "".join(f"{ord(c) ^ 0x5a:02x}" for c in "info@acme.com")
        self.assertEqual(le.decode_cfemail("5a" + enc), "info@acme.com")
        hosts = {"acme.com"}
        self.assertTrue(le.email_acceptable("a@acme.com", hosts))
        self.assertTrue(le.email_acceptable("a@mail.acme.com", hosts))
        self.assertTrue(le.email_acceptable("a@acme.co.uk", hosts))
        self.assertTrue(le.email_acceptable("a@gmail.com", hosts))
        self.assertFalse(le.email_acceptable("a@webagency.com", hosts))
        self.assertFalse(le.email_acceptable("a@sentry.io", hosts))
        self.assertEqual(le.choose_primary_email(["me@gmail.com", "hello@acme.com"], hosts), "hello@acme.com")

    def test_phones(self):
        text = ("Tel: 011 234 5678 | Fax: 011 234 5679. Since 2024 2025 2026. Updated 2024-05-12. "
                "Also +94 77 123 4567. Invoice 1234567890. Call (555) 123-4567")
        self.assertEqual(le.extract_phones_from_text(text), {"0112345678", "+94771234567", "5551234567"})
        self.assertEqual(le.clean_phone("0094 77 123 4567"), "+94771234567")
        self.assertIsNone(le.clean_phone("1111111111"))

    def test_decision_makers(self):
        self.assertEqual(le.find_decision_makers("Jane Doe, Founder and more")[0], ("Jane Doe", "Founder"))
        self.assertEqual(le.find_decision_makers("Managing Director: Ravi Perera")[0], ("Ravi Perera", "Managing Director"))
        self.assertEqual(le.find_decision_makers("Founded by Mary Ann Lee in 1999")[0], ("Mary Ann Lee", "Founder"))
        self.assertEqual(le.find_decision_makers("John Smith CEO & Founder")[0][0], "John Smith")
        for text in ("We help business owners grow. Partner with us. Our founder story. Contact Us Director of Sales team",
                     "Meet The Team Our Owner", "Read More Owner"):
            self.assertEqual(le.find_decision_makers(text), [], text)
        self.assertEqual(le.find_decision_makers("Meet Jane Doe Founder")[0][0], "Jane Doe")

    def test_company_size(self):
        self.assertEqual(le.estimate_company_size("a team of 25 employees"), ("small", 2))
        self.assertEqual(le.estimate_company_size("we have 120 employees"), ("medium", 2))
        self.assertEqual(le.estimate_company_size("over 1,000 employees worldwide"), ("large", 2))
        self.assertEqual(le.estimate_company_size("10,000 people served; global enterprise"), ("unknown", 0))
        self.assertEqual(le.estimate_company_size("a family-owned boutique"), ("small", 1))

    def test_social(self):
        self.assertEqual(le.social_from_url("https://uk.linkedin.com/company/acme/"), ("linkedin_company", "https://www.linkedin.com/company/acme/"))
        self.assertEqual(le.social_from_url("https://m.facebook.com/acmecorp")[0], "facebook")
        self.assertEqual(le.social_from_url("https://www.facebook.com/sharer/sharer.php?u=x"), ("", ""))
        self.assertEqual(le.social_from_url("https://www.facebook.com/profile.php?id=123")[1], "https://www.facebook.com/profile.php?id=123")
        self.assertEqual(le.social_from_url("https://twitter.com/intent/tweet"), ("", ""))
        self.assertEqual(le.social_from_url("https://www.instagram.com/p/abc/"), ("", ""))
        self.assertEqual(le.social_from_url("https://x.com/AcmeCo")[1], "https://x.com/acmeco/")

    def test_parse_page(self):
        html = """<html><head><title>Our Team</title>
        <script type="application/ld+json">{"@type":"Organization","email":"hi@acme.com","telephone":"+94 11 234 5678",
        "sameAs":["https://www.instagram.com/acme/"],"employee":{"@type":"Person","name":"Sam Lee","jobTitle":"Managing Director"}}</script></head>
        <body><nav><a href="/contact">Contact Us</a></nav>
        <div class="card"><h3>Ann Fox</h3><p>CEO</p><a href="https://www.linkedin.com/in/annfox"></a></div>
        <div class="card"><h3>Bo Ray</h3><p>Co-Founder</p><a href="https://www.linkedin.com/in/boray"></a></div>
        <a class="__cf_email__" data-cfemail="%s">[email protected]</a></body></html>""" % ("5a" + "".join(f"{ord(c) ^ 0x5a:02x}" for c in "boss@acme.com"))
        page = le.parse_page(html, "https://acme.com/team", frozenset({"acme.com"}), 1)
        self.assertEqual(page.emails, {"hi@acme.com", "boss@acme.com"})
        self.assertIn("+94112345678", page.phones)
        self.assertEqual(page.socials["instagram"], "https://www.instagram.com/acme/")
        self.assertEqual(page.socials["linkedin_ceo"], "https://www.linkedin.com/in/annfox/")
        self.assertEqual(page.socials["linkedin_founder"], "https://www.linkedin.com/in/boray/")
        self.assertIn(("Sam Lee", "Managing Director"), page.decision_makers)
        self.assertIn("wordpress", le.parse_page('<meta name="generator" content="WordPress 6"><p>x</p>', "https://a.com/", frozenset({"a.com"}), 0).tech)
        # "Contact Us" in a menu does not make a page a contact page
        self.assertFalse(le.parse_page('<html><title>Home</title><a href="/contact">Contact Us</a></html>', "https://a.com/", frozenset({"a.com"}), 0).is_contact)
        self.assertTrue(le.parse_page('<title>Contact</title><h1>Contact</h1><form><textarea></textarea></form>', "https://a.com/hello", frozenset({"a.com"}), 0).is_contact)

    def test_phone_noise_page(self):
        page = le.parse_page(ACCOUNTING, "https://a.com/accounting-services", frozenset({"a.com"}), 1)
        self.assertEqual(page.phones, {"0112345678", "+94771234567"})  # no fax, no years, no date, no invoice id

    def test_row_merge_keeps_input_values(self):
        row = le.initial_row_defaults({"business_name": "Acme", "website": "acme.com", "whatsapp_number": "+94 77 111 2222",
                                       "instagram": "https://instagram.com/mine/", "email": "Old@Acme.com"})
        site = le.SiteData(hosts={"acme.com"}, status="ok", pages_crawled=3)
        site.emails = {"hello@acme.com"}
        site.phones = {"+94771112222", "0112345678"}
        site.socials["instagram"] = "https://www.instagram.com/other/"
        site.socials["facebook"] = "https://www.facebook.com/acme/"
        site.decision_maker = ("Jane Doe", "Founder")
        le.merge_site_into_row(row, site)
        le.finalise_scores(row)
        self.assertEqual(row["whatsapp_number"], "+94 77 111 2222")  # input column untouched
        self.assertEqual(row["instagram"], "https://instagram.com/mine/")
        self.assertEqual(row["facebook"], "https://www.facebook.com/acme/")
        self.assertEqual(row["phones_all"], "+94771112222; 0112345678")  # same number in two spellings once
        self.assertEqual(row["email_primary"], "hello@acme.com")
        self.assertEqual(row["email"], "old@acme.com; hello@acme.com")
        self.assertEqual(row["decision_maker_name"], "Jane Doe")
        self.assertGreater(int(row["lead_quality_score"]), 40)

    def test_read_csv_variants(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.csv"
            p.write_bytes("Business;URL\nCaf\xe9 Uno;cafe.com\n".encode("cp1252"))
            rows, cols = le.read_csv(str(p))
            self.assertEqual(rows[0]["website"], "cafe.com")
            self.assertEqual(rows[0]["Business"], "Caf\xe9 Uno")
            self.assertIn("website", cols)

    def test_checkpoint_ignores_changed_rows_and_torn_lines(self):
        with tempfile.TemporaryDirectory() as d:
            ck = le.Checkpoint(str(Path(d) / "c.jsonl"))
            ck.open()
            ck.write(0, "k0", {"a": 1})
            ck.write(1, "OLD", {"a": 2})
            ck.close()
            with open(ck.path, "a") as f:
                f.write('{"i": 2, "k": "k2", "row": {"a"')  # crash mid-write
            ck2 = le.Checkpoint(ck.path)
            self.assertEqual(ck2.load(["k0", "k1", "k2"]), {0: {"a": 1}})
            ck2.open()
            ck2.write(2, "k2", {"a": 3})
            ck2.close()
            self.assertEqual(le.Checkpoint(ck.path).load(["k0", "k1", "k2"]), {0: {"a": 1}, 2: {"a": 3}})


class LockTests(unittest.TestCase):
    def _lock(self, content=None):
        d = Path(tempfile.mkdtemp())
        path = d / ".lock"
        if content is not None:
            path.write_text(content)
        return path

    def test_fresh_lock_is_taken_and_records_our_pid(self):
        path = self._lock()
        self.assertTrue(w.acquire_lock(path))
        self.assertEqual(path.read_text(), str(os.getpid()))
        self.assertFalse(w.acquire_lock(path))  # a second run while we are alive is refused

    def test_lock_of_a_dead_process_is_cleared_at_once(self):
        child = subprocess.Popen([sys.executable, "-c", "pass"])
        child.wait()
        path = self._lock(str(child.pid))  # brand new file, but its owner is gone (crash or closed window)
        self.assertTrue(w.acquire_lock(path))
        self.assertEqual(path.read_text(), str(os.getpid()))

    def test_unreadable_owner_falls_back_to_the_age_rule(self):
        path = self._lock("not a pid")
        self.assertFalse(w.acquire_lock(path))  # fresh: could be a live run
        old = time.time() - (w.LOCK_MAX_AGE_HOURS + 1) * 3600
        os.utime(path, (old, old))
        self.assertTrue(w.acquire_lock(path))  # stale

    def test_live_owner_is_respected_however_old(self):
        path = self._lock(str(os.getpid()))
        old = time.time() - 2 * 3600
        os.utime(path, (old, old))
        self.assertFalse(w.acquire_lock(path))


class CrawlTests(unittest.IsolatedAsyncioTestCase):
    async def test_full_crawl(self):
        mock = MockSite()
        await mock.start(site_pages(mock))
        try:
            site = await crawl(mock.url + "/")
        finally:
            await mock.stop()
        self.assertEqual(site.status, "ok")
        self.assertEqual(mock.hits["/private"], 0)  # robots.txt respected
        self.assertEqual(mock.hits["/login"], 0)  # login pages skipped
        self.assertLess(site.pages_crawled, 8)  # enough evidence found: stopped early instead of crawling everything
        self.assertNotIn("secret@gmail.com", site.emails)
        self.assertIn("sales@gmail.com", site.emails)
        self.assertNotIn("icon@2x.png", site.emails)
        self.assertEqual(site.contact_page_url, mock.url + "/contact")
        self.assertEqual(site.decision_maker, ("Jane Doe", "Founder"))
        self.assertEqual(site.size, "small")
        self.assertIn("wordpress", site.tech)
        self.assertEqual(site.socials["facebook"], "https://www.facebook.com/acmecorp/")
        self.assertEqual(site.socials["linkedin_company"], "https://www.linkedin.com/company/acme-plumbing/")
        self.assertIn("+94771234567", site.whatsapp)
        self.assertTrue({"+94771234567", "+94112345678"} <= site.phones)

    async def test_redirect_to_other_host_keeps_site(self):
        mock = MockSite()

        async def start(request):
            raise web.HTTPFound(mock.url + "/landing")

        pages = site_pages(mock)
        pages["/landing"] = HOME
        await mock.start(pages)
        # the lead lists localhost, which redirects to 127.0.0.1 (a different host name)
        app_redirect = MockSite()
        await app_redirect.start({"/": start})
        try:
            site = await crawl(f"http://localhost:{app_redirect.port}/")
        finally:
            await app_redirect.stop()
            await mock.stop()
        self.assertEqual(site.status, "ok")
        self.assertIn("127.0.0.1", site.hosts)
        self.assertIn("sales@gmail.com", site.emails)  # reached /contact on the new host

    async def test_scheme_missing_falls_back_to_http(self):
        mock = MockSite()
        await mock.start(site_pages(mock))
        try:
            site = await crawl(f"127.0.0.1:{mock.port}")
        finally:
            await mock.stop()
        self.assertEqual(site.status, "ok")
        self.assertIn("sales@gmail.com", site.emails)

    async def test_unreachable_and_robots_status(self):
        site = await crawl("http://nonexistent-host-abc123.invalid/")
        self.assertEqual(site.status, "unreachable")
        mock = MockSite()
        await mock.start({"/": HOME, "/robots.txt": "User-agent: *\nDisallow: /\n"})
        try:
            blocked = await crawl(mock.url + "/")
        finally:
            await mock.stop()
        self.assertEqual(blocked.status, "blocked_by_robots")
        self.assertEqual(mock.hits["/"], 0)

    async def test_429_retry_with_slowdown(self):
        mock = MockSite()
        state = {"n": 0}

        async def flaky(request):
            state["n"] += 1
            if state["n"] == 1:
                return web.Response(status=429, headers={"Retry-After": "0"})
            return web.Response(text="<html><body>ok flaky@gmail.com</body></html>", content_type="text/html")

        await mock.start({"/": flaky})
        cfg = le.Config(delay=0.01, retries=2, request_timeout=5, max_pages=2)
        limiter = le.DomainLimiter(cfg.delay)
        try:
            async with aiohttp.ClientSession() as s:
                res = await le.http_get(s, mock.url + "/", cfg, le.RobotsCache(cfg), limiter)
        finally:
            await mock.stop()
        self.assertTrue(res.ok)
        self.assertEqual(state["n"], 2)
        self.assertGreaterEqual(limiter._delay["127.0.0.1"], 2.0)

    async def test_sitemap_discovery_for_linkless_homepage(self):
        mock = MockSite()
        sm = f"""<?xml version="1.0"?><urlset><url><loc>{{u}}/contact-us</loc></url><url><loc>{{u}}/blog/post-1</loc></url></urlset>"""

        async def sitemap(request):
            mock.hits["/sitemap.xml"] += 1
            return web.Response(text=sm.format(u=mock.url), content_type="text/xml")

        await mock.start({"/": "<html><body>JS only site</body></html>", "/contact-us": CONTACT, "/sitemap.xml": sitemap})
        try:
            site = await crawl(mock.url + "/")
        finally:
            await mock.stop()
        self.assertEqual(mock.hits["/sitemap.xml"], 1)
        self.assertIn("sales@gmail.com", site.emails)

    async def test_social_profile_as_website_is_not_crawled(self):
        site = await crawl("https://www.facebook.com/acmecorp")
        self.assertEqual(site.status, "social_only")
        self.assertEqual(site.socials["facebook"], "https://www.facebook.com/acmecorp/")
        self.assertEqual((await crawl("n/a")).status, "no_website")


class EndToEndTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_csv_order_cache_and_resume(self):
        mock = MockSite()
        await mock.start(site_pages(mock))
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "leads.csv"
            rows = [
                {"business_name": "A", "website": mock.url + "/", "whatsapp_number": "+94 77 000 0001", "extra": "keep1"},
                {"business_name": "B", "website": "", "whatsapp_number": "", "extra": "keep2"},
                {"business_name": "C (same site)", "website": mock.url + "/", "whatsapp_number": "", "extra": "keep3"},
                {"business_name": "D", "website": "https://www.facebook.com/dcorp", "whatsapp_number": "", "extra": "keep4"},
                {"business_name": "E", "website": "http://nonexistent-host-abc123.invalid", "whatsapp_number": "", "extra": "keep5"},
            ]
            with open(src, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=list(rows[0]))
                w.writeheader()
                w.writerows(rows)
            out = Path(d) / "out.csv"
            cfg = le.Config(delay=0.02, retries=0, request_timeout=5, concurrency=4)
            try:
                result = await le.run(str(src), str(out), resume=True, cfg=cfg)
                self.assertEqual(result, str(out))
                got = read_rows(out)
                self.assertEqual([r["business_name"] for r in got], ["A", "B", "C (same site)", "D", "E"])  # input order
                self.assertEqual([r["extra"] for r in got], ["keep1", "keep2", "keep3", "keep4", "keep5"])  # input columns kept
                self.assertEqual([r["enrichment_status"] for r in got], ["ok", "no_website", "ok", "social_only", "unreachable"])
                self.assertEqual(got[0]["whatsapp_number"], "+94 77 000 0001")
                self.assertEqual(got[3]["facebook"], "https://www.facebook.com/dcorp/")
                self.assertEqual(mock.hits["/"], 1)  # duplicate site crawled once
                self.assertFalse(os.path.exists(le.checkpoint_path(str(out))))

                # resume: a checkpoint with row 0 done, row 0's input then changed -> must be redone
                keys = [le.row_key(r) for r in rows]
                ck = le.Checkpoint(le.checkpoint_path(str(out)))
                ck.open(fresh=True)
                ck.write(0, keys[0], {**rows[0], "enrichment_status": "ok", "email_primary": "kept@gmail.com"})
                ck.write(1, "stale-key", {**rows[1], "enrichment_status": "ok", "email_primary": "wrong@gmail.com"})
                ck.close()
                before = mock.hits["/"]
                await le.run(str(src), str(out), resume=True, cfg=cfg)
                got2 = read_rows(out)
                self.assertEqual(got2[0]["email_primary"], "kept@gmail.com")  # reused, not re-crawled
                self.assertNotEqual(got2[1]["email_primary"], "wrong@gmail.com")  # stale entry discarded
                self.assertEqual(mock.hits["/"], before + 1)  # only row C crawled the site again
            finally:
                await mock.stop()


w.MAP_PAUSE = 0.0  # tests do not wait for the free servers' rate limits


def grid_places(n=130, site_url=""):
    """OpenStreetMap elements on a grid inside 0..1 x 0..1. Every 25th one has no name: the real server is asked for
    named places only, but the mock returns them anyway so the worker's own filter is tested too."""
    out = []
    for i in range(n):
        tags = {"craft": "plumber", "phone": f"+94 11 {i:03d} 0000", "addr:housenumber": str(i), "addr:street": "Test Road"}
        if i % 25 != 0:
            tags["name"] = f"Biz {i}"
        if site_url and i % 2 == 0:
            tags["website"] = site_url + "/?utm_source=osm"
        out.append({"type": "node", "id": i, "lat": (i % 13) / 13 + 0.03, "lon": (i // 13) / 10 + 0.03, "tags": tags})
    return out


class MockOSM:
    """Stands in for both free servers: Nominatim (/search) and Overpass (/api/interpreter)."""

    def __init__(self, places, fail_first_429=False, status=None, geocode_status=None):
        self.places = places
        self.calls = []
        self.fail_first_429 = fail_first_429
        self.status = status  # every Overpass answer is this error
        self.geocode_status = geocode_status
        self.runner = None
        self.port = 0

    async def geocode(self, request):
        self.calls.append(("geocode", request.query["q"]))
        if "AutoLeadsWorker" not in request.headers.get("User-Agent", ""):
            return web.Response(status=403, text="Please identify your application")
        if self.geocode_status:
            return web.Response(status=self.geocode_status, text="blocked")
        if request.query["q"] == "Nowhere":
            return web.json_response([])
        return web.json_response([{"display_name": request.query["q"], "boundingbox": ["0", "1", "0", "1"]}])

    async def interpreter(self, request):
        if "AutoLeadsWorker" not in request.headers.get("User-Agent", ""):
            return web.Response(status=403, text="no user agent")
        ql = (await request.post())["data"]
        if self.status:
            self.calls.append("error")
            return web.Response(status=self.status, text="<html>down</html>")
        if self.fail_first_429 and not any(isinstance(c, dict) or c == "429" for c in self.calls):
            self.calls.append("429")
            return web.Response(status=429, headers={"Retry-After": "0"})
        south, west, north, east = (float(x) for x in re.search(r"\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)", ql).groups())
        limit = int(re.search(r"out tags center (\d+);", ql).group(1))
        self.calls.append({"ql": ql, "rect": (south, west, north, east), "limit": limit})
        found = [p for p in self.places if south <= p["lat"] <= north and west <= p["lon"] <= east]
        return web.json_response({"elements": found[:limit]})  # the real server also stops at the limit

    async def start(self):
        app = web.Application()
        app.router.add_get("/search", self.geocode)
        app.router.add_post("/api/interpreter", self.interpreter)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        return self

    async def stop(self):
        await self.runner.cleanup()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}"


MockPlaces = MockOSM  # the old name, kept so the tests below read as before


class SearchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.mock = await MockOSM(grid_places()).start()

    async def asyncTearDown(self):
        await self.mock.stop()

    async def test_full_area_is_split_until_everything_is_found(self):
        rows, stats = await gs.search(["plumbers"], location="Testville", cfg=gs.SearchConfig(limit=50), base=self.mock.url)
        ids = [r["place_id"] for r in rows]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(rows), 124)  # 130 minus 6 without a name
        self.assertEqual(stats.filtered["no_name"], 6)
        self.assertGreater(stats.requests, 3)  # one area lookup plus the split searches
        first = rows[0]
        self.assertEqual(set(gs.OUTPUT_COLUMNS) - set(first), set())
        self.assertTrue(first["place_id"].startswith("osm:node/"))
        self.assertTrue(first["maps_url"].startswith("https://www.openstreetmap.org/node/"))
        self.assertTrue(first["whatsapp_number"].startswith("+94"))
        self.assertEqual(first["rating"], "")  # OpenStreetMap has no ratings

    async def test_one_query_returns_everything_when_the_area_is_not_crowded(self):
        rows, stats = await gs.search(["plumbers"], location="Testville", base=self.mock.url)
        self.assertEqual(len(rows), 124)
        self.assertEqual(stats.requests, 2)  # area lookup + one search: far fewer than a paged API needs

    async def test_without_splitting_you_only_get_the_cap(self):
        rows, _ = await gs.search(["plumbers"], location="Testville", cfg=gs.SearchConfig(limit=50, max_depth=0), base=self.mock.url)
        self.assertLessEqual(len(rows), 50)

    async def test_budget_guard_stops_cleanly_and_keeps_results(self):
        rows, stats = await gs.search(["plumbers"], location="Testville", cfg=gs.SearchConfig(limit=50, max_requests=4), base=self.mock.url)
        self.assertTrue(stats.budget_hit)
        self.assertLessEqual(len(self.mock.calls), 4)
        self.assertGreater(len(rows), 0)

    async def test_unknown_area_gives_a_helpful_error(self):
        with self.assertRaises(gs.ApiError) as ctx:
            await gs.search(["plumbers"], location="Nowhere", base=self.mock.url)
        self.assertIn("Nowhere", str(ctx.exception))
        self.assertIn("--bbox", str(ctx.exception))

    async def test_a_search_without_any_area_explains_what_to_add(self):
        with self.assertRaises(gs.ApiError) as ctx:
            await gs.search(["plumbers"], base=self.mock.url)
        self.assertIn("area", str(ctx.exception))
        self.assertEqual(self.mock.calls, [])  # nothing was asked of the server

    async def test_the_area_can_be_written_into_the_search(self):
        rows, _ = await gs.search(["plumbers in Testville"], base=self.mock.url)
        self.assertEqual(len(rows), 124)
        self.assertEqual(self.mock.calls[0], ("geocode", "Testville"))

    async def test_repeat_run_returns_only_new_places(self):
        seen = {}
        first, _ = await gs.search(["plumbers"], location="Testville", seen=seen, base=self.mock.url)
        second, stats = await gs.search(["plumbers"], location="Testville", seen=seen, base=self.mock.url)
        self.assertEqual(len(second), 0)
        self.assertEqual(stats.already_seen, len(first))

    async def test_filters(self):
        # OpenStreetMap has no reviews: the old "minimum reviews" setting is accepted and ignored
        rows, stats = await gs.search(["plumbers"], location="Testville", base=self.mock.url, cfg=gs.SearchConfig(min_reviews=100))
        self.assertEqual(len(rows), 124)
        mock2 = await MockOSM(grid_places(site_url="http://x.example")).start()
        try:
            rows2, stats2 = await gs.search(["plumbers"], location="Testville", base=mock2.url, cfg=gs.SearchConfig(require_website=True))
        finally:
            await mock2.stop()
        self.assertTrue(rows2 and all(r["website"] for r in rows2))
        self.assertGreater(stats2.filtered["no_website"], 0)

    async def test_retry_after_429(self):
        mock = await MockOSM(grid_places(30), fail_first_429=True).start()
        try:
            rows, _ = await gs.search(["plumbers"], bbox=gs.Rect(0, 0, 1, 1), base=mock.url)
        finally:
            await mock.stop()
        self.assertEqual(len(rows), 28)  # 30 minus 2 without a name (ids 0 and 25)

    async def test_servers_down_gives_a_helpful_error(self):
        mock = await MockOSM(grid_places(5), status=503).start()
        try:
            with self.assertRaises(gs.ApiError) as ctx:
                await gs.search(["plumbers"], location="Testville", base=mock.url)
        finally:
            await mock.stop()
        self.assertIn("busy or unreachable", str(ctx.exception))

    async def test_a_search_the_server_cannot_answer_is_split(self):
        class Heavy(MockOSM):
            async def interpreter(self, request):
                ql = (await request.post())["data"]
                south, _w, north, _e = (float(x) for x in re.search(r"\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)", ql).groups())
                if north - south > 0.6:  # the whole area is too big for the server
                    self.calls.append("timeout")
                    return web.json_response({"elements": [], "remark": 'runtime error: Query timed out in "query" at line 3 after 91 seconds.'})
                return await super().interpreter(request)

        mock = await Heavy(grid_places(60)).start()
        try:
            rows, _ = await gs.search(["plumbers"], location="Testville", base=mock.url)
        finally:
            await mock.stop()
        self.assertEqual(len(rows), 57)  # 60 minus 3 without a name

    async def test_cli_writes_csv_and_seen_file(self):
        with tempfile.TemporaryDirectory() as d:
            out, seen = str(Path(d) / "o.csv"), str(Path(d) / "seen.json")
            argv = ["-q", "plumbers", "--location", "Testville", "-o", out, "--seen-file", seen, "--api-base", self.mock.url]
            code = await asyncio.to_thread(w.main, ["search"] + argv)
            self.assertEqual(code, 0)
            with open(out, encoding="utf-8") as f:
                self.assertEqual(len(list(csv.DictReader(f))), 124)
            self.assertEqual(len(json.load(open(seen))), 124)

    async def test_old_commands_with_a_google_key_still_run(self):
        with tempfile.TemporaryDirectory() as d:
            out = str(Path(d) / "o.csv")
            argv = ["search", "-q", "plumbers", "--location", "Testville", "-o", out, "--no-seen", "--api-key", "old-key", "--api-base", self.mock.url]
            self.assertEqual(await asyncio.to_thread(w.main, argv), 0)

    def test_bbox_parsing(self):
        self.assertEqual(gs.Rect.parse("6.8,79.8,7.0,79.9"), gs.Rect(6.8, 79.8, 7.0, 79.9))
        for bad in ("1,2,3", "7,79,6,80", "a,b,c,d", "0,0,95,10"):
            with self.assertRaises(ValueError, msg=bad):
                gs.Rect.parse(bad)
        self.assertEqual(len(gs.Rect(0, 0, 1, 1).split4()), 4)
        self.assertTrue(gs.Rect(0, 0, 0.001, 0.001).small)
        self.assertEqual(gs.Rect.from_nominatim(["6.7", "7.0", "79.8", "80.0"]), gs.Rect(6.7, 79.8, 7.0, 80.0))


class OsmParsingTests(unittest.TestCase):
    def test_search_words_become_map_tags(self):
        tags, stems = gs.category_filters("Plumbers")
        self.assertIn("craft=plumber", tags)
        self.assertIn("plumb", stems)
        tags, _ = gs.category_filters("dental clinics")
        self.assertIn("amenity=dentist", tags)
        self.assertTrue(any(t.startswith("amenity=doctors") for t in tags))
        tags, stems = gs.category_filters("yarn sellers")  # not in the table: look for the words in names
        self.assertEqual((tags, stems), ([], ["yarn seller"]))
        self.assertEqual(gs.split_area_from_query("plumbers in Colombo, Sri Lanka"), ("plumbers", "Colombo, Sri Lanka"))
        self.assertEqual(gs.split_area_from_query("plumbers"), ("plumbers", ""))

    def test_overpass_query_text(self):
        ql = gs.overpass_query(["amenity=doctors|clinic", "craft=plumber"], ["clinic"], gs.Rect(6.8, 79.8, 7.0, 79.9), 100)
        self.assertIn('nwr["amenity"~"^(doctors|clinic)$"]["name"](6.800000,79.800000,7.000000,79.900000);', ql)
        self.assertIn('nwr["craft"="plumber"]["name"]', ql)
        self.assertIn('["name"~"clinic",i]', ql)
        self.assertTrue(ql.rstrip().endswith("out tags center 100;"))
        with self.assertRaises(gs.ApiError):
            gs.overpass_query([], [], gs.Rect(0, 0, 1, 1))

    def test_user_agent_is_honest_and_per_install(self):
        ua = gs.user_agent()
        self.assertTrue(ua.startswith("AutoLeadsWorker/1.0"))
        self.assertEqual(ua, gs.user_agent())

    def test_element_to_row(self):
        col = gs.Collector(gs.SearchConfig(), {}, gs.SearchStats())
        col.add({"type": "node", "id": 1, "lat": 6.9, "lon": 79.85, "tags": {
            "name": "Acme Plumbing", "craft": "plumber", "phone": "+94 11 234 5678; 077 123 4567", "website": "http://www.acme.lk/?utm_source=x",
            "email": "info@acme.lk", "addr:housenumber": "12", "addr:street": "Galle Road", "addr:city": "Colombo"}}, "plumbers")
        col.add({"type": "way", "id": 2, "center": {"lat": 6.91, "lon": 79.86},
                 "tags": {"name": "Facebook Only Salon", "shop": "hairdresser", "website": "https://www.facebook.com/fbsalon"}}, "salons")
        col.add({"type": "node", "id": 3, "lat": 1, "lon": 1, "tags": {"craft": "plumber"}}, "plumbers")  # no name
        col.add({"type": "node", "id": 1, "lat": 6.9, "lon": 79.85, "tags": {"name": "Acme Plumbing"}}, "plumbers")  # same place again
        a, b = col.result_rows()
        self.assertEqual(col.stats.filtered["no_name"], 1)
        self.assertEqual((a["place_id"], a["whatsapp_number"], a["email"]), ("osm:node/1", "+94112345678", "info@acme.lk"))
        self.assertEqual((a["website"], a["address"], a["category"]), ("http://www.acme.lk/", "12 Galle Road, Colombo", "Plumber"))
        self.assertEqual(b["website"], "")  # a Facebook page is a social link, not a website to crawl
        self.assertTrue(b["facebook"].startswith("https://www.facebook.com/fbsalon"))
        self.assertEqual(b["latitude"], 6.91)  # areas use their centre point



class AppImportTests(unittest.TestCase):
    def row(self, name, score, email="", phone="", dm=("", ""), **kw):
        return {"business_name": name, "lead_quality_score": str(score), "email_primary": email, "email": email,
                "whatsapp_number": phone, "phone_primary": phone, "decision_maker_name": dm[0], "decision_maker_title": dm[1], **kw}

    def test_rules(self):
        rows = [
            self.row("Chain A", 80, "info@chain.com", "+94 11 111 1111", ("Jane Doe", "Founder")),
            self.row("Chain B", 60, "info@chain.com", "+94 11 222 2222"),
            self.row("Chain C", 55, "info@chain.com"),
            self.row("Low", 20, "x@acme.com"),
            self.row("Robot", 50, "noreply@bot.com", "+94 11 333 3333"),
            self.row("Nothing", 90),
            self.row("Phone only", 10, phone="0112 444 444"),
            self.row("Manager", 45, "a@mgr.com", dm=("Bob Ray", "Director")),
        ]
        ready, review, reasons = lp.prepare_app_import(rows, min_score=40)
        by = {r["business_name"]: r for r in ready}
        self.assertEqual([r["business_name"] for r in ready][0], "Chain A")  # best first
        self.assertEqual(by["Chain A"]["email"], "info@chain.com")
        self.assertEqual((by["Chain A"]["first_name"], by["Chain A"]["last_name"]), ("Jane", "Doe"))
        self.assertEqual(by["Chain A"]["lead_quality"], "HOT")
        self.assertEqual(by["Chain B"]["email"], "")  # shared inbox is contacted once; this branch keeps only its phone
        self.assertEqual(by["Chain B"]["whatsapp_number"], "+94 11 222 2222".replace(" ", ""))
        self.assertNotIn("Chain C", by)  # duplicate email and no phone of its own
        self.assertEqual(by["Robot"]["email"], "")  # noreply is not a person, phone kept
        self.assertEqual(by["Manager"]["first_name"], "")  # only owner-level titles become a greeting name
        self.assertEqual(by["Manager"]["lead_quality"], "WARM")
        self.assertIn("Phone only", by)  # phone-only leads are not held to the email score minimum
        self.assertEqual(by["Phone only"]["lead_quality"], "COLD")
        self.assertNotIn("Low", by)
        self.assertNotIn("Nothing", by)
        reasons_by = {r["business_name"]: r["excluded_reason"] for r in review}
        self.assertEqual(reasons_by, {"Chain C": "duplicate_email", "Low": "score_below_minimum", "Nothing": "no_email_or_phone"})
        emails = [r["email"] for r in ready if r["email"]]
        self.assertEqual(len(emails), len(set(emails)))  # one row per address, always


def read_csv_rows(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


class PipelineEndToEnd(unittest.IsolatedAsyncioTestCase):
    def places(self, site):
        def node(i, name, phone, website="", address="", **extra):
            tags = {"craft": "plumber", "phone": phone}
            if name:
                tags["name"] = name
            if website:
                tags["website"] = website
            if address:
                tags["addr:full"] = address
            tags.update(extra)
            return {"type": "node", "id": i, "lat": 0.5, "lon": 0.5, "tags": tags}
        return [
            node(1, "Acme Plumbing HQ", "+94 11 111 1111", site.url + "/?utm_source=osm", "1 Main St"),
            node(2, "Acme Plumbing Branch", "+94 11 222 2222", site.url + "/", "2 Side St"),
            node(3, "No Site Ltd", "+94 11 333 3333"),
            node(4, "", "+94 11 444 4444"),  # no name: dropped at search time
            node(5, "Dead Site Co", "+94 11 555 5555", "http://nonexistent-host-abc123.invalid"),
        ]

    def argv(self, d, mock, *extra):
        return ["find", "-q", "plumbers", "--bbox", "0,0,1,1", "--name", str(Path(d) / "run"), "--seen-file", str(Path(d) / "seen.json"),
                "--api-base", mock.url, "--delay", "0.02", *extra]

    async def test_search_enrich_import_and_repeat_runs(self):
        site = MockSite()
        await site.start(site_pages(site))
        mock = await MockOSM(self.places(site)).start()
        try:
            with tempfile.TemporaryDirectory() as d:
                name = str(Path(d) / "run")
                self.assertEqual(await lp.run_pipeline(lp.parse_args(self.argv(d, mock))), 0)
                for suffix in ("raw", "enriched", "app_import", "review"):
                    self.assertTrue(os.path.exists(f"{name}_{suffix}.csv"), suffix)
                self.assertFalse(os.path.exists(f"{name}_batch_enriched.csv"))
                imp = read_csv_rows(f"{name}_app_import.csv")
                by = {r["business_name"]: r for r in imp}
                self.assertNotIn("", by)  # the unnamed place was dropped at search time
                self.assertEqual(by["Acme Plumbing HQ"]["email"], "sales@gmail.com")
                self.assertEqual(by["Acme Plumbing HQ"]["lead_quality"], "HOT")
                self.assertEqual(by["Acme Plumbing HQ"]["first_name"], "Jane")
                self.assertTrue(by["Acme Plumbing HQ"]["maps_url"].startswith("https://www.openstreetmap.org/node/"))
                self.assertEqual(by["Acme Plumbing Branch"]["email"], "")  # same inbox is used once
                self.assertTrue(by["Acme Plumbing Branch"]["whatsapp_number"].startswith("+94"))
                self.assertIn("No Site Ltd", by)  # phone-only lead kept
                self.assertEqual(by["Dead Site Co"]["enrichment_status"], "unreachable")
                emails = [r["email"] for r in imp if r["email"]]
                self.assertEqual(len(emails), len(set(emails)))
                self.assertEqual(site.hits["/"], 1)  # the shared website was crawled once
                self.assertEqual(read_csv_rows(f"{name}_review.csv"), [])
                self.assertEqual(len(json.load(open(Path(d) / "seen.json"))), 4)

                # same search again: nothing new, and the earlier results must be left exactly as they were
                before = {k: read_bytes(f"{name}_{k}.csv") for k in ("enriched", "app_import", "raw")}
                self.assertEqual(await lp.run_pipeline(lp.parse_args(self.argv(d, mock))), 0)
                self.assertEqual(before, {k: read_bytes(f"{name}_{k}.csv") for k in ("enriched", "app_import", "raw")})

                # a new business appears: the import file holds only it, the enriched file keeps everything
                mock.places.append({"type": "node", "id": 6, "lat": 0.5, "lon": 0.5,
                                    "tags": {"name": "New Biz F", "phone": "+94 11 666 6666", "website": site.url + "/about-us"}})
                self.assertEqual(await lp.run_pipeline(lp.parse_args(self.argv(d, mock))), 0)
                self.assertEqual([r["business_name"] for r in read_csv_rows(f"{name}_app_import.csv")], ["New Biz F"])
                self.assertEqual(len(read_csv_rows(f"{name}_enriched.csv")), 5)

                # re-filter the whole collection with a minimum nobody reaches: emails drop out, phone-only rows stay
                self.assertEqual(await lp.run_pipeline(lp.parse_args(["find", "--name", name, "--min-score", "101"])), 0)
                again = read_csv_rows(f"{name}_app_import.csv")
                self.assertEqual([r["email"] for r in again if r["email"]], [])
                self.assertGreaterEqual(len(again), 4)
        finally:
            await mock.stop()
            await site.stop()

    async def test_interrupted_batch_is_finished_without_searching_again(self):
        site = MockSite()
        await site.start(site_pages(site))
        mock = await MockOSM([]).start()
        try:
            with tempfile.TemporaryDirectory() as d:
                name = str(Path(d) / "run")
                raw = [{"place_id": "X1", "business_name": "Done Before", "website": site.url + "/", "whatsapp_number": "+94 11 000 0001"},
                       {"place_id": "X2", "business_name": "Not Yet", "website": "", "whatsapp_number": "+94 11 000 0002"}]
                gs_cols = gs.OUTPUT_COLUMNS
                with open(f"{name}_raw.csv", "w", newline="", encoding="utf-8") as f:
                    w = csv.DictWriter(f, fieldnames=gs_cols, restval="")
                    w.writeheader()
                    w.writerows(raw)
                ck = le.Checkpoint(le.checkpoint_path(f"{name}_batch_enriched.csv"))
                ck.open(fresh=True)
                done = {**raw[0], "email_primary": "kept@gmail.com", "email": "kept@gmail.com", "enrichment_status": "ok", "lead_quality_score": "60"}
                ck.write(0, le.row_key(raw[0]), done)
                ck.close()
                code = await lp.run_pipeline(lp.parse_args(self.argv(d, mock)))
                self.assertEqual(code, 0)
                self.assertEqual(mock.calls, [])  # the map was not asked again
                self.assertEqual(site.hits["/"], 0)  # the finished row was not crawled again
                names = {r["business_name"]: r for r in read_csv_rows(f"{name}_app_import.csv")}
                self.assertEqual(names["Done Before"]["email"], "kept@gmail.com")
                self.assertIn("Not Yet", names)
                self.assertEqual(sorted(json.load(open(Path(d) / "seen.json"))), ["X1", "X2"])
        finally:
            await mock.stop()
            await site.stop()


NOW = datetime(2026, 10, 11, 9, 0, tzinfo=timezone.utc)
INGEST_KEY = "uid1." + "a" * 48
w.PUSH_RETRY_DELAY = 0.01


class MockInbox:
    def __init__(self):
        self.posts, self.headers, self.status, self.hooks = [], [], 200, []
        self.runner, self.port = None, 0

    async def ingest(self, request):
        if request.headers.get("Authorization") != f"Bearer {INGEST_KEY}":
            return web.json_response({"success": False, "error": "Invalid or revoked ingest key."}, status=401)
        if self.status != 200:
            return web.json_response({"success": False, "error": "boom"}, status=self.status)
        body = await request.json()
        self.posts.append(body)
        return web.json_response({"success": True, "received": len(body["leads"]), "added": len(body["leads"]), "skipped": {}})

    async def hook(self, request):
        self.hooks.append(await request.json())
        return web.json_response({})

    async def start(self):
        app = web.Application()
        app.router.add_post("/api/lead-inbox/ingest", self.ingest)
        app.router.add_post("/hook", self.hook)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        return self

    async def stop(self):
        await self.runner.cleanup()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}"


def make_cfg(**over):
    raw = {"campaigns": [{"name": "c1", "queries": ["plumbers"], "locations": ["Testville"], "min_score": 40}],
           "limits": {"requests_per_run": 40, "requests_per_day": 200, "requests_per_month": 2000, "combos_per_run": 2, "max_depth": 2},
           "enrichment": {"max_pages": 6, "concurrency": 8, "delay": 0.02}}
    raw.update(over)
    return ap.validate_config(raw)


def multi_cfg(per_run=3):
    return ap.validate_config({
        "campaigns": [{"name": "A", "queries": ["q1", "q2"], "locations": ["L1", "L2"]}, {"name": "B", "queries": ["q3"], "locations": ["L1"]}],
        "limits": {"combos_per_run": per_run}})


class PlanTests(unittest.TestCase):
    def test_untried_first_round_robin_then_best_yield(self):
        cfg = multi_cfg(3)
        self.assertEqual([c.key for c in ap.plan_run(cfg, ap.empty_state(), NOW).combos], ["A|q1|L1", "B|q3|L1", "A|q1|L2"])
        st = ap.empty_state()
        st["combos"]["A|q1|L1"] = {"runs": 1, "new_total": 10, "hot_total": 0, "requests": 10, "last_run": "2026-10-01T00:00:00+00:00"}
        st["combos"]["B|q3|L1"] = {"runs": 1, "new_total": 5, "hot_total": 5, "requests": 5, "last_run": "2026-10-02T00:00:00+00:00"}
        order = [c.key for c in ap.plan_run(multi_cfg(10), st, NOW).combos]
        self.assertEqual(order, ["A|q1|L2", "A|q2|L1", "A|q2|L2", "B|q3|L1", "A|q1|L1"])  # untried first, then B (yield 4) before A (yield 1)

    def test_resting_combinations_are_skipped_until_the_rest_ends(self):
        cfg = multi_cfg(10)
        st = ap.empty_state()
        st["combos"]["A|q1|L1"] = {"runs": 2, "exhausted_until": (NOW + timedelta(days=5)).isoformat()}
        self.assertNotIn("A|q1|L1", [c.key for c in ap.plan_run(cfg, st, NOW).combos])
        st["combos"]["A|q1|L1"]["exhausted_until"] = (NOW - timedelta(days=1)).isoformat()
        self.assertIn("A|q1|L1", [c.key for c in ap.plan_run(cfg, st, NOW).combos])
        for key in [c.key for c in ap.all_combos(cfg)]:
            st["combos"][key] = {"runs": 2, "exhausted_until": (NOW + timedelta(days=5)).isoformat()}
        plan = ap.plan_run(cfg, st, NOW)
        self.assertEqual(plan.combos, [])
        self.assertIn("resting", plan.reason)

    def test_budgets(self):
        cfg = ap.validate_config({"campaigns": [{"name": "A", "queries": ["q"], "locations": ["L"]}],
                                  "limits": {"requests_per_run": 40, "requests_per_day": 60, "requests_per_month": 100}})
        st = ap.empty_state()
        self.assertEqual(ap.plan_run(cfg, st, NOW).budget, 40)
        ap.record_usage(st, 45, NOW)
        self.assertEqual(ap.plan_run(cfg, st, NOW).budget, 15)  # the day allows 15 more
        ap.record_usage(st, 15, NOW)
        p = ap.plan_run(cfg, st, NOW)
        self.assertEqual((p.combos, "daily" in p.reason), ([], True))
        self.assertEqual(ap.plan_run(cfg, st, NOW + timedelta(days=1)).budget, 40)  # next day, but the month has 40 left
        ap.record_usage(st, 38, NOW + timedelta(days=1))
        p = ap.plan_run(cfg, st, NOW + timedelta(days=2))
        self.assertEqual(p.combos, [])
        self.assertIn("monthly", p.reason)

    def test_config_validation(self):
        for bad, text in (({}, "campaigns"), ({"campaigns": [{"name": "A", "queries": []}]}, "query"),
                          ({"campaigns": [{"queries": ["q"]}]}, "name"),
                          ({"campaigns": [{"name": "A", "queries": ["q"]}, {"name": "A", "queries": ["q"]}]}, "twice"),
                          ({"campaigns": [{"name": "A", "queries": ["q"]}], "limits": {"requests_per_run": "many"}}, "requests_per_run"),
                          ({"campaigns": [{"name": "A", "queries": ["q"]}], "notify": {"when": "sometimes"}}, "notify.when")):
            with self.assertRaises(ap.ConfigError, msg=str(bad)) as ctx:
                ap.validate_config(bad)
            self.assertIn(text, str(ctx.exception))
        ok = ap.validate_config({"campaigns": [{"name": "A", "queries": ["q"]}]})
        self.assertEqual(ok["limits"]["requests_per_day"], 60)
        self.assertEqual(ok["campaigns"][0]["min_score"], 40)
        self.assertEqual(ap.all_combos(ok)[0].location, "")  # no locations: search with no area


class RunTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.site = MockSite()
        await self.site.start(site_pages(self.site))
        self.places = await MockOSM(grid_places(60, site_url=self.site.url)).start()
        self.inbox = await MockInbox().start()
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.env = {"AUTOLEADS_URL": self.inbox.url, "AUTOLEADS_INGEST_KEY": INGEST_KEY, "AUTOPILOT_WEBHOOK_URL": self.inbox.url + "/hook"}

    async def asyncTearDown(self):
        for s in (self.site, self.places, self.inbox):
            await s.stop()
        self.tmp.cleanup()

    async def run_once(self, cfg=None, now=NOW, **kw):
        return await ap.run_once(cfg or make_cfg(), self.base, env=kw.pop("env", self.env), api_base=kw.pop("api_base", self.places.url), now=now, **kw)

    def state(self):
        return json.loads((self.base / "autopilot_data" / "state.json").read_text())

    async def test_first_run_delivers_and_learns_then_rests_and_stops_spending(self):
        s = await self.run_once()
        self.assertEqual(s.code, 0, s.message)
        self.assertEqual(s.new_businesses, 57)  # 60 minus 3 without a name
        self.assertGreater(s.ready, 0)
        self.assertTrue(Path(s.outbox_file).exists())
        self.assertEqual(sum(len(p["leads"]) for p in self.inbox.posts), s.ready)  # everything ready was delivered
        leads = [l for p in self.inbox.posts for l in p["leads"]]
        self.assertTrue(all(l["campaign"] == "c1" for l in leads))
        emails = [l["email"] for l in leads if l["email"]]
        self.assertEqual(len(emails), len(set(emails)))  # one row per address
        self.assertEqual(self.inbox.posts[0]["source"], "autopilot")
        self.assertEqual(s.pushed, s.ready)
        st = self.state()
        self.assertEqual(st["usage"]["days"]["2026-10-11"], s.requests)
        self.assertEqual(st["combos"]["c1|plumbers|Testville"]["new_total"], 57)
        self.assertEqual(st["runs"], 1)
        self.assertEqual(len(self.inbox.hooks), 1)
        self.assertIn("ready for review", self.inbox.hooks[0]["text"])
        self.assertTrue((self.base / "autopilot_data" / "report.md").exists())
        self.assertFalse((self.base / "autopilot_data" / ".lock").exists())

        # second and third run find nothing new: no push, no notification, then the search rests
        calls = len(self.places.calls)
        for n in (1, 2):
            s2 = await self.run_once(now=NOW + timedelta(minutes=n))
            self.assertEqual((s2.code, s2.ready, s2.pushed), (0, 0, 0))
        self.assertEqual(len(self.inbox.hooks), 1)
        st = self.state()["combos"]["c1|plumbers|Testville"]
        self.assertEqual(st["empty_streak"], 2)
        self.assertIsNotNone(st["exhausted_until"])
        # fourth run: everything is resting, so not a single map request is made
        calls = len(self.places.calls)
        s4 = await self.run_once(now=NOW + timedelta(minutes=3))
        self.assertEqual(len(self.places.calls), calls)
        self.assertIn("resting", s4.message)

    async def test_inbox_outage_keeps_the_batch_and_retries_next_run(self):
        self.inbox.status = 500
        s = await self.run_once()
        self.assertEqual(s.code, 0)
        self.assertEqual(s.pushed, 0)
        self.assertIn("500", s.push_error)
        pending = self.state()["pending_pushes"]
        self.assertEqual(len(pending), 1)
        self.assertTrue((self.base / "autopilot_data" / "outbox" / pending[0]).exists())
        self.assertIn("outbox", self.inbox.hooks[0]["text"] if self.inbox.hooks else "outbox")
        self.inbox.status = 200
        s2 = await self.run_once(now=NOW + timedelta(hours=1))
        self.assertEqual(s2.pushed, s.ready)  # the earlier batch arrived
        self.assertEqual(self.state()["pending_pushes"], [])
        self.assertEqual(len(self.inbox.posts), 1)

    async def test_wrong_ingest_key_is_reported_not_retried_forever(self):
        env = {**self.env, "AUTOLEADS_INGEST_KEY": "uid1." + "b" * 48}
        s = await self.run_once(env=env)
        self.assertIn("401", s.push_error)
        self.assertEqual(len(self.state()["pending_pushes"]), 1)

    async def test_no_push_configured_still_writes_the_csv(self):
        env = {k: v for k, v in self.env.items() if not k.startswith("AUTOLEADS")}
        s = await self.run_once(env=env)
        self.assertEqual((s.code, s.pushed), (0, 0))
        self.assertGreater(s.ready, 0)
        self.assertTrue(Path(s.outbox_file).exists())
        self.assertEqual(self.inbox.posts, [])

    async def test_overlapping_runs_are_refused(self):
        out = self.base / "autopilot_data"
        out.mkdir(parents=True)
        (out / ".lock").write_text("1")
        s = await self.run_once()
        self.assertEqual(s.code, 3)
        self.assertEqual(self.places.calls, [])
        self.assertTrue((out / ".lock").exists())  # not ours to remove

    async def test_map_failure_is_reported_and_budget_is_counted(self):
        down = await MockOSM([], status=503).start()
        try:
            s = await self.run_once(api_base=down.url)
        finally:
            await down.stop()
        self.assertEqual(s.code, 1)
        self.assertIn("Map search failed", s.message)
        self.assertGreater(self.state()["usage"]["days"]["2026-10-11"], 0)
        self.assertEqual(len(self.inbox.hooks), 1)
        self.assertIn("problem", self.inbox.hooks[0]["text"].lower())
        self.assertFalse((self.base / "autopilot_data" / ".lock").exists())

    async def test_no_key_of_any_kind_is_needed_for_the_map(self):
        s = await self.run_once(env={k: v for k, v in self.env.items() if not k.startswith("GOOGLE")})
        self.assertEqual(s.code, 0, s.message)
        self.assertGreater(s.new_businesses, 0)

    def test_an_old_settings_file_with_a_google_key_still_loads(self):
        cfg = ap.validate_config({"campaigns": [{"name": "c1", "queries": ["plumbers"], "locations": ["Testville"], "min_reviews": 20}],
                                  "secrets": {"google_maps_api_key": "old", "autoleads_url": "https://x.example/"}})
        self.assertNotIn("google_maps_api_key", cfg["secrets"])
        self.assertEqual(cfg["secrets"]["autoleads_url"], "https://x.example")
        self.assertEqual(cfg["campaigns"][0]["min_reviews"], 20)  # accepted, ignored by the search

    async def test_interrupted_batch_is_finished_without_searching(self):
        out = self.base / "autopilot_data"
        work = out / "work"
        work.mkdir(parents=True)
        raw = [{"place_id": "X1", "business_name": "Done Before", "website": self.site.url + "/", "whatsapp_number": "+94 11 000 0001", "campaign": "c1"},
               {"place_id": "X2", "business_name": "Not Yet", "website": "", "whatsapp_number": "+94 11 000 0002", "campaign": "c1"}]
        with open(work / "batch_raw.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=gs.OUTPUT_COLUMNS + ["campaign"], restval="")
            w.writeheader()
            w.writerows(raw)
        ck = le.Checkpoint(le.checkpoint_path(str(work / "batch_enriched.csv")))
        ck.open(fresh=True)
        ck.write(0, le.row_key(raw[0]), {**raw[0], "email_primary": "kept@gmail.com", "email": "kept@gmail.com", "enrichment_status": "ok", "lead_quality_score": "60"})
        ck.close()
        s = await self.run_once()
        self.assertEqual(s.code, 0, s.message)
        self.assertEqual(self.places.calls, [])
        self.assertEqual(self.site.hits["/"], 0)
        names = {l["business_name"]: l for p in self.inbox.posts for l in p["leads"]}
        self.assertEqual(names["Done Before"]["email"], "kept@gmail.com")
        self.assertIn("Not Yet", names)
        self.assertTrue((out / "enriched.csv").exists())

    async def test_per_campaign_score_gates(self):
        cfg = make_cfg(campaigns=[{"name": "c1", "queries": ["plumbers"], "locations": ["Testville"], "min_score": 101, "min_score_phone_only": 101}])
        s = await self.run_once(cfg)
        self.assertEqual(s.ready, 0)  # nothing reaches 101, emails and phone-only alike
        self.assertEqual(self.inbox.posts, [])
        self.assertGreater(s.new_businesses, 0)
        review = list((self.base / "autopilot_data" / "outbox").glob("*_review.csv"))
        self.assertEqual(len(review), 1)

    async def test_keys_from_the_settings_file_work_without_any_environment(self):
        cfg = make_cfg(secrets={"autoleads_url": self.inbox.url + "/", "autoleads_ingest_key": INGEST_KEY, "webhook_url": ""})
        s = await ap.run_once(cfg, self.base, env={}, api_base=self.places.url, now=NOW)
        self.assertEqual(s.code, 0, s.message)
        self.assertEqual(s.pushed, s.ready)
        self.assertGreater(s.ready, 0)


class FakeCrontab:
    """Stands in for subprocess.run so no real crontab or Task Scheduler is touched."""
    def __init__(self, existing=""):
        self.text, self.calls = existing, []

    def __call__(self, cmd, input=None, capture_output=False, text=False):
        self.calls.append(cmd)
        if cmd[:2] == ["crontab", "-l"]:
            return subprocess.CompletedProcess(cmd, 0 if self.text else 1, self.text, "")
        if cmd[:2] == ["crontab", "-"]:
            self.text = input
        return subprocess.CompletedProcess(cmd, 0, "", "")


class SettingsAndCliTests(unittest.TestCase):
    def setup_args(self, path, *extra):
        return w.parse_args(["setup", "--config", path, "--yes", "--skip-check", *extra])

    def test_setup_writes_private_settings_and_refuses_to_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            path = str(Path(d) / "autoleads.json")
            code = w.main(["setup", "--config", path, "--yes", "--skip-check", "--google-key", "OLD-KEY", "--app-url", "https://x.vercel.app/",
                           "--ingest-key", "uid." + "a" * 48, "--query", "plumbers, electricians", "--location", "Colombo, Sri Lanka; Kandy, Sri Lanka", "--region", "lk"])
            self.assertEqual(code, 0)
            raw = json.loads(Path(path).read_text())
            self.assertEqual(raw["campaigns"][0]["queries"], ["plumbers", "electricians"])
            self.assertEqual(raw["campaigns"][0]["region"], "LK")
            self.assertEqual(raw["campaigns"][0]["locations"], ["Colombo, Sri Lanka", "Kandy, Sri Lanka"])  # commas inside a place name survive
            self.assertEqual(raw["secrets"]["autoleads_url"], "https://x.vercel.app")  # trailing slash removed
            if os.name == "posix":
                self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            cfg = w.load_config(path)
            self.assertNotIn("google_maps_api_key", raw["secrets"])  # an old --google-key is accepted and ignored
            self.assertEqual(w.secret(cfg, {}, "autoleads_url"), "https://x.vercel.app")
            self.assertEqual(w.secret(cfg, {"AUTOLEADS_URL": "https://from-env.example"}, "autoleads_url"), "https://from-env.example")  # environment wins
            before = Path(path).read_text()
            self.assertEqual(w.main(["setup", "--config", path, "--yes", "--skip-check", "--query", "dentists"]), 0)
            self.assertEqual(Path(path).read_text(), before)  # not overwritten
            self.assertEqual(w.main(["setup", "--config", path, "--yes", "--skip-check", "--query", "dentists", "--force"]), 0)
            self.assertEqual(json.loads(Path(path).read_text())["campaigns"][0]["queries"], ["dentists"])

    def test_setup_rejects_missing_query_and_bad_address(self):
        with tempfile.TemporaryDirectory() as d:
            path = str(Path(d) / "a.json")
            self.assertEqual(w.run_setup(self.setup_args(path), env={}), 2)
            self.assertEqual(w.run_setup(self.setup_args(path, "--query", "x", "--app-url", "my-app.com"), env={}), 2)
            self.assertFalse(Path(path).exists())

    def test_interactive_setup_asks_questions_and_can_schedule(self):
        answers = {"AutoLeads address": "https://a.example", "Ingest key": "uid." + "b" * 48,
                   "Slack/Discord": "", "What kind": "plumbers", "Where": "Kandy, Sri Lanka"}
        asked = []

        def ask(prompt, default="", assume_yes=False):
            asked.append(prompt)
            return next((v for k, v in answers.items() if k in prompt), default)

        with tempfile.TemporaryDirectory() as d:
            path = str(Path(d) / "a.json")
            runner = FakeCrontab()
            args = w.parse_args(["setup", "--config", path, "--skip-check"])
            code = w.run_setup(args, env={}, ask=ask, confirm=lambda *a, **k: True, runner=runner)
            self.assertEqual(code, 0)
            self.assertEqual(len(asked), 5)
            self.assertEqual(json.loads(Path(path).read_text())["campaigns"][0]["locations"], ["Kandy, Sri Lanka"])
            self.assertTrue(runner.calls)  # the daily schedule was offered and accepted

    def test_schedule_commands_install_replace_and_remove(self):
        cmds = w.schedule_commands("/data/autoleads.json", "07:30", python="/usr/bin/python3", script="/opt/autoleads_worker.py")
        self.assertEqual(cmds["windows_create"][cmds["windows_create"].index("/ST") + 1], "07:30")
        self.assertIn('"/opt/autoleads_worker.py" run --config "/data/autoleads.json"', cmds["windows_create"][-2])
        self.assertTrue(cmds["cron_line"].startswith("30 7 * * * cd /opt"))
        for bad in ("25:00", "9", "ab:cd"):
            with self.assertRaises(w.ConfigError):
                w.schedule_commands("x", bad)
        cron = FakeCrontab("0 1 * * * echo keep-me\n5 5 * * * old  # AutoLeadsWorker\n")
        ok, _ = w.install_schedule("09:00", "/data/autoleads.json", runner=cron, platform="linux")
        self.assertTrue(ok)
        self.assertIn("echo keep-me", cron.text)  # other jobs are untouched
        self.assertEqual(cron.text.count("AutoLeadsWorker"), 1)  # the old entry was replaced, not duplicated
        ok, msg = w.remove_schedule(runner=cron, platform="linux")
        self.assertTrue(ok)
        self.assertNotIn("AutoLeadsWorker", cron.text)
        self.assertIn("echo keep-me", cron.text)
        win = FakeCrontab()
        ok, _ = w.install_schedule("09:00", "C:/x/autoleads.json", runner=win, platform="win32")
        self.assertEqual(win.calls[0][:2], ["schtasks", "/Create"])
        ok, _ = w.remove_schedule(runner=win, platform="win32")
        self.assertEqual(win.calls[1][:2], ["schtasks", "/Delete"])

    def test_commands_plan_status_schedule_and_enrich(self):
        with tempfile.TemporaryDirectory() as d:
            path = str(Path(d) / "autoleads.json")
            self.assertEqual(w.main(["setup", "--config", path, "--yes", "--skip-check", "--query", "plumbers", "--location", "Colombo"]), 0)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(w.main(["plan", "--config", path]), 0)
                self.assertEqual(w.main(["status", "--config", path]), 0)
                self.assertEqual(w.main(["schedule", "--config", path]), 0)
            text = out.getvalue()
            self.assertIn("No API calls were made", text)
            self.assertIn("schtasks", text)
            self.assertIn("crontab", text)
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                self.assertEqual(w.main(["plan", "--config", str(Path(d) / "missing.json")]), 2)
            self.assertIn("setup", err.getvalue())
            src = Path(d) / "in.csv"
            src.write_text("business_name,website\nNo Site,\n", encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(w.main(["enrich", str(src), "-o", str(Path(d) / "out.csv"), "--delay", "0.02"]), 0)
            self.assertEqual(read_rows(Path(d) / "out.csv")[0]["enrichment_status"], "no_website")

    def test_dependencies_are_present(self):
        self.assertEqual(w.missing_dependencies(), [])


class ConnectionCheckTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.places = await MockOSM(grid_places(5)).start()
        self.inbox = await MockInbox().start()
        self.cfg = make_cfg()

    async def asyncTearDown(self):
        await self.places.stop()
        await self.inbox.stop()

    async def test_all_good(self):
        env = {"AUTOLEADS_URL": self.inbox.url, "AUTOLEADS_INGEST_KEY": INGEST_KEY, "AUTOPILOT_WEBHOOK_URL": self.inbox.url + "/hook"}
        res = {name: (ok, msg) for name, ok, msg in await w.run_check(self.cfg, env, self.places.url)}
        self.assertEqual([res[k][0] for k in ("Map data", "AutoLeads inbox", "Webhook")], [True, True, True])
        self.assertEqual(len(self.inbox.hooks), 1)
        self.assertEqual(self.inbox.posts[-1]["leads"], [])  # the check adds nothing to the inbox

    async def test_each_problem_is_named(self):
        blocked = await MockOSM([], geocode_status=403).start()
        try:
            env = {"AUTOLEADS_URL": self.inbox.url, "AUTOLEADS_INGEST_KEY": "uid1." + "c" * 48}
            res = {name: (ok, msg) for name, ok, msg in await w.run_check(self.cfg, env, blocked.url)}
        finally:
            await blocked.stop()
        self.assertFalse(res["Map data"][0])
        self.assertIn("refused", res["Map data"][1])
        self.assertFalse(res["AutoLeads inbox"][0])
        self.assertIn("rejected", res["AutoLeads inbox"][1])
        self.assertIsNone(res["Webhook"][0])
        none = {name: ok for name, ok, _ in await w.run_check(self.cfg, {}, self.places.url)}
        self.assertEqual((none["Map data"], none["AutoLeads inbox"]), (True, None))  # the map needs no key
        ok, msg = await w.ping_inbox("http://127.0.0.1:9", INGEST_KEY)
        self.assertFalse(ok)
        self.assertIn("could not reach", msg)


class ImportCommandTests(unittest.IsolatedAsyncioTestCase):
    """`import`: the owner scrapes a CSV by hand (raw, or already enriched) and gets it into the Lead Inbox."""

    async def asyncSetUp(self):
        self.site = MockSite()
        await self.site.start(site_pages(self.site))
        self.inbox = await MockInbox().start()
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.env = {"AUTOLEADS_URL": self.inbox.url, "AUTOLEADS_INGEST_KEY": INGEST_KEY}

    async def asyncTearDown(self):
        await self.site.stop()
        await self.inbox.stop()
        self.tmp.cleanup()

    def scrape(self, name="lanka.csv"):
        # what a Google Maps scraper extension produces: odd column names, blank rows, businesses with no contact details
        cols = ["place_id", "business_name", "rating", "reviews", "W4Efsd 2", "address", "website", "whatsapp_number", "Cw1rxd"]
        rows = [
            ["", "", "", "", "", "", "", "", ""],
            ["https://maps.example/a", "Alpha Distributors", "4.1", "(7)", "·", "145 Lake Rd", self.site.url + "/", "076 359 7171", "\ue52e"],
            ["https://maps.example/b", "Beta Traders", "4.5", "(12)", "·", "9 Main St", "", "077 111 2222", "\ue52e"],
            ["https://maps.example/c", "Gamma With Nothing", "3.0", "(1)", "·", "1 Dead End", "", "", "\ue52e"],
        ]
        path = self.dir / name
        with open(path, "w", newline="", encoding="utf-8") as f:
            wr = csv.writer(f)
            wr.writerow(cols)
            wr.writerows(rows)
        return path

    async def run_import(self, path, *extra, env=None):
        args = w.parse_args(["import", str(path), "--config", str(self.dir / "none.json"), "--yes", "--delay", "0.02", *extra])
        out = io.StringIO()
        with unittest.mock.patch.dict(os.environ, env if env is not None else self.env, clear=True), contextlib.redirect_stdout(out):
            code = await w.run_import(args)
        return code, out.getvalue()

    async def test_raw_scrape_is_cleaned_crawled_and_delivered(self):
        code, text = await self.run_import(self.scrape())
        self.assertEqual(code, 0, text)
        self.assertEqual(self.site.hits["/"], 1)  # the one website was read
        self.assertEqual(len(self.inbox.posts), 1)
        body = self.inbox.posts[0]
        self.assertEqual(body["source"], "import")
        names = sorted(l["business_name"] for l in body["leads"])
        self.assertEqual(names, ["Alpha Distributors", "Beta Traders"])  # blank row and the business with no contact are not sent
        self.assertTrue(all(l["whatsapp_number"] for l in body["leads"]))
        self.assertTrue((self.dir / "lanka_app_import.csv").exists())
        self.assertTrue((self.dir / "lanka_review.csv").exists())
        self.assertFalse((self.dir / "lanka_cleaned.csv").exists())  # temporary file is removed
        self.assertIn("Added 2 lead(s)", text)

    async def test_already_enriched_file_is_not_crawled_again(self):
        code, _ = await self.run_import(self.scrape())
        self.assertEqual(code, 0)
        enriched = next(self.dir.glob("lanka_enriched*.csv"))
        self.inbox.posts.clear()
        self.site.hits.clear()
        code, text = await self.run_import(enriched)
        self.assertEqual(code, 0, text)
        self.assertEqual(sum(self.site.hits.values()), 0)  # no second crawl
        self.assertIn("already enriched", text)
        self.assertEqual(len(self.inbox.posts[0]["leads"]), 2)
        self.assertTrue((self.dir / "lanka_app_import.csv").exists())  # same names as the raw run, not lanka_enriched_app_import

    async def test_without_a_connection_it_writes_the_file_and_says_where_to_upload_it(self):
        code, text = await self.run_import(self.scrape(), env={})
        self.assertEqual(code, 0, text)
        self.assertEqual(self.inbox.posts, [])
        self.assertIn("Upload this on the AutoLeads dashboard", text)
        self.assertTrue((self.dir / "lanka_app_import.csv").exists())

    async def test_no_push_flag_and_inbox_outage_never_lose_the_file(self):
        code, text = await self.run_import(self.scrape(), "--no-push")
        self.assertEqual((code, self.inbox.posts), (0, []))
        self.inbox.status = 500
        code, text = await self.run_import(self.scrape("again.csv"))
        self.assertEqual(code, 0)
        self.assertIn("Could not reach your Lead Inbox", text)
        self.assertTrue((self.dir / "again_app_import.csv").exists())

    async def test_bad_input_is_explained(self):
        self.assertEqual((await self.run_import(self.dir / "missing.csv"))[0], 2)
        empty = self.dir / "empty.csv"
        empty.write_text("name,phone\n,\n", encoding="utf-8")
        code, text = await self.run_import(empty)
        self.assertEqual(code, 1)
        self.assertIn("No usable businesses", text)

    def test_common_column_names_are_understood(self):
        rows = [{"Name": "Acme", "Phone": "077 123 4567", "x": "1"}, {"Name": "No Contact", "Phone": "", "x": "2"}, {"Name": "", "Phone": "1", "x": "3"}]
        # headers are matched case-insensitively
        kept, cols, dropped = w.tidy_import_rows(rows, ["Name", "Phone", "x"])
        self.assertEqual([r["business_name"] for r in kept], ["Acme"])
        self.assertEqual(kept[0]["whatsapp_number"], "077 123 4567")
        self.assertEqual(dropped, 2)
        self.assertIn("website", cols)
        self.assertFalse(w.looks_enriched(kept))
        self.assertTrue(w.looks_enriched([{"enrichment_status": "ok"}] * 4))


if __name__ == "__main__":
    unittest.main(verbosity=2)
