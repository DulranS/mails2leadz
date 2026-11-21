// Browser side of thermal printing. Keeps this device's printer settings and sends print jobs to the print agent. If no printer
// is set, or the printer cannot be reached, the caller falls back to the normal print window, so a sale or a ticket is never lost.
// The settings live on this device only (browser storage), because the printer is on this device's network. They are read and
// written inside try/catch, since browser storage can be blocked.
import { openPrintWindow } from "@/lib/print";
import { isLoopbackAgentUrl, DEFAULT_AGENT_URL, DEFAULT_PRINTER_PORT, isPrivateIPv4, isValidPrinterPort, isValidToken } from "@/lib/printAgentRules";

export const PRINTER_STORAGE_KEY = "balancr.kitchenPrinter.v1";

export interface PrinterConfig {
  agentUrl: string;
  token: string;
  host: string;
  port: number;
}

export function validatePrinterConfig(c: PrinterConfig): string | null {
  if (!isLoopbackAgentUrl(c.agentUrl)) return "The print agent address should be http://127.0.0.1:9101 on the computer that prints.";
  if (!isValidToken(c.token)) return "The printer token should be the secret you set for the print agent (at least 16 characters).";
  if (!isPrivateIPv4(c.host)) return "The printer address should be a local network address, such as 192.168.1.50.";
  if (!isValidPrinterPort(c.port)) return "The printer port should be a number from 1 to 65535 (usually 9100).";
  return null;
}

export function loadPrinterConfig(): PrinterConfig | null {
  try {
    const raw = window.localStorage.getItem(PRINTER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<PrinterConfig>;
    const c: PrinterConfig = {
      agentUrl: typeof o.agentUrl === "string" ? o.agentUrl : DEFAULT_AGENT_URL,
      token: typeof o.token === "string" ? o.token : "",
      host: typeof o.host === "string" ? o.host : "",
      port: typeof o.port === "number" ? o.port : DEFAULT_PRINTER_PORT,
    };
    return validatePrinterConfig(c) ? null : c;
  } catch {
    return null;
  }
}

export function savePrinterConfig(c: PrinterConfig): boolean {
  try {
    window.localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

export function clearPrinterConfig(): void {
  try {
    window.localStorage.removeItem(PRINTER_STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

// Sends one job. Throws with the agent's or the printer's own message when it fails.
export async function sendToPrinter(bytes: Uint8Array, c: PrinterConfig): Promise<void> {
  const url = `${c.agentUrl.replace(/\/$/, "")}/print?host=${encodeURIComponent(c.host)}&port=${c.port}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-print-token": c.token },
      body: bytes as BodyInit,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("The print agent is not running on this computer.");
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "The printer did not accept the job.");
  }
}

// Prints one document: to the kitchen printer when one is set on this device, otherwise (or if the printer fails) to the normal
// print window. Returns where it went, and the reason it did not go to the printer, so the page can say so.
export async function printJob(job: { bytes: Uint8Array; html: string }): Promise<{ via: "printer" | "browser"; error?: string }> {
  const cfg = loadPrinterConfig();
  if (cfg) {
    try {
      await sendToPrinter(job.bytes, cfg);
      return { via: "printer" };
    } catch (e) {
      const error = e instanceof Error ? e.message : "The printer did not accept the job.";
      return { via: "browser", error: openPrintWindow(job.html) ? error : `${error} Allow pop-ups for this site to print on paper instead.` };
    }
  }
  return openPrintWindow(job.html) ? { via: "browser" } : { via: "browser", error: "Allow pop-ups for this site, then press Print again." };
}
