import { type ArtifactStore, artifactKinds } from "../artifacts.js";
import type { Tool } from "./registry.js";

/** `local`: it writes, but only inside Brindle's own data directory. */
export function createArtifactTool(store: ArtifactStore): Tool {
  return {
    name: "create_artifact",
    description:
      "Save something you made as an artifact the user can open later: a document (Markdown), code, data (JSON), a page (HTML) or a link. Give it a clear title.",
    effect: "local",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: [...artifactKinds] },
        content: { type: "string" },
        filename: { type: "string" },
      },
      required: ["title", "kind", "content"],
    },
    describeCall: (args) => `Save "${String(args.title)}"`,
    async execute(args, ctx) {
      const artifact = store.create(args, { scope: ctx.scope.kind, scopeId: ctx.scope.id, runId: ctx.runId });
      ctx.emit("artifact", { id: artifact.id, title: artifact.title, kind: artifact.kind });
      return `Saved artifact "${artifact.title}" (${artifact.id}).`;
    },
  };
}
