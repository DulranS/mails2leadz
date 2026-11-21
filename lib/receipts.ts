// Receipt photos and PDFs on expenses (v332). One file per receipt, stored at receipts/{businessId}/{receiptId}. The expense keeps the
// download link and the storage path. The check on the file is here; the upload is in lib/receiptUpload.ts.
// The storage rules (storage.rules) enforce the same types and size, and allow only the owner or a manager to write.
// Pure: no I/O.

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

/** Null when the file can be attached as a receipt, otherwise the reason it cannot. */
export function validateReceiptFile(file: { type: string; size: number } | null | undefined): string | null {
  if (!file) return "Choose a file.";
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) return "A receipt must be a photo (JPG, PNG or WebP) or a PDF.";
  if (!Number.isFinite(file.size) || file.size <= 0) return "That file is empty.";
  if (file.size > RECEIPT_MAX_BYTES) return "A receipt must be 5 MB or smaller.";
  return null;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The storage path for one receipt. Throws on ids that could escape the folder. */
export function receiptStoragePath(businessId: string, receiptId: string): string {
  if (!SAFE_ID.test(businessId) || !SAFE_ID.test(receiptId)) throw new Error("Bad receipt path.");
  return `receipts/${businessId}/${receiptId}`;
}
