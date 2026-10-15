import { describe, expect, it } from "vitest";
import { createApp, recordFirstStart, type Greeting } from "./app.js";
import { openDatabase } from "./db/index.js";

describe("GET /api/greeting", () => {
  it("greets with the time of the first start, which later starts do not move", async () => {
    const db = openDatabase(":memory:");
    recordFirstStart(db, new Date("2026-01-02T03:04:05.000Z"));
    recordFirstStart(db, new Date("2026-06-07T08:09:10.000Z"));

    const res = await createApp({ db }).request("/api/greeting");

    expect(res.status).toBe(200);
    const body = (await res.json()) as Greeting;
    expect(body.message).toBe("Hello from Bridle.");
    expect(body.since).toBe("2026-01-02T03:04:05.000Z");
  });
});
