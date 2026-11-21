"use client";

// Kitchen printer settings for this device: where the print agent runs, its token, and the printer's address on the network.
// Saved in this browser only. "Test print" sends a short test page to the printer so a setup problem shows up straight away.
import { useState } from "react";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { DEFAULT_AGENT_URL, DEFAULT_PRINTER_PORT } from "@/lib/printAgentRules";
import { clearPrinterConfig, loadPrinterConfig, savePrinterConfig, sendToPrinter, validatePrinterConfig, type PrinterConfig } from "@/lib/thermalPrint";
import { kitchenTicketLines, renderTicket } from "@/lib/escpos";
import { Button, Card, Field, Input, Label } from "@/components/ui";

export default function PrinterSetup() {
  const toast = useToast();
  const saved = typeof window !== "undefined" ? loadPrinterConfig() : null;
  const [agentUrl, setAgentUrl] = useState(saved?.agentUrl ?? DEFAULT_AGENT_URL);
  const [token, setToken] = useState(saved?.token ?? "");
  const [host, setHost] = useState(saved?.host ?? "");
  const [port, setPort] = useState(String(saved?.port ?? DEFAULT_PRINTER_PORT));
  const [isSaved, setIsSaved] = useState(!!saved);
  const [busy, setBusy] = useState(false);

  function current(): PrinterConfig {
    return { agentUrl: agentUrl.trim(), token: token.trim(), host: host.trim(), port: Number(port) };
  }

  function save() {
    const cfg = current();
    const problem = validatePrinterConfig(cfg);
    if (problem) {
      toast.error("Check the printer settings", problem);
      return;
    }
    if (savePrinterConfig(cfg)) {
      setIsSaved(true);
      toast.success("Kitchen printer saved", "Tickets and bills now go to the printer on this device.");
    } else {
      toast.error("Couldn't save on this device", "Browser storage is blocked, so the printer settings can't be kept.");
    }
  }

  function forget() {
    clearPrinterConfig();
    setIsSaved(false);
    setToken("");
    toast.info("Printer removed", "Tickets and bills print to the normal print window again.");
  }

  async function testPrint() {
    const cfg = current();
    const problem = validatePrinterConfig(cfg);
    if (problem) {
      toast.error("Check the printer settings", problem);
      return;
    }
    setBusy(true);
    try {
      const bytes = renderTicket(kitchenTicketLines("Test print", new Date().toLocaleString(), "test", [{ qty: 1, name: "Printer works" }]));
      await sendToPrinter(bytes, cfg);
      toast.success("Test page sent", "If it did not come out, check the printer's paper and address.");
    } catch (err) {
      toast.error("Test print failed", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-md">
      <div className="text-sm font-medium mb-1">Kitchen printer (this device)</div>
      <div className="text-xs text-muted mb-3">
        A thermal printer on your network prints tickets and bills without a dialog. Run the print agent on the computer next to it
        (see the manual). This is saved in this browser only. Until a printer is saved, tickets open in the normal print window.
      </div>
      <div className="grid gap-3">
        <Field>
          <Label>Print agent address</Label>
          <Input value={agentUrl} onChange={(e) => setAgentUrl(e.target.value)} placeholder={DEFAULT_AGENT_URL} />
        </Field>
        <Field>
          <Label>Print agent token</Label>
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>Printer address</Label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50" />
          </Field>
          <Field>
            <Label>Printer port</Label>
            <Input type="number" min="1" max="65535" value={port} onChange={(e) => setPort(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button onClick={save}>Save printer</Button>
        <Button variant="ghost" onClick={testPrint} disabled={busy}>{busy ? "Printing…" : "Test print"}</Button>
        {isSaved && <Button variant="ghost" onClick={forget}>Remove</Button>}
        {isSaved && <span className="text-xs text-good">Saved on this device</span>}
      </div>
    </Card>
  );
}
