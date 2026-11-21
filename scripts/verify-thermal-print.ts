// Thermal printing (lib/escpos.ts, lib/printAgentRules.ts, lib/tabBill.ts, lib/thermalPrint.ts) and the print agent's rules:
// the printer bytes for a ticket and a bill, the text rules (accents, wrapping, right-aligned rows), the private-network and
// token rules, and the wiring of the pages and the agent. Hand-worked values throughout.
// Run: npx tsx scripts/verify-thermal-print.ts
import fs from "node:fs";
import { asciiOnly, billLines, kitchenTicketLines, renderTicket, rowText, wrapText } from "../lib/escpos";
import {
  constantTimeEqual,
  isLoopbackAgentUrl,
  isPrivateIPv4,
  isValidPrinterPort,
  isValidToken,
  MAX_PRINT_BYTES,
} from "../lib/printAgentRules";
import { tabBillHtml } from "../lib/tabBill";
import { validatePrinterConfig } from "../lib/thermalPrint";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const asText = (b: Uint8Array) => Buffer.from(b).toString("latin1");

// --- text rules
ok(asciiOnly("Café crème") === "Cafe creme", "accents are folded to plain letters");
ok(asciiOnly("Rs. 500 ✓") === "Rs. 500 ?", "anything the printer cannot draw becomes ?");
ok(JSON.stringify(wrapText("one two three four", 9)) === '["one two","three","four"]', "words wrap onto new lines inside the width");
ok(JSON.stringify(wrapText("abcdefghijkl", 5)) === '["abcde","fghij","kl"]', "a word longer than the line is split");
ok(rowText("TOTAL", "100.00", 32) === "TOTAL" + " ".repeat(32 - 5 - 6) + "100.00", "a row puts the right text at the right edge of 32 characters");
ok(rowText("TOTAL", "100.00", 32).length === 32, "a row is exactly the paper width");
ok(rowText("A very long dish name that goes on and on", "250.00", 32).endsWith("250.00") && rowText("A very long dish name that goes on and on", "250.00", 32).length === 32, "long left text is cut so the amount always shows");

// --- ticket bytes
const ticket = renderTicket(
  kitchenTicketLines("Table 4", "19:20", "new", [{ qty: 2, name: "Chicken rice" }, { qty: 1, name: "Café latte" }]),
  42
);
ok(ticket[0] === 0x1b && ticket[1] === 0x40, "a ticket starts by resetting the printer (ESC @)");
ok(Array.from(ticket.slice(-4)).join(",") === "29,86,66,3", "a ticket ends with a feed and cut (GS V B 3)");
const text = asText(ticket);
ok(text.includes("2 x Chicken rice") && text.includes("1 x Cafe latte"), "items print with their quantities, accents folded");
ok(text.includes("Table 4"), "the table prints");
ok(Array.from(ticket).some((b, i) => b === 0x1d && ticket[i + 1] === 0x21 && ticket[i + 2] === 0x11), "the table name is printed in double size");
ok(Array.from(ticket).some((b, i) => b === 0x1b && ticket[i + 1] === 0x45 && ticket[i + 2] === 1), "items are printed in bold");

// --- bill bytes
const bill = renderTicket(
  billLines({
    heading: "Balancr Cafe",
    table: "Table 4",
    date: "2026-11-01",
    items: [{ qty: 2, name: "Chicken rice", unitPrice: 450 }, { qty: 1, name: "Latte", unitPrice: 300.5 }],
    total: 1200.5,
    currency: "LKR",
    footer: "Thank you",
  }),
  32
);
const billText = asText(bill);
ok(billText.includes("2 x Chicken rice") && billText.includes("900.00"), "each bill line shows quantity and amount (2 x 450 = 900.00)");
ok(billText.includes("TOTAL") && billText.includes("LKR 1200.50"), "the bill shows the total in the currency");
ok(billText.includes("Thank you"), "the bill shows the footer");
const totalLine = billText.split("\n").find((l) => l.includes("TOTAL")) ?? "";
ok(totalLine.slice(totalLine.indexOf("TOTAL")).length === 32, "the total line fills the 32-character paper exactly");

