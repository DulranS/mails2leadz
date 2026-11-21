"use client";

// A procedure's steps as a flow, with the diagram code to copy into any diagram tool. Reads the steps the procedure holds; nothing is saved.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/contexts/ToastContext";
import { flowchartCode, parseFlowSteps } from "@/lib/processMap";

export default function ProcessFlow({ title, body }: { title: string; body: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const steps = useMemo(() => parseFlowSteps(body), [body]);
  const code = useMemo(() => flowchartCode(steps, title), [steps, title]);
  if (steps.length === 0) return null;
  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Hide the flow" : "Show as a flow"}</Button>
      {open && (
        <div className="space-y-2">
          <div className="flex flex-col items-center gap-1">
            <div className="rounded-md border border-line px-3 py-1.5 text-xs font-medium">{title || "Start"}</div>
            {steps.map((s) => (
              <div key={s.n} className="flex flex-col items-center gap-1 w-full">
                <span className="text-muted text-xs">↓</span>
                <div className="rounded-md border border-line px-3 py-2 text-sm w-full max-w-md">{s.n}. {s.text}</div>
              </div>
            ))}
            <span className="text-muted text-xs">↓</span>
            <div className="rounded-md border border-line px-3 py-1.5 text-xs font-medium">Done</div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => navigator.clipboard?.writeText(code).then(() => toast.success("Copied", "Paste it into a diagram tool that reads Mermaid"))} className="text-xs text-amber-soft hover:underline min-h-[32px]">Copy the diagram code</button>
            <span className="text-[11px] text-muted">Mermaid code: paste it into a free diagram tool for a styled, editable chart.</span>
          </div>
        </div>
      )}
    </div>
  );
}
