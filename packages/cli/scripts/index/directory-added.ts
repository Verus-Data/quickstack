import type { DirectoryData, IndexEntry } from "@stacks/format";
import { Effect, Path } from "effect";
import { markdownFile } from "../../src/core/registry/entry";
import { historyExec } from "./history";

const firstAddition = (cwd: string, file: string) =>
  historyExec(cwd, ["git", "log", "--diff-filter=A", "--format=%H", "--", file]).pipe(
    Effect.map((text) => text.split("\n").filter(Boolean).at(-1)),
  );

export const addedEntries = Effect.fn("index.addedEntries")(function* (options: {
  cwd: string;
  root: string;
  entries: ReadonlyArray<IndexEntry>;
}) {
  const path = yield* Path.Path;
  const checkout = yield* historyExec(options.cwd, ["git", "rev-parse", "--show-toplevel"]);
  const rows: DirectoryData["entries"][number][] = [];
  for (const entry of options.entries) {
    // Registry ids must equal their directory names, including entries now carried by the index.
    const file = path.relative(
      checkout,
      path.join(options.root, `${entry.kind}s`, entry.id, markdownFile(entry.kind)),
    );
    const first = yield* firstAddition(checkout, file);
    if (first === undefined)
      return yield* Effect.fail(
        new Error(`${entry.kind}/${entry.id}: added dates need a committed definition file.`),
      );
    const addedAt = yield* historyExec(checkout, ["git", "show", "-s", "--format=%cI", first]);
    rows.push({ id: entry.id, kind: entry.kind, addedAt });
  }
  return rows.sort((a, b) => `${a.kind}/${a.id}`.localeCompare(`${b.kind}/${b.id}`, "en"));
});
