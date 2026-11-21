"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/components/ui";

// Scan a code with the phone or tablet camera. Uses the browser's barcode detector where it exists (Chrome on Android and
// similar). Where it doesn't, this renders nothing and the code box, which also takes a USB or Bluetooth scanner, still works.
// The camera is on only while this is open, and it is switched off as soon as a code is read or the box is closed. Nothing is stored.

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

// The formats a shop label uses: retail barcodes, short codes, and QR codes.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

function detectorCtor(): DetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;
}

export default function CameraScanButton({ onCode }: { onCode: (code: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Always the latest callback, without restarting the camera when the parent re-renders.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    setSupported(!!detectorCtor() && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let finished = false;
    const stop = () => {
      finished = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    (async () => {
      const Ctor = detectorCtor();
      if (!Ctor) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (finished) {
          stop();
          return;
        }
        const video = videoRef.current;
        if (!video) {
          stop();
          return;
        }
        video.srcObject = stream;
        await video.play();
        const detector = new Ctor({ formats: FORMATS });
        timer = setInterval(async () => {
          const frame = videoRef.current;
          if (finished || !frame) return;
          try {
            const found = await detector.detect(frame);
            const code = found[0]?.rawValue?.trim();
            if (code) {
              stop();
              setOpen(false);
              onCodeRef.current(code);
            }
          } catch {
            // A frame that cannot be read is skipped; the next one is tried.
          }
        }, 400);
      } catch {
        setMessage("The camera isn't available. Allow camera access, or type the code.");
      }
    })();
    return stop;
  }, [open]);

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setOpen(true);
        }}
        className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
      >
        Scan with camera
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Scan a code">
        <div className="space-y-3">
          <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black" />
          <div className="text-xs text-muted">Hold the code steady in the frame. It fills in by itself.</div>
          {message && <div className="text-xs text-bad">{message}</div>}
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
