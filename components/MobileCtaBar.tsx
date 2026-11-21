"use client";

// Phone-only action bar pinned to the bottom of the landing page. It stays hidden while the
// hero buttons or the closing call-to-action are on screen (they already offer the same
// choices), and slides in once the visitor has scrolled past the hero, so "Try it" and
// "Free trial" are always one thumb-tap away on a long page. Hidden entirely from sm up.
import { useEffect, useState } from "react";
import Link from "next/link";
import TryDemoButton from "@/components/TryDemoButton";

export default function MobileCtaBar() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    const closing = document.getElementById("closing");
    if (!hero || !closing || typeof IntersectionObserver === "undefined") return;
    let heroOn = true;
    let closingOn = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroOn = e.isIntersecting;
        else closingOn = e.isIntersecting;
      }
      setHidden(heroOn || closingOn);
    });
    io.observe(hero);
    io.observe(closing);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 sm:hidden border-t border-line bg-ink/95 backdrop-blur px-4 pt-3 pb-3 safe-bottom flex gap-2 transition-transform duration-200 ${
        hidden ? "translate-y-full invisible" : "translate-y-0 visible"
      }`}
    >
      <TryDemoButton
        label="Try it now"
        busyLabel="Opening…"
        className="flex-1 inline-flex items-center justify-center min-h-[48px] rounded-md text-sm font-semibold bg-amber text-ink active:translate-y-px"
      />
      <Link
        href="/request-trial"
        className="flex-1 inline-flex items-center justify-center min-h-[48px] rounded-md text-sm font-medium border border-line text-fg active:translate-y-px"
      >
        Free trial
      </Link>
    </div>
  );
}
