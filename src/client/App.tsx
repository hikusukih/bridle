import { useEffect, useState } from "react";
import type { Greeting } from "../server/app";

type State = { kind: "loading" } | { kind: "ready"; greeting: Greeting } | { kind: "error"; message: string };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/greeting")
      .then((res) => {
        if (!res.ok) throw new Error(`Server answered ${res.status}`);
        return res.json() as Promise<Greeting>;
      })
      .then((greeting) => !cancelled && setState({ kind: "ready", greeting }))
      .catch((err: unknown) => !cancelled && setState({ kind: "error", message: String(err) }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-2 p-6 font-sans text-slate-800">
      <h1 className="text-2xl font-semibold">Bridle</h1>
      {state.kind === "loading" && <p className="text-slate-500">Reaching the server…</p>}
      {state.kind === "ready" && (
        <>
          <p>{state.greeting.message}</p>
          <p className="text-sm text-slate-500">Running since {new Date(state.greeting.since).toLocaleString()}</p>
        </>
      )}
      {state.kind === "error" && <p className="text-red-700">Could not reach the server: {state.message}</p>}
    </main>
  );
}
