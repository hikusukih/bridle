import { readFileSync } from "node:fs";
import type { ModelAdapter } from "./adapter.js";
import { type ScriptedFixture, ScriptedModel } from "./scripted.js";

/**
 * Builds the model named by configuration. Returns undefined when none is configured, so the server
 * still starts and starting a run answers 503. Misconfiguration throws: failing at startup beats
 * failing on the first message.
 */
export function modelFromEnv(
  env: Record<string, string | undefined>,
  readFixture: (path: string) => string = (path) => readFileSync(path, "utf8"),
): ModelAdapter | undefined {
  const name = env.BRIDLE_MODEL?.trim();
  if (!name) return undefined;
  if (name !== "scripted") throw new Error(`BRIDLE_MODEL "${name}" is not supported yet; use "scripted".`);

  const path = env.BRIDLE_SCRIPTED_FIXTURE?.trim();
  if (!path) throw new Error("BRIDLE_MODEL=scripted needs BRIDLE_SCRIPTED_FIXTURE, the path to a fixture JSON file.");
  const fixture = JSON.parse(readFixture(path)) as ScriptedFixture;
  if (!Array.isArray(fixture?.turns)) throw new Error(`${path} is not a scripted fixture: expected a "turns" array.`);
  return new ScriptedModel(fixture);
}
