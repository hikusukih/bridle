# UI feedback, October 29: write-up and deviations from the design

Status: draft for the user, not committed. Nothing here has been filed as a `[plan]` PR yet; the last section proposes how to split it. Terms in bold at their first use (**run**, **scope**, **scope statement**, **housekeeping call**, **request**, **card**) are defined in the glossary in `docs/architecture.md`.

Each item says what was asked, what the current design already says, and whether it fits, extends or deviates. A **Deviation** is a place where today's docs would say something different once the item is adopted, so the docs have to change first.

## Open PRs this touches

- [hikusukih/brindle#63](https://github.com/hikusukih/brindle/pull/63) is P3.8, the landing channel design note, open and not merged. Everything below about the landing channel can still be edited into that note rather than amended later.
- [hikusukih/brindle#64](https://github.com/hikusukih/brindle/pull/64) is P4.3, goals server side, built on the merged goals note, so it gives each goal exactly one channel. Item 6 (goals separate from channels) changes that. If #64 merges first, a follow-up box has to migrate it.
- [hikusukih/brindle#61](https://github.com/hikusukih/brindle/pull/61) is P3.2, context assembly. The new context layers in items 2, 3 and 7 land on top of it.
- [hikusukih/brindle#62](https://github.com/hikusukih/brindle/pull/62), [#65](https://github.com/hikusukih/brindle/pull/65) and [#66](https://github.com/hikusukih/brindle/pull/66) (scheduler, goal lifecycle, scheduler wiring) say a schedule's destination is "the goal's channel". Item 6 changes the destination to a chosen channel.
- [hikusukih/brindle#52](https://github.com/hikusukih/brindle/pull/52) is P2.11, per-model settings as a JSON file. Item 1 puts a screen over it.

## 1. A Settings screen

Asked: a Settings screen where the agent can be configured; model choice lives there.

- **Today:** no Settings screen and no box for one, though three notes assume it: the time zone "changeable in settings" (goals note), the suggestions off switch (P7.1), and the landing channel's learned examples "viewed and deleted in settings". Model choice is per channel (P2.2a); P2.11 proposes limits per model in a JSON file.
- **Fits.** One new box, needing P2.7 (auth), P2.2a and P2.11.
- **Contents of the first version:** the default model, the Soul (item 3), the time zone, suggestions on or off, the learned landing examples, and per-model window and limits (the non-secret fields of P2.11, written to the same JSON file).
- **Model choice is a dropdown of configured models**, not a typed string. The server builds the list from its configuration (the environment variables and the P2.11 file) and serves it at one endpoint. A channel's model selector reads the same list. **Extension** of P2.2a, which only says "a model setting on each channel".
- **No secrets and no endpoints through the UI.** Keys stay in environment variables or the key manager. I would also keep base URLs out of the UI: whoever holds the login token could otherwise point the agent at any host and receive the whole prompt. Adding a model stays a server-side configuration step; the screen picks among them. The Settings screen shows a model's name, provider, window and whether its key is present, never the key.
- Open: a channel whose model was removed from configuration falls back to the default and says so in the channel header.

## 2. System instructions and the app context

Asked: the model gets system instructions and knows which part of the app it is in.

- **Today:** layer 1 of the context note is "harness instructions, up to 1,500 tokens, fixed text". Layer 2 carries the scope statement. Neither says what Brindle's surfaces are or tells the run what kind of place it is in.
- **Extends** the context note; no conflict. Layer 1 grows a short description of Brindle (channels, goals, the feed, artifacts, reports, the tools) and how to behave. The run's place goes in layer 2 beside the scope statement: "You are in the channel Scheduling" or "This is a goal run for Prepare for the Show", plus the surface (channel, goal run, Home, suggestion run).
- **Why not layer 1:** layer 1 must be byte-identical across every channel, or the model server's prompt cache is lost. The place changes per scope, so it goes after the static part.
- This is harness behavior, so it needs the design-note PR first (see the split at the end).

## 3. The Soul

Asked: a SOUL.md-style personality, user-editable, with presets, token-capped, perhaps framed as a puzzle or game to stay concise, with a button to compact the wording.

- **New.** Not in any note.
- **Placement:** a layer 1b directly after the harness instructions, so it is as static as layer 1. Editing it is a planned cache break, listed with the others in the context note.
- **Shape:** plain text the user owns, edited in Settings, with a handful of shipped presets to start from (copying a preset creates the user's own text; a later release changing a preset never changes what the user saved). A live token counter against a cap. On a 32,000-token window every Soul token is paid on every request, so I would start at 400 tokens and tune.
- **The compact button** is a housekeeping call that rewrites the text shorter. It shows the result beside the original and saves nothing until the user accepts. It never runs on its own.
- **The puzzle framing:** my honest view is that a visible budget meter already is the game: a bar that fills as you write, and a compact button when it is over. A separate game mechanic risks being a gimmick that gets in the way of editing; I would ship the meter and see whether you want more.
- **Who may write it:** the user only. The agent never edits the Soul by itself, even with a confirmation, in the first version: it is the one text every run reads first, and the reference-documents rule (text from the web must not quietly rewrite what every channel reads) applies in full. An agent suggestion could arrive later as a card.
- **What it cannot do:** change tool permissions, approvals, effect levels or the key manager. It shapes voice and defaults, nothing structural. The harness instructions come first and say so.
- **Deviation: the calm principle.** `docs/architecture.md` states calm as "Guiding principle" in the voice of a rule. You said it is a design goal of the app as a whole and can be overridden by the user. Proposed wording: calm is the default, not a constraint; a user can turn on notifications, suggestions, follow-up offers and a chattier voice (through the Soul or Settings), and nothing in the harness refuses that. Acceptance box A.4 ("no notification the user didn't ask for") stays true, since it is about what is on by default. This is a small edit to `architecture.md`, its own `[plan]` PR.

## 4. The left menu

Asked: existing channels listed under the Channels heading, indented. Archive and delete for channels and goals.

- **Today:** four flat navigation links (`src/client/screens.ts`); the list of channels is inside the Channels screen. Archive, restore and delete exist for channels (P1.2, P1.7) and for goals (P4.3, P4.11).
- **Fits.** UI-only, so an ordinary PR with no note.
- **Details to settle:** the heading still opens the management screen (archived channels, rename, delete) while each child opens a channel. Home (item 7) is always the first child and cannot be archived or deleted, as the landing note already says. Goals could get the same treatment: goals listed under their heading, which sits well with the grid in item 5.
- **Phone:** the bottom bar has no room for children. A drawer opened from the Channels tab, or the Channels tab opening the list itself, are the two options. I recommend the second, since it needs no new gesture; the drawer can come once you have seen the app on a phone.
- **Seeing it on a phone:** your browser's device mode (about 390 pixels wide) is a good first look. I can also render the screens at that width and send screenshots when you want them.

## 5. Add goal, and the Goals page

Asked: an "Add goal" flow like Muse's: suggested goals as buttons ("lose 5 lbs", "buy a new rug") and a text box where pasted language creates a goal; with no goals yet, an open text box. Goals shown as a grid of roughly 200 by 200 pixel tiles, each with an illustrative image and a short identifying text, opening into the goal's main experience.

- **Today:** the architecture says category buttons on the Goals screen are prompt templates that draft a goal for the user to edit (P4.6). P4.9 adds `propose_goal`, a tool that drafts a goal as a card the user confirms; the model never creates one itself. P4.3a is the Goals screen as a list with each goal's next run, and the form to create and edit.
- **Fits and extends:** your buttons are P4.6 with specific examples, and the text box is the same draft-and-confirm path. Nothing is created without the user's confirmation, which matches the architecture.
- **A gap in P4.9:** `propose_goal` is a tool, and a tool call happens inside a run, which needs a channel or goal scope. A text box on the Goals page has no scope. Recommended: drafting from the Goals page is a **housekeeping call** that returns a draft (title, brief, optionally a schedule) into the edit form, with no tools and no scope. `propose_goal` stays for drafting from inside a conversation. **Deviation:** a second path for drafting a goal, and the glossary's list of housekeeping calls gains "drafting a goal".
- **Grid and image (deviation from P4.3a):** a grid of tiles replaces the list. The image is the new part and the architecture has no image generation. Options, in the order I would build them:
  - A generated placeholder from the title (a color and an emoji or pattern), always present, free, deterministic. I would ship this first.
  - An image the user supplies, stored as an artifact of kind image, so it shows in the gallery and survives the goal.
  - Later, a `generate_image` tool using an OpenAI-compatible images endpoint, the same way speech works, so a local server and a hosted one are interchangeable. It costs money or hardware per goal, and your local-first setup may not have an image model, which is why it comes last and stays optional.
- **The goal page** (the "primary goal experience") is new: P4.3a does not describe one. It shows the brief, the state document, the schedules and next run, the linked channels (item 6), recent reports (item 8) and the goal's Add or Edit actions. This is a box of its own, needing P4.3a and P4.4.
- Open: whether the suggested buttons are fixed text or a mix of fixed and ones the suggestion run (P7.1) proposes. I would start fixed.

## 6. Goals are separate from channels, many to many

Asked: goals have primacy of their own and are not stuck in a channel. A goal may create a channel if none fits, since it needs somewhere to respond. Several goals can relate to a channel and a goal to several channels. For example three channels (Scheduling, My Band, The Kids) and goals A (Prepare for the Show) and B (Broaden Kids Culture): talk about A and B in Scheduling, A in My Band, B in The Kids. Channels are where goals get refined and defined, with room for serendipity. Goal runs posting to a channel stays correct.

This is the largest deviation.

- **Today (`docs/design/goals.md`):**
  - `goals` holds the id of its channel, "created with the goal", and the brief is pinned at its top.
  - The brief is that channel's scope statement; no purpose statement is drafted for it.
  - A schedule's destination is `channel`, meaning the goal's channel.
  - "At most 1 run per goal at once", counting the user's run in the goal's channel.
  - Deleting a goal deletes its channel and that channel's runs.
- **Proposed model:**
  - A goal exists without a channel. A link table (goal id, channel id) holds the many-to-many relation.
  - A goal run's scope is the goal. Its output posts to a destination channel chosen per schedule when the schedule is confirmed, defaulting to the first linked channel. If the goal has no channel, one is created, named after the goal, and linked, so output always has a home.
  - A channel run gets the briefs of its linked goals in context, as one line each under a small cap, plus read access to their state documents, and can write them (below). So talking about A and B in Scheduling works with no handoff.
  - `propose_goal` from a conversation (P4.9) creates the goal already linked to that channel.
  - Serendipity: Home's directory (item 7) lists goals, so a mention in any channel can surface a goal, and the agent can offer "Link this goal to this channel?" as an inline offer with the same click-to-accept pattern as the landing offers.
  - A channel that a goal created is an ordinary channel: it gets a purpose statement drafted like any other. The `GoalBrief` remains the scope statement for goal runs only.
- **What changes in the goals note:** the `goals` row loses the channel id; `goal_channels` is added; `schedules.destination` becomes a channel id (plus the later `feed` and `digest` values); the concurrency rule applies to goal-scope runs, not to the user's channel runs; deleting a goal unlinks its channels and deletes none of them; the deletion dialog then asks what to do with the goal's own runs and artifacts, as it already does for artifacts.
- **Concurrency under many to many:** the existing state-document edit rules already handle two writers (edits are `{old, new}` pairs against a version, conflicts return the current content, a user's edit is never overwritten), so a channel run can write goal state without a per-goal run lock. The one-run-per-goal rule stays for scheduled goal runs.
- **Open: should a channel run write a linked goal's state without a confirmation?** My recommendation: yes in a channel the goal is linked to, because versions are append-only and each one records the channel and run that wrote it, with one-click revert. A channel not linked to the goal asks first. The risk is the same one the reference-documents rule guards against: a channel that read a poisoned page writing something the goal's later scheduled runs act on. Provenance and revert limit it; they do not remove it, so say if you would rather it always confirm.
- **Cost:** it touches the goals note, P4.2, P4.3 (#64, in flight), P4.11, P4.12, P4.3a and P4.9. Because #64 implements the merged note as written, I recommend letting it land and adding a migration box after the amended note merges. If you would rather hold #64 until the note is amended, that is your call; it avoids a migration but delays Phase 4.

## 7. One Brindle with facets, and Home

Asked: the catchall should correspond with a sense of the whole system. Other channels should feel like added context rather than silos. Siloing for security is acceptable, and the off-topic nudge is welcome. A landing channel that cannot see the instance is much less usable. It should not have a summary, but should know the names of all active channels and goals. Perhaps a tool call "to the landing channel" loads system-level knowledge when a message seems out of scope for the current channel, with "this seems off topic" as the gate.

- **Naming (a better term for the catchall).** The glossary and notes say "landing channel". I propose **Home** as the label in the UI and the docs. One collision: the architecture already says a reference document's "home" is the channel that owns it. I would rename that one to "owning channel", which is a docs-only edit. If you prefer another word (Hub, Main), it is a find-and-replace; only the glossary entry matters.
- **Home sees the instance. Deviation in the landing note (#63).** The note has the matching housekeeping call see only candidates' names and purpose statements, and says the model "never sees another channel's history". Your point stands: a front door that does not know what is behind it is not much use. Proposed change:
  - The matching call stays as narrow as the note says; that is a different call from a run.
  - A Home run gets a directory layer: every active channel (name and purpose statement) and every active goal (title and one-line brief), one line each, most recently active first, under a token cap; beyond the cap a read tool lists the rest. No summary for Home, as the note already says.
  - A Home run also gets read tools across the instance: `search_history` over any channel, `read_artifact`, reading a goal's state. Results come back as tool-result data, labeled as such, the same way a fetched page does.
  - Cross-channel writes stay behind a card, as in the reference-documents rule.
- **Honest trade-off on injection.** Giving Home read access means text from other channels, which may include web content a run fetched, can reach a run that also reads fresh untrusted input. The note was cautious here for a reason. But what stops harm is that external actions need an approval card, secrets never reach the model, and writes to shared things are confirmed or versioned; context isolation was a second line, not the first. I think the usability gain justifies dropping it for reads, with the labels, but it is a real change in posture, so I am flagging it rather than burying it. The injection scenarios in the landing note gain a case: text in another channel's history that tells Home to act.
- **`load_system_context` for every channel (new tool).** Any channel run can call a read tool that returns the same directory, plus recent reports' titles. The harness instructions in layer 1 tell it to call it when the user's message clearly does not fit the channel's purpose, so "this seems off topic" is the model's own judgment, with the existing drift check (P3.5) as the housekeeping backstop afterward. Why a plain read tool and not a hand-off run in Home: a hand-off puts the user's question in Home's transcript, and a read keeps it where the user is; if the answer is "this belongs in Music", the existing click-to-move offer (P3.8) does the handoff with its visible quote. If you do want a true hand-off, it is the same machinery as "another run handing off" in the glossary.
- **Caveat:** a small local model may call the tool too often or too rarely. The context report counts calls, and if the numbers are bad the fallback is simply to include the directory in every request, which costs a few hundred tokens and one more planned cache break.
- **Everything else in the "added context" feel is already designed:** artifacts belong to the user, reference documents are shared, the suggestion run reads across scopes, branching carries context. The additions above are what is missing.

## 8. Reports and system events

Asked: agent-written text reports about background activity appear in the relevant channels. Anything that spans channels or is about the system (updates, schedules, errors) goes to Home. Reports could sit in a pane beside Home, or in the feed, and selecting a report's text is how it is included in the context of a message, as a quote. System events need to reach the user without passing through the model's voice.

- **Today:** a goal's runs post in its channel by default. The feed (Phase 5) holds items found by scheduled runs; the digest (P8.2) rolls up new feed items, check-ins and finished long runs. The P3.8 note proposes keeping scheduled runs out of the landing channel and leaves it as an open question.
- **This answers that open question:** reports go in a pane beside Home (a side panel on wide screens, a sheet or tab on a phone), not in Home's transcript, so Home holds only what the user typed and its 25% layer 4 is not crowded out.
- **Reports are not in context unless the user brings them.** A report has an "Attach to message" action that writes a quote event into the conversation, the same mechanism as the landing channel's `quoted_from_landing` generalized to `quoted_report`. It is labeled as a quotation and is data, not an instruction. This is a **deviation** only in that the quote event gets a second source.
- **Two kinds of report, same store:**
  - Goal-run reports are agent-written text: the run's output summary, posted in its destination channel as it is today and listed in that channel's reports pane and on each linked goal's page. Stored once; other linked channels list it by reference rather than copying it.
  - System events are written by the harness from templates, with no model call, so the wording is exact and cannot be misled by what a run read: a scheduled run failed or was missed, a run stopped on a limit, an update is available, a model in use was removed from configuration. They go to Home's pane. Events belonging to one channel or goal also show there.
- **A question for you about the pane and the feed.** The feed (items found), the digest (a periodic roll-up) and a reports pane (what Brindle did and what went wrong) overlap in their data model. I would keep one store with a kind field, and give Home's pane a view onto it (reports and system events), so the feed is the same store filtered to found items. Three separate lists would drift apart. Say if you want them kept separate.
- **Errors that matter vs housekeeping noise:** the landing note says a failed housekeeping call produces no error. I would keep that, and show only errors that affect work the user can see: a failed or missed scheduled run, a run stopped on a limit, a credential problem. Failed housekeeping calls get a count under Settings, in a diagnostics line, not a report.
- **Calm:** no notification attaches to reports by default; the existing per-goal and per-channel opt-in applies.

## 9. The old name

Asked: get rid of references to Bridle; the old repository name should link through to Brindle.

- **Repository:** `hikusukih/bridle` already redirects to `hikusukih/brindle` (the open PR list above is served from the new name). Nothing to do on GitHub. This session's checkout directory is still called `bridle`; that is the environment's naming and I cannot change it from here.
- **In the code, the remaining references are deliberate** (box P0.5): `src/server/legacy.ts` and its test (reads old `BRIDLE_*` variables with a warning, renames `bridle.sqlite`), the README section "Moving an install from Bridle", the settled entry in `docs/decisions.md`, and the wording of three plan boxes (P0.5, P1.8, P2.2a). They exist so an install made before the rename keeps working.
- **Proposal:** if no install of yours still uses the old names, a small box can remove the shim, its test and the README section, and leave one line in `docs/decisions.md` recording the rename. I would not do it without you confirming that no old data directory or volume is in use, since it deletes the only path that moves one forward. The plan boxes are history and stay as written (a checked box is never edited).

## 10. Phone

Not yet seen on a phone. The shell was built for it (bottom bar on narrow screens, PWA manifest), but items 4 and 5 make it matter more. Check the app at 390 pixels before deciding the drawer question in item 4.

## Deviations from today's docs, in one list

- `docs/architecture.md`: the calm principle becomes a default the user can override; the glossary renames the landing channel to Home and a reference document's "home" to "owning channel"; a reports surface is added; housekeeping calls gain "drafting a goal".
- `docs/design/context.md`: layer 1 describes the app; layer 2 gains the place; a Soul layer after layer 1 with a cap; a directory layer for Home; `load_system_context`; the planned-break list gains Soul changes and directory changes.
- `docs/design/goals.md`: goals no longer own a channel; many to many; destinations name a channel; the concurrency rule narrows to goal runs; deletion unlinks.
- P3.8 landing note (#63): Home sees the instance's directory and has cross-channel read tools; the open question about scheduled runs is answered (reports go in a pane); the quote event is generalized.
- `.agents/PLAN.md`: new boxes for Settings, the Soul, the sidebar, Add goal and the grid, the goal page, the reports pane, the migration to many to many, and optionally the shim removal. Boxes P4.3a and P4.9 are reworded by proposal, not by their own PRs.

## Proposed split into `[plan]` PRs

Each of these is one idea and can be merged or closed alone, per `CLAUDE.md`. IDs are assigned at filing time by the procedure in `CLAUDE.md`. The landing note changes go on the P3.8 branch instead, since that note is not merged.

- Design note box: system context layers (the app context, the Soul, the directory, `load_system_context`), amending the context note.
- Settings screen box, with the model dropdown and the endpoint served from configuration.
- Soul box, needing the design note and Settings.
- Sidebar nesting box, UI only.
- Add goal and goals grid box, plus a separate goal page box.
- Design note box: goals separate from channels, many to many, amending the goals note; later a migration box after P4.3 lands.
- Design note box: reports and system events, plus the feed overlap question.
- `docs/architecture.md` edits: the calm principle and the glossary terms.
- Optional: remove the Bridle compatibility shim, after you confirm.

## Questions that change what I do next

- Is **Home** the right name, given the "owning channel" rename it forces?
- Should reports, the feed and the digest share one store with different views?
- May a channel run write a linked goal's state without confirmation, with provenance and revert?
- Should #64 (goals with one channel each) land first and be migrated, or wait for the amended note?
