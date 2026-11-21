// Camera scan for the sale form (components/CameraScan.tsx) and the code box it feeds (components/QuickForms.tsx).
// The camera itself cannot run here, so this checks the things that must be true for it to be safe and to work where it is offered.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-camera-scan.ts
import fs from "node:fs";
import { lookupBySku } from "../lib/skuLookup";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const cam = fs.readFileSync("components/CameraScan.tsx", "utf8");
const qf = fs.readFileSync("components/QuickForms.tsx", "utf8");

// 1. Only offered where the browser can read codes and has a camera; otherwise nothing is rendered.
ok(cam.includes("if (!supported) return null;"), "the button renders nothing where the browser cannot scan");
ok(cam.includes("BarcodeDetector") && cam.includes("getUserMedia"), "it needs both a barcode detector and camera access to be offered");

// 2. The camera is switched off when a code is read, when closed, and when the component goes away.
ok(cam.includes("stream?.getTracks().forEach((t) => t.stop())"), "the camera tracks are stopped");
ok(cam.includes("return stop;"), "the camera stops when the box closes or the page leaves");
ok(cam.includes("if (code) {\n              stop();"), "the camera stops as soon as a code is read");
ok(!/localStorage|sessionStorage|fetch\(/.test(cam), "nothing is stored or sent from the camera");

// 3. A camera that is refused gives a plain message, and the typed code still works.
ok(cam.includes("The camera isn't available. Allow camera access, or type the code."), "a refused camera says what to do instead");

// 4. The sale form uses the same code path as the scanner and the typed box.
ok(qf.includes("<CameraScanButton onCode={(code) => applyScan(code)} />"), "the sale form connects the camera to the same code path");
ok(qf.includes("function applyScan(code: string = scanCode)"), "applyScan accepts the code it was given");
ok(qf.includes("lookupBySku(sellable, code)"), "the camera code is looked up exactly like a typed code");

// 5. The lookup itself: an exact, unambiguous match picks the item; anything else asks the person to choose.
const items = [{ id: "a", sku: "777" }, { id: "b", sku: "777" }, { id: "c", sku: "555" }];
ok(lookupBySku(items, "555").status === "found", "an exact code is found");
ok(lookupBySku(items, "  555 ").status === "found", "stray spaces around the code are ignored");
ok(lookupBySku(items, "777").status === "ambiguous", "two items sharing a code are never guessed");
ok(lookupBySku(items, "999").status === "none", "an unknown code is reported, not guessed");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
