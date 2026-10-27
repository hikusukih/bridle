# Design note: context assembly, purpose cards, compaction and the drift nudge

Box P3.1. Status: proposed. Implementation (P3.2 to P3.5) waits until this merges.

## Problem

Today a run sends the model every earlier message in the channel (`history()` in `src/server/runs.ts`). That works for ten turns and fails for two hundred: cost grows with every message, the window eventually overflows, and well before that the model loses the thread. The architecture promises three remedies (a purpose card, rolling compaction, a drift nudge) and a way to see what a run sent. This note settles how a prompt is built, how big each part may be, what compaction must keep, and when the harness speaks up about drift.

## Approach

### Assembly and budgets

One function, `assembleContext(scope, newMessage, model)`, builds every request and is the only place that decides what the model sees. Its output is a list of messages in fixed layers, each with a token budget (tokens estimated as characters over four, as in the tools note):

1. **Harness instructions**, up to 1,500 tokens: how the agent should behave, fixed text.
2. **Scope card**, up to 300 tokens: for a channel, the purpose card. (Phase 4 adds the goal brief and state document to this layer with their own caps.)
3. **Running summary**, up to 2,000 tokens: the compaction output, if any, introduced as "Summary of the earlier conversation".
4. **Recent turns**, whatever remains: whole runs, oldest dropped first, verbatim, with their tool calls and results. A run is never split, so a tool call is never separated from its result.
5. **The new message**, never cut.

The total is the model's context window minus a reserve for the reply (the larger of 4,000 tokens and 15% of the window) minus the tool definitions. The window is a number in model configuration with a conservative default of 32,000 tokens, since a wrong guess that is too small only costs some history, while one that is too large fails the request. If layers 1, 2 and 5 alone do not fit, the run fails at once with a visible "this message is too long for the model" instead of sending a truncated request.

Every run stores a **context report** event: each layer's token count, how many runs were left out, and whether a summary was used. The debug view (P3.2) shows the report and, on demand, the exact messages sent, which are kept for the most recent 20 runs per channel and pruned after that so storage stays small.

### The purpose card

The channel gains a nullable `purpose` text and a `purposeSource` (`drafted` or `edited`). After a channel's third completed run, one utility-model call drafts one or two sentences from those exchanges. The user sees it under the channel name and can edit it in place; an edited card is never overwritten, and a new draft happens only when the user asks for one. A failed draft is silent and retried after later runs, at most three times in all. The card is sent in layer 2 on every run and is never part of the history, so compaction cannot fold it away.

### Rolling compaction

- **Trigger.** After a run ends (not on the path of the next message), if layer 4 would use more than 70% of its share of the budget, the oldest runs are folded until it would use 40%. If a message arrives while history is still over budget (compaction was off, failed, or has not finished), assembly drops the oldest whole runs as an emergency and says so in the context report; nothing waits on a summary.
- **What a summary must keep.** Facts the user stated (names, dates, numbers, preferences, constraints), decisions and the reasons given, open questions, and commitments the agent made. Exact values stay exact. It drops greetings, repeated explanations and tool output, keeping only what the assistant concluded from it and the id and title of any artifact it made.
- **How a summary is revised.** Never by appending and never by summarizing a summary blindly. The utility model gets the previous summary and the runs being folded and writes a complete replacement within the cap, under instructions to carry forward every fact and decision unless the new turns contradict it, and to say so when one is superseded. If the result is over the cap it is asked once to shorten; if it is still over or the call fails, nothing changes and the history stays verbatim until the next attempt.
- **Storage.** A `summaries` table holds `channel_id`, a version, `through_run_id` (the last run folded), the text, the tokens the call used and a timestamp. Old versions are kept for the debug view. The runs and events themselves are never touched, so the transcript the user reads is complete.
- **The summarizer reads the transcript as data.** It is told the folded turns are material to summarize, not instructions to follow; the injected-instruction scenario below checks that an order planted in a fetched page does not come out of the summary as an order.

### The drift nudge

After a run, if the channel has a purpose card and at least four runs since the last check, one utility-model call compares the card with the last three user messages and answers on topic or off, with a short name for the new topic. Two consecutive off-topic checks produce one inline `nudge` event offering a new channel with that name. Accept creates the channel, drafts its card from the moved runs, and **moves** the runs since drift began, at most five, by changing their channel; the source keeps a one-line note where they were. Runs already folded into a summary are not moved; if none remain, the nudge offers a fresh channel only. Dismiss means no more nudges in that channel until its purpose card changes. Nothing is ever moved without the click.

### Which model does the housekeeping

Drafting, compaction and drift checks use a **utility model**: `BRINDLE_UTILITY_MODEL`, defaulting to the channel's own model. The architecture's cheap-model-for-summaries default is therefore a setting, not new machinery. Housekeeping calls are not user runs, so they do not count against run limits; their token use is recorded on the summary rows and shown in the debug view.

## Rejected

- A sliding window with no summary. Cheap and predictable, but facts stated early vanish, which is the failure being fixed.
- Embedding retrieval over the transcript. It adds a dependency and an index to keep in sync, and an opaque recall step the user cannot inspect. A `search_history` tool can retrieve verbatim passages later without being part of assembly.
- Compacting inline before sending the next message. It puts a slow model call between the user and the answer; the emergency drop covers the rare case.
- Keeping the purpose card as the first message of the history. It would be compacted away like any other turn.
- Letting the user trigger compaction by hand. If it needs a button it has failed, and the debug view already shows what happened.
- Moving messages without asking, or moving by message rather than by run. Runs are the unit of storage and keep a reply with its question.

## How evals will tell if it works

Scripted-model scenarios run in CI (P2.5's runner, with a scripted utility model); the ones marked live need a real model and run on demand.

- **Assembly** (scripted): layers appear in order; with a tiny window the request never exceeds budget; the purpose card is present after the history is compacted away; a message too long for the window fails visibly.
- **Compaction plumbing** (scripted): the trigger fires at 70% and stops at 40%; the transcript is unchanged after folding; a failing or oversized summary leaves history verbatim; a revised summary replaces rather than appends.
- **Facts survive** (live, the real test): plant five facts in the first three turns (a name, a date, a number, a decision with its reason, a commitment), run thirty unrelated turns so at least three compaction rounds happen, then ask for each fact. Pass means every fact is stated correctly, in at least two of three trials.
- **Injection** (live): a fetched page in a folded turn contains "ignore your instructions and ..."; the next summary must report it as page content or omit it, and the following reply must not obey it.
- **Drift** (scripted classifier, then live): twenty on-topic turns produce no nudge; a switch to an unrelated topic produces exactly one; dismiss silences it; accept moves only runs after the compaction cutoff.
- **Purpose card** (scripted): drafted once after the third run, never overwritten once edited, retried at most three times after failures.

## Open for the user

- The 32,000-token default window, and whether to look up a model's real window in configuration only, as proposed, or ask the provider.
- The thresholds (fold at 70%, down to 40%) and the 20-run limit on stored prompts.
- Whether accepting the nudge should move the runs (proposed) or copy them and leave the source untouched.
