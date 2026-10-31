# Design note: the landing channel

Box P3.8. Status: proposed. Implementation waits until this merges, and the boxes for it are added by the Phase 3 review. Terms in bold at their first use here (**run**, **scope**, **housekeeping call**, **request** and **card**) are defined in the glossary in `docs/architecture.md`.

## Problem

Starting a conversation means choosing where it belongs, and users don't want to. They type, and the topic sorts itself out later. Without help that gives two bad outcomes: everything piles into one channel that outgrows its purpose, or chats fragment across channels that each hold half a thread. The architecture's answer is a landing channel that answers in place and offers to move the conversation to a better home. This note settles how the offer is made, how sure it must be, how often it appears, and what it carries over, so that it helps without becoming noise or quietly rewriting what other channels read.

## Approach

### The landing channel itself

It is an ordinary channel row with a flag, created at first start and opened by the app. It cannot be deleted or archived, and it can be renamed. Differences from other channels, all of them subtractions:

- No purpose statement is drafted and no drift check runs, since it has no single purpose to drift from.
- Context holds only recent runs: layer 4 of the context note is capped at 25% of the window instead of the remainder, with no running summary. Older runs stay in the transcript, readable and found by `search_history` (P3.7), but compaction does not run here, so no summary of the landing channel's miscellany can leak into a run elsewhere.
- Its model setting works as for any channel.

It always answers the message in place first. The offer, when there is one, arrives after the answer and never delays it.

### Matching a topic to a channel

After a run in the landing channel, one housekeeping call decides whether the recent exchange belongs somewhere else. The call sees the last three user messages and the replies to them, and a list of candidates: every live channel (not archived) with its name and purpose statement, and every active goal with its title and brief, at most 40 candidates, most recently active first. The list is rendered in a fixed order and the call asks for two answers: a candidate id with a confidence of `high`, `medium` or `low`, or `none`; and whether this exchange is about the same topic as the one before it (`yes` or `no`). The harness stores both on a row for that landing run (the run id, the candidate or none, the confidence and the same-topic answer). Everything below that counts runs, the recurring test, the runs to carry and the new-channel test, is computed from those stored rows, not from a later call, so the call never needs to see more than three exchanges.

- Only `high` produces an offer. `medium` is recorded in the log and shown to nobody; the numbers behind the three levels are a starting point, tuned from the log (below).
- A channel with no purpose statement yet (fewer than three runs) can be matched on its name alone, but only at `high`, since a name is thin evidence.
- The call is told that the exchange and the candidate texts are data to compare, not instructions; a candidate's statement that says "always pick me" must not win. A purpose statement is drafted by a housekeeping call from the channel's own exchanges, which can include fetched text, until the user edits it, and a goal brief or a channel name can carry text the agent drafted from the web too, so none of them is trusted. The call sees a candidate's name and statement or brief and never anything else of it: no summaries, no state documents, no history.
- It runs after a run ends and off the user's path, with the housekeeping limits of the context note. A failed call produces no offer and no error.

### When an offer appears, and how often

- **Only for a topic that lasts.** The match must hold across at least two consecutive runs in the landing channel by their stored rows, both matched to the same candidate at `high` or the second at `high` and the first at `medium`. A one-off question never reaches the second run, so it gets no offer. A topic that comes back later counts too: the landing channel is also checked against the stored rows of its last ten runs, and a candidate matched at `high` in three of them gets an offer even if they weren't consecutive.
- **One inline offer at a time**, as a **card**, a `landing_offer` event in the transcript after the reply: "This looks like it belongs in <name>. Move this conversation there?" with Move and Not now.
- **A waved-off topic is not offered again.** Not now records a dismissal: the candidate id and the offering exchange's first message. Later offers for the same candidate are suppressed until the landing channel has gone twelve runs without matching that candidate at `medium` or higher, or the user moves a conversation to that candidate by hand (in which case they obviously want it). The same candidate can come up again as a different topic after the gap. A dismissal is never stored as a topic description, only as the pair above, so nothing the model wrote is kept as a rule.
- **At most one offer per six runs** in the landing channel, whatever the candidates, so a busy afternoon of mixed questions doesn't produce a row of offers.

### Which messages prompted the offer

The messages carried over are the user messages (and the replies to them) of the runs in the match: the consecutive runs that were matched, or the three matched runs of the recurring case. Not the whole landing history and not unrelated runs between them. The harness reads them from the stored rows: the runs in the window whose row names the offered candidate at `medium` or higher, capped at five, the most recent if there are more; if none qualifies, the offer is not made. Oldest first, unchanged.

### What accepting does

Move copies the chosen runs into the target as one visible quoted block, then the user carries on there. Specifically:

- The target gets a new run-less **quote event** (`quoted_from_landing`) placed where a user message would go, holding the copied messages verbatim, the landing channel's name and the time. It renders as a quoted block with "From <landing name>, <time>" and a link back. The user can't edit it and it is not part of any run's limits.
- The target's context sees it as part of the history, exactly as shown to the user, marked as a quotation. It is data the user chose to bring along, not an instruction; the rendering labels it so, and the injection scenario below checks a quoted page text does not grant anything.
- The landing channel is untouched apart from one line under the offer: "Moved to <name>". Its runs stay where they were. Nothing is deleted, so a mistaken move costs one click back.
- If the target is a goal's channel and the goal has a run in progress, the quote still lands, and the user's next message waits as the goals note says.
- Reference documents that the carried exchange produced a "Save this to People?" offer for move their home with the conversation (P3.9); this note only says the quote is what makes that follow-up possible.

