"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import CRM from "../components/CRM";
import LostReasonModal from "../components/ui/LostReasonModal";
import { dealDocId, buildDealWrite, normalizeStage, daysQuiet } from "../../lib/deal-utils.js";
import { sanitizeTeam } from "../../lib/team.js";
import { useNotifications } from "../components/ui/NotificationProvider";
import { createFollowUpTask } from "../../lib/firebase-operations.js";
import { useAuthUser } from "../components/AuthProvider";
import { stale, put } from "../../lib/swr-cache.js";
import { getSentEmails, getContacts, getDeals, getPendingFollowUps, getSettingsDoc } from "../../lib/client-data.js";
import { pickBusinessName, NO_NAME_LABEL } from "../../lib/lead-name.js";

// Import Firebase functions
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc,
  addDoc,
  query,
  where,
  limit,
  getDoc,
  setDoc,
} from "../../lib/client-firestore.js";
import { getAuth, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase with error handling
let app;
let db;
let auth;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
  auth = getAuth(app);
  if (typeof window !== "undefined") {
    auth.setPersistence(browserLocalPersistence).catch((error) => {
      console.error("Firebase auth persistence error:", error);
    });
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
}

const EMPTY_CRM = {
  leads: [], contacts: {}, repliedLeads: {}, leadScores: {}, dealStages: {}, dealValues: {}, dealQual: {}, dealOwners: {}, dealLost: {}, team: [], defaultDealValue: 1000,
};

export default function CRMPage() {
  const { addNotification } = useNotifications();
  const { user, ready } = useAuthUser(); // one shared sign-in listener for the whole app
  const loadingAuth = !ready;
  // The last list shown (if any) paints at once on the way back to this page; the fresh one loads quietly behind it.
  const [data, setData] = useState(() => (user?.uid && stale(`${user.uid}|page|crm`)) || EMPTY_CRM);
  const [loading, setLoading] = useState(() => !(user?.uid && stale(`${user.uid}|page|crm`)));

  useEffect(() => {
    if (user?.uid) {
      loadCRMData();
    } else if (ready) {
      setLoading(false);
    }
  }, [user?.uid, ready]);

  const norm = (e) => String(e || "").trim().toLowerCase();
  const toIso = (v) => {
    if (!v) return null;
    const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  // Keep the saved copy equal to what is on screen (including edits made here), so coming back never flashes older values.
  useEffect(() => { if (user?.uid && !loading) put(`${user.uid}|page|crm`, data); }, [user?.uid, loading, data]);

  const loadCRMData = async () => {
    if (!user?.uid || !db) {
      setLoading(false);
      return;
    }

    try {
      // Shared, cached reads (the same copies Business, Customers and Billing use): coming back to this page costs no new downloads.
      const [sentSnap, contactsSnap, dealsSnap, taskSnap, settingsSnap, teamSnap] = await Promise.all([
        getSentEmails(db, user.uid),
        getContacts(db, user.uid).catch(() => ({ docs: [] })),
        getDeals(db, user.uid),
        getPendingFollowUps(db, user.uid).catch(() => ({ docs: [] })),
        getSettingsDoc(db, user.uid, "business").catch(() => null),
        getSettingsDoc(db, user.uid, "team").catch(() => null),
      ]);

      // ONE row per lead (several emails to the same person used to show as duplicate rows).
      const byEmail = new Map();
      sentSnap.docs.forEach((d) => {
        const x = d.data();
        const email = norm(x.to || x.recipientEmail);
        if (!email) return;
        const sentAt = toIso(x.sentAt) || toIso(x.createdAt);
        const prev = byEmail.get(email);
        if (!prev) {
          // A phone number in a name field is not a name: take the first real one, else the website / e-mail domain, else a plain label.
          const shown = pickBusinessName([x.recipientName, x.business_name, x.businessName], { website: x.recipientWebsite, email }) || NO_NAME_LABEL;
          byEmail.set(email, {
            id: d.id, email,
            business: shown,
            company: shown,
            phone: x.recipientPhone || null, website: x.recipientWebsite || null, industry: x.industry || null,
            sentAt, lastContact: sentAt, replied: x.replied === true, repliedAt: x.repliedAt || null,
            followUpAt: x.followUpAt || null, notes: Array.isArray(x.notes) ? x.notes : [], source: "email",
          });
        } else {
          if (sentAt && (!prev.sentAt || sentAt > prev.sentAt)) { prev.sentAt = sentAt; prev.lastContact = sentAt; }
          if (x.replied === true) { prev.replied = true; prev.repliedAt = prev.repliedAt || x.repliedAt || null; }
          if (Array.isArray(x.notes)) prev.notes = [...prev.notes, ...x.notes];
        }
      });

      const contacts = {};
      contactsSnap.docs.forEach((d) => {
        const c = d.data();
        if (c.email) contacts[norm(c.email)] = c;
      });

      const dealStages = {};
      const dealValues = {};
      const dealNotes = {};
      const dealQual = {};
      const dealOwners = {};
      const dealLost = {}; // lost deals: why, and how long since the last contact (decides whether a revive draft is offered)
      const nowMs = Date.now();
      dealsSnap.docs.forEach((d) => {
        const deal = d.data();
        const email = norm(deal.email);
        if (!email) return;
        dealStages[email] = normalizeStage(deal.stage);
        if (Number(deal.value) > 0 && deal.valueIsEstimate !== true) dealValues[email] = Number(deal.value);
        if (Array.isArray(deal.notes)) dealNotes[email] = deal.notes;
        if (deal.qualification) dealQual[email] = deal.qualification;
        if (deal.ownerId) dealOwners[email] = deal.ownerId;
        if (dealStages[email] === "closed_lost") dealLost[email] = { reason: deal.lostReason || "", quietDays: daysQuiet(deal, nowMs) };
        // The deal is the owner's own record (and what "Rename" writes), so a real name there wins over the one on the sent email.
        const dealName = pickBusinessName([deal.businessName], { email });
        if (dealName && byEmail.has(email)) { const l = byEmail.get(email); l.business = dealName; l.company = dealName; }
        // A deal with no outreach email (referral, inbound, WhatsApp...) is still a lead.
        if (!byEmail.has(email)) {
          byEmail.set(email, {
            id: d.id, email, business: dealName || email, company: dealName || email,
            phone: null, website: null, industry: null, sentAt: null, lastContact: toIso(deal.lastUpdate),
            replied: false, repliedAt: null, followUpAt: null, notes: [], source: "deal",
          });
        }
      });

      // Next follow-up = the earliest pending reminder (the same queue the dashboard works from).
      const nextTask = {};
      taskSnap.docs.forEach((d) => {
        const t = d.data();
        const email = norm(t.leadEmail);
        const when = toIso(t.scheduledFor);
        if (email && when && (!nextTask[email] || when < nextTask[email])) nextTask[email] = when;
      });

      let defaultDealValue = 1000;
      if (settingsSnap?.exists?.() && Number(settingsSnap.data().avgDealValue) > 0) defaultDealValue = Number(settingsSnap.data().avgDealValue);

      const leads = [...byEmail.values()].map((lead) => {
        const seen = new Set();
        const notes = [...lead.notes, ...(dealNotes[lead.email] || []), ...(contacts[lead.email]?.notes || [])]
          .filter((n) => n && n.text)
          .filter((n) => { const k = `${n.timestamp}|${n.text}`; if (seen.has(k)) return false; seen.add(k); return true; })
          .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
        return {
          ...lead,
          notes,
          nextFollowUp: nextTask[lead.email] || toIso(lead.followUpAt) || toIso(contacts[lead.email]?.nextFollowUp) || null,
          lastContact: lead.lastContact || toIso(contacts[lead.email]?.lastContact),
        };
      });

      const repliedLeads = {};
      leads.forEach((lead) => { if (lead.replied) repliedLeads[lead.email] = true; });

      // "Score" = how complete + how warm the lead is (not a prediction).
      const leadScores = {};
      leads.forEach((lead) => {
        let score = 50;
        if (lead.email) score += 15;
        if (lead.phone) score += 10;
        if (lead.website) score += 5;
        if (lead.industry) score += 5;
        if (lead.replied) score += 25;
        if (lead.repliedAt && (Date.now() - new Date(lead.repliedAt)) / 86400000 < 7) score += 10;
        leadScores[lead.email] = Math.min(score, 100);
      });

      // Leads without a deal record: replied -> contacted, otherwise new.
      leads.forEach((lead) => {
        if (!dealStages[lead.email]) dealStages[lead.email] = lead.replied ? "contacted" : "new";
      });

      const team = teamSnap?.exists?.() ? sanitizeTeam(teamSnap.data().members) : [];
      const next = { leads, contacts, repliedLeads, leadScores, dealStages, dealValues, dealQual, dealOwners, dealLost, team, defaultDealValue };
      put(`${user.uid}|page|crm`, next);
      setData(next);
    } catch (error) {
      console.error("Error loading CRM data:", error);
      addNotification("Error loading CRM data", "error");
    } finally {
      setLoading(false);
    }
  };

  // Every CRM write goes to the one deal document for that lead (same path as the dashboard + Business page).
  const writeDeal = async (email, changes = {}) => {
    const e = norm(email);
    const ref = doc(db, "deals", dealDocId(user.uid, e));
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : null;
    const lead = data.leads.find((l) => l.email === e);
    const write = buildDealWrite({
      uid: user.uid, email: e, existing,
      stage: changes.stage ?? existing?.stage ?? data.dealStages[e] ?? "new",
      businessName: changes.businessName ?? (!existing ? lead?.business : undefined),
      value: changes.value,
      lostReason: changes.lostReason,
      source: changes.source,
      qualification: changes.qualification,
      ownerId: changes.ownerId,
      touch: changes.touch,
    });
    if (changes.notes) write.notes = changes.notes;
    await setDoc(ref, write, { merge: true });
    return { write, existing };
  };

  const [lostPrompt, setLostPrompt] = useState(null);
  const handleUpdateLead = async (email, updates) => {
    if (!user?.uid || !db) return;
    // Marking Lost: ask why first (one tap), unless already Lost or the reason is already known.
    if (normalizeStage(updates.stage) === "closed_lost" && updates.stage !== undefined && !updates.lostReason && !updates.skipLostReason && normalizeStage(data.dealStages[norm(email)]) !== "closed_lost") {
      setLostPrompt({ email, updates });
      return;
    }
    try {
      const e = norm(email);
      if (updates.ownerId !== undefined) {
        const { write } = await writeDeal(e, { ownerId: updates.ownerId });
        setData((prev) => {
          const dealOwners = { ...prev.dealOwners };
          if (write.ownerId) dealOwners[e] = write.ownerId; else delete dealOwners[e];
          return { ...prev, dealOwners, dealStages: { ...prev.dealStages, [e]: write.stage } };
        });
        addNotification(write.ownerId ? "Owner saved" : "Owner cleared", "success");
        return;
      }
      if (updates.qualification || updates.touch) {
        const { write } = await writeDeal(e, { qualification: updates.qualification, touch: updates.touch });
        setData((prev) => ({
          ...prev,
          dealStages: { ...prev.dealStages, [e]: write.stage },
          dealQual: write.qualification ? { ...prev.dealQual, [e]: write.qualification } : prev.dealQual,
        }));
        if (updates.qualification) addNotification("Qualification saved", "success");
        return;
      }
      const { write } = await writeDeal(e, { stage: updates.stage, value: updates.value, lostReason: updates.lostReason });
      setData((prev) => ({
        ...prev,
        dealStages: { ...prev.dealStages, [e]: write.stage },
        dealValues: write.valueIsEstimate === false && write.value > 0 ? { ...prev.dealValues, [e]: write.value } : prev.dealValues,
      }));
      addNotification(updates.value !== undefined ? "Value saved" : "Stage updated", "success");
    } catch (error) {
      console.error("Error updating lead:", error);
      addNotification("Could not save that change", "error");
    }
  };

  const handleAddNote = async (email, noteText) => {
    const text = String(noteText || "").trim();
    if (!user?.uid || !db || !text) return;
    try {
      const e = norm(email);
      const note = { text, timestamp: new Date().toISOString(), type: "manual", addedBy: user.email || user.displayName || "User" };
      const snap = await getDoc(doc(db, "deals", dealDocId(user.uid, e)));
      const current = snap.exists() && Array.isArray(snap.data().notes) ? snap.data().notes : [];
      await writeDeal(e, { notes: [...current, note] });
      setData((prev) => ({
        ...prev,
        leads: prev.leads.map((lead) => (lead.email === e ? { ...lead, notes: [...(lead.notes || []), note] } : lead)),
        dealStages: { ...prev.dealStages, [e]: prev.dealStages[e] || "new" },
      }));
      addNotification("Note saved", "success");
    } catch (error) {
      console.error("Error adding note:", error);
      addNotification("Could not save the note", "error");
    }
  };

  // Creates a real reminder in the dashboard's follow-up queue (so it shows up in
  // "Do this next" and the Business Value page), 3 days out.
  const handleScheduleFollowUp = async (email) => {
    if (!user?.uid || !db) return;
    try {
      const e = norm(email);
      const lead = data.leads.find((l) => l.email === e);
      if (lead?.replied) {
        addNotification("They already replied, so there is nothing to chase. Move the deal forward instead.", "info");
        return;
      }
      const when = new Date(Date.now() + 3 * 86400000);
      const id = await createFollowUpTask(user.uid, {
        leadEmail: e,
        leadName: lead?.business || e,
        companyName: lead?.company || lead?.business || "",
        channel: "email",
        followUpStage: "Follow-up (from CRM)",
        scheduledFor: when.toISOString(),
      });
      if (!id) throw new Error("task not created");
      setData((prev) => ({
        ...prev,
        leads: prev.leads.map((l) => (l.email === e ? { ...l, nextFollowUp: when.toISOString() } : l)),
      }));
      addNotification(`Follow-up set for ${when.toLocaleDateString()}`, "success");
    } catch (error) {
      console.error("Error scheduling follow-up:", error);
      addNotification("Could not schedule the follow-up", "error");
    }
  };

  // Give a lead a proper name (for leads that arrived with only a phone number, or a wrong name). Saved on the deal, which wins everywhere.
  const handleRename = async (email, name) => {
    if (!user?.uid || !db) return false;
    const clean = pickBusinessName([String(name || "").slice(0, 120)], {});
    if (!clean) {
      addNotification("Type a business name (a phone number is not a name)", "error");
      return false;
    }
    try {
      const e = norm(email);
      await writeDeal(e, { businessName: clean });
      setData((prev) => ({
        ...prev,
        leads: prev.leads.map((l) => (l.email === e ? { ...l, business: clean, company: clean } : l)),
        dealStages: { ...prev.dealStages, [e]: prev.dealStages[e] || "new" },
      }));
      addNotification("Name saved", "success");
      return true;
    } catch (error) {
      console.error("Error renaming lead:", error);
      addNotification("Could not save the name", "error");
      return false;
    }
  };

  // Add a lead that did not come from cold email (referral, inbound, walk-in...).
  const handleAddLead = async ({ email, businessName, stage, value, source }) => {
    if (!user?.uid || !db) return false;
    const e = norm(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      addNotification("Enter a valid email address", "error");
      return false;
    }
    try {
      await writeDeal(e, { stage: stage || "qualified", value, source, businessName: String(businessName || "").trim() || undefined });
      await loadCRMData();
      addNotification("Lead added", "success");
      return true;
    } catch (error) {
      console.error("Error adding lead:", error);
      addNotification("Could not add the lead", "error");
      return false;
    }
  };

  if (loadingAuth) {
    return (
      <DashboardLayout title="CRM" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout title="CRM" subtitle="Authentication Required">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            Please sign in to access the CRM.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout title="CRM" subtitle="Loading CRM data...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="CRM & Deals"
      subtitle="Manage leads, deals, and customer interactions"
    >
      <CRM
        leads={data.leads}
        contacts={data.contacts}
        repliedLeads={data.repliedLeads}
        leadScores={data.leadScores}
        dealStages={data.dealStages}
        dealValues={data.dealValues}
        dealQual={data.dealQual}
        dealOwners={data.dealOwners}
        dealLost={data.dealLost}
        team={data.team}
        defaultDealValue={data.defaultDealValue}
        onUpdateLead={handleUpdateLead}
        onAddNote={handleAddNote}
        onScheduleFollowUp={handleScheduleFollowUp}
        onAddLead={handleAddLead}
        onRename={handleRename}
      />
      <LostReasonModal
        target={lostPrompt}
        onCancel={() => setLostPrompt(null)}
        onSkip={() => { const t = lostPrompt; setLostPrompt(null); if (t) handleUpdateLead(t.email, { ...t.updates, skipLostReason: true }); }}
        onPick={(reason) => { const t = lostPrompt; setLostPrompt(null); if (t) handleUpdateLead(t.email, { ...t.updates, lostReason: reason }); }}
      />
    </DashboardLayout>
  );
}
