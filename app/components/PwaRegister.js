"use client";
// Registers the service worker that makes the app installable. It caches nothing.
import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
