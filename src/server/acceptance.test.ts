// P1.5, server half: histories live in the database file, so a new engine and app over the same file is a restart.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { openDatabase } from "./db/index.js";
import { type ScriptedFixture, ScriptedModel } from "./model/scripted.js";
import { RunEngine } from "./runs.js";

type Transcript = { status: string; stopReason: string | null; events: { type: string; data: string }[] }[];

function start(file: string, turns: ScriptedFixture["turns"]) {
  const db = openDatabase(file);
  const engine = new RunEngine(db, new ScriptedModel({ turns }));
  engine.recoverInterrupted();
  const app = createApp({ db, engine });
  const json = async <T>(path: string, body?: unknown) => {
    const res = await app.request(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return (await res.json()) as T;
  };
  const send = async (channelId: string, text: string) => {
    const run = await json<{ id: string }>(`/api/channels/${channelId}/runs`, { text });
    await engine.whenSettled(run.id);
  };
  const transcript = (channelId: string) => json<Transcript>(`/api/channels/${channelId}/runs`);
  return { json, send, transcript };
}

const texts = (t: Transcript, type: string) =>
  t.flatMap((run) =>
    run.events.filter((e) => e.type === type).map((e) => (JSON.parse(e.data) as { text?: string }).text),
  );

describe("two channels across a restart", () => {
  it("keep separate histories, show a failed run's error, and keep working", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "brindle-accept-")), "t.sqlite");
    const before = start(file, [
      { text: ["Plans reply."] },
      { fail: { kind: "unavailable", message: "scripted outage" } },
    ]);
    const plans = await before.json<{ id: string }>("/api/channels", { name: "Plans" });
    const cooking = await before.json<{ id: string }>("/api/channels", { name: "Cooking" });
    await before.send(plans.id, "Plan the week.");
    await before.send(cooking.id, "Soup ideas.");

    // The model script starts over after a restart, which also proves no reply is replayed from memory.
    const after = start(file, [{ text: ["Soup, take two."] }]);

    const planRuns = await after.transcript(plans.id);
    expect(texts(planRuns, "message")).toEqual(["Plan the week."]);
    expect(texts(planRuns, "text")).toEqual(["Plans reply."]);

    const cookRuns = await after.transcript(cooking.id);
    expect(texts(cookRuns, "message")).toEqual(["Soup ideas."]);
    expect(texts(cookRuns, "text")).toEqual([]);
    expect(cookRuns[0]?.status).toBe("failed");
    expect(cookRuns[0]?.events.map((e) => e.type)).toContain("error");

    await after.send(cooking.id, "Try again.");
    const cookAgain = await after.transcript(cooking.id);
    expect(cookAgain.map((r) => r.status)).toEqual(["failed", "done"]);
    expect(texts(cookAgain, "text")).toEqual(["Soup, take two."]);
    expect(texts(await after.transcript(plans.id), "message")).toEqual(["Plan the week."]);
  });
});
