import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, type Channel, type Run, type RunEvent } from "./api";
import { channelIdFromHash } from "./screens";

const button = "min-h-11 rounded-lg px-3 text-sm font-medium";
const primary = `${button} bg-slate-900 text-white disabled:opacity-50`;
const quiet = `${button} border border-slate-300 text-slate-700 hover:bg-slate-100`;

function Problem({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
      {message}
    </p>
  ) : null;
}

function useChannelId() {
  const [id, setId] = useState(() => channelIdFromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setId(channelIdFromHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return id;
}

export function ChannelsScreen() {
  const id = useChannelId();
  return id ? <ChannelView id={id} /> : <ChannelList />;
}

function ChannelList() {
  const [showArchived, setShowArchived] = useState(false);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    api<Channel[]>(`/api/channels?archived=${showArchived}`)
      .then((list) => {
        setChannels(list);
        setProblem(null);
      })
      .catch((e: unknown) => setProblem(String((e as Error).message)));
  }, [showArchived]);
  useEffect(load, [load]);

  const act = async (path: string, method: string, body?: unknown) => {
    try {
      await api(path, { method, body });
      setRenaming(null);
      load();
    } catch (e) {
      setProblem((e as Error).message);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const made = await api<Channel>("/api/channels", { method: "POST", body: { name } });
      setName("");
      window.location.hash = `#/channels/${made.id}`;
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Channels</h1>
      <form onSubmit={create} className="flex gap-2">
        <input
          aria-label="New channel name"
          placeholder="New channel name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3"
        />
        <button type="submit" className={primary}>
          Create
        </button>
      </form>
      <Problem message={problem} />
      <div className="flex gap-2">
        <button type="button" className={quiet} aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>
          Active
        </button>
        <button type="button" className={quiet} aria-pressed={showArchived} onClick={() => setShowArchived(true)}>
          Archived
        </button>
      </div>
      {channels?.length === 0 && (
        <div>
          <h2 className="font-medium">{showArchived ? "No archived channels" : "No channels yet"}</h2>
          {!showArchived && (
            <p className="text-slate-600">
              A channel is a named conversation with its own history. Start one to talk to your agent.
            </p>
          )}
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {channels?.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            {renaming?.id === c.id ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(`/api/channels/${c.id}`, "PATCH", { name: renaming.name });
                }}
              >
                <input
                  aria-label="Channel name"
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3"
                />
                <button type="submit" className={primary}>
                  Save
                </button>
                <button type="button" className={quiet} onClick={() => setRenaming(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <a href={`#/channels/${c.id}`} className="min-h-6 font-medium">
                {c.name}
              </a>
            )}
            <div className="flex flex-wrap gap-2">
              {c.archivedAt ? (
                <button type="button" className={quiet} onClick={() => act(`/api/channels/${c.id}/restore`, "POST")}>
                  Restore
                </button>
              ) : (
                <>
                  <button type="button" className={quiet} onClick={() => setRenaming({ id: c.id, name: c.name })}>
                    Rename
                  </button>
                  <button type="button" className={quiet} onClick={() => act(`/api/channels/${c.id}/archive`, "POST")}>
                    Archive
                  </button>
                </>
              )}
              <button
                type="button"
                className={`${quiet} text-red-700`}
                onClick={() => {
                  if (window.confirm(`Delete "${c.name}" and its history? This can't be undone.`))
                    void act(`/api/channels/${c.id}`, "DELETE");
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const eventTypes = ["message", "text", "tool_call", "tool_result", "artifact", "error"];

function parse(e: RunEvent): Record<string, unknown> {
  try {
    return JSON.parse(e.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function EventLine({ event }: { event: RunEvent }) {
  const d = parse(event);
  switch (event.type) {
    case "message":
      return <p className="ml-auto max-w-[85%] rounded-lg bg-slate-900 p-3 text-white">{String(d.text)}</p>;
    case "text":
      return <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-slate-100 p-3">{String(d.text)}</p>;
    case "tool_call":
      return <p className="text-xs text-slate-500">Called {String(d.name)}</p>;
    case "tool_result":
      return <p className="text-xs text-slate-500">{String(d.name)} answered</p>;
    case "error":
      return (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {String(d.message)}
        </p>
      );
    default:
      return null;
  }
}

function ChannelView({ id }: { id: string }) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const source = useRef<EventSource | null>(null);

  const reload = useCallback(async () => {
    setRuns(await api<Run[]>(`/api/channels/${id}/runs`));
  }, [id]);

  useEffect(() => {
    setChannel(null);
    api<Channel[]>("/api/channels")
      .then(async (active) => {
        const found =
          active.find((c) => c.id === id) ??
          (await api<Channel[]>("/api/channels?archived=true")).find((c) => c.id === id);
        if (!found) throw new Error("No such channel.");
        setChannel(found);
        await reload();
      })
      .catch((e: unknown) => setProblem((e as Error).message));
    return () => source.current?.close();
  }, [id, reload]);

  // Events replay from the start on connect and again after a reconnect, so merge by seq instead of appending.
  const follow = useCallback(
    (runId: string) => {
      source.current?.close();
      const es = new EventSource(`/api/runs/${runId}/events`);
      source.current = es;
      const take = (e: Event) => {
        // "error" is also the name of EventSource's own connection failure, which carries no data.
        if (!(e instanceof MessageEvent) || typeof e.data !== "string") return;
        const seq = Number(e.lastEventId);
        setRuns((all) =>
          all.map((r) =>
            r.id !== runId || r.events.some((x) => x.seq === seq)
              ? r
              : {
                  ...r,
                  events: [
                    ...r.events,
                    { id: `${runId}:${seq}`, runId, seq, type: e.type, data: e.data, createdAt: "" },
                  ].sort((a, b) => a.seq - b.seq),
                },
          ),
        );
      };
      for (const t of eventTypes) es.addEventListener(t, take);
      es.addEventListener("end", () => {
        es.close();
        reload().catch((err: unknown) => setProblem((err as Error).message));
      });
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          setProblem("Lost the connection to the server.");
          reload().catch(() => {});
        }
      };
    },
    [reload],
  );

  const send = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const run = await api<Run>(`/api/channels/${id}/runs`, { method: "POST", body: { text } });
      setText("");
      setProblem(null);
      setRuns((all) => [...all, { ...run, events: [] }]);
      follow(run.id);
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  const running = runs.find((r) => r.status === "running");
  const readOnly = channel?.archivedAt != null;

  return (
    <div className="flex flex-col gap-4">
      <a href="#/channels" className="min-h-6 text-sm text-slate-600">
        ← All channels
      </a>
      <h1 className="text-2xl font-semibold">{channel?.name ?? "Channel"}</h1>
      <div className="flex flex-col gap-4">
        {runs.map((run) => (
          <section key={run.id} aria-label="Run" className="flex flex-col gap-2">
            {run.events.map((ev) => (
              <EventLine key={ev.seq} event={ev} />
            ))}
            {run.status !== "running" &&
              run.status !== "done" &&
              run.stopReason &&
              !run.events.some((x) => x.type === "error") && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  This run ended: {run.stopReason}.
                </p>
              )}
            {run.status === "cancelled" && <p className="text-xs text-slate-500">Cancelled.</p>}
          </section>
        ))}
      </div>
      <Problem message={problem} />
      {readOnly ? (
        <p className="text-sm text-slate-600">This channel is archived. Restore it to send a message.</p>
      ) : (
        <form onSubmit={send} className="flex gap-2">
          <input
            aria-label="Message"
            placeholder="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3"
          />
          {running ? (
            <button
              type="button"
              className={quiet}
              onClick={() =>
                api(`/api/runs/${running.id}/cancel`, { method: "POST" }).catch((err: unknown) =>
                  setProblem((err as Error).message),
                )
              }
            >
              Cancel
            </button>
          ) : (
            <button type="submit" className={primary} disabled={!channel}>
              Send
            </button>
          )}
        </form>
      )}
    </div>
  );
}
