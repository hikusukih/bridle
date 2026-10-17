import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicDir = new URL("./public/", import.meta.url);

describe("PWA manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", publicDir), "utf8"));

  it("is installable: standalone, with a start URL and 192 and 512 icons that exist", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    for (const icon of manifest.icons) {
      expect(existsSync(new URL(icon.src.replace(/^\//, ""), publicDir))).toBe(true);
    }
  });

  it("is linked from the page", () => {
    const html = readFileSync(new URL("index.html", import.meta.url), "utf8");
    expect(html).toContain('rel="manifest"');
  });
});
