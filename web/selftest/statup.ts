// Dev-only check: one stat raise, logging every message the server sends back.
import { Msg } from "../../shared/protocol.ts";
import { joinAs } from "../../client/scripts/bot.ts";

const { room: r } = await joinAs(process.argv[2] ?? "http://localhost:2567", "statup_bot", "statup_c", true);
const seen: string[] = [];
r.onMessage("*", (type: unknown, m: unknown) => { seen.push(`${String(type)} ${JSON.stringify(m).slice(0, 120)}`); });
await new Promise((ok) => setTimeout(ok, 500));
console.log("before:", seen.length, "messages", seen.map((s) => s.split(" ")[0]).join(","));
seen.length = 0;
r.send(Msg.statUp, { stat: "str" });
await new Promise((ok) => setTimeout(ok, 1000));
console.log("after statUp:", seen.join(" | "));
seen.length = 0;
const t0 = performance.now();
for (const stat of ["str", "agi", "dex"] as const) for (let i = 0; i < 8; i++) r.send(Msg.statUp, { stat });
for (let i = 0; i < 30; i++) {
  await new Promise((ok) => setTimeout(ok, 100));
  const acks = seen.filter((s) => s.startsWith("statUpAck")).length;
  if (acks >= 24 || i === 29) { console.log(`burst: ${acks} acks after ${Math.round(performance.now() - t0)} ms; last: ${seen.filter((s) => s.startsWith("status")).at(-1)}`); break; }
}
process.exit(0);
