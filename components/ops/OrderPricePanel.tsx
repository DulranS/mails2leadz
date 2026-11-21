"use client";

// Price check for an order in quantity: the total at the quantity discounts, and the margin left against a floor the business sets. Nothing is
// recorded or priced; it is a check before a deal is agreed. Owner and manager only.
import { useMemo, useState } from "react";
import { Badge, Card, Field, Input, Label, Select, Textarea } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { formatMoney } from "@/lib/format";
import { parseTiers, orderPrice } from "@/lib/bulkPricing";

export default function OrderPricePanel() {
  const { products, ledgers, settings } = useData();
  const cur = settings.currency;
  const sellable = useMemo(() => products.filter((p) => (p.defaultSellPrice ?? 0) > 0), [products]);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("10");
  const [tierText, setTierText] = useState("10:5, 50:10");
  const [floor, setFloor] = useState("30");
  const product = sellable.find((p) => p.id === productId) ?? sellable[0];
  const parsed = useMemo(() => parseTiers(tierText), [tierText]);
  const cost = product ? (ledgers.get(product.id)?.wac || (product.defaultCostPrice ?? 0)) : 0;
  const result = useMemo(() => product ? orderPrice({
    qty: Math.max(1, Math.floor(Number(qty) || 1)), listUnitPrice: product.defaultSellPrice ?? 0, unitCost: cost,
    tiers: parsed.tiers, marginFloorPct: Number(floor) || 0,
  }) : null, [product, qty, cost, parsed, floor]);

  if (sellable.length === 0) {
    return <Card className="p-4 text-xs text-muted">Give your products a selling price first; the price check works from it.</Card>;
  }
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Price check for a quantity deal</div>
        <div className="text-xs text-muted">Nothing is recorded or priced here. It shows the total and the margin left, so a deal can be agreed knowingly.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Product or service</Label>
            <Select value={product?.id ?? ""} onChange={(e) => setProductId(e.target.value)}>
              {sellable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field><Label>Quantity</Label><Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field><Label>Quantity discounts (minimum quantity:discount %, comma separated)</Label><Input value={tierText} onChange={(e) => setTierText(e.target.value)} /></Field>
          <Field><Label>Lowest margin you accept (%)</Label><Input inputMode="decimal" value={floor} onChange={(e) => setFloor(e.target.value)} /></Field>
        </div>
        {parsed.errors.map((e) => <div key={e} className="text-xs text-bad">{e}</div>)}
      </Card>
      {result && (
        <Card className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{product?.name}</span>
            <Badge tone={result.belowFloor ? "bad" : "good"}>{result.belowFloor ? "below your margin floor" : "above your margin floor"}</Badge>
          </div>
          <div className="text-xs text-muted mt-1">
            {result.qty} × <span className="num">{formatMoney(result.listUnitPrice, cur)}</span> list, {result.discountPct}% off → <span className="num">{formatMoney(result.unitPrice, cur)}</span> each, total <span className="num">{formatMoney(result.total, cur)}</span>.
            {" "}Cost <span className="num">{formatMoney(result.unitCost, cur)}</span> each; margin <span className="num">{result.marginPct === null ? "—" : `${result.marginPct}%`}</span> (<span className="num">{formatMoney(result.marginAmount, cur)}</span> in total).
          </div>
        </Card>
      )}
    </div>
  );
}
