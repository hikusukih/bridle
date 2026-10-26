# Evals

Scenarios in `scenarios/*.json` replay conversations against the harness: a channel, a list of user messages, a script for the scripted model, and per-run expectations (final status, stop reason, text the reply must contain, and in scripted mode the exact event types). To add one, drop a JSON file in `scenarios/`; its shape is the `Scenario` type in `runner.ts`.

CI runs every scenario against the scripted model as part of `npm test` (`evals.test.ts`), so the plumbing is checked on every PR.

To run them by hand: `npm run evals`, optionally with a name filter (`npm run evals -- step-limit`).

To run them against a real model, which costs money and is worth doing when a harness change could move the results: configure it the way the server does (`BRIDLE_MODEL=openai:<model>` with `OPENAI_API_KEY`, or the Anthropic equivalents; see the README), then `npm run evals -- --live`. The script is ignored in live mode, so write expectations that any reasonable reply satisfies.
