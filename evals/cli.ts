// Usage: npm run evals [-- <scenario-name-substring>]
// Add `--live` to run against a real model: it is built from the same configuration as the server, so set
// BRINDLE_MODEL (such as openai:<model>) and the matching key. This costs money; run it when a harness change
// could move results.

import type { ModelAdapter } from "../src/server/model/adapter.js";
import { modelRegistry } from "../src/server/model/config.js";
import { loadScenarios } from "./load.js";
import { runScenario } from "./runner.js";

const args = process.argv.slice(2);
const live = args.includes("--live");
const filter = args.find((a) => !a.startsWith("--"));

let model: ModelAdapter | undefined;
if (live) {
  try {
    model = modelRegistry(process.env).resolve(null);
  } catch (err) {
    console.error(`--live needs a configured model: ${(err as Error).message}`);
    process.exit(2);
  }
}

let failed = 0;
for (const scenario of loadScenarios().filter((s) => !filter || s.name.includes(filter))) {
  const result = await runScenario(scenario, model);
  if (result.failures.length) {
    failed++;
    console.log(`FAIL ${result.name}`);
    for (const f of result.failures) console.log(`  ${f}`);
  } else {
    console.log(`ok   ${result.name}`);
  }
}
process.exit(failed ? 1 : 0);
