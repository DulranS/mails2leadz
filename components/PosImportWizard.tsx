"use client";

// The generic "my POS isn't Balancr" on-ramp. Rather than a parser per
// vendor (Square/Shopify/Clover/Toast/...), this lets the column-mapping
// engine in lib/posImport.ts guess what an arbitrary export's headers
// mean, the person confirms or fixes that guess against a live preview,
// and then the exact same validated path the plain Balancr-format CSV
// import already uses (importProductsRows/importSalesRows in lib/csv.ts)
// takes it from there — so this file is UI and column-renaming only, with
// zero duplicated business rules.
import { useRef, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { Modal, Button, Select, Label, Checkbox, Input } from "@/components/ui";
import { toastableErrorMessage, useToast } from "@/contexts/ToastContext";
import { parseCsvFile, importProductsRows, importSalesRows, type ImportError } from "@/lib/csv";
import {
  POS_FIELD_SPECS,
  suggestMapping,
  applyMapping,
  finalizeSalesRows,
  looksLikeLineTotal,
  recallMapping,
  rememberMapping,
  type PosEntity,
  type ColumnMapping,
} from "@/lib/posImport";
import { applyVendorProfile, findVendorProfile, missingProfileColumns, validateVendorProfile } from "@/lib/posVendorProfile";
import type { PosVendorProfile } from "@/lib/types";

type Step = "choose" | "map" | "result";

export default function PosImportWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("choose");
  const [entity, setEntity] = useState<PosEntity>("sales");
  const [fileName, setFileName] = useState("");
  const [fileRows, setFileRows] = useState<Record<string, string>[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [priceIsTotal, setPriceIsTotal] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; errors: ImportError[] } | null>(null);
  // v319: a saved layout (sales only). The payment method and transaction id columns are set here, not in the main list above.
  const toast = useToast();
  const [layoutName, setLayoutName] = useState(""); // the saved layout in use; "" = match the columns by hand, as before
  const [newLayoutName, setNewLayoutName] = useState("");
  const [extraColumns, setExtraColumns] = useState<{ paymentMethod: string | null; transactionId: string | null }>({ paymentMethod: null, transactionId: null });
  const [layoutMsg, setLayoutMsg] = useState<string | null>(null);

  function reset() {
    setStep("choose");
    setFileName("");
    setFileRows(null);
    setHeaders([]);
    setMapping({});
    setPriceIsTotal(false);
    setFileError(null);
    setResult(null);
    setLayoutName("");
    setNewLayoutName("");
    setExtraColumns({ paymentMethod: null, transactionId: null });
    setLayoutMsg(null);
  }

  function handleClose() {
    onClose();
    setTimeout(reset, 200); // let the close animation finish before the form resets under it
  }

  async function handleFile(file: File) {
    setFileError(null);
    try {
      const { data: rows, meta } = await parseCsvFile(file);
      if (rows.length === 0) {
        setFileError("That file doesn't have any rows in it.");
        return;
      }
      const headerList = (meta.fields ?? Object.keys(rows[0])).filter(Boolean);
      const fields = POS_FIELD_SPECS[entity];
      const remembered = recallMapping(entity, headerList);
      const suggested = remembered?.mapping ?? suggestMapping(headerList, fields);

      setFileName(file.name);
      setHeaders(headerList);
      setFileRows(rows);
      setMapping(suggested);
      setPriceIsTotal(
        entity === "sales" ? remembered?.priceIsTotal ?? looksLikeLineTotal(suggested.unitPrice ?? null) : false
      );
      setStep("map");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read that file — is it a CSV export?");
    }
  }

  const fields = POS_FIELD_SPECS[entity];
  const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);

  // v319: the layout as it stands on screen (the main columns above plus the two extra ones).
  function layoutAsShown(name: string): PosVendorProfile {
    return {
      name,
      mapping: { product: mapping.product ?? null, date: mapping.date ?? null, qty: mapping.qty ?? null, unitPrice: mapping.unitPrice ?? null, ...extraColumns },
      priceIsTotal,
      savedAt: Date.now(),
    };
  }

  function chooseLayout(name: string) {
    setLayoutMsg(null);
    if (!name) {
      setLayoutName("");
      return;
    }
    const saved = findVendorProfile(data.settings.posVendorProfiles, name);
    if (!saved) return;
    const missing = missingProfileColumns(saved, headers);
    setMapping({ ...mapping, product: saved.mapping.product ?? null, date: saved.mapping.date ?? null, qty: saved.mapping.qty ?? null, unitPrice: saved.mapping.unitPrice ?? null });
    setExtraColumns({ paymentMethod: saved.mapping.paymentMethod ?? null, transactionId: saved.mapping.transactionId ?? null });
    setPriceIsTotal(saved.priceIsTotal);
    setLayoutName(saved.name);
    if (missing.length) setLayoutMsg(`This file doesn't have these columns from the layout: ${missing.join(", ")}. Match them below.`);
  }

  async function saveLayout() {
    const name = newLayoutName.trim();
    const candidate = layoutAsShown(name);
    const problem = validateVendorProfile({ name, mapping: candidate.mapping, priceIsTotal });
    if (problem) {
      setLayoutMsg(problem);
      return;
    }
    try {
      const others = (data.settings.posVendorProfiles ?? []).filter((p) => p.name.trim().toLowerCase() !== name.toLowerCase());
      await data.updateSettings({ posVendorProfiles: [...others, candidate] });
      setLayoutName(name);
      setNewLayoutName("");
      setLayoutMsg(`Saved the layout "${name}". Next time, choose it from the list.`);
      toast.success("Layout saved", name);
    } catch (err) {
      setLayoutMsg(toastableErrorMessage(err));
    }
  }

  function mappedPreviewRows(sourceRows: Record<string, string>[]): Record<string, string>[] {
    // v319: a saved layout is applied in place of the columns by hand. With none chosen, the path below is unchanged.
    if (entity === "sales" && layoutName) return applyVendorProfile(sourceRows, layoutAsShown(layoutName));
    const applied = applyMapping(sourceRows, mapping);
    return entity === "sales"
      ? finalizeSalesRows(applied, { qtyMapped: !!mapping.qty, priceIsTotal })
      : applied;
  }

  async function handleConfirm() {
    if (!fileRows) return;
    setBusy(true);
    try {
      const mapped = mappedPreviewRows(fileRows);
      if (entity === "products") {
        const { rows, errors } = importProductsRows(mapped);
        if (errors.length === 0) await data.bulkAddProducts(rows);
        setResult({ added: errors.length === 0 ? rows.length : 0, errors });
      } else {
        const { rows, errors } = importSalesRows(mapped, data.products);
        if (errors.length === 0) await data.bulkAddSales(rows);
        setResult({ added: errors.length === 0 ? rows.length : 0, errors });
      }
      // Remembered regardless of outright success — even a mapping that
      // surfaced a few row-level errors this time (typos, a couple of
      // unrecognized products) is almost certainly still the right column
      // layout for this POS's export next time.
      rememberMapping(entity, headers, { mapping, priceIsTotal });
      setStep("result");
    } finally {
      setBusy(false);
    }
  }

  const salesNeedsProductsFirst = entity === "sales" && data.products.length === 0;

  return (
    <Modal open={open} onClose={handleClose} title="Import from your POS" size="lg">
      {step === "choose" && (
        <div className="space-y-4">
          <p className="text-sm text-muted -mt-1">
            Export a CSV from Square, Shopify, Clover, Toast, Lightspeed, Vend, WooCommerce, or pretty much any
            till or POS software — the column names don&apos;t need to match. We&apos;ll show you what we found
            and let you match them up before anything gets saved.
          </p>
          <div>
            <Label>What&apos;s in this file?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEntity("products")}
                className={`text-left px-3 py-2.5 rounded-md border text-sm transition-colors ${
                  entity === "products" ? "border-amber bg-amber/10 font-medium" : "border-line hover:bg-panel2"
                }`}
              >
                Items / menu
                <div className="text-xs text-muted font-normal mt-0.5">Your product or menu catalog</div>
              </button>
              <button
                type="button"
                onClick={() => setEntity("sales")}
                className={`text-left px-3 py-2.5 rounded-md border text-sm transition-colors ${
                  entity === "sales" ? "border-amber bg-amber/10 font-medium" : "border-line hover:bg-panel2"
                }`}
              >
                Sales / transactions
                <div className="text-xs text-muted font-normal mt-0.5">Line-item sales history</div>
              </button>
            </div>
          </div>
          {salesNeedsProductsFirst && (
            <div className="text-xs text-amber-soft bg-amber/10 border border-amber/30 rounded-md px-3 py-2">
              Import your items/menu first — sales history is matched against your product list by name or SKU,
              so there&apos;s nothing to match against yet.
            </div>
          )}
          {fileError && <div className="text-xs text-bad">{fileError}</div>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Button
            className="w-full"
            disabled={salesNeedsProductsFirst}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose CSV file…
          </Button>
        </div>
      )}

      {step === "map" && fileRows && (
        <div className="space-y-4">
          <div className="text-xs text-muted -mt-1">
            {fileName} · {fileRows.length} row{fileRows.length === 1 ? "" : "s"}. Match each field below to a
            column from your file, or leave the optional ones blank.
          </div>

          {entity === "sales" && (
            <div className="rounded-md border border-line p-3 space-y-2">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Saved layout</div>
              <div className="grid grid-cols-2 gap-3">
                <Select value={layoutName} onChange={(e) => chooseLayout(e.target.value)}>
                  <option value="">— match the columns below —</option>
                  {(data.settings.posVendorProfiles ?? []).map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </Select>
                <div>
                  <Label>Payment method column</Label>
                  <Select value={extraColumns.paymentMethod ?? ""} onChange={(e) => setExtraColumns({ ...extraColumns, paymentMethod: e.target.value || null })}>
                    <option value="">— not in this file —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Transaction id column</Label>
                  <Select value={extraColumns.transactionId ?? ""} onChange={(e) => setExtraColumns({ ...extraColumns, transactionId: e.target.value || null })}>
                    <option value="">— not in this file —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </div>
                <div className="flex gap-2 items-end">
                  <Input value={newLayoutName} onChange={(e) => setNewLayoutName(e.target.value)} maxLength={60} placeholder="Name this layout" />
                  <Button variant="ghost" onClick={saveLayout} disabled={!newLayoutName.trim()}>Save</Button>
                </div>
              </div>
              <div className="text-[11px] text-muted">
                {layoutName ? `Using the saved layout "${layoutName}" for this import. It brings in item, date, quantity, price, payment method and transaction id.` : "Save these columns under a name and the next export from the same till can use them in one step."}
              </div>
              {layoutMsg && <div className="text-xs text-muted">{layoutMsg}</div>}
            </div>
          )}

          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.key} className="grid grid-cols-2 gap-3 items-start">
                <div>
                  <Label>
                    {field.label}
                    {field.required && <span className="text-bad ml-1">*</span>}
                  </Label>
                  {field.hint && <div className="text-[11px] text-muted -mt-1 mb-1">{field.hint}</div>}
                </div>
                <div>
                  <Select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value || null }))}
                  >
                    <option value="">— not in this file —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                  {field.key === "unitPrice" && entity === "sales" && (
                    <label className="flex items-center gap-2 mt-1.5 text-xs text-muted">
                      <Checkbox checked={priceIsTotal} onCheckedChange={setPriceIsTotal} />
                      This is the line&apos;s total, not a per-item price
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>

          {missingRequired.length > 0 && (
            <div className="text-xs text-amber-soft bg-amber/10 border border-amber/30 rounded-md px-3 py-2">
              Still need: {missingRequired.map((f) => f.label).join(", ")}
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Preview (first {Math.min(3, fileRows.length)} rows)
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-xs border-collapse min-w-[480px]">
                <thead>
                  <tr className="border-b border-line">
                    {fields.map((f) => (
                      <th key={f.key} className="text-left font-medium text-muted px-2 py-1.5 whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedPreviewRows(fileRows.slice(0, 3)).map((row, i) => (
                    <tr key={i} className="border-b border-line/50">
                      {fields.map((f) => (
                        <td key={f.key} className="px-2 py-1.5 text-fg whitespace-nowrap">
                          {row[f.key] || <span className="text-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("choose")} className="flex-1">
              Back
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={busy || missingRequired.length > 0}
              className="flex-1"
            >
              {busy ? "Importing…" : `Import ${fileRows.length} row${fileRows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4 text-sm">
          {result.errors.length === 0 ? (
            <>
              <div className="text-good font-medium">Added {result.added} rows.</div>
              <div className="text-xs text-muted">
                This mapping is remembered — the next CSV shaped like this one from the same POS will suggest the
                same columns automatically.
              </div>
            </>
          ) : (
            <div className="text-bad space-y-1">
              <div>{result.errors.length} row(s) had a problem — nothing was added yet. Fix these and try again:</div>
              <ul className="list-disc list-inside text-muted text-xs max-h-48 overflow-y-auto">
                {result.errors.slice(0, 20).map((err, i) => (
                  <li key={i}>
                    Row {err.row}: {err.message}
                  </li>
                ))}
              </ul>
              {result.errors.length > 20 && <div className="text-muted text-xs">…and {result.errors.length - 20} more.</div>}
            </div>
          )}
          <div className="flex gap-2">
            {result.errors.length > 0 && (
              <Button variant="ghost" onClick={() => setStep("map")} className="flex-1">
                Back to mapping
              </Button>
            )}
            <Button onClick={handleClose} className="flex-1">
              {result.errors.length === 0 ? "Done" : "Close"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
