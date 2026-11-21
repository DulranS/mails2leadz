// Print agent: a small program for the computer that the kitchen or till printer is plugged into or can be reached from on the
// local network. The app sends it printer bytes; it passes them on to the printer on TCP port 9100 (the usual port for network
// thermal printers). It listens only on this computer (127.0.0.1), only accepts requests from your app's address, and only sends to
// private-network printer addresses. Run it with:
//   PRINT_AGENT_TOKEN=<a secret of at least 16 characters> PRINT_AGENT_ORIGIN=<your app's address, such as https://your-app.example> npx tsx scripts/print-agent.ts
// The same token is typed into Settings > Kitchen printer on the device that prints.
import http from "node:http";
import net from "node:net";
import {
  constantTimeEqual,
  DEFAULT_PRINTER_PORT,
  isPrivateIPv4,
  isValidPrinterPort,
  isValidToken,
  MAX_PRINT_BYTES,
} from "../lib/printAgentRules";

const token = (process.env.PRINT_AGENT_TOKEN ?? "").trim();
const origin = (process.env.PRINT_AGENT_ORIGIN ?? "").trim().replace(/\/$/, "");
const port = Number(process.env.PRINT_AGENT_PORT ?? 9101);
if (!isValidToken(token)) {
  console.error("Set PRINT_AGENT_TOKEN to a secret of at least 16 characters.");
  process.exit(1);
}
if (!origin.startsWith("https://") && !origin.startsWith("http://localhost")) {
  console.error("Set PRINT_AGENT_ORIGIN to your app's address, such as https://your-app.example.");
  process.exit(1);
}

function corsHeaders(reqOrigin: string) {
  return {
    "Access-Control-Allow-Origin": reqOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-print-token",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
  };
}

function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_PRINT_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

function sendToPrinter(host: string, printerPort: number, bytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: printerPort, timeout: 5000 });
    socket.once("connect", () => socket.end(bytes));
    socket.once("close", () => resolve());
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("The printer did not answer in time."));
    });
    socket.once("error", (e) => reject(new Error(`The printer could not be reached: ${e.message}`)));
  });
}

const server = http.createServer(async (req, res) => {
  const reqOrigin = String(req.headers.origin ?? "");
  const allowed = reqOrigin === origin;
  if (req.method === "OPTIONS") {
    res.writeHead(allowed ? 204 : 403, allowed ? corsHeaders(reqOrigin) : {});
    res.end();
    return;
  }
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", ...(allowed ? corsHeaders(reqOrigin) : {}) });
    res.end(JSON.stringify(body));
  };
  if (!allowed) return json(403, { error: "This app is not allowed to use the printer agent." });
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method !== "POST" || url.pathname !== "/print") return json(404, { error: "Not found." });
  if (!constantTimeEqual(String(req.headers["x-print-token"] ?? ""), token)) return json(401, { error: "The printer token is wrong." });

  const host = (url.searchParams.get("host") ?? "").trim();
  const printerPort = url.searchParams.get("port") ? Number(url.searchParams.get("port")) : DEFAULT_PRINTER_PORT;
  if (!isPrivateIPv4(host)) return json(400, { error: "The printer address must be a private network address, such as 192.168.1.50." });
  if (!isValidPrinterPort(printerPort)) return json(400, { error: "The printer port must be a number from 1 to 65535." });

  const bytes = await readBody(req);
  if (!bytes) return json(413, { error: "That print job is too large." });
  if (bytes.length === 0) return json(400, { error: "Nothing to print." });
  try {
    await sendToPrinter(host, printerPort, bytes);
    json(200, { ok: true });
  } catch (e) {
    json(502, { error: e instanceof Error ? e.message : "The printer could not be reached." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Print agent listening on http://127.0.0.1:${port} for ${origin}`);
});
