import {
  type ModelAdapter,
  ModelError,
  type ModelErrorKind,
  type ModelEvent,
  type ModelRequest,
  type StopReason,
  type ToolCall,
  type Usage,
} from "./adapter.js";

// A fixture is plain JSON so evals and tests can keep canned conversations in files.
export type ScriptedTurn = {
  /** Streamed in order, one text event per chunk. */
  text?: string[];
  toolCalls?: ToolCall[];
  usage?: Usage;
  /** If set, the turn emits its events and then throws, as a dropped connection would. */
  fail?: { kind: ModelErrorKind; message: string; retryable?: boolean };
};

export type ScriptedFixture = { turns: ScriptedTurn[] };

/** Replays one turn per stream() call and records the requests it received. */
export class ScriptedModel implements ModelAdapter {
  readonly requests: ModelRequest[] = [];
  private next = 0;

  constructor(private readonly fixture: ScriptedFixture) {}

  async *stream(request: ModelRequest): AsyncGenerator<ModelEvent> {
    this.requests.push(request);
    const turn = this.fixture.turns[this.next++];
    if (!turn) {
      throw new ModelError("invalid_request", "scripted model has no turn left", false);
    }
    throwIfAborted(request.signal);

    for (const text of turn.text ?? []) {
      yield { type: "text", text };
      throwIfAborted(request.signal);
    }
    for (const call of turn.toolCalls ?? []) {
      yield { type: "tool_call", call };
      throwIfAborted(request.signal);
    }
    if (turn.fail) {
      throw new ModelError(turn.fail.kind, turn.fail.message, turn.fail.retryable);
    }
    const stop: StopReason = turn.toolCalls?.length ? "tool_use" : "end";
    yield { type: "done", stop, usage: turn.usage ?? { inputTokens: 0, outputTokens: 0 } };
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new ModelError("aborted", "request aborted", false);
}
