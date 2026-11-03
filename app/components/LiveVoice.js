import React, { useRef, useState } from "react";

// A live voice conversation in the browser (owner's test and demo). The audio goes straight to the voice service;
// this component only gets a short-lived key from the server.
export default function LiveVoice() {
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(false);
  const ref = useRef({});

  const stop = () => {
    try { ref.current.pc?.close(); } catch { /* already closed */ }
    try { ref.current.mic?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
    ref.current = {};
    setActive(false);
    setStatus("Stopped.");
  };

  const start = async () => {
    setStatus("Starting...");
    try {
      const res = await fetch("/api/voice/live-session", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus(data.error || "Live voice could not start."); return; }
      const pc = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));
      ref.current = { pc, mic };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const r = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(data.model || "gpt-realtime")}`, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${data.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!r.ok) { stop(); setStatus("The voice service refused the connection."); return; }
      await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
      setActive(true);
      setStatus("Live. Speak to start.");
    } catch (e) {
      stop();
      setStatus("Could not use the microphone or connect. Check the browser's microphone permission.");
    }
  };

  return (
    <section aria-label="Live voice" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Live voice</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">A live voice conversation from this browser. Turn it on in Account first. It does not quote prices, promise results or take payments.</p>
      <div className="mt-2 flex items-center gap-2">
        {active ? (
          <button type="button" onClick={stop} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm">End</button>
        ) : (
          <button type="button" onClick={start} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm">Start live voice</button>
        )}
        {status ? <span className="text-xs text-gray-600 dark:text-gray-300">{status}</span> : null}
      </div>
    </section>
  );
}
