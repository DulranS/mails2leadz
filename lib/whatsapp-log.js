// lib/whatsapp-log.js - tells the server that a WhatsApp conversation with a lead was opened (fire and forget; never blocks the chat).
export function logWhatsAppOpen({ email = "", number = "" } = {}) {
  try {
    fetch("/api/whatsapp/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, number }) }).catch(() => {});
  } catch { /* the conversation still opens */ }
}
