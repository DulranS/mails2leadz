"use client";

import { useState, useRef, useEffect } from "react";
import { Button, Modal } from "@/components/ui";
import { performOcr, extractStructuredData, terminateOcrWorker, type OcrProgress, type OcrResult } from "@/lib/ocr";
import { CameraIcon, WarningIcon } from "@/components/icons";

interface OcrScannerProps {
  open: boolean;
  onClose: () => void;
  onResult: (data: { text: string; extracted: any }) => void;
  title?: string;
  hint?: string;
}

export default function OcrScanner({ open, onClose, onResult, title = "Scan Receipt/Invoice", hint }: OcrScannerProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The OCR worker (lib/ocr.ts) stays warm for a couple of minutes after
  // the last scan so re-opening this modal for a second receipt is instant.
  // But once the scanner is actually closed there's no near-term reuse to
  // wait for, so free that memory right away instead of leaving it parked
  // until the idle timer fires — matters most on the lower-end phones this
  // is aimed at.
  useEffect(() => {
    if (!open) {
      void terminateOcrWorker();
    }
  }, [open]);

  function reset() {
    setImageFile(null);
    setImagePreview(null);
    setProcessing(false);
    setProgress(0);
    setProgressStatus("");
    setOcrResult(null);
    setExtractedData(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB for performance)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large. Please use an image under 10MB');
      return;
    }

    setImageFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleScan() {
    if (!imageFile) return;

    setProcessing(true);
    setError(null);
    setProgress(0);

    try {
      const result = await performOcr(imageFile, (progress: OcrProgress) => {
        setProgress(Math.round(progress.progress * 100));
        setProgressStatus(progress.status);
      });

      setOcrResult(result);
      const extracted = extractStructuredData(result.text);
      setExtractedData(extracted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan image');
    } finally {
      setProcessing(false);
    }
  }

  function handleConfirm() {
    if (ocrResult) {
      onResult({
        text: ocrResult.text,
        extracted: extractedData
      });
      handleClose();
    }
  }

  function handleRetake() {
    setImageFile(null);
    setImagePreview(null);
    setOcrResult(null);
    setExtractedData(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <div className="space-y-4">
        {!imagePreview ? (
          <>
            <div className="border-2 border-dashed border-line rounded-lg p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
                id="ocr-file-input"
              />
              <label
                htmlFor="ocr-file-input"
                className="cursor-pointer block"
              >
                <CameraIcon className="w-10 h-10 mb-2 mx-auto text-muted" />
                <p className="text-sm text-fg font-medium">Tap to take photo or select image</p>
                <p className="text-xs text-muted mt-1">Supports JPG, PNG, WebP (max 10MB)</p>
              </label>
            </div>
            {hint && <p className="text-xs text-muted text-center">{hint}</p>}
          </>
        ) : (
          <>
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full rounded-lg border border-line"
              />
              {processing && (
                <div className="absolute inset-0 bg-black/50 rounded-lg flex flex-col items-center justify-center">
                  <div className="text-white text-sm font-medium mb-2">
                    {progressStatus}
                  </div>
                  <div className="w-48 h-2 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-soft transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-white text-xs mt-1">{progress}%</div>
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2 flex items-start gap-2">
                <WarningIcon className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {!processing && !ocrResult && (
              <div className="flex gap-2">
                <Button onClick={handleRetake} variant="ghost" className="flex-1">
                  Retake
                </Button>
                <Button onClick={handleScan} className="flex-1">
                  Scan Image
                </Button>
              </div>
            )}

            {ocrResult && (
              <div className="space-y-3">
                <div className="bg-panel2 border border-line rounded-md p-3">
                  <p className="text-xs text-muted mb-1 font-medium">Extracted Data:</p>
                  {extractedData?.amount && (
                    <p className="text-sm text-fg">Amount: {extractedData.amount}</p>
                  )}
                  {extractedData?.date && (
                    <p className="text-sm text-fg">Date: {extractedData.date}</p>
                  )}
                  {extractedData?.vendor && (
                    <p className="text-sm text-fg">Vendor: {extractedData.vendor}</p>
                  )}
                </div>

                <div className="bg-panel2 border border-line rounded-md p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs text-muted mb-1 font-medium">Recognized Text:</p>
                  <p className="text-xs text-fg whitespace-pre-wrap">{ocrResult.text}</p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleRetake} variant="ghost" className="flex-1">
                    Try Again
                  </Button>
                  <Button onClick={handleConfirm} className="flex-1">
                    Use This Data
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
