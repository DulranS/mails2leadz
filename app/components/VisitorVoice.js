import React, { useRef, useState } from "react";

// Live voice on the public site: a visitor can talk to the business's assistant. The server only issues a short-lived key.
export default function VisitorVoice({ siteKey }) {
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(false);
  const ref = useRef({});

  const stop = () => {
    try { ref.current.pc?.close(); } catch { /* already closed */ }
    try { ref.current.mic?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
    ref.current = {};
    setActive(false);
    setStatus("Ended.");
  };

  const start = async () => {
    setStatus("Connecting...");
    try {
      const res = await fetch("/api/voice/visitor-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: siteKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setStatus(data.error || "Voice chat could not start."); return; }
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
        method: "POST", body: offer.sdp, headers: { Authorization: `Bearer ${data.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!r.ok) { stop(); setStatus("The voice service refused the connection."); return; }
      await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
      setActive(true);
      setStatus("Connected. Go ahead and speak.");
    } catch (e) {
      stop();
      setStatus("Could not use the microphone or connect. Check the microphone permission.");
    }
  };

  return (
    <div className="mx-4 my-3 flex flex-wrap items-center gap-2 text-sm">
      {active ? (
        <button type="button" onClick={stop} className="px-3 py-1.5 rounded border border-gray-300 text-sm">End voice chat</button>
      ) : (
        <button type="button" onClick={start} className="px-3 py-1.5 rounded border border-gray-300 text-sm">Talk to us by voice</button>
      )}
      {status ? <span className="text-xs text-gray-600">{status}</span> : null}
    </div>
  );
}
