import { eq } from "drizzle-orm";
import { createChannel } from "../src/server/channels.js";
import { openDatabase } from "../src/server/db/index.js";
import { events } from "../src/server/db/schema.js";
import type { ModelAdapter } from "../src/server/model/adapter.js";
import { type ScriptedFixture, ScriptedModel } from "../src/server/model/scripted.js";
import { defaultLimits, RunEngine, type RunLimits } from "../src/server/runs.js";

// One scenario is one channel and a list of user messages, each sent as its own run. The expectations are
// per run, in order. `script` feeds the scripted model in CI; against a real model it is ignored, so
// expectations must hold for any reasonable reply and `eventTypes` (which pins the exact loop) is skipped.
export type RunExpectation = {
  status: "done" | "failed" | "stopped" | "cancelled";
  stopReasonIncludes?: string;
  /** Every string must appear in the concatenated reply text. */
  replyIncludes?: string[];
  /** Exact event types in order. Scripted mode only. */
  eventTypes?: string[];
};

export type Scenario = {
  name: string;
  description: string;
  messages: string[];
  script: ScriptedFixture;
  limits?: Partial<RunLimits>;
  expect: RunExpectation[];
};

export type ScenarioResult = { name: string; failures: string[] };

export async function runScenario(scenario: Scenario, live?: ModelAdapter): Promise<ScenarioResult> {
  const db = openDatabase(":memory:");
  const engine = new RunEngine(db, live ?? new ScriptedModel(scenario.script), {
    ...defaultLimits,
    ...scenario.limits,
  });
  const channel = createChannel(db, scenario.name);
  const failures: string[] = [];

  if (scenario.messages.length !== scenario.expect.length) {
    return { name: scenario.name, failures: ["messages and expect must have the same length"] };
  }

  for (const [i, text] of scenario.messages.entries()) {
    const want = scenario.expect[i];
    if (!want) continue;
    const label = `run ${i + 1}`;
    const run = engine.start(channel.id, text);
    await engine.whenSettled(run.id);
    const done = engine.get(run.id);
    const stored = db.select().from(events).where(eq(events.runId, run.id)).orderBy(events.seq).all();

    if (done.status !== want.status) failures.push(`${label}: status was ${done.status}, expected ${want.status}`);
    if (want.stopReasonIncludes && !done.stopReason?.includes(want.stopReasonIncludes)) {
      failures.push(`${label}: stop reason "${done.stopReason}" lacks "${want.stopReasonIncludes}"`);
    }
    const reply = stored
      .filter((e) => e.type === "text")
      .map((e) => String((JSON.parse(e.data) as { text?: string }).text ?? ""))
      .join("");
    for (const needle of want.replyIncludes ?? []) {
      if (!reply.includes(needle)) failures.push(`${label}: reply lacks "${needle}"`);
    }
    if (!live && want.eventTypes) {
      const types = stored.map((e) => e.type);
      if (types.join() !== want.eventTypes.join()) {
        failures.push(`${label}: events were [${types.join(", ")}], expected [${want.eventTypes.join(", ")}]`);
      }
    }
  }
  return { name: scenario.name, failures };
}
