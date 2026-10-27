// Usage: npm run evals [-- <scenario-name-substring>]
// Add `--live` to run against a real model: set BRINDLE_EVAL_MODEL_MODULE to a module whose default export
// is a function returning a ModelAdapter. This costs money; run it when a harness change could move results.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ModelAdapter } from "../src/server/model/adapter.js";
import { loadScenarios } from "./load.js";
import { runScenario } from "./runner.js";

const args = process.argv.slice(2);
const live = args.includes("--live");
const filter = args.find((a) => !a.startsWith("--"));

let makeModel: (() => ModelAdapter) | undefined;
if (live) {
  const path = process.env.BRINDLE_EVAL_MODEL_MODULE;
  if (!path) {
    console.error("--live needs BRINDLE_EVAL_MODEL_MODULE, a module whose default export returns a ModelAdapter.");
    process.exit(2);
  }
  makeModel = ((await import(pathToFileURL(resolve(path)).href)) as { default: () => ModelAdapter }).default;
}

let failed = 0;
for (const scenario of loadScenarios().filter((s) => !filter || s.name.includes(filter))) {
  const result = await runScenario(scenario, makeModel?.());
  if (result.failures.length) {
    failed++;
    console.log(`FAIL ${result.name}`);
    for (const f of result.failures) console.log(`  ${f}`);
  } else {
    console.log(`ok   ${result.name}`);
  }
}
process.exit(failed ? 1 : 0);