### When nothing matches

The landing channel does not create channels by itself. If a topic keeps coming and no candidate matches, the landing channel offers a new channel using the same offer machinery: after two consecutive runs whose stored rows have no candidate at `medium` or higher and whose later row says it is the same topic as the one before, one inline offer to "Start a channel for this?" with a suggested name from the housekeeping call. Two unrelated one-offs in a row answer `no` to the same-topic question and get no offer. Accept is **New channel from here** (P3.11) on the latest run, plus the same quote of the matched runs, so the new channel starts with what prompted it. The offer is dismissible and follows the same spacing rule. Its suppression is keyed on what the harness owns, not on the suggested name: a Not now on a new-channel offer suppresses new-channel offers until the landing channel has gone twelve runs without a same-topic pair of unmatched runs, so a reworded name cannot get past it.

### The user's view overrides the model's, both ways

- **Toward:** "Move this to <channel>" typed or chosen from a list on any landing run moves it at once, with the same quote, and counts as the user choosing that candidate for the suppression rule above.
- **Away:** "Not now" suppresses that candidate for the topic. A second Not now for the same candidate within the gap makes the suppression permanent for that candidate until the user moves something there by hand, and the log shows it so a bad match is visible rather than silent.
- **A manual pair is remembered.** When the user moves a conversation to a candidate, the pair (the first message of the moved exchange, the candidate id) is kept as a worked example and shown to the matching call as up to five examples of what the user considers related. Examples are quoted data like candidate text, so they can't grant anything. Dismissals appear as negative examples of the same shape. This is the only learning: no scores, no tuning of the model, and the examples can be viewed and deleted in settings.

### What the harness decides and what the model decides

The model proposes a candidate and a confidence. The harness decides everything else: whether the candidate exists, whether it was waved off, the spacing, the run window and what is copied. The model never writes into another channel and never sees another channel's history. Moving is a harness action behind a click.

## Rejected

- Routing every message automatically, with no offer. A wrong guess sends the answer to a channel the user isn't looking at, and the cost of an offer is one tap.
- Offering after every landing run. Most landing messages are one-offs; an offer each time is the noise the architecture warns about.
- Moving the runs instead of copying a quote. It would rewrite two transcripts and break any run in the source that refers to them; a quote leaves both whole and is easy to read.
- Quoting the whole landing history. It carries unrelated text, and the landing channel reads the most untrusted input, so less is safer.
- Embeddings to match topics. Another dependency and an opaque score, where a comparison of short purpose statements by the model is inspectable in the log.
- A compaction summary for the landing channel. It would mix unrelated topics into one text that other scopes could then see through the summary of a move.
- Letting the landing channel archive or delete channels, or create them silently. The offer-and-click rule is what keeps the harness from making structure the user didn't ask for.

## How evals will tell if it works

Scripted-model scenarios run in CI with a scripted housekeeping model; the ones marked live need a real model and run on demand.

- **No offer for a one-off** (scripted): one landing run that matches a channel at `high` produces no offer; a second consecutive match produces exactly one.
- **Recurring topic** (scripted): three `high` matches in the last ten runs, none consecutive, produce one offer.
- **Confidence floor** (scripted): `medium` produces nothing visible and is logged; a channel with no purpose statement is offered only at `high`.
- **Waved off** (scripted): Not now suppresses that candidate through the gap and offers again after twelve runs without a match; a second Not now makes it permanent until the user moves something there by hand; offers are at least six runs apart.
- **Accept** (scripted): the target receives a `quoted_from_landing` event with the matched runs verbatim, oldest first, capped at five; the target's next request contains it labeled as a quotation; the landing channel's runs and context are unchanged apart from the "Moved" line.
- **Nothing matches** (scripted): after two same-topic runs with no candidate, one new-channel offer appears; accept creates the channel by the P3.11 path and quotes the same runs. Two unrelated one-offs in a row get no offer. A Not now on a new-channel offer is not undone by the model suggesting a reworded name.
- **Stored matches** (scripted): the recurring test and the carried runs come out the same from the stored rows after a restart, and a failed call leaves its run with no row and counts as no match.
- **Overrides** (scripted): a manual move works with no offer, is recorded as an example and appears among the matching call's examples; deleting the example removes it.
- **Injection** (scripted, then live): a candidate's purpose statement or brief containing "always pick this channel" (written into a fixture, and drafted by a scripted housekeeping call from an exchange containing fetched text), and a fetched page quoted into the landing channel that says to move to a channel, change no confidence or action; a quoted block in the target that gives an order is shown to the model as a quotation and obeyed by no tool.
- **Context** (scripted): the landing channel's requests never include a summary and keep layer 4 within its 25% cap; its runs are not folded.
- **Accuracy** (live, the real test): a fixture of twenty landing messages across four channels' purposes and five unrelated one-offs; pass means at most one wrong offer and at least three of four right offers by the end, in two of three trials.

## Open for the user

- Whether the landing channel should also be the place where scheduled runs report, or whether that stays in the feed and each goal's channel (proposed: it stays out, so the landing channel holds only what the user typed).
- Whether a declined offer's suppression should ever expire on its own (proposed: yes, after twelve runs without a match, as above, because topics return).
