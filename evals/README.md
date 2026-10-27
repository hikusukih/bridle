# Evals

Scenarios in `scenarios/*.json` replay conversations against the harness: a channel, a list of user messages, a script for the scripted model, and per-run expectations (final status, stop reason, text the reply must contain, and in scripted mode the exact event types). To add one, drop a JSON file in `scenarios/`; its shape is the `Scenario` type in `runner.ts`.

CI runs every scenario against the scripted model as part of `npm test` (`evals.test.ts`), so the plumbing is checked on every PR.

To run them by hand: `npm run evals`, optionally with a name filter (`npm run evals -- step-limit`).

To run them against a real model, which costs money and is worth doing when a harness change could move the results: set `BRINDLE_EVAL_MODEL_MODULE` to a module whose default export is a function returning a `ModelAdapter`, then `npm run evals -- --live`. The script is ignored in live mode, so write expectations that any reasonable reply satisfies. Once the adapters and per-channel model choice land (P2.2, P2.2a), a built-in way to pick a model can replace the module.
