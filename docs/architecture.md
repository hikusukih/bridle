# Architecture

Brindle is a self-hosted personal agent: a harness that runs work for one person, and a phone-friendly web app over it. Five surfaces sit on top: **channels**, **goals**, the **feed**, **artifacts**, and **suggestions**. Underneath them all is one primitive, the **run**.

Most of the work is the harness, not the UI. The UI is standard; how context is assembled, how long conversations stay useful, how goals keep state and act on a schedule, and how credentials are kept away from the model are the parts that decide whether this is any good. Those parts are designed in short notes under `docs/design/` and reviewed before they are built (see `CLAUDE.md`).

## Guiding principle: calm

The agent works on the user's behalf and reports when there is something worth reporting. Scheduled work lands in the feed or a digest, not a ping. Notifications exist, and the user turns them on per goal or channel. Suggestions are capped and remember what was dismissed. A reply ends when it is done, without a list of other things the agent could do.

## The run

A run is one unit of agent work: a trigger, a scope, and the loop that follows.

- **Trigger:** a user message, a goal's schedule firing, an accepted suggestion, or another run handing off.
- **Scope:** the channel or goal the run belongs to. The scope decides what context the run gets and where its output goes.
- **The loop:** assemble context, call the model, execute any tool calls, feed results back, repeat until the model finishes or a limit is hit. Every step is persisted as an event (text, tool call, tool result, artifact, error), streamed to the UI as it happens.
- **Limits:** every run has a step limit, a token limit, a wall-clock limit, and an optional cost budget. Hitting one ends the run with a clear "stopped because" event, never silently.

Every surface either shows runs or creates them. A goal's daily brief, a feed watcher, and a chat message are the same machinery with different triggers and destinations.

## Channels

A channel is a persistent, named conversation with its own history. Channels can be archived (hidden, read-only, restorable) and deleted.

Long channels are the main way an agent like this degrades: the context balloons, cost rises, and the model loses the thread. Three mechanisms keep channels useful, all on by default:

- **A purpose card.** After the first few exchanges, the harness drafts one or two sentences saying what the channel is for. The user can edit it. It is sent with every run in that channel, ahead of the history, so the model always knows what the conversation is about even after older turns are compacted away.
- **Rolling compaction.** Past a token threshold, the oldest turns are folded into a running summary, and only the summary plus recent turns are sent. The full transcript stays stored and searchable; compaction changes what the model sees, never what the user can read. Compaction keeps decisions, facts the user stated, open questions and commitments, and drops chatter. That claim is tested by the eval suite, not assumed.
- **Drift nudges.** When the conversation wanders well away from the purpose card, the harness suggests once, inline, starting a new channel for the new topic, with one click that branches a new channel from there (below); nothing is moved out of the source. Short, focused channels are cheaper and better, and the UI makes them the easy path.
- **Branching.** Any message can start a new channel "from here": the new channel opens with a summary built from the source's summary as it was at that message, the message itself, and a summary of the source refreshed at the moment of branching, and the source is left as it was. This is the by-hand path for a topic that has outgrown a catch-all channel.

## Goals

A goal is an ongoing project: "learn Rust", "keep me posted on shows at a local venue", "a daily audio brief of the news I care about". A goal has four parts:

- **A brief:** what the goal is and what success looks like. User-written, agent-assisted.
- **A state document:** the goal's working memory, owned by the goal and versioned. For "learn Rust" it holds the curriculum and progress through it; for a venue watcher, the shows already reported. The agent reads it on every goal run and changes it through a tool that records each change as a new version. **The state document is also an artifact:** it shows in the artifacts gallery and can be opened, read and edited like any other, so what the agent keeps under the hood is never hidden.
- **Schedules:** zero or more cron-like entries, each a task prompt plus a destination. "Read these sources at 8:00 and 20:00, add new items to the feed." "At 6:30, write and voice a brief, save it as an audio artifact, put it in the digest." Users describe a schedule in plain words; the agent proposes the cron expression and the user confirms it.
- **A channel:** where the user talks to the goal and where goal runs post by default.

The category buttons on the Goals screen (interests, relationships, finance, career, and so on) are prompt templates that draft a goal for the user to edit before saving.

## Feed

