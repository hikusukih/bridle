import { describe, expect, it } from "vitest";
import { loadScenarios } from "./load.js";
import { runScenario } from "./runner.js";

// CI runs every scenario against the scripted model, so the plumbing is checked on every PR.
describe("eval scenarios (scripted model)", () => {
  const scenarios = loadScenarios();

  it("finds scenarios", () => {
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it.each(scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    const result = await runScenario(scenario);
    expect(result.failures).toEqual([]);
  });

  it("reports a failure when an expectation is not met", async () => {
    const result = await runScenario({
      name: "deliberate mismatch",
      description: "The runner must be able to fail.",
      messages: ["hi"],
      script: { turns: [{ text: ["Hello."] }] },
      expect: [{ status: "failed", replyIncludes: ["Goodbye"] }],
    });
    expect(result.failures).toHaveLength(2);
  });
});
