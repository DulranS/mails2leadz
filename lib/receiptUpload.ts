"use client";

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getFirebase } from "./firebase";
import { validateReceiptFile, receiptStoragePath } from "./receipts";

/** Uploads a receipt under a new random id. Returns the download link and the storage path to keep on the expense. */
export async function uploadReceipt(businessId: string, file: File): Promise<{ url: string; path: string }> {
  const problem = validateReceiptFile(file);
  if (problem) throw new Error(problem);
  const receiptId = crypto.randomUUID();
  const path = receiptStoragePath(businessId, receiptId);
  const { storage } = getFirebase();
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type });
  return { url: await getDownloadURL(fileRef), path };
}

/** Deletes a receipt file. Missing files are fine. */
export async function removeReceipt(path: string): Promise<void> {
  const { storage } = getFirebase();
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Already gone. Nothing else to clear.
  }
}
