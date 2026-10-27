import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyLegacyEnv, migrateLegacyDatabase } from "./legacy.js";

describe("applyLegacyEnv", () => {
  it("copies an old variable to the new name and warns", () => {
    const env: Record<string, string | undefined> = { BRIDLE_DATA_DIR: "/old" };
    const warnings: string[] = [];
    applyLegacyEnv(env, (m) => warnings.push(m));
    expect(env.BRINDLE_DATA_DIR).toBe("/old");
    expect(warnings).toEqual(["BRIDLE_DATA_DIR is deprecated; rename it to BRINDLE_DATA_DIR."]);
  });

  it("lets the new variable win and stays quiet when there is nothing old", () => {
    const env: Record<string, string | undefined> = { BRIDLE_MODEL: "old", BRINDLE_MODEL: "new", PORT: "1" };
    const warnings: string[] = [];
    applyLegacyEnv(env, (m) => warnings.push(m));
    expect(env.BRINDLE_MODEL).toBe("new");
    expect(warnings).toEqual([]);
  });
});

describe("migrateLegacyDatabase", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "brindle-"));

  it("renames the old database and its companions when only the old one exists", () => {
    const d = dir();
    writeFileSync(join(d, "bridle.sqlite"), "db");
    writeFileSync(join(d, "bridle.sqlite-wal"), "wal");
    migrateLegacyDatabase(d, () => {});
    expect(readFileSync(join(d, "brindle.sqlite"), "utf8")).toBe("db");
    expect(readFileSync(join(d, "brindle.sqlite-wal"), "utf8")).toBe("wal");
    expect(existsSync(join(d, "bridle.sqlite"))).toBe(false);
  });

  it("leaves both files alone when a new database already exists", () => {
    const d = dir();
    writeFileSync(join(d, "bridle.sqlite"), "old");
    writeFileSync(join(d, "brindle.sqlite"), "new");
    migrateLegacyDatabase(d, () => {});
    expect(readFileSync(join(d, "brindle.sqlite"), "utf8")).toBe("new");
    expect(existsSync(join(d, "bridle.sqlite"))).toBe(true);
  });
});
