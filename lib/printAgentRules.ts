// Rules shared by the print agent (scripts/print-agent.ts, runs on the computer next to the printer) and the app's browser code.
// Pure. The agent only prints to a private-network address on the usual printer port, so it cannot be used to reach other machines.

export const DEFAULT_AGENT_URL = "http://127.0.0.1:9101";
export const DEFAULT_PRINTER_PORT = 9100;
export const MAX_PRINT_BYTES = 64 * 1024;
export const MIN_TOKEN_LENGTH = 16;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// A printer on the local network: 10.x, 172.16-31.x or 192.168.x. Anything else (including public addresses and host names) is refused.
export function isPrivateIPv4(host: string): boolean {
  const m = IPV4.exec(host.trim());
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
}

export function isValidPrinterPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function isValidToken(token: string): boolean {
  return token.length >= MIN_TOKEN_LENGTH;
}

// Compares two strings without stopping at the first difference, so timing does not reveal the token.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The browser only sends the token to the agent on this computer, never to an address on the internet.
export function isLoopbackAgentUrl(url: string): boolean {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(url.trim());
}
