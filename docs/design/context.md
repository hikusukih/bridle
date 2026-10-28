# Design note: context assembly, purpose cards, compaction and the drift nudge

Box P3.1. Status: proposed. Implementation (P3.2 to P3.5, and P3.11 for branching) waits until this merges. Terms such as `Run`, `Step`, `Request` and `Housekeeping call` are defined in the glossary in `docs/architecture.md`.

## Problem

Today every `Request` carries every earlier message in the channel (`history()` in `src/server/runs.ts`). That works for ten `Runs` and fails for two hundred: cost grows with every message, the window eventually overflows, and well before that the model loses the thread. The architecture promises three remedies (a purpose card, rolling compaction, a drift nudge) and a way to see what a `Run` sent. This note settles how a `Request` is built, how big each part may be, what compaction keeps, and when the harness speaks up about drift.

## Approach

### Assembly and budgets

One function, `assembleContext(scope, run, model)`, builds every `Request`, for the first `Step` of a `Run` and for each one after it, and is the only place that decides what the model sees. Its output is a list of messages in layers, each with a token budget:

1. **Harness instructions**, up to 1,500 tokens: how the agent should behave, fixed text.
2. **Scope card**, the `ScopeCard` for the `Scope`: a channel's purpose card (up to 300 tokens) or a goal's brief (up to 500; see the goals note). Both are one type, below.
3. **Running summary**, up to 2,000 tokens: the compaction output, if any, introduced as "Summary of the earlier conversation".
4. **Recent `Runs`**, whatever remains: whole `Runs`, oldest dropped first, verbatim, with their tool calls and results. A finished `Run` is never split, so a tool call is never separated from its result.
5. **The current `Run`**: the message that started it and, from the second `Step` on, its own tool calls and results so far.

The layers are ordered most static first, because that is what keeps the server's prompt cache useful (below). The order above is the starting point. Where layers that change often go, a goal's state document above all, is settled at implementation (P3.2, P4.4) by measuring cache reuse in the context report, not fixed here.

The total is the model's context window minus a reserve for the reply (the larger of 4,000 tokens and 15% of the window) minus the tool definitions. The window is a per-model setting (see model settings below), so a hosted model with a large window is not held to a local one's. When it is not set, assembly asks the server where it can (llama.cpp's server reports its per-slot context size at `/props`) and otherwise uses a default of 32,000 tokens, which suits a CPU-only llama.cpp host. A configured window larger than the one the server reports is a configuration error, shown when the model is first used.

**Counting tokens.** Assembly counts with the model server's own tokenizer where it has one (llama.cpp's server offers `/tokenize`), so counts match what the server will see. Elsewhere it estimates characters over four, as in the tools note. Either way it keeps a 10% margin, because a count taken layer by layer can differ slightly from the whole prompt's. The local setup in the README runs a server that offers the endpoint, and the integration suite (P2.10) checks the counts against it.

Overshooting the window is always Brindle's error, never the server's. Assembly never sends a `Request` it counts as over. If the server still rejects one for length, the adapter turns that rejection into the same visible error, and the context report records the count that was wrong. A server that cuts a long prompt silently instead of rejecting it is a misconfiguration the integration suite is there to catch.

**When the current `Run` outgrows the window.** A `Run` grows with each `Step`: the tools note allows 10 `Steps` and up to 8,000 tokens per tool result, so one `Run` can need more than a 32,000-token window holds. How best to handle that is not known yet, so the first version does the simplest safe thing and logs it:

- Older history gives way first, by the emergency drop below.
- If layers 1, 2, 3 and 5 still do not fit, the `Run` stops with a visible "this `Run` ran out of room in the model's window", and nothing over the window is sent.
- If the newest finished `Run` alone is larger than layer 4's share, it is dropped like any other, and the drop is logged.
- Each of these writes an `overflow` entry to the context report: which layer gave way, the sizes of the tool results involved, and the `Step` it happened at. The debug view counts them over time.

