"use client";
// Content: the inbound side. AI drafts a week of posts (with a visual brief for your designer), you edit and schedule them,
// post with one tap (copy + open the network), then log how each did. Nothing is posted for you: each network needs its own
// approved developer app, and a person pressing "post" keeps your accounts safe.
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, addDoc, setDoc, deleteDoc, doc, query, where, limit } from "firebase/firestore";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import {
  PLATFORMS, PILLARS, localDateStr, isDateStr, platformLabel, platformUrl, pillarLabel, hasPlaceholders,
  sanitizeResults, summarizeContent, performanceHint, groupPosts, MIN_PER_GROUP, MIN_POSTS_TO_LEARN,
  LINK_PLATFORMS, withEnquiryLink, composeUrl, composePrefills, postCampaign, withPostTag, enquiriesByPost,
} from "../../lib/content.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const postsRef = (uid) => collection(db, "users", uid, "content_posts");
const fullText = (p) => `${p.body}${p.hashtags?.length ? `\n\n${p.hashtags.join(" ")}` : ""}`;

function PostCard({ p, today, onSave, onDelete, onNotice, linkFor, credit }) {
  const link = linkFor ? linkFor(p.platform, p.id) : ""; // this owner's enquiry link, tagged with this platform AND this post
  const bioLink = linkFor ? linkFor(p.platform) : ""; // the bio link is shared by every post, so it carries the platform only
  const credited = credit ? credit[postCampaign(p.id)] || 0 : 0; // enquiries the app credited to this exact post, automatically
  const inlineLinks = LINK_PLATFORMS.includes(p.platform);
  const [addLink, setAddLink] = useState(true);
  const [body, setBody] = useState(p.body || "");
  const [date, setDate] = useState(p.scheduledFor || today);
  const [res, setRes] = useState({ reach: p.results?.reach ?? "", engagement: p.results?.engagement ?? "", leads: p.results?.leads ?? "" });
  const taRef = useRef(null);
  // The box grows to fit the whole post, so nothing is hidden before you approve it (matters most on a phone).
  useEffect(() => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; } }, [body]);
  const dirty = body !== (p.body || "") || date !== (p.scheduledFor || today);
  const open = p.status === "scheduled";
  const warn = open && hasPlaceholders(body);

  const postNow = () => {
    const r = link && addLink ? withEnquiryLink(body, link, p.platform) : { text: body, mode: "bio" };
    const text = fullText({ ...p, body: r.text });
    const url = composeUrl(p.platform, text); // X and LinkedIn open with the text already filled in
    const filled = composePrefills(p.platform) && url !== platformUrl(p.platform);
    window.open(url, "_blank", "noopener"); // opened first: browsers only allow it straight after the tap
    navigator.clipboard.writeText(text).then(
      () => onNotice(`${filled ? `Opened ${platformLabel(p.platform)} with your post filled in (also copied)` : `Copied${r.mode === "inline" ? " with your enquiry link" : ""}. Paste it into ${platformLabel(p.platform)}`}${filled && r.mode === "inline" ? " and your enquiry link" : ""}. Check it, post it, then come back and press "Mark as posted".${r.mode === "too_long" ? " (The link did not fit in 280 characters: put it in your profile instead.)" : ""}`),
      () => onNotice("Could not copy automatically: select the text above and copy it by hand."),
    );
  };

  return (
    <li className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{platformLabel(p.platform)}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{pillarLabel(p.pillar)}</span>
        {p.source === "ai" && <span className="text-xs text-gray-400">· AI draft</span>}
        <span className="flex-1" />
        {open ? (
          <label className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2">Post on
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
          </label>
        ) : <span className="text-xs text-gray-500 dark:text-gray-400">{p.status === "posted" ? `Posted ${p.postedOn || ""}` : "Skipped"}</span>}
        {credited > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{credited} enquir{credited === 1 ? "y" : "ies"} from this post</span>}
      </div>

      <textarea ref={taRef} value={body} onChange={(e) => setBody(e.target.value)} rows={3} readOnly={!open} aria-label={`${platformLabel(p.platform)} post text`} className={`${field} leading-relaxed`} />
      {p.hashtags?.length > 0 && <p className="text-xs text-blue-700 dark:text-blue-300 break-words">{p.hashtags.join(" ")}</p>}
      {p.visual && <p className="text-xs rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 p-2"><b>Design brief:</b> {p.visual}</p>}
      {open && link && inlineLinks && (
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 min-h-[44px]"><input type="checkbox" className="h-5 w-5" checked={addLink} onChange={(e) => setAddLink(e.target.checked)} />Add my enquiry link to this post (enquiries it brings are credited to {platformLabel(p.platform)})</label>
      )}
      {open && link && !inlineLinks && (
        <p className="text-xs rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 p-2">Links in {platformLabel(p.platform)} posts are not clickable. Put this link in your {platformLabel(p.platform)} bio once, and every enquiry from it is credited to {platformLabel(p.platform)}: <button type="button" className="underline" onClick={() => navigator.clipboard.writeText(bioLink).then(() => onNotice("Bio link copied."), () => onNotice("Could not copy automatically."))}>copy bio link</button></p>
      )}
      {warn && <p role="alert" className="text-xs rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-2">Fill in the [bracketed] part with something real before you post. The AI never invents customers or results.</p>}

      {open ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={postNow} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Copy &amp; open {platformLabel(p.platform)}</button>
          <button type="button" onClick={() => onSave(p, { status: "posted", postedOn: localDateStr(), body, scheduledFor: isDateStr(date) ? date : today })} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>Mark as posted</button>
          {dirty && <button type="button" onClick={() => onSave(p, { body, scheduledFor: isDateStr(date) ? date : today }, "Saved.")} className={ghost}>Save changes</button>}
          <span className="flex-1" />
          <button type="button" onClick={() => onSave(p, { status: "skipped" })} className={ghost}>Skip</button>
          <button type="button" onClick={() => { if (window.confirm("Delete this post?")) onDelete(p); }} className={ghost}>Delete</button>
        </div>
      ) : p.status === "posted" ? (
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">How did it do? Rough numbers are fine; they teach the AI what works for you.</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            {[["reach", "People reached / views"], ["engagement", "Likes + comments + shares"], ["leads", "Enquiries it brought"]].map(([k, label]) => (
              <label key={k} className="text-xs text-gray-600 dark:text-gray-300">{label}
                <input inputMode="numeric" value={res[k]} onChange={(e) => setRes({ ...res, [k]: e.target.value.replace(/[^\d]/g, "") })} className={`${field} mt-1`} />
              </label>
            ))}
            <button type="button" onClick={() => onSave(p, { results: sanitizeResults(res) }, "Results saved.")} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Save results</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2"><button type="button" onClick={() => onSave(p, { status: "scheduled" })} className={ghost}>Put back on the calendar</button><button type="button" onClick={() => { if (window.confirm("Delete this post?")) onDelete(p); }} className={ghost}>Delete</button></div>
      )}
    </li>
  );
}

