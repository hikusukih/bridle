import { describe, expect, it } from "vitest";
import { modelFromEnv } from "./config.js";
import { ScriptedModel } from "./scripted.js";

const fixture = JSON.stringify({ turns: [{ text: ["hi"] }] });

describe("modelFromEnv", () => {
  it("returns nothing when no model is configured", () => {
    expect(modelFromEnv({})).toBeUndefined();
    expect(modelFromEnv({ BRIDLE_MODEL: " " })).toBeUndefined();
  });

  it("loads the scripted model from the fixture path", () => {
    const model = modelFromEnv({ BRIDLE_MODEL: "scripted", BRIDLE_SCRIPTED_FIXTURE: "turns.json" }, (path) => {
      expect(path).toBe("turns.json");
      return fixture;
    });
    expect(model).toBeInstanceOf(ScriptedModel);
  });

  it("fails loudly on a missing path, a bad fixture or an unknown model", () => {
    expect(() => modelFromEnv({ BRIDLE_MODEL: "scripted" })).toThrow(/BRIDLE_SCRIPTED_FIXTURE/);
    expect(() => modelFromEnv({ BRIDLE_MODEL: "scripted", BRIDLE_SCRIPTED_FIXTURE: "x" }, () => "{}")).toThrow(/turns/);
    expect(() => modelFromEnv({ BRIDLE_MODEL: "gpt" })).toThrow(/not supported/);
  });
});