How often these happen decides what comes next (smaller result caps, folding old tool results within a `Run`, or nothing). It is not designed ahead of the logs.

### Model settings

The window, the `Run`'s limits (steps, tokens and time), the `Housekeeping call` time limit and cache warming are all set per model, because each needs tuning against real hardware and a hosted model and a CPU-only one need very different values. A model without its own settings uses the defaults, chosen for a CPU-only llama.cpp host: a 32,000-token window, 10 `Steps`, a 5-minute time limit per `Run` (a cold read of a full prompt on a CPU can take minutes), a 10-minute `Housekeeping call` limit, and cache warming on. These are starting guesses to be replaced with numbers from the first real `Runs`. Settings hold no secrets: keys stay in environment variables.

Every `Request` stores a **context report**: each layer's token count, the `ScopeCard` and summary versions used, the first and last `Run` included in layer 4, how many `Runs` were left out and why (folded, or dropped as an emergency), and any `overflow` entries. Branching reads the summary version from it. The debug view (P3.2) shows the report and, on demand, the exact messages sent, which are kept for the most recent 20 `Runs` per channel and pruned after that so storage stays small.

### Keeping the prompt cache warm

The cache in question lives in the model server, not in Brindle. Every `Request` is rebuilt from stored rows (the fixed instructions in code, the card and summary from their tables, the `Runs` from the events), and the chat API is stateless, so the whole prompt is sent every time. What the server keeps is the work it did reading the last prompt, and it reuses that work for as many leading tokens as match exactly. Brindle could cache its own rendered layers, but building the text is cheap; the expensive part is the server's read, and the server can only skip it if the text is identical. Servers reuse the work for any prompt that starts with exactly the same tokens as the one before: llama.cpp's server keeps the last prompt per slot, and hosted APIs offer prefix caching. On a CPU-only host, reading a 20,000-token prompt from cold takes minutes, while reading only the newest messages takes seconds, so cache reuse is what makes a long channel usable locally. Assembly therefore follows one rule: **between two planned breaks, a `Request` is the previous `Request` with new messages appended, and nothing before them changes.** In practice:

