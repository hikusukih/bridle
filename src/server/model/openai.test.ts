import { describe, expect, it } from "vitest";
import { runAdapterContract } from "./contract.js";
import { httpFactory } from "./http-contract.js";
import { OpenAiAdapter } from "./openai.js";

const make = (fetch: typeof globalThis.fetch) =>
  new OpenAiAdapter({
    baseUrl: "https://llm.example.com/v1",
    model: "test-model",
    apiKey: "sk-test-1234abcd1234abcd",
    fetch,
  });

runAdapterContract("OpenAiAdapter", httpFactory(make, "openai"));

describe("OpenAiAdapter request", () => {
  it("sends the key, tools and prior tool results in the wire format", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const adapter = make(async (url, init) => {
      seen = { url: String(url), init: init as RequestInit };
      return new Response("data: [DONE]\n\n", { status: 200 });
    });
    const stream = adapter.stream({
      messages: [
        { role: "user", content: "go" },
        { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "t", arguments: { a: 1 } }] },
        { role: "tool", toolCallId: "c1", content: "ok" },
      ],
      tools: [{ name: "t", description: "d", parameters: { type: "object" } }],
    });
    await stream.next().catch(() => {});

    expect(seen?.url).toBe("https://llm.example.com/v1/chat/completions");
    expect((seen?.init.headers as Record<string, string> | undefined)?.authorization).toBe(
      "Bearer sk-test-1234abcd1234abcd",
    );
    const body = JSON.parse(String(seen?.init.body));
    expect(body.tools[0].function.name).toBe("t");
    expect(body.messages[1].tool_calls[0].function.arguments).toBe('{"a":1}');
    expect(body.messages[2]).toEqual({ role: "tool", tool_call_id: "c1", content: "ok" });
  });
});
