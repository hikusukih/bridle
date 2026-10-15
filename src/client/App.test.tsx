// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows the greeting fetched from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "Hello from Bridle.", since: "2026-01-02T03:04:05.000Z" })),
    );
    render(<App />);
    expect(await screen.findByText("Hello from Bridle.")).toBeTruthy();
  });

  it("says so when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    render(<App />);
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy();
  });
});
