// Recording a write-down (v256): an asset worth less than its book value. The write-down must be a real amount, dated after the purchase and no later
// than today, and no more than the asset is still worth on that day. Earlier write-downs are kept. Pure.
import { computeFixedAssetStatus } from "./calculations";
import type { FixedAsset } from "./types";

export function writeDownAsset(
  asset: FixedAsset,
  input: { date: string; amount: number; reason?: string },
  todayIso: string,
): { ok: true; impairments: NonNullable<FixedAsset["impairments"]> } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Enter the day of the write-down." };
  if (input.date < asset.purchaseDate) return { ok: false, error: "A write-down cannot be dated before the asset was bought." };
  if (input.date > todayIso) return { ok: false, error: "A write-down cannot be dated in the future." };
  if (!(input.amount > 0)) return { ok: false, error: "The amount lost must be more than zero." };
  const worth = computeFixedAssetStatus({ ...asset, impairments: asset.impairments ?? [] }, input.date).netBookValue;
  if (input.amount > worth + 0.005) return { ok: false, error: `The asset is worth ${Math.round(worth * 100) / 100} on that day, so the write-down cannot be more than that.` };
  return { ok: true, impairments: [...(asset.impairments ?? []), { date: input.date, amount: input.amount, reason: input.reason }] };
}
