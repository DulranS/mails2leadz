// ---------------------------------------------------------------------------
// OCR utility for scanning receipts, invoices, and bills.
// Uses Tesseract.js (client-side) to avoid API costs and keep data private —
// this never sends the image or its text anywhere, unlike routing a photo
// through a paid vision model. Two efficiency choices keep the compute cost
// of that low as well:
//
// 1. Lazy-loaded: tesseract.js is a multi-MB WASM bundle. It's dynamically
//    imported only when a scan is actually requested, via ensureWorker()
//    below, so pages that never open the scanner never pay for it.
// 2. Worker reuse: Tesseract.createWorker() loads the ~2-4MB English
//    traineddata model into WASM. The old implementation called
//    Tesseract.recognize() per scan, which spins up and tears down a full
//    worker (and re-loads that model) every time — fine for one scan, but
//    wasteful for the common case of a user scanning several receipts in a
//    row in the same session. Instead we keep one worker warm and reuse it,
//    and only terminate it after a period of inactivity to free the memory
//    back up (worthwhile on the lower-end phones this is likely used on).
// ---------------------------------------------------------------------------

export interface OcrResult {
  text: string;
  confidence: number;
  lines: string[];
}

export interface OcrProgress {
  status: 'recognizing text' | 'loading language traineddata';
  progress: number; // 0-1
}

// How long to keep an idle worker warm before releasing it. Long enough to
// cover "scan a few receipts back to back", short enough not to sit on a
// phone's memory for the rest of the session after the user is done.
const WORKER_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

let workerPromise: Promise<any> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleTermination() {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    void terminateOcrWorker();
  }, WORKER_IDLE_TIMEOUT_MS);
}

// Lazily creates (or returns the already-warm) worker. English-only, since
// that covers the receipts/invoices this is aimed at and keeps the model
// download to a single ~2-4MB file instead of one per language.
async function ensureWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng');
    })().catch((err) => {
      // Don't leave a rejected promise cached — the next call should retry.
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/**
 * Frees the warm worker's memory immediately. Safe to call any time
 * (no-op if nothing is warm); the scanner component calls this on unmount
 * so a closed scanner doesn't hold memory until the idle timer fires.
 */
export async function terminateOcrWorker(): Promise<void> {
  clearIdleTimer();
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Already gone or failed to load — nothing to clean up.
  }
}

/**
 * Preprocess image for better OCR accuracy
 * - Converts to grayscale
 * - Increases contrast
 * - Resizes to optimal dimensions
 * This runs client-side using Canvas API
 */
async function preprocessImage(imageFile: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Target width for OCR (balance between quality and speed)
      const targetWidth = 2000;
      const scale = Math.min(targetWidth / img.width, 2); // Max 2x upscale
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      // Draw image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Get image data for processing
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert to grayscale and increase contrast
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        // Grayscale
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
        
        // Contrast enhancement (simple stretch)
        const contrast = 1.5;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        const enhanced = factor * (avg - 128) + 128;
        const clamped = Math.max(0, Math.min(255, enhanced));
        
        data[i] = clamped;
        data[i + 1] = clamped;
        data[i + 2] = clamped;
      }

      ctx.putImageData(imageData, 0, 0);

      // Convert to data URL
      const processedUrl = canvas.toDataURL('image/png', 0.9);
      URL.revokeObjectURL(url);
      resolve(processedUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Extract structured data from OCR text
 * This is a lightweight parser that looks for common patterns in receipts/invoices
 */
export function extractStructuredData(text: string): {
  amount?: number;
  date?: string;
  vendor?: string;
  items?: Array<{ name: string; price?: number; qty?: number }>;
} {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result: any = {};

  // Extract amount (look for currency symbols, "total", "amount", etc.)
  const amountPatterns = [
    /total[:\s]*[$€£₹]?\s*([\d,]+\.?\d*)/i,
    /amount[:\s]*[$€£₹]?\s*([\d,]+\.?\d*)/i,
    /grand total[:\s]*[$€£₹]?\s*([\d,]+\.?\d*)/i,
    /[$€£₹]\s*([\d,]+\.?\d*)/,
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        result.amount = amount;
        break;
      }
    }
  }

  // Extract date (common formats)
  const datePatterns = [
    /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    /(\d{1,2}[-/]\d{1,2}[-/]\d{4})/,
    /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.date = match[1];
      break;
    }
  }

  // Extract vendor (often the first non-empty line or contains "store", "shop", etc.)

  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (line.length > 3 && line.length < 50 && !/\d/.test(line)) {
      result.vendor = line;
      break;
    }
  }

  return result;
}

/**
 * Main OCR function with progress callback.
 * Cost: $0 — runs entirely client-side, no API calls, nothing leaves the
 * device.
 * Performance: reuses a warm WebAssembly worker across calls (see
 * ensureWorker above) instead of reloading the language model per scan,
 * plus image preprocessing to keep recognition itself fast and accurate.
 */
export async function performOcr(
  imageFile: File,
  onProgress?: (progress: OcrProgress) => void
): Promise<OcrResult> {
  try {
    // Preprocess image for better accuracy
    onProgress?.({ status: 'recognizing text', progress: 0.1 });
    const processedImageUrl = await preprocessImage(imageFile);

    onProgress?.({ status: 'loading language traineddata', progress: 0.2 });
    const worker = await ensureWorker();

    const result = await worker.recognize(processedImageUrl);

    // Worker stays warm for a follow-up scan; only torn down after a period
    // of inactivity (see WORKER_IDLE_TIMEOUT_MS) or on explicit unmount.
    scheduleIdleTermination();

    onProgress?.({ status: 'recognizing text', progress: 1 });

    const lines = result.data.text
      .split('\n')
      .map((line: string) => line.trim())
      .filter((text: string) => text.length > 0);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      lines
    };
  } catch (error) {
    console.error('OCR failed:', error);
    throw new Error('Failed to process image. Please try a clearer photo.');
  }
}

/**
 * Lightweight OCR for quick text extraction — same warm worker as
 * performOcr, just returns raw text without the confidence/line breakdown.
 */
export async function performQuickOcr(
  imageFile: File,
  onProgress?: (progress: OcrProgress) => void
): Promise<string> {
  try {
    onProgress?.({ status: 'recognizing text', progress: 0.1 });
    const processedImageUrl = await preprocessImage(imageFile);

    onProgress?.({ status: 'loading language traineddata', progress: 0.2 });
    const worker = await ensureWorker();

    const result = await worker.recognize(processedImageUrl);
    scheduleIdleTermination();
    onProgress?.({ status: 'recognizing text', progress: 1 });

    return result.data.text;
  } catch (error) {
    console.error('Quick OCR failed:', error);
    throw new Error('Failed to read text from image');
  }
}
