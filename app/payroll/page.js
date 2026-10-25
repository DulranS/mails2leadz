"use client";
// Payroll: employees, monthly attendance and commission, payslips with EPF and ETF, and when the funds are due. Rates are settings
// you can change (they change by law); APIT is entered by hand. Stored under your own account.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc } from "../../lib/client-firestore.js";
import { useAuthUser } from "../components/AuthProvider";
import { getSettingsDoc } from "../../lib/client-data.js";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { makeMoney, normalizeCurrency } from "../../lib/currency.js";
import { sanitizeEmployee, sanitizeInput, sanitizeRates, computePayroll, payrollCsv, ymOf, validYm, DEFAULT_RATES, LIMITS } from "../../lib/payroll.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const blankEmp = () => ({ name: "", role: "", basic: "", allowance: "", epf: true, startDate: "", endDate: "" });

export default function PayrollPage() {
  const { user, ready, workspace } = useAuthUser();
  const [employees, setEmployees] = useState([]);
  const [inputs, setInputs] = useState([]);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [currency, setCurrency] = useState("LKR");
  const [monthDoc, setMonthDoc] = useState(null);
  const [ym, setYm] = useState(ymOf());
  const [form, setForm] = useState(blankEmp());
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState({}); // empId -> input fields being typed
  const [showRates, setShowRates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { if (!auth || (ready && !user)) setLoading(false); }, [ready, user]);
  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try {
      const [emps, ins, rt, biz] = await Promise.all([
        getDocs(query(collection(db, "users", user.uid, "employees"), limit(LIMITS.employees))),
        getDocs(query(collection(db, "users", user.uid, "payroll_inputs"), limit(1500))),
        getSettingsDoc(db, user.uid, "payroll").catch(() => null),
        getSettingsDoc(db, user.uid, "business").catch(() => null),
      ]);
      setEmployees(emps.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInputs(ins.docs.map((d) => d.data()));
      setRates(sanitizeRates(rt?.exists?.() ? rt.data() : {}));
      setCurrency(normalizeCurrency(biz?.exists?.() ? biz.data().currency : undefined));
      setError("");
    } catch (e) { console.error(e); setError("Could not load payroll right now."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!user?.uid || !db || !validYm(ym)) return;
    getDocs(query(collection(db, "users", user.uid, "payroll_months"), limit(36))).then((s) => setMonthDoc(s.docs.map((d) => ({ id: d.id, ...d.data() })).find((d) => d.id === ym) || null)).catch(() => setMonthDoc(null));
  }, [user, ym, notice]);

  const money = useMemo(() => makeMoney(currency, 2), [currency]);
  const merged = useMemo(() => inputs.map((i) => (i.ym === ym && draft[i.empId] ? { ...i, ...draft[i.empId] } : i)).concat(Object.entries(draft).filter(([id]) => !inputs.some((i) => i.ym === ym && i.empId === id)).map(([id, d]) => ({ ym, empId: id, ...d }))), [inputs, draft, ym]);
  const payroll = useMemo(() => computePayroll({ employees, inputs: merged, rates, ym }), [employees, merged, rates, ym]);

  const wrap = async (fn, ok) => { setBusy(true); setError(""); setNotice(""); try { await fn(); if (ok) setNotice(ok); await load(); return true; } catch (e) { console.error(e); setError(e?.message?.startsWith("!") ? e.message.slice(1) : "Could not save right now."); return false; } finally { setBusy(false); } };
  const saveEmployee = async (e) => {
    e.preventDefault();
    const r = sanitizeEmployee({ ...form, id: editing });
    if (r.error) { setError(r.error); return; }
    const id = r.employee.id || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (await wrap(() => setDoc(doc(db, "users", user.uid, "employees", id), { ...r.employee, id, userId: user.uid, updatedAt: new Date().toISOString() }), editing ? "Employee updated." : "Employee added.")) { setForm(blankEmp()); setEditing(""); }
  };
  const toggleActive = (e) => wrap(() => setDoc(doc(db, "users", user.uid, "employees", e.id), { ...e, active: e.active === false, userId: user.uid }), e.active === false ? "Back on payroll." : "Taken off payroll from now on.");
  const removeEmployee = (e) => { if (window.confirm(`Delete ${e.name} completely, including past inputs? Use Take off payroll to keep the history.`)) wrap(() => deleteDoc(doc(db, "users", user.uid, "employees", e.id)), "Deleted."); };
  const saveInput = (empId) => {
    const base = inputs.find((i) => i.ym === ym && i.empId === empId) || {};
    const r = sanitizeInput({ ...base, ...(draft[empId] || {}), ym, empId });
    if (r.error) { setError(r.error); return; }
    wrap(async () => { await setDoc(doc(db, "users", user.uid, "payroll_inputs", `${ym}_${empId}`), { ...r.input, userId: user.uid, updatedAt: new Date().toISOString() }); setDraft((d) => { const n = { ...d }; delete n[empId]; return n; }); }, "Saved.");
  };
  const saveRates = (e) => { e.preventDefault(); wrap(() => setDoc(doc(db, "users", user.uid, "settings", "payroll"), sanitizeRates(rates)), "Rates saved."); };
  const togglePaid = () => wrap(() => setDoc(doc(db, "users", user.uid, "payroll_months", ym), { ym, userId: user.uid, epfPaidAt: monthDoc?.epfPaidAt ? null : new Date().toISOString() }), monthDoc?.epfPaidAt ? "Marked as not paid." : "Marked as paid.");
  const download = () => {
    const blob = new Blob([payrollCsv(payroll)], { type: "text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `payroll-${ym}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const typed = (empId, k, v) => setDraft((d) => ({ ...d, [empId]: { ...(d[empId] || {}), [k]: v } }));
  const val = (empId, k) => { const d = draft[empId]; if (d && d[k] !== undefined) return d[k]; const i = inputs.find((x) => x.ym === ym && x.empId === empId); return i && i[k] ? String(i[k]) : ""; };

  if (ready && user && workspace && !workspace.isOwner) return <DashboardLayout title="Payroll"><section className={card}><p className="text-gray-700 dark:text-gray-200">Only the owner of this workspace can see payroll: it holds money and people records. Everything else in the menu works for you.</p></section></DashboardLayout>;
  if (ready && !user) return <DashboardLayout title="Payroll"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  const t = payroll.totals;

  return (
    <DashboardLayout title="Payroll" subtitle="Employees, attendance, commission, EPF and ETF">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-700 dark:text-green-300">{notice}</p>}

        <section className={card}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs text-gray-600 dark:text-gray-300">Month
              <input type="month" className={`${field} mt-1 !w-44`} value={ym} onChange={(e) => { if (validYm(e.target.value)) { setYm(e.target.value); setDraft({}); } }} />
            </label>
            {t && t.people > 0 && <button type="button" onClick={download} className={ghost}>Download CSV</button>}
            <button type="button" onClick={() => setShowRates(!showRates)} aria-expanded={showRates} className={`${ghost} ml-auto`}>{showRates ? "Hide rates" : "EPF and ETF rates"}</button>
          </div>
          {showRates && (
            <form onSubmit={saveRates} className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
              {[["epfEmployee", "EPF, employee %"], ["epfEmployer", "EPF, employer %"], ["etfEmployer", "ETF, employer %"], ["noPayDivisor", "No-pay: days in a month"]].map(([k, label]) => (
                <label key={k} className="block text-xs text-gray-600 dark:text-gray-300">{label}<input type="number" step="any" className={`${field} mt-1`} value={rates[k]} onChange={(e) => setRates({ ...rates, [k]: e.target.value })} /></label>
              ))}
              <div className="flex items-end"><button type="submit" disabled={busy} className={`${btn} w-full bg-blue-600 hover:bg-blue-500 text-white`}>Save rates</button></div>
              <p className="col-span-2 sm:col-span-5 text-xs text-gray-500 dark:text-gray-400">Defaults are the current Sri Lankan rates (EPF 8% from the employee and 12% from you, ETF 3% from you, all on total monthly earnings). These change by law, so check them. Income tax withheld (APIT) is not calculated: enter it under Deductions. Which payments count as earnings can depend on the payment, so ask your accountant to confirm for your case.</p>
            </form>
          )}
        </section>

        {t && t.people > 0 && (
          <section className={card}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[["Gross pay", t.gross, `${t.people} people`], ["Net pay to staff", t.net, "after EPF and deductions"], ["EPF to pay (20%)", t.epfRemit, `${money(t.epfEmployee)} from staff, ${money(t.epfEmployer)} yours`], ["ETF to pay (3%)", t.etf, "from you only"]].map(([l, v, h]) => (
                <div key={l} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"><p className="text-xs text-gray-500 dark:text-gray-400">{l}</p><p className="text-xl font-bold text-gray-900 dark:text-white">{money(v)}</p><p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{h}</p></div>
              ))}
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-100 mt-3">The real cost of this team for the month is <b>{money(t.employerCost)}</b>. EPF and ETF for {ym} are due by <b>{payroll.due}</b> (the last working day of the next month; public holidays are not known here).</p>
            <div className="mt-2 flex items-center gap-3"><button type="button" disabled={busy} onClick={togglePaid} className={ghost}>{monthDoc?.epfPaidAt ? "Marked as paid. Undo" : "Mark EPF and ETF as paid"}</button></div>
          </section>
        )}

        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p> : payroll.rows.map((r) => (
          <section key={r.empId} className={card}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-semibold text-gray-900 dark:text-white">{r.name}</h2>
              {r.role && <span className="text-sm text-gray-500 dark:text-gray-400">{r.role}</span>}
              <span className="ml-auto text-sm text-gray-800 dark:text-gray-100">Net pay <b>{money(r.net)}</b>, costs you <b>{money(r.employerCost)}</b></span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-3">
              {[["absentDays", "Unpaid absent days"], ["leaveDays", "Paid leave days"], ["commission", "Commission"], ["additions", "Other additions"], ["deductions", "Deductions (APIT, advances)"]].map(([k, label]) => (
                <label key={k} className="block text-xs text-gray-600 dark:text-gray-300">{label}
                  <input type="number" inputMode="decimal" min="0" step="any" className={`${field} mt-1`} value={val(r.empId, k)} onChange={(e) => typed(r.empId, k, e.target.value)} placeholder="0" />
                </label>
              ))}
              <div className="flex items-end"><button type="button" disabled={busy || !draft[r.empId]} onClick={() => saveInput(r.empId)} className={`${btn} w-full bg-blue-600 hover:bg-blue-500 text-white`}>Save</button></div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Basic {money(r.basic)}{r.noPay ? `, no pay ${money(r.noPay)}` : ""}, allowance {money(r.allowance)}{r.commission ? `, commission ${money(r.commission)}` : ""} = gross {money(r.gross)}. EPF from staff {money(r.epfEmployee)}. You also pay EPF {money(r.epfEmployer)} and ETF {money(r.etf)}.{r.flags.length ? ` ${r.flags[0]}` : ""}</p>
          </section>
        ))}
        {!loading && payroll.rows.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-300">{employees.length ? "Nobody is on payroll for this month." : "Add your first employee below."} Commission owed to a sales team member shows in Business Value (team report); type it here as Commission once you decide to pay it.</p>}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">{editing ? "Edit employee" : "Add an employee"}</h2>
          <form onSubmit={saveEmployee} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Name<input className={`${field} mt-1`} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Role<input className={`${field} mt-1`} value={form.role} maxLength={60} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="optional" /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Monthly basic<input type="number" inputMode="decimal" min="0" step="any" className={`${field} mt-1`} value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Fixed allowances<input type="number" inputMode="decimal" min="0" step="any" className={`${field} mt-1`} value={form.allowance} onChange={(e) => setForm({ ...form, allowance: e.target.value })} placeholder="optional" /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">First day<input type="date" className={`${field} mt-1`} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Last day (if leaving)<input type="date" className={`${field} mt-1`} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            <label className="flex items-center gap-2 min-h-[44px] text-sm text-gray-800 dark:text-gray-100 sm:col-span-2"><input type="checkbox" checked={form.epf} onChange={(e) => setForm({ ...form, epf: e.target.checked })} />Covered by EPF and ETF</label>
            <div className="sm:col-span-6 flex gap-2"><button type="submit" disabled={busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>{editing ? "Save changes" : "Add employee"}</button>{editing && <button type="button" onClick={() => { setEditing(""); setForm(blankEmp()); }} className={ghost}>Cancel</button>}</div>
          </form>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Contractors and freelancers are not employees for EPF and ETF: leave them off payroll and pay them as bills. If someone joins part-way through a month, enter the days they were not employed as unpaid absent days.</p>
        </section>

        {employees.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Everyone</h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {employees.map((e) => (
                <li key={e.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  <span className={`font-medium ${e.active === false ? "text-gray-400" : "text-gray-900 dark:text-white"}`}>{e.name}</span>
                  <span className="text-gray-600 dark:text-gray-300">{money(e.basic)} basic{e.allowance ? ` + ${money(e.allowance)}` : ""}{e.epf === false ? ", no EPF" : ""}{e.active === false ? ", off payroll" : ""}</span>
                  <span className="ml-auto flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setEditing(e.id); setForm({ name: e.name, role: e.role || "", basic: e.basic, allowance: e.allowance || "", epf: e.epf !== false, startDate: e.startDate || "", endDate: e.endDate || "" }); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }} className={ghost}>Edit</button>
                    <button type="button" disabled={busy} onClick={() => toggleActive(e)} className={ghost}>{e.active === false ? "Put back" : "Take off payroll"}</button>
                    <button type="button" disabled={busy} onClick={() => removeEmployee(e)} className={ghost}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
