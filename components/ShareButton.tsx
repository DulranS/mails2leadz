"use client";

// Drop-in companion to the existing "Print" button on Invoices/Estimates —
// see lib/share.ts for why this is native-share/wa.me/mailto only, no
// third-party service. Its own small component (rather than folded into
// each page's print handler) because the fallback menu — shown when
// navigator.share isn't available — needs open/close state and
// click-outside handling that every call site would otherwise repeat.
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { buildShareTargets, buildShareText, type ShareableDocInput } from "@/lib/share";

export function ShareButton({
  contact,
  className,
  label = "Share",
  ...doc
}: ShareableDocInput & {
  /** Sale.customerContact / Estimate.customerContact, if one was recorded — addresses the WhatsApp/Email link at it. */
  contact?: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const text = buildShareText(doc);
  const targets = buildShareTargets(text, doc.title, contact);

  async function handleClick() {
    if (targets.canUseNativeShare) {
      await targets.shareNative();
      return;
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button type="button" onClick={handleClick} className={clsx(className ?? "text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]")}>
        {label}
      </button>
      {open && (
        <div className="absolute z-20 right-0 mt-1 w-36 rounded-md border border-line bg-panel shadow-lg overflow-hidden">
          <a
            href={targets.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center min-h-[44px] sm:min-h-0 px-3 sm:py-2 text-xs text-fg hover:bg-line/50"
            onClick={() => setOpen(false)}
          >
            WhatsApp
          </a>
          <a
            href={targets.mailtoUrl}
            className="flex items-center min-h-[44px] sm:min-h-0 px-3 sm:py-2 text-xs text-fg hover:bg-line/50"
            onClick={() => setOpen(false)}
          >
            Email
          </a>
        </div>
      )}
    </div>
  );
}
