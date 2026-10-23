import { readdirSync, readFileSync } from "node:fs";
import type { Scenario } from "./runner.js";

const dir = new URL("./scenarios/", import.meta.url);

export function loadScenarios(): Scenario[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Scenario);
}