The feed collects items that scheduled runs produce for the user to skim: new listings, articles, updates. Items are deduplicated against what is already there and can be marked read. The feed is also published as an Atom feed behind the user's token, so any RSS reader can follow it, and individual goals can publish their own feed.

## Artifacts

Anything a run produces as a file, an image, audio, a document or a link is an artifact, indexed in one gallery and linked back to the run and scope that made it. Goal state documents appear here too.

## Suggestions

A suggestion run, at most daily, reads goal briefs and states, channel purpose cards and recent activity, and proposes a few cards: a next step on a goal, a schedule that would help it, a new goal, or a login to connect so a goal can do more. Accepting a card turns it into a run, a goal, a schedule or a credential request. Dismissed cards are remembered and don't come back. Suggestions can be turned off.

## Tools

The model acts through tools in a registry. Each tool declares its **effect level**: read-only, local (writes only inside Brindle), or external (does something in the world, such as posting, buying or sending). External tools require the user's approval per call unless a goal grants standing permission for that tool. Built-in tools:

- `web_fetch`, `web_search`, `read_feed` for reading the web.
- `create_artifact`, `update_goal_state`, `search_history` for working inside Brindle.
- `propose_schedule`, `propose_goal` for creating structure, always confirmed by the user.
- `speak` for text-to-speech, writing an audio artifact.
- `use_credential` and `request_credential`, through the key manager (below).

More tools plug in over **MCP**, and whole external agents (coding agents and the like) plug in over **ACP** as delegates: a run hands them a task and gets their result back as a tool result.

## Models

The model is pluggable behind one adapter contract: send messages and tool definitions, get back a stream of text and tool calls. Adapters: OpenAI-compatible chat completions (covers local servers such as llama.cpp, ollama and vLLM, plus most hosted APIs) and the Anthropic Messages API. Different scopes can use different models, so a cheap model can run watchers while a strong one handles conversation. Text-to-speech uses an OpenAI-compatible speech endpoint, which local TTS servers also offer.

## Key manager

Goals that act on the user's behalf need logins and API keys. The key manager is its own module with a narrow API, held to a higher bar than the rest of the code: a written threat model, its own test suite, and a red-team suite that tries to make it leak.

- **The model never sees a secret value.** It sees a handle, such as `{{secret:venue-site-login}}`. A tool resolves the handle at the last moment, inside the tool, and only if the call is allowed by the secret's scope.
- **Every secret is scoped:** which hosts it may be sent to, which tools may resolve it, which goals may use it, when it expires, and whether each use needs the user's approval.
- **Values are encrypted at rest**, with a master key held outside the database.
- **Output is scrubbed.** Tool results, model output, logs, artifacts and error messages are checked for every stored secret value, and common encodings of it, before anything is persisted, displayed or sent back to the model.
- **Requesting a login is a first-class flow.** The agent calls `request_credential` with the site and the reason; the user gets a card that opens a vault form. Secrets are entered in the form, never in chat. A secret pasted into chat is detected, moved to the vault on the user's say-so, and redacted from the transcript.
- **Every use is audited:** which run, which tool, which host, allowed or refused.
- **The red-team suite** covers at least: prompt injection in fetched pages telling the agent to send a secret somewhere; sending a handle to a host outside its scope; smuggling a value out through URLs, tool arguments, artifacts, error text or encodings; the model being asked to repeat what a tool returned; the agent asking the user to paste a secret into chat; and the web UI itself (XSS reaching the vault endpoints). Every fixture uses obviously fake values.

## Evals

Harness quality is measured, not asserted. `evals/` holds scenarios replayed against the harness: compaction keeps the facts planted early in a long channel; "read this twice a day" becomes the right schedule; a goal's state document updates correctly after a lesson; injected pages fail to move secrets. CI runs every scenario against a scripted model, so the plumbing is checked on every PR. The same scenarios run against a real model on demand, which costs money and is done when a harness change could move the results.

## Storage and delivery

One process: a Node server with SQLite for everything structured, and artifacts on disk under a data directory. The UI is a PWA, installable on a phone. Streaming is Server-Sent Events. It ships as a Docker image meant for an always-on host, since schedules only fire while the server runs. Single user, a login token, bound to localhost unless configured otherwise.
