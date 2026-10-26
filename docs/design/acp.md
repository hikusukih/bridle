# Design note: ACP delegates

Box P9.2. Status: proposed. Implementation (P9.3) waits until this merges.

## Problem

Some work is better done by an existing coding or research agent than by this harness's own loop. The Agent Client Protocol (ACP) is the standard way an editor-like client drives such an agent, so a run should be able to hand a task to one and get a result back, with the agent's requests for permission surfacing as the approval cards already designed in `docs/design/tools.md`.

## The protocol, as checked

Checked on the day of writing through a web search; the official site could not be fetched from the session's sandbox, so the method list below comes from search snippets of the specification's overview and from third-party SDK documentation. **P9.3 must re-read the specification before coding, and the first thing it does is confirm or correct this section.**

- ACP is JSON-RPC 2.0 between a **client** (here, the harness) and an **agent**, which normally runs as a subprocess of the client and talks over its standard input and output, one JSON message per line.
- A session starts with `initialize` (versions and capabilities are exchanged) and `session/new` (or the optional `session/load`, which needs the `loadSession` capability); `authenticate` exists for agents that need it.
- A task is a **prompt turn**: the client sends `session/prompt`; the agent streams progress back as `session/update` notifications (message text, plans, tool calls and their status); the turn ends when the `session/prompt` response carries a stop reason. The client may send `session/cancel` at any time.
- The agent may call back into the client: `session/request_permission` (the agent asks the client to approve an action), and file-system and terminal methods where the client advertises them.
- It is implemented by a growing set of agents and editors, and there is an official TypeScript SDK. The protocol is versioned and has a draft track, so version negotiation matters.

## Approach

### A delegate is a tool, with the effect level `external`

`delegate_task(agent, task)` is registered like any tool and is `external`: handing work and the user's files to another program is an action in the world. Each call therefore waits for approval under the existing flow, showing the agent's name and the task text. Which agents exist is configuration, not something the model chooses: an operator lists named agents (a command, its arguments, a working directory and an environment allow-list), and the model can name only those. The model cannot supply a command line.

### Mapping a run to an ACP session

One delegate call is one ACP session and one prompt turn. The harness starts the subprocess, runs `initialize` and `session/new` with the configured working directory, sends the task in `session/prompt`, and ends the session when the turn ends or the run is cancelled. Nothing is reused between calls, which keeps state out of the picture; `session/load` and long-lived sessions can come later.

While the turn runs, `session/update` notifications are written to the run as events (a new `delegate_update` type, shown folded under the delegate's tool call, so the user can watch). The tool's result to the model is the agent's final message plus a short list of what it did, cut by the same sizing step as any result. The run's step and time limits apply to the delegate as to any tool call; hitting the time limit sends `session/cancel`, waits briefly, then kills the process.

### Permission requests become approval cards

A `session/request_permission` from the agent becomes an `approval_request` event on the run, carrying the agent's description of the action and its options, and parks the run in `waiting` exactly as in the tools note. The user's choice is returned as the response. There is **no standing permission for delegate-originated requests in this phase**, and the approval timeout ends the run as usual. If the user is not there, the agent waits; it is never answered on the user's behalf. File and terminal requests from the agent are not advertised as client capabilities in the first version: the agent works in its own directory using its own tools, and anything it wants beyond that arrives as a permission request.

### Containing the subprocess

The delegate runs as an unprivileged process in a directory the operator names, with an environment built from an allow-list, so the server's own variables (and later the key manager's key file path) are not inherited. The key manager's rule holds: **no secret value is ever put in a task or in the delegate's environment**; a delegate needing a credential is out of scope until the key manager can issue one the delegate cannot read. The task text and the agent's output pass through the same scrubbing step as any tool result once the key manager exists.

## Rejected

- Letting the model name the command to run. That is arbitrary code execution chosen by untrusted text.
- Treating a delegate as `local` because it runs on the same machine. It acts with its own tools and can do anything its process can.
- Answering the agent's permission requests automatically, or mapping them to "approve for the session" now. That is the standing-permission design, which belongs to Phase 4 with the rest of the grant model.
- Long-lived shared sessions across runs. They hide state and complicate restarts; a fresh session per call is predictable.
- Implementing the protocol by hand rather than using the official SDK, if the SDK fits. P9.3 decides after reading it; a small dependency beats a private reimplementation that drifts.

## How evals will tell if it works

P9.3 writes a **fake ACP agent**, a few dozen lines speaking the protocol over a pipe, and tests against it in CI; one manual check uses a real coding agent, as the plan says.

- A delegate call never starts the subprocess before approval, and starts it with only the allow-listed environment.
- Updates from the fake agent appear as events; its final message becomes the tool result, cut when huge.
- A permission request from the agent produces an approval card, the run waits (including across a restart: the subprocess is gone, so the run resumes as a failed delegate call with a clear error rather than pretending), and approve and decline each reach the agent as the right response.
- Cancel and the time limit send `session/cancel` and leave no process behind.
- A fake agent that hangs, crashes, speaks an unsupported version or writes invalid JSON ends the call with an error result, not the run.
- A scripted scenario shows the model cannot reach an agent that is not configured.

## Open for the user

- Which real agent to verify against first.
- Whether the delegate's file edits should show as a diff card in the channel (proposed for later) or only as the agent's own summary.
- Whether an operator-configured agent may ever be marked as not needing approval (proposed: not until Phase 4's standing permission exists).
