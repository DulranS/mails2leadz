"use client";

import clsx from "clsx";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { READ_ONLY_MESSAGE } from "@/lib/readOnlyGuard";
import type { ButtonHTMLAttributes, ChangeEvent, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { groupedNumber, plainNumber } from "@/lib/numberFormat";

export function Card({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("bg-panel border border-line rounded-lg p-4 sm:p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "default",
  sub,
}: {
  label: ReactNode;
  value: string;
  tone?: "default" | "good" | "bad" | "amber";
  sub?: string;
}) {
  const toneClass = {
    default: "text-fg",
    good: "text-good",
    bad: "text-bad",
    amber: "text-amber-soft",
  }[tone];
  // A colored left edge, not a colored card — the stripe carries the
  // "glance at the color before you read the number" signal without
  // tinting the whole card (which would fight the value's own color and
  // make several Stats in a row feel like a wall of colored boxes).
  const stripeClass = {
    default: "border-l-line",
    good: "border-l-good",
    bad: "border-l-bad",
    amber: "border-l-amber",
  }[tone];
  return (
    <Card className={clsx("border-l-4", stripeClass)}>
      <div className="text-[11px] uppercase tracking-wider text-muted font-medium">{label}</div>
      <div className={clsx("num text-xl sm:text-2xl lg:text-3xl mt-1.5 font-medium break-words", toneClass)}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </Card>
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  // min-h-[44px] keeps every button at (or above) the widely-used 44px
  // touch-target minimum (Apple HIG / WCAG 2.5.5) on phones and tablets,
  // without visually bloating it on desktop — px/py alone comfortably
  // clear 44px on their own once line-height is accounted for, this is
  // just an explicit floor so short-label buttons don't fall under it.
  const base =
    "inline-flex items-center justify-center min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]";
  const variants = {
    primary: "bg-amber text-ink font-semibold hover:bg-amber-soft",
    ghost: "bg-transparent border border-line text-fg hover:border-muted",
    danger: "bg-transparent border border-bad/40 text-bad hover:bg-bad/10",
  };
  return <button className={clsx(base, variants[variant], className)} {...props} />;
}

// Links each <Label> to the control next to it, without touching the ~370
// call sites that write <Field><Label>…</Label><Input/></Field>. Field owns a
// small piece of state; the first Input/Select/Textarea inside it registers
// its id, and Label points htmlFor at that id. Result: tapping a label focuses
// the field (a bigger tap target on phones) and screen readers announce the
// label with the control. A Field holding several controls links its label to
// the first one. A Label outside any Field behaves exactly as before.
const FieldContext = createContext<{ controlId: string | null; register: (id: string) => void } | null>(null);

function useFieldControlId(explicitId?: string): string {
  const field = useContext(FieldContext);
  const autoId = useId();
  const id = explicitId ?? autoId;
  const register = field?.register;
  useEffect(() => {
    register?.(id);
  }, [register, id]);
  return id;
}

function PlainInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const id = useFieldControlId(props.id);
  return (
    <input
      {...props}
      id={id}
      className={clsx(
        // text-base (16px) rather than text-sm below the sm breakpoint —
        // any input under 16px triggers iOS Safari's automatic zoom-in on
        // focus, which shoves the whole page around and is one of the most
        // common "this feels broken on my phone" complaints in web apps.
        // min-h-[44px] is the same touch-target floor as Button.
        "w-full min-h-[44px] sm:min-h-0 bg-panel2 border border-line rounded-md px-3 py-2 text-base sm:text-sm text-fg placeholder:text-muted focus:outline-none focus:border-amber-dim",
        props.className
      )}
    />
  );
}

// Amount fields (number, decimal and numeric entry) show thousands separators as they are typed, so 500,000 and 5,000,000 read at a glance.
// The screen still receives the plain number ("500000"), so every place that parses the value keeps working. A field that is not an amount
// (for example a year) opts out with noCommas.
type InputProps = InputHTMLAttributes<HTMLInputElement> & { noCommas?: boolean };
export function Input(props: InputProps) {
  const { noCommas, ...rest } = props;
  const isAmount = !noCommas && (rest.type === "number" || rest.inputMode === "decimal" || rest.inputMode === "numeric");
  if (!isAmount) return <PlainInput {...rest} />;
  const { type: _type, min: _min, max: _max, step: _step, inputMode, value, onChange, ...others } = rest;
  const shown = value === undefined || value === null ? undefined : groupedNumber(String(value));
  return (
    <PlainInput
      {...others}
      type="text"
      inputMode={inputMode ?? "decimal"}
      value={shown}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        if (!onChange) return;
        onChange({ ...e, target: { ...e.target, value: plainNumber(e.target.value) } } as unknown as ChangeEvent<HTMLInputElement>);
      }}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useFieldControlId(props.id);
  return (
    <textarea
      {...props}
      id={id}
      className={clsx(
        // Same iOS-zoom-safe sizing rationale as Input above, just with a
        // taller default and vertical-only resize so it can't blow out a
        // narrow mobile layout.
        "w-full min-h-[110px] bg-panel2 border border-line rounded-md px-3 py-2 text-base sm:text-sm text-fg placeholder:text-muted focus:outline-none focus:border-amber-dim resize-y",
        props.className
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useFieldControlId(props.id);
  return (
    <select
      {...props}
      id={id}
      className={clsx(
        "w-full min-h-[44px] sm:min-h-0 bg-panel2 border border-line rounded-md px-3 py-2 text-base sm:text-sm text-fg focus:outline-none focus:border-amber-dim",
        props.className
      )}
    />
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  const field = useContext(FieldContext);
  return (
    <label htmlFor={htmlFor ?? field?.controlId ?? undefined} className="block text-xs text-muted mb-1.5">
      {children}
    </label>
  );
}

export function Field({ children, className }: { children: ReactNode; className?: string }) {
  const [controlId, setControlId] = useState<string | null>(null);
  // First control to register wins (effects run in DOM order), so the label
  // always points at the first field in the group.
  const register = useCallback((id: string) => setControlId((prev) => prev ?? id), []);
  const value = useMemo(() => ({ controlId, register }), [controlId, register]);
  return (
    <FieldContext.Provider value={value}>
      <div className={className}>{children}</div>
    </FieldContext.Provider>
  );
}

// `action` is almost always a "+ Add ..." button. The accountant login is view-only, so those are
// hidden for it - unless the page marks its action `readOnlySafe` (e.g. a Print button).
export function PageHeader({ title, action, readOnlySafe = false }: { title: string; action?: ReactNode; readOnlySafe?: boolean }) {
  const { role } = useAuth();
  const showAction = action && (role !== "accountant" || readOnlySafe);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-6">
      <h1 className="font-display text-xl sm:text-2xl font-medium">{title}</h1>
      {showAction && <div className="[&>button]:w-full sm:[&>button]:w-auto">{action}</div>}
    </div>
  );
}

// A named, remembered on/off toggle for a whole block of the page — built
// specifically to cut down dashboard-style screens that pile every stat
// group, chart, and table on top of each other with nothing collapsed.
// Nothing behind it is ever removed, just tucked away until asked for, so
// a first glance shows the handful of things worth checking today and
// everything else is one tap away. `storageKey` persists the open/closed
// state per section in localStorage (keyed so each section remembers its
// own state independently) so a returning owner who always expands
// "Money by month" doesn't have to redo that every visit, while someone
// who never touches "Fixed assets" doesn't have to keep re-collapsing it.
export function CollapsibleSection({
  title,
  subtitle,
  storageKey,
  defaultOpen = false,
  badge,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  storageKey: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const fullKey = `balancr:section-open:${storageKey}`;
  const [open, setOpen] = useState<boolean>(defaultOpen);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(fullKey);
      if (stored !== null) setOpen(stored === "1");
    } catch {
      // localStorage unavailable (private browsing, etc.) — fall back to defaultOpen.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(fullKey, next ? "1" : "0");
    } catch {
      // Non-fatal — the toggle still works for this session even if it can't persist.
    }
  }

  return (
    <Card className={className}>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="w-full flex items-start sm:items-center justify-between gap-3 text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
            {title}
            {badge}
          </div>
          {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
        </div>
        <ChevronIcon className={clsx("w-4 h-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </div>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

function ChevronIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="text-center py-10">
      <div className="text-sm font-medium text-fg">{title}</div>
      <div className="text-sm text-muted mt-1 max-w-sm mx-auto">{body}</div>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "good" | "bad" | "amber" }) {
  const toneClass = {
    default: "bg-panel2 text-muted border-line",
    good: "bg-good/15 text-good border-good/40",
    bad: "bg-bad/15 text-bad border-bad/40",
    amber: "bg-amber/15 text-amber-soft border-amber/40",
  }[tone];
  return (
    <span className={clsx("text-[11px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap", toneClass)}>
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "default",
  viewOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // "lg" is for content that's genuinely wide (a column-mapping grid plus
  // a data preview table, e.g. components/PosImportWizard.tsx) — every
  // other caller is a normal form and stays at the original width by not
  // passing this at all.
  size?: "default" | "lg";
  // A modal that only shows information (no form, nothing saved) can stay available to the
  // view-only accountant login. Every other modal is a form, so for an accountant it opens a
  // plain "view-only" notice instead - the form (and its Save button) is never mounted.
  viewOnly?: boolean;
}) {
  const { role } = useAuth();
  const blockedForAccountant = role === "accountant" && !viewOnly;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Lock background scroll while a modal is open (otherwise the page behind
  // a bottom-sheet keeps scrolling on touch devices — a common source of
  // "the app feels janky" reports) and move focus into the dialog once,
  // when it opens.
  //
  // Deliberately keyed on `open` alone, not `onClose`. onClose is usually
  // an inline arrow function from the parent, so it gets a new reference
  // on every parent re-render — including every keystroke in a form
  // inside this modal. If this effect (and its dialogRef.current.focus()
  // call) depended on onClose too, it would re-run on every keystroke and
  // steal focus back from whatever input the user was typing into after
  // each character. Splitting the Escape-key listener into its own effect
  // below keeps that handler correctly wired to the latest onClose
  // without the focus effect re-firing on every render.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={blockedForAccountant ? "View-only access" : title}
        tabIndex={-1}
        className={clsx(
          "relative bg-panel border border-line rounded-t-lg sm:rounded-lg w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto p-5 sm:p-6 focus:outline-none",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}
      >
        {/* Small drag-handle affordance on mobile bottom sheets — a visual
            cue this is a sheet you could swipe, matching iOS/Android
            conventions, even though swipe-to-dismiss isn't wired up. */}
        <div className="sm:hidden w-9 h-1 rounded-full bg-line mx-auto -mt-1 mb-3" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-medium pr-2">{blockedForAccountant ? "View-only access" : title}</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-fg w-11 h-11 sm:w-7 sm:h-7 -mr-2 sm:mr-0 shrink-0 flex items-center justify-center rounded-md hover:bg-panel2"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {blockedForAccountant ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">{READ_ONLY_MESSAGE}</p>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { key: T; label: ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx("flex gap-1 mb-4 border-b border-line overflow-x-auto scroll-touch", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            "px-3.5 py-2.5 sm:py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap",
            value === t.key
              ? "border-amber text-fg font-medium shadow-[0_1px_0_0_rgba(217,164,65,0.35)]"
              : "border-transparent text-muted hover:text-fg"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// A single pulsing placeholder block. Every other Skeleton* component below
// is built out of these, sized and arranged to match the real component
// it's standing in for, so the transition from skeleton to real content
// doesn't cause any layout jump.
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-panel2", className)} aria-hidden />;
}

// Mirrors the shape of a single <Stat>: a label-height bar plus a
// value-height bar inside the same Card padding as the real thing.
export function StatSkeleton() {
  return (
    <Card>
      <Skeleton className="h-[11px] w-20 mb-2.5" />
      <Skeleton className="h-6 sm:h-7 w-24" />
    </Card>
  );
}

// A row of StatSkeletons, using the same responsive grid every Stat grid
// in the app already uses, so `count` stat cards placeholder in exactly
// the space the real ones will occupy.
export function StatGridSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <StatSkeleton key={i} />
      ))}
    </div>
  );
}

// Mirrors a <Table> — a header row of short bars, then `rows` rows of
// `cols` value-shaped bars — without needing real column data yet.
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div>
      <div className="flex gap-4 pb-2.5 mb-2.5 border-b border-line">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1 max-w-[8rem]" />
        ))}
      </div>
      <div className="space-y-3.5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4">
            {Array.from({ length: cols }).map((__, c) => (
              <Skeleton key={c} className="h-3.5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// The same TableSkeleton, pre-wrapped in a Card — the common case, since
// almost every table in the app sits inside one.
export function TableCardSkeleton({ rows = 5, cols = 4, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <Card className={className}>
      <TableSkeleton rows={rows} cols={cols} />
    </Card>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="overflow-x-auto -mx-4 sm:mx-0 scroll-touch">
        <table className="w-full text-sm border-collapse min-w-[560px]">{children}</table>
      </div>
      {/* Right-edge fade hints that a wide table scrolls horizontally —
          otherwise on a phone it just looks like the table got cut off,
          with no signal there's more to see. Purely decorative, so it's
          hidden from assistive tech. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-6 sm:hidden bg-gradient-to-l from-panel to-transparent"
      />
    </div>
  );
}

export function Checkbox({ 
  id, 
  checked, 
  onCheckedChange, 
  className 
}: { 
  id?: string; 
  checked: boolean; 
  onCheckedChange: (checked: boolean) => void; 
  className?: string;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className={clsx(
        "w-4 h-4 rounded border border-line bg-panel2 text-amber focus:outline-none focus:ring-2 focus:ring-amber/50 cursor-pointer",
        className
      )}
    />
  );
}


// ---------------------------------------------------------------------------
// Progressive list paging.
//
// A busy business can have tens of thousands of sales, bills or invoices. The
// pages render each list twice (phone cards + desktop table), so drawing every
// row at once meant a frozen tab on a big account. These two helpers draw the
// newest `pageSize` rows and let the person reveal more on demand. Nothing is
// removed from the data — totals, KPIs, search and exports still use the full
// list; only the number of DOM rows drawn changes.
//
// The visible count resets to one page whenever `resetKey` changes (e.g. a
// search box or filter), so a new search always starts from the top.
// ---------------------------------------------------------------------------
export const LIST_PAGE_SIZE = 50;

export function usePagedList<T>(items: T[], resetKey: string | number = "", pageSize: number = LIST_PAGE_SIZE) {
  const [count, setCount] = useState(pageSize);
  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);
  const total = items.length;
  const visible = useMemo(() => (total <= count ? items : items.slice(0, count)), [items, total, count]);
  const remaining = Math.max(0, total - visible.length);
  const showMore = useCallback(() => setCount((c) => c + pageSize), [pageSize]);
  const showAll = useCallback(() => setCount(Number.MAX_SAFE_INTEGER), []);
  return { visible, total, remaining, showMore, showAll, shown: visible.length };
}

export function ShowMoreBar({
  shown,
  total,
  remaining,
  onShowMore,
  onShowAll,
  noun = "rows",
  pageSize = LIST_PAGE_SIZE,
}: {
  shown: number;
  total: number;
  remaining: number;
  onShowMore: () => void;
  onShowAll: () => void;
  noun?: string;
  pageSize?: number;
}) {
  if (remaining <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-muted">
      <span>
        Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun} (newest first). Totals above include all of them.
      </span>
      <span className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onShowMore}>
          Show {Math.min(pageSize, remaining).toLocaleString()} more
        </Button>
        {remaining > pageSize * 4 && remaining <= 2000 && (
          <Button type="button" variant="ghost" onClick={onShowAll}>
            Show all
          </Button>
        )}
      </span>
    </div>
  );
}
