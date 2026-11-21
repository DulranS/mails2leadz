// Recorded SOP videos and new-hire procedure training (lib/procedureTraining.ts).
import { cleanVideoUrl, procedureTrainingTasks, readAtCurrentVersion, videoUrlOrUndefined } from "../lib/procedureTraining";
import type { StaffProcedure } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const proc = (title: string, version: number, acks: StaffProcedure["acks"] = {}, videoUrl?: string): StaffProcedure => ({
  id: title, title, body: "1. Unlock the door", version, acks, videoUrl, createdAt: 0, updatedAt: 0,
});

const good = cleanVideoUrl("https://drive.google.com/file/d/abc/view");
ok(good.ok && good.url !== undefined, "an https link is accepted");
ok(cleanVideoUrl("").ok && cleanVideoUrl("").ok && (cleanVideoUrl("") as { url?: string }).url === undefined, "an empty link means no video");
ok(!cleanVideoUrl("http://example.com/v").ok, "plain http is refused");
ok(!cleanVideoUrl("javascript:alert(1)").ok, "a javascript link is refused");
ok(!cleanVideoUrl("https://user:pw@example.com/v").ok, "a link with a username or password is refused");
ok(!cleanVideoUrl("not a link").ok, "text that is not an address is refused");
ok(!cleanVideoUrl("https://example.com/" + "a".repeat(500)).ok, "a very long link is refused");
ok(videoUrlOrUndefined("http://x.com") === undefined && videoUrlOrUndefined("https://x.com/v") !== undefined, "only an allowed link is stored");

const fresh = proc("Opening the shop", 2, { a: { name: "Priya", version: 2, at: 1 } });
ok(readAtCurrentVersion(fresh, "priya"), "a person who read the current version is matched by name, ignoring case");
ok(!readAtCurrentVersion(proc("Opening the shop", 3, { a: { name: "Priya", version: 2, at: 1 } }), "Priya"), "a new version has to be read again");
ok(!readAtCurrentVersion(fresh, "Sam"), "someone else's reading does not count");

const todo = procedureTrainingTasks("Priya", "2026-11-16", [fresh, proc("Closing the shop", 1)]);
ok(todo !== null && todo.length === 1 && todo[0].title === "Read and confirm: Closing the shop", "only procedures not read at their current version become tasks");
ok(todo !== null && todo[0].dueDate === "2026-11-17" && todo[0].assigneeName === "Priya" && todo[0].assigneeKind === "outside", "the first task is due the day after the start, for the new person");
const withVideo = procedureTrainingTasks("Sam", "2026-11-16", [proc("Till", 1, {}, "https://youtu.be/x1")]);
ok(withVideo !== null && (withVideo[0].details ?? "").includes("https://youtu.be/x1"), "a task points to the recorded video when there is one");
ok(procedureTrainingTasks("", "2026-11-16", []) === null && procedureTrainingTasks("Sam", "16/11/2026", []) === null, "no name, or a bad start date, makes no plan");

const many = Array.from({ length: 20 }, (_, i) => proc(`Step ${i}`, 1));
const plan = procedureTrainingTasks("Sam", "2026-11-16", many);
ok(plan !== null && plan.length === 20 && plan[19].dueDate === "2026-11-30", "tasks are spread over at most fourteen days");

console.log(`verify-procedure-training: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
