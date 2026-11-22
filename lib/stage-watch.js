// lib/stage-watch.js - finds deals that changed since the last watch and sit in a stage that needs the owner's next step (pass 368).
// Covers every change, including ones made outside the app (webhooks, imports), because it reads the stored deals, not the browser.
// It runs on a schedule (every 15 minutes, see DEPLOYMENT_GUIDE.md). Pure: no I/O.
import { normalizeStage } from './deal-utils.js';
import { stageAlertFor, STAGE_ALERT_STAGES } from './stage-alert.js';

/** Alerts for deals updated after sinceIso that are now in a stage that needs the next step. The caller drops repeats (one per deal, stage and day). */
export function newStageAlerts(deals = [], { sinceIso = '', now = Date.now() } = {}) {
  const since = Date.parse(sinceIso) || 0;
  const out = [];
  for (const d of deals) {
    if (!d || !d.userId || !d.email) continue;
    if (!(Date.parse(d.lastUpdate) > since)) continue;
    const stage = normalizeStage(d.stage);
    if (!STAGE_ALERT_STAGES.includes(stage)) continue;
    out.push({ userId: d.userId, alert: stageAlertFor({ email: d.email, stage, now }) });
  }
  return out;
}

/**
 * Where the next watch starts. A full page means more deals may follow, so the watch resumes from the last one it read.
 * Otherwise it starts from the time this run began, so nothing changed during the run is missed.
 */
export function nextWatermark(rows = [], runAtIso, pageSize) {
  if (rows.length >= pageSize && rows.length > 0) {
    const last = rows[rows.length - 1].lastUpdate;
    if (last) return last;
  }
  return runAtIso;
}
