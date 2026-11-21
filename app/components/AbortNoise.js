"use client";
// Pass 359b. A request or a live data listener that is cancelled when a page closes or navigates rejects with an AbortError. The browser
// reports that as an unhandled rejection, so the console shows a failure where nothing failed. This ignores AbortError only. Every other
// rejection still reaches the console and the error boundaries.
import { useEffect } from "react";

export default function AbortNoise() {
  useEffect(() => {
    const onRejection = (event) => {
      if (event?.reason?.name === "AbortError") event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  return null;
}