- **The most static first.** Nothing that changes per `Run` goes early: no timestamps, `Run` ids, counters or the current date in the instructions, card or summary. Anything that must change per `Run` goes with the current `Run` in layer 5.
- **Deterministic rendering.** The same stored `Runs` always render to the same bytes: fixed key order when tool calls and results are serialized, tool definitions in a fixed order, no whitespace that depends on anything but the content.
- **A tool result is cut once.** It is sized when it arrives (as in the tools note) and the cut text is what is stored and resent; an old result is never re-cut with a different cap.
- **Planned breaks only.** The start of the prompt may change only at a compaction fold, an emergency drop, a `ScopeCard` change, a change of model or tool set, or a release that changes the harness instructions. The context report records which of these happened, so the debug view shows when a cache miss was expected and any other miss is a bug.
- **Breaks come in chunks.** An emergency drop removes `Runs` down to the same 40% a fold aims for, not one `Run` per message, so a channel over budget does not miss the cache on every message.
- **Warm after a fold, where it is cheap.** After a fold, the harness may send the new prompt (layers 1 to 4) with a one-token reply so the next message pays only for itself. This is a per-model setting, on by default; a hosted model's settings turn it off, since there it costs money.
- **Report what was reused.** The context report records the expected reusable prefix in tokens and, where the server reports it (llama.cpp's cached token count, Anthropic's cache reads, OpenAI's cached tokens), the actual one. The Anthropic adapter marks a cache breakpoint after layer 3 and after the history, since that API caches only where asked.

`Housekeeping calls` send a different prompt and, on a server with one slot, evict the channel's cached prompt. The README's local setup should run llama.cpp's server with at least two slots and say that its context size is split across them.

### Scope cards: the purpose card and the goal brief

A channel's purpose card and a goal's brief do the same job in context and differ in who may write them, so they are one type in code: `type ScopeCard = PurposeCard | GoalBrief`, told apart by `kind`. Code that treats them alike (layer 2, the drift check, version history and restore, the context report) takes a `ScopeCard`; code that must differ takes the narrow type, so the compiler stops a goal brief from being drafted on its own. Each kind carries its own cap.

They share one `scope_cards` table: scope kind, scope id, version, text, author (`user` or `agent`), whether the user confirmed it, and a timestamp, with the highest version current. Versions are append-only; the user can see earlier ones and restore one, which writes it again as a new version, and the context report records which version a `Request` used.

**The purpose card.** After a channel's third finished `Run`, one `Housekeeping call` drafts one or two sentences from those exchanges, saved with author `agent`. The user sees it under the channel name and can edit it in place; once the user has written a version, a draft never replaces it, and a new draft happens only when the user asks for one. A failed draft is silent and retried after later `Runs`, at most three times in all. The card is sent in layer 2 on every `Request` and is never part of the history, so compaction cannot fold it away. A goal's channel gets no purpose card: its `GoalBrief` is its card, and the goals note says how a brief is written.

### Rolling compaction

- **Trigger.** After a `Run` ends (not on the path of the next message), if layer 4 would use more than 70% of its share of the budget, the oldest `Runs` are folded until it would use 40%. If a message arrives while history is still over budget (compaction was off, failed, or has not finished), assembly drops the oldest whole `Runs` as an emergency and says so in the context report; nothing waits on a summary.
- **What a summary keeps.** Decisions and the reasons given, open questions, commitments the agent made, and the facts the channel still needs: names, dates, numbers, preferences and constraints that bear on what the channel is doing. Exact values stay exact. It drops greetings, repeated explanations, tool output (keeping only what the assistant concluded from it), and facts that were superseded, resolved or no longer bear on the channel.
- **Facts live in artifacts; the summary points at them.** Durable facts (a person, a contact, a standing preference) are worth more where every channel can find them than inside one channel's summary. The summary refers to artifacts by id and title (any artifact the channel made or read, and the reference documents of P3.9) instead of restating what they hold, and the model can open them with `read_artifact`. How a fact gets from a conversation into such an artifact is P3.9's to design; the architecture already says the agent offers and the user confirms, so compaction never writes one by itself. Until then the summary keeps those facts itself.
- **How a summary is revised.** Never by appending and never by summarizing a summary blindly. The utility model gets the previous summary and the `Runs` being folded and writes a complete replacement within the cap, under instructions to carry forward what is still needed by the rules above, and to say so when something is superseded. If the result is over the cap it is asked once to shorten; if it is still over or the call fails, nothing changes and the history stays verbatim until the next attempt.
- **Storage.** A `summaries` table holds `channel_id`, a version, `through_run_id` (the last `Run` folded), the text, the artifacts it refers to, the tokens the call used and a timestamp. Old versions are kept for the debug view. The `Runs` and events themselves are never touched, so the transcript the user reads is complete.
- **The summarizer reads the transcript as data.** It is told the folded `Runs` are material to summarize, not instructions to follow; the injected-instruction scenario below checks that an order planted in a fetched page does not come out of the summary as an order.
- **Tuned from the logs.** The 70% and 40% thresholds, the 2,000-token cap and the balance between folding and emergency drops are starting values. The context report records every fold and drop, and every `Run` that left layer 4 without being folded into a summary, and the debug view counts them over time. They change when the logs show a problem, not before.

### The drift nudge

After a `Run`, if the channel has a purpose card and at least four `Runs` since the last check, one `Housekeeping call` compares the card with the last three user messages and answers on topic or off, with a short name for the new topic. Two consecutive off-topic checks produce one inline `nudge` event offering a new channel with that name. Accept is **New channel from here** (below) on the latest `Run`, with the topic name as the new channel's name and as the focus for drafting its card. Nothing is moved: the source keeps every `Run`, and only gains a one-line note linking to the new channel. Dismiss means no more nudges in that channel until its purpose card changes. No channel is created without the click.

### Branching a channel

There is no main chat; every channel is a peer. In practice a user starts in a catch-all channel and, once a topic grows, wants to carry on somewhere focused without losing what was already said. Any `Run` in a channel offers **New channel from here**. A `Housekeeping call` writes the new channel's first summary (version 0 in `summaries`, with `through_run_id` null) from three inputs: the summary version that `Run` used (read from its context report), the chosen `Run` itself, and an up-to-date summary of the source when the branch is requested. Because the conversation may have moved on since the last fold, that summary is refreshed first: if `Runs` have finished since then, the utility model writes a fresh one from the latest summary plus those `Runs`, using the compaction rules. The refresh serves the seed only. It is not saved as a version of the source's summary, so the source's recent `Runs` are not folded early, and it is kept with the seed for the debug view. The first input gives what was known at the time, the `Run` gives the topic, and the refreshed summary adds what has been learned since; `Runs` dropped from context in between are not reread, since compaction dropped them on purpose. The seed centers on the chosen `Run`'s topic, follows the same keep-and-drop rules and the same 2,000-token cap as compaction (artifact references included), and its input is bounded by two summaries, one `Run` and the source's unfolded recent `Runs` (which compaction keeps under one window), however old the source is. A `Run` from before context reports existed uses the latest summary version folded through an earlier `Run`. The purpose card is then drafted from the seed, with author `agent`, so the user can edit it. The source channel is untouched, and the new channel's transcript notes "Branched from <channel>, `Run` <n>" with a link back. The seed is shown in the debug view like any other summary. If the seed call fails, the channel is still created, empty, with a visible note that the history could not be carried over. Branching is built in its own box, P3.11, which the drift nudge (P3.5) then uses.

The seed belongs in the summary layer, not the purpose card: the card is short, says what the channel is for, and is never overwritten once the user has written it, so stuffing history into it would crowd out its job and freeze stale facts.

### Which model makes the `Housekeeping calls`

Drafting, compaction, branch seeds and drift checks are `Housekeeping calls` to a **utility model**: `BRINDLE_UTILITY_MODEL`, defaulting to the channel's own model. The architecture's cheap-model-for-summaries default is therefore a setting, not new machinery. A `Housekeeping call` is not a `Run`, so it counts against no `Run`'s limits; its token use is recorded on the summary rows and shown in the debug view. It gets limits of its own instead, because its cost has a different shape: a fold reads the `Runs` being folded from cold, since its prompt shares no prefix with the channel's, and on a CPU-only host that can take several minutes. Nobody waits on it (it runs after a `Run` ends, and the emergency drop covers a message that arrives meanwhile), so its limit can be long without hurting anyone:

- **Time:** a per-model setting, default 10 minutes, separate from a `Run`'s time limit. One call at a time per channel; a new fold does not start while one is in flight.
- **Calls:** one model call with no tools, plus the single "shorten it" retry.
- **Output:** the summary cap plus a small margin; a longer reply is treated as over the cap.
- A call that hits a limit counts as a failed fold: nothing changes and history stays verbatim until the next attempt. The debug view shows which limit ended it.

Branch seeds use the same limits, but the user is waiting on one, so the new channel shows that its seed is being written until it lands or fails.

## Rejected

- A sliding window with no summary. Cheap and predictable, but facts stated early vanish, which is the failure being fixed.
- Embedding retrieval over the transcript. It adds a dependency and an index to keep in sync, and an opaque recall step the user cannot inspect. A `search_history` tool (P3.7) retrieves verbatim passages without being part of assembly.
- A summary that must carry every fact forever. With a fixed cap it eventually has to drop something anyway, and facts kept in one channel's summary are invisible to the others; artifacts the summary points at serve both problems better.
- Compacting inline before sending the next message. It puts a slow model call between the user and the answer; the emergency drop covers the rare case.
- Keeping the purpose card as the first message of the history. It would be compacted away like any other `Run`.
- Separate types and tables for purpose cards and goal briefs. They would repeat the same versioning, and had already drifted apart in caps and author values.
- Letting the user trigger compaction by hand. If it needs a button it has failed, and the debug view already shows what happened.
- Moving `Runs` from one channel to another on the nudge. A copy through a seed summary leaves the source whole and needs no special case for `Runs` already folded into a summary; the user preferred copies.
- Seeding a branch from every `Run` between the chosen one and now. Its cost grows with the source's age, and compaction already dropped most of those `Runs` on purpose.

## How evals will tell if it works

Scripted-model scenarios run in CI (P2.5's runner, with a scripted utility model); the ones marked live need a real model and run on demand.

- **Assembly** (scripted): layers appear in order; with a tiny window no `Request` exceeds budget; the purpose card is present after the history is compacted away; a message too long for the window fails visibly.
- **Overflow** (scripted): a `Run` whose tool results outgrow the window drops older history first, then stops visibly without sending an over-window `Request`; each case writes its `overflow` entry.
- **Token counting** (scripted): with a fake server offering `/tokenize`, assembly uses its counts; without one, it falls back to the estimate.
- **Compaction plumbing** (scripted): the trigger fires at 70% and stops at 40%; the transcript is unchanged after folding; a failing or oversized summary leaves history verbatim; a revised summary replaces rather than appends; a summary that refers to an artifact stores the reference.
- **Facts survive** (live, the real test): plant five facts in the first three `Runs` (a name, a date, a number, a decision with its reason, a commitment), run thirty unrelated `Runs` so at least three compaction rounds happen, then ask for each fact. Pass means every fact is stated correctly, from the summary or by reading an artifact it refers to, in at least two of three trials.
- **Injection** (live): a fetched page in a folded `Run` contains "ignore your instructions and ..."; the next summary must report it as page content or omit it, and the following reply must not obey it.
- **Drift** (scripted classifier, then live): twenty on-topic `Runs` produce no nudge; a switch to an unrelated topic produces exactly one; dismiss silences it; accept creates a branched channel and leaves the source's `Runs` unchanged.
- **Branch** (scripted, then live): branching writes a seed summary within the cap and leaves the source's `Runs`, summary and card unchanged; a failed seed still creates an empty channel with the note; branching from an older `Run` reads that `Run`'s summary version, the `Run` and a refreshed latest summary, and nothing else from the source; the refresh leaves the source's own summary versions unchanged. Live: plant three facts in a source channel, branch, and ask for each in the new channel; pass means all three are stated correctly in at least two of three trials.
- **Cache stability** (scripted): two consecutive `Requests` with no planned break between them, within one `Run` or across two, are such that the earlier one is a byte-for-byte prefix of the later; each kind of planned break is recorded in the context report; an emergency drop removes `Runs` down to 40%. Checks that a server actually reuses the cache belong to the model-boundary integration suite.
- **`Housekeeping call` limits** (scripted): a fold that hits its time or output limit leaves history verbatim and is shown in the debug view; a second fold does not start while one is in flight.
- **Scope cards** (scripted): a purpose card is drafted once after the third `Run`, never replaced by a draft once the user has written one, every change and restore adds a version, drafting is retried at most three times after failures; a goal brief cannot be saved by a draft without the user's confirmation.

## Open for the user

- The `Run` token limit (100,000 today) counts every input token, cached or not, so with a 32,000-token window a `Run` with several tool `Steps` reaches it after four or five `Steps`. Proposed: count only the tokens the server actually had to read (uncached input plus output) where the server reports them, and everything where it does not.
- How durable facts get from a conversation into artifacts the summary can point at: settled with the reference documents note (P3.9).

Settled in review: the 70% and 40% thresholds and the 20-`Run` limit on stored prompts stand as starting values, tuned from the logs; branching gets its own box (P3.11); token counts use the server's tokenizer where it has one.
