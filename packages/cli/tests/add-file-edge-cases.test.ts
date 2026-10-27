import { chmodSync, lstatSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { addCli, added, addProject, put, refused, releaseAdd, snapshot } from "./helpers/add";
import { minimal, writeEntry } from "./helpers/registry";

afterEach(releaseAdd);

test.each([true, false])(
  "an internal live symlink stays intact when its rendered bytes are identical=%s",
  async (identical) => {
    const p = addProject();
    const entry = writeEntry({
      root: p.registry,
      kind: "fragment",
      dir: "linked",
      frontmatter: minimal("fragment", "linked"),
    });
    put(p.root, "personal.txt", "personal data\n");
    put(entry, "files/link.txt", identical ? "personal data\n" : "contributed data\n");
    symlinkSync("personal.txt", join(p.root, "link.txt"));
    const result = await added(await addCli(p, ["add", "linked", "--json"]));
    expect(lstatSync(join(p.root, "link.txt")).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(p.root, "personal.txt"), "utf8")).toBe("personal data\n");
    expect(readFileSync(join(p.root, "link.txt"), "utf8")).toBe("personal data\n");
    expect(result.written).toEqual([]);
    if (identical) {
      expect(result.skipped).toEqual(["link.txt"]);
      expect(result.mergeNeeded).toEqual([]);
    } else {
      expect(result.skipped).toEqual([]);
      expect(result.mergeNeeded).toEqual([
        { path: "link.txt", incoming: [".stacks/incoming/link.txt"] },
      ]);
      expect(readFileSync(join(p.root, ".stacks/incoming/link.txt"), "utf8")).toBe(
        "contributed data\n",
      );
    }
  },
);

test.skipIf(process.getuid?.() === 0)(
  "an unreadable live file refuses the add before writing any earlier destination",
  async () => {
    const p = addProject();
    const entry = writeEntry({
      root: p.registry,
      kind: "fragment",
      dir: "unreadable",
      frontmatter: minimal("fragment", "unreadable"),
    });
    put(entry, "files/a-new.txt", "new data\n");
    put(entry, "files/z-existing.txt", "contribution\n");
    put(p.root, "z-existing.txt", "personal data\n");
    const before = snapshot(p.root);
    chmodSync(join(p.root, "z-existing.txt"), 0o000);
    try {
      refused(await addCli(p, ["add", "unreadable", "--json"]), 6, "PermissionDenied");
    } finally {
      chmodSync(join(p.root, "z-existing.txt"), 0o600);
    }
    expect(snapshot(p.root)).toEqual(before);
  },
);