function Group({ title, tone, posts, ...rest }) {
  if (!posts.length) return null;
  return (
    <section className={card}>
      <h2 className={`text-base font-semibold ${tone || "text-gray-900 dark:text-white"}`}>{title} ({posts.length})</h2>
      <ul className="space-y-3 mt-3">{posts.map((p) => <PostCard key={p.id} p={p} {...rest} />)}</ul>
    </section>
  );
}

function StatsTable({ title, rows }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-gray-500 dark:text-gray-400">No results logged yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-gray-700 dark:text-gray-200">
            <thead><tr className="text-gray-500 dark:text-gray-400"><th className="py-1 pr-3 font-medium">&nbsp;</th><th className="py-1 pr-3 font-medium">Posts</th><th className="py-1 pr-3 font-medium">Enquiries / post</th><th className="py-1 font-medium">Engagement / post</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-gray-100 dark:border-gray-700"><td className="py-1.5 pr-3">{r.label}</td><td className="pr-3">{r.posts}</td><td className="pr-3">{r.avgLeads.toFixed(1)}</td><td>{Math.round(r.avgEngagement)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ContentPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [today, setToday] = useState("");
  const [chosen, setChosen] = useState(["linkedin", "instagram"]);
  const [count, setCount] = useState(5);
  const [focus, setFocus] = useState("");
  const [planning, setPlanning] = useState(false);
  const [manual, setManual] = useState(false);
  const [mPlatform, setMPlatform] = useState("linkedin");
  const [mBody, setMBody] = useState("");
  const [mDate, setMDate] = useState("");

  useEffect(() => { const d = localDateStr(); setToday(d); setMDate(d); }, []);
  // The owner's enquiry link (Account → Enquiry form), tagged per platform, so a post can carry it and the enquiry is credited to that platform.
  const [enquiryKey, setEnquiryKey] = useState("");
  useEffect(() => { if (!user?.uid) return; fetch("/api/inbound-key").then((r) => r.json()).then((d) => setEnquiryKey(d?.key || "")).catch(() => {}); }, [user?.uid]);
  const linkFor = useCallback((platformId, postId) => (enquiryKey && typeof window !== "undefined" ? withPostTag(`${window.location.origin}/enquire?k=${enquiryKey}&src=${platformId}`, postId) : ""), [enquiryKey]);
  // Enquiries that arrived through a post's own link are counted per post by the app (no typing needed).
  const [credit, setCredit] = useState({});
  useEffect(() => {
    if (!user?.uid || !db) return;
    getDocs(query(collection(db, "inbound_enquiries"), where("userId", "==", user.uid), limit(1000)))
      .then((snap) => setCredit(enquiriesByPost(snap.docs.map((d) => d.data()))))
      .catch(() => {}); // not critical: the page works without the counts
  }, [user?.uid]);
  useEffect(() => {
    if (!auth) { setAuthReady(true); setLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
  }, []);

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    setLoading(true); setError("");
    try {
      const snap = await getDocs(postsRef(user.uid));
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); setError("Could not load your posts. Check your connection and try again."); }
    finally { setLoading(false); }
  }, [user?.uid]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => (today ? summarizeContent(posts, today) : null), [posts, today]);
  const groups = useMemo(() => (today ? groupPosts(posts, today) : { overdue: [], today: [], upcoming: [], done: [] }), [posts, today]);
  const hint = useMemo(() => (today ? performanceHint(posts, today) : null), [posts, today]);
  const autoCredited = useMemo(() => posts.reduce((n, p) => n + (credit[postCampaign(p.id)] || 0), 0), [posts, credit]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 6000); };
  const save = async (p, patch, msg) => {
    try {
      const next = { ...patch, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, "users", user.uid, "content_posts", p.id), next, { merge: true });
      setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...next } : x)));
      if (msg) flash(msg);
    } catch { setError("Could not save that change. Try again."); }
  };
  const remove = async (p) => {
    try { await deleteDoc(doc(db, "users", user.uid, "content_posts", p.id)); setPosts((prev) => prev.filter((x) => x.id !== p.id)); }
    catch { setError("Could not delete that post."); }
  };

  const plan = async () => {
    setPlanning(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/ai-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platforms: chosen, count, focus, today, hint }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setError(data.error || "Could not draft posts right now."); return; }
      const now = new Date().toISOString();
      const saved = [];
      for (const p of data.posts) {
        const ref = await addDoc(postsRef(user.uid), { ...p, userId: user.uid, createdAt: now, updatedAt: now });
        saved.push({ id: ref.id, ...p, userId: user.uid, createdAt: now, updatedAt: now });
      }
      setPosts((prev) => [...prev, ...saved]);
      flash(`${saved.length} post${saved.length === 1 ? "" : "s"} drafted${saved.length < data.requested ? ` (${data.requested - saved.length} did not pass the checks and were left out)` : ""}. Read, edit and schedule them below.`);
    } catch (e) { console.error(e); setError("Could not reach the server. Check your connection and try again."); }
    finally { setPlanning(false); }
  };

  const addManual = async () => {
    if (mBody.trim().length < 5) { setError("Write the post first."); return; }
    try {
      const now = new Date().toISOString();
      const p = { userId: user.uid, platform: mPlatform, pillar: "educate", body: mBody.trim(), hashtags: [], visual: "", scheduledFor: isDateStr(mDate) ? mDate : today, status: "scheduled", source: "manual", createdAt: now, updatedAt: now };
      const ref = await addDoc(postsRef(user.uid), p);
      setPosts((prev) => [...prev, { id: ref.id, ...p }]);
      setMBody(""); setManual(false); flash("Post added to your calendar.");
    } catch { setError("Could not add that post."); }
  };

  if (authReady && !user) {
    return <DashboardLayout title="Content"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 underline" href="/dashboard">sign in on the dashboard</Link> first.</p></section></DashboardLayout>;
  }

  const togglePlatform = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const tile = (label, value, sub) => <div className={card}><div className="text-xs text-gray-500 dark:text-gray-400">{label}</div><div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</div>{sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>}</div>;

  return (
    <DashboardLayout title="Content" subtitle="Posts that bring people to you. AI drafts, you approve and post.">
      <div className="space-y-4 sm:space-y-6">
        {error && <div role="alert" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 rounded-lg p-3 text-sm">{error}{/profile|what you sell/i.test(error) && <> <Link href="/account" className="underline">Open Account</Link></>}</div>}
        {notice && <div role="status" className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 rounded-lg p-3 text-sm">{notice}</div>}

        {stats && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {tile("Due today", stats.dueToday + stats.overdue, stats.overdue ? `${stats.overdue} overdue` : "")}
            {tile("Planned, next 7 days", stats.scheduledNext7)}
            {tile("Posted this week", stats.postedThisWeek)}
            {tile("Enquiries logged", stats.totalLeads, stats.withResults ? `from ${stats.withResults} post${stats.withResults === 1 ? "" : "s"} with results` : "log results after posting")}
          </div>
        )}

        <section className={card} aria-labelledby="plan-title">
          <h2 id="plan-title" className="text-base font-semibold text-gray-900 dark:text-white">Plan my week</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">The AI writes posts from what you sell (Account → Your business), with a design brief for each. Costs a fraction of a cent.</p>
          <fieldset className="mt-3">
            <legend className="text-xs text-gray-600 dark:text-gray-300 mb-1">Where do you post?</legend>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <label key={p.id} className={`min-h-[44px] px-3 rounded-lg text-sm border flex items-center gap-2 cursor-pointer ${chosen.includes(p.id) ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"}`}>
                  <input type="checkbox" className="sr-only" checked={chosen.includes(p.id)} onChange={() => togglePlatform(p.id)} />{p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
            <label className="text-xs text-gray-600 dark:text-gray-300">How many posts
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${field} mt-1`}>{[3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Focus this week (optional)
              <input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={160} placeholder="e.g. a new service, a seasonal offer, a common question" className={`${field} mt-1`} />
            </label>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:items-center">
            <button type="button" onClick={plan} disabled={planning || chosen.length === 0} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>{planning ? "Writing..." : "✨ Draft my week"}</button>
            <button type="button" onClick={() => setManual((v) => !v)} className={ghost}>{manual ? "Cancel" : "+ Write one myself"}</button>
            <span className="text-xs text-gray-500 dark:text-gray-400">{hint ? "Using what worked best for you so far." : `Once ${MIN_POSTS_TO_LEARN} posts have results, the AI leans toward what works for you.`}</span>
          </div>
          {manual && (
            <div className="mt-3 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select value={mPlatform} onChange={(e) => setMPlatform(e.target.value)} aria-label="Platform" className={field}>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
                <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} aria-label="Post date" className={field} />
              </div>
              <textarea value={mBody} onChange={(e) => setMBody(e.target.value)} rows={4} placeholder="Write your post..." aria-label="Post text" className={field} />
              <button type="button" onClick={addManual} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Add to calendar</button>
            </div>
          )}
        </section>

        {loading ? <section className={card}><p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p></section> : (
          <>
            {posts.length === 0 && <section className={card}><p className="text-sm text-gray-700 dark:text-gray-200">No posts yet. Press “Draft my week” to get your first ones.</p></section>}
            <Group title="Overdue" tone="text-red-700 dark:text-red-300" posts={groups.overdue} today={today} onSave={save} onDelete={remove} onNotice={flash} linkFor={linkFor} credit={credit} />
            <Group title="Today" posts={groups.today} today={today} onSave={save} onDelete={remove} onNotice={flash} linkFor={linkFor} credit={credit} />
            <Group title="Coming up" posts={groups.upcoming} today={today} onSave={save} onDelete={remove} onNotice={flash} linkFor={linkFor} credit={credit} />
            <Group title="Posted & skipped" posts={groups.done} today={today} onSave={save} onDelete={remove} onNotice={flash} linkFor={linkFor} credit={credit} />
          </>
        )}

        {stats && stats.postedTotal > 0 && (
          <section className={card}>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">What is working</h2>
            {autoCredited > 0 && <p className="text-sm text-green-800 dark:text-green-200 mt-2">{autoCredited} enquir{autoCredited === 1 ? "y was" : "ies were"} credited to your posts automatically (through each post&apos;s own link), without you logging anything.</p>}
            {stats.withResults === 0 ? <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Log results on your posted posts (reach, engagement, enquiries) and this fills in.</p> : (
              <div className="mt-3 space-y-4">
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  {stats.bestPlatform ? <>Best platform so far: <b>{stats.bestPlatform.label}</b> ({stats.bestPlatform.avgLeads.toFixed(1)} enquiries per post). </> : <>Too early to name a best platform (needs {MIN_PER_GROUP}+ posts with results on at least two). </>}
                  {stats.bestPillar ? <>Best theme: <b>{stats.bestPillar.label}</b>.</> : <>Too early to name a best theme.</>}
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><StatsTable title="By platform" rows={stats.byPlatform} /><StatsTable title="By theme" rows={stats.byPillar} /></div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Enquiries you turn into deals are tracked in <Link href="/business" className="underline">Business Value</Link> under “Where your deals come from” (tag them Inbound enquiry in the CRM).</p>
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
