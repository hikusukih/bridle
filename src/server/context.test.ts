import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createChannel } from "./channels.js";
import { assembleContext, ContextOverflow, keptPrompts, runContext } from "./context.js";
import { openDatabase } from "./db/index.js";
import type { Message } from "./model/adapter.js";
import { ScriptedModel } from "./model/scripted.js";
import { defaultLimits, RunEngine } from "./runs.js";

const run = (id: string, words: number): { id: string; messages: Message[] } => ({
  id,
  messages: [
    { role: "user", content: `question ${id}` },
    { role: "assistant", content: "x".repeat(words * 4) },
  ],
});

describe("assembleContext", () => {
  it("orders instructions, scope card, summary, past runs, then the current run", () => {
    const { messages, report } = assembleContext({
      past: [run("r1", 10)],
      current: [{ role: "user", content: "now" }],
      scopeCard: "Purpose: Rust",
      summary: "Earlier facts",
    });
    expect(messages.map((m) => m.role)).toEqual(["system", "system", "system", "user", "assistant", "user"]);
    expect(messages[1]?.content).toBe("Purpose: Rust");
    expect(messages[2]?.content).toContain("Earlier facts");
    expect(messages.at(-1)?.content).toBe("now");
    expect(report.layers.map((l) => l.name)).toEqual([
      "instructions",
      "scope_card",
      "summary",
      "recent_runs",
      "current_run",
    ]);
  });

  it("never exceeds its budget: drops whole oldest runs down to 40% and says so", () => {
    const past = Array.from({ length: 10 }, (_, i) => run(`r${i}`, 500));
    const { messages, report } = assembleContext({ past, current: [{ role: "user", content: "hi" }], window: 8_000 });
    const tokens = report.layers.reduce((n, l) => n + (l.name === "recent_runs" ? l.tokens : 0), 0);
    expect(report.runsDropped).toBeGreaterThan(0);
    expect(report.runsIncluded + report.runsDropped).toBe(10);
    expect(report.breaks).toContain("emergency_drop");
    expect(report.overflow[0]?.layer).toBe("recent_runs");
    // The newest runs survive, and each kept run is whole.
    expect(report.lastRunId).toBe("r9");
    expect(messages.filter((m) => m.role === "user")).toHaveLength(report.runsIncluded + 1);
    expect(tokens).toBeLessThan(report.budget);
  });

  it("is byte-stable: the same inputs plus one new message keep the earlier request as a prefix", () => {
    const past = [run("r1", 20)];
    const a = assembleContext({ past, current: [{ role: "user", content: "q" }] }).messages;
    const b = assembleContext({
      past,
      current: [
        { role: "user", content: "q" },
        { role: "assistant", content: "a" },
      ],
    }).messages;
    expect(JSON.stringify(b).startsWith(JSON.stringify(a).slice(0, -1))).toBe(true);
  });

  it("refuses to send a request over the window", () => {
    const big: Message[] = [{ role: "user", content: "x".repeat(200_000) }];
    expect(() => assembleContext({ past: [], current: big, window: 8_000 })).toThrow(ContextOverflow);
  });
});

describe("the run engine and context", () => {
  function setup(limits: Partial<typeof defaultLimits> = {}, turns = 1) {
    const db = openDatabase(":memory:");
    const model = new ScriptedModel({ turns: Array.from({ length: turns }, () => ({ text: ["ok"] })) });
    const engine = new RunEngine(db, model, { ...defaultLimits, ...limits });
    return { db, model, engine, channel: createChannel(db, "C"), app: createApp({ db, engine }) };
  }

  it("stores a report for each request and serves it", async () => {
    const { db, engine, channel, app } = setup();
    const r = engine.start(channel.id, "hello");
    await engine.whenSettled(r.id);
    const stored = runContext(db, r.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.messages?.at(-1)).toEqual({ role: "user", content: "hello" });
    const res = await app.request(`/api/runs/${r.id}/context`);
    expect(((await res.json()) as unknown[]).length).toBe(1);
  });

  it("ends a run that cannot fit with a visible reason and sends nothing", async () => {
    const { db, model, engine, channel } = setup({ contextWindow: 5_000 });
    const r = engine.start(channel.id, "x".repeat(40_000));
    await engine.whenSettled(r.id);
    expect(engine.get(r.id)).toMatchObject({
      status: "stopped",
      stopReason: "this run ran out of room in the model's window",
    });
    expect(model.requests).toHaveLength(0);
    expect(runContext(db, r.id)[0]?.report.overflow[0]?.layer).toBe("current_run");
  });

  it("keeps the exact messages for only the newest 20 runs of a channel", async () => {
    const { db, engine, channel } = setup({}, keptPrompts + 2);
    const ids: string[] = [];
    for (let i = 0; i < keptPrompts + 2; i++) {
      const r = engine.start(channel.id, `m${i}`, new Date(Date.now() + i * 1000));
      await engine.whenSettled(r.id);
      ids.push(r.id);
    }
    expect(runContext(db, ids[0] as string)[0]?.messages).toBeNull();
    expect(runContext(db, ids[0] as string)[0]?.report.window).toBeGreaterThan(0);
    expect(runContext(db, ids.at(-1) as string)[0]?.messages).not.toBeNull();
  });
});