// --- bill HTML escapes text
const html = tabBillHtml({ heading: "<b>Shop</b>", table: "T1", date: "2026-11-01", items: [{ qty: 1, name: "<script>x</script>", unitPrice: 5 }], total: 5, currency: "LKR" });
ok(!html.includes("<script>x</script>") && html.includes("&lt;script&gt;"), "bill HTML escapes names so nothing runs");
ok(html.includes("LKR 5.00"), "bill HTML shows the total");

// --- printer address and port
ok(isPrivateIPv4("192.168.1.50") && isPrivateIPv4("10.0.0.5") && isPrivateIPv4("172.16.4.1") && isPrivateIPv4("172.31.255.1"), "private network printer addresses are accepted");
ok(!isPrivateIPv4("8.8.8.8") && !isPrivateIPv4("172.32.0.1") && !isPrivateIPv4("printer.local") && !isPrivateIPv4("999.1.1.1") && !isPrivateIPv4("127.0.0.1"), "public addresses, host names, out-of-range octets and loopback are refused");
ok(isValidPrinterPort(9100) && !isValidPrinterPort(0) && !isValidPrinterPort(70000) && !isValidPrinterPort(91.5), "printer port must be a whole number from 1 to 65535");
ok(isValidToken("0123456789abcdef") && !isValidToken("short"), "the token must be at least 16 characters");
ok(constantTimeEqual("abc", "abc") && !constantTimeEqual("abc", "abd") && !constantTimeEqual("abc", "abcd"), "token comparison is exact");
ok(isLoopbackAgentUrl("http://127.0.0.1:9101") && isLoopbackAgentUrl("http://localhost:9101") && !isLoopbackAgentUrl("https://evil.example.com"), "the token is only ever sent to this computer");
ok(MAX_PRINT_BYTES === 64 * 1024, "print jobs are capped in size");

// --- browser settings check
ok(validatePrinterConfig({ agentUrl: "http://127.0.0.1:9101", token: "0123456789abcdef", host: "192.168.1.50", port: 9100 }) === null, "a complete printer setup is accepted");
ok(validatePrinterConfig({ agentUrl: "https://app.example.com", token: "0123456789abcdef", host: "192.168.1.50", port: 9100 }) !== null, "an agent address off this computer is refused");
ok(validatePrinterConfig({ agentUrl: "http://127.0.0.1:9101", token: "0123456789abcdef", host: "8.8.8.8", port: 9100 }) !== null, "a public printer address is refused");

// --- wiring
const agent = fs.readFileSync("scripts/print-agent.ts", "utf8");
ok(agent.includes('server.listen(port, "127.0.0.1"'), "the agent listens on this computer only");
ok(agent.includes("reqOrigin === origin") && agent.includes("constantTimeEqual") && agent.includes("MAX_PRINT_BYTES"), "the agent checks the app, the token and the size");
ok(agent.includes("isPrivateIPv4(host)") && agent.includes("isValidPrinterPort(printerPort)"), "the agent only sends to private printer addresses");
ok(agent.includes("Access-Control-Allow-Private-Network"), "the agent allows the browser's private network request");
const kitchen = fs.readFileSync("app/kitchen/page.tsx", "utf8");
ok(kitchen.includes("printJob({") && kitchen.includes("renderTicket(kitchenTicketLines"), "the kitchen prints to the printer first");
const tabs = fs.readFileSync("app/tabs/page.tsx", "utf8");
ok(tabs.includes("printBill") && tabs.includes("Print bill"), "tabs has a Print bill button");
ok(tabs.includes("billLines(doc)") && tabs.includes("tabBillHtml(doc)"), "the bill prints to the printer or the browser");
const settings = fs.readFileSync("app/settings/page.tsx", "utf8");
ok(settings.includes("<PrinterSetup />"), "settings has the printer setup");
const thermal = fs.readFileSync("lib/thermalPrint.ts", "utf8");
ok(thermal.includes('"x-print-token": c.token') && !thermal.includes("token=") && thermal.includes("validatePrinterConfig"), "the token goes in a header and only after the address is checked");

console.log(`verify-thermal-print: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
