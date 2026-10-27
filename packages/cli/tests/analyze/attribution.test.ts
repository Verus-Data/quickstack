import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Exit } from "effect";
import { describe, expect, test } from "vitest";
import { readAttribution } from "../../src/core/analyze/record";
import { runFs } from "./helpers";

async function readAttr(target: string, label?: string) {
  const exit = await runFs(readAttribution(target, label));
  if (Exit.isFailure(exit)) throw new Error(`readAttribution failed: ${String(exit.cause)}`);
  return exit.value;
}

describe("attribution", () => {
  test("with a manifest carries stack, fragments, preset and fingerprint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "attr-manifest-"));
    try {
      mkdirSync(join(dir, ".quickstacks"), { recursive: true });
      writeFileSync(
        join(dir, ".quickstacks", "manifest.json"),
        JSON.stringify({
          stack: "astro-blog",
          with: ["tailwind"],
          preset: "default",
          agent: "claude",
          fingerprint: "sha256:abc",
          unknownField: "ignored",
        }),
        "utf8",
      );
      const { attribution, warning } = await readAttr(dir);
      expect(warning).toBeUndefined();
      expect(attribution.kind).toBe("manifest");
      expect(attribution.stack).toBe("astro-blog");
      expect(attribution.with).toEqual(["tailwind"]);
      expect(attribution.preset).toBe("default");
      expect(attribution.agent).toBe("claude");
      expect(attribution.fingerprint).toBe("sha256:abc");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("without a manifest is kind none and still valid", async () => {
    const dir = mkdtempSync(join(tmpdir(), "attr-none-"));
    try {
      const { attribution } = await readAttr(dir);
      expect(attribution.kind).toBe("none");
      expect(attribution.stack).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("without a manifest but with a label is kind label", async () => {
    const dir = mkdtempSync(join(tmpdir(), "attr-label-"));
    try {
      const { attribution } = await readAttr(dir, "my-label");
      expect(attribution.kind).toBe("label");
      expect(attribution.label).toBe("my-label");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("with a malformed manifest warns and falls back to kind none", async () => {
    const dir = mkdtempSync(join(tmpdir(), "attr-bad-"));
    try {
      mkdirSync(join(dir, ".quickstacks"), { recursive: true });
      writeFileSync(join(dir, ".quickstacks", "manifest.json"), "{not json", "utf8");
      const { attribution, warning } = await readAttr(dir);
      expect(warning).toBeDefined();
      expect(attribution.kind).toBe("none");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
