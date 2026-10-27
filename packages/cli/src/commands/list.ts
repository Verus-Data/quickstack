import { Effect, Option, Schema } from "effect";
import { Argument, Command } from "effect/cli";
import { readLedger } from "../core/ledger";
import { type Group, groups, listResult, renderList, toRow } from "../core/list";
import { type Entry, isRejected } from "../core/registry/entry";
import { defaultRoots, Registry } from "../core/registry/registry";
import { shownPath } from "../core/shown-path";
import { closest } from "../core/suggest";
import { Usage } from "../errors";
import { ListResult } from "../schemas/list";
import { Host } from "../services/host";
import { Output } from "../services/output";

const isGroup = (value: string): value is Group =>
  (groups as ReadonlyArray<string>).includes(value);

export const listCommand = Command.make(
  "list",
  {
    group: Argument.String("group").pipe(
      Argument.withDescription(
        "Show one group: stacks, fragments (apps excluded) or apps. Omit it to show all three.",
      ),
      Argument.optional,
    ),
  },
  ({ group }) =>
    Effect.gen(function* () {
      const typed = Option.getOrUndefined(group);
      if (typed !== undefined && !isGroup(typed))
        return yield* new Usage({
          details: { command: typed, suggestions: closest(typed, groups) },
        });
      const host = yield* Host;
      const roots = yield* defaultRoots;
      const bundled = roots.find((root) => root.origin === "bundled");
      const ledger = bundled ? yield* readLedger(bundled.path) : undefined;
      const records = ledger?.records ?? [];
      const items = yield* Registry.pipe(
        Effect.flatMap((registry) => registry.all),
        Effect.provide(Registry.layer(roots)),
      );
      const result = listResult(items, typed, records);
      const all = items
        .filter((item): item is Entry => !isRejected(item))
        .map((entry) => toRow(entry, records));
      const output = yield* Output;
      const agent = output.audience === "agent";
      // A human's descriptions wrap to the terminal; an agent's stay on one line each.
      const width = agent
        ? Number.POSITIVE_INFINITY
        : host.stdoutIsTTY && host.stdoutColumns
          ? Math.min(80, Math.max(20, host.stdoutColumns))
          : 80;
      const rejected = agent
        ? yield* Effect.forEach(result.rejected, (entry) =>
            Effect.map(shownPath(host.cwd, entry.dir), (dir) => ({ ...entry, dir })),
          )
        : result.rejected;
      yield* output.result(
        Schema.encodeSync(ListResult)(result),
        renderList({ ...result, rejected }, all, {
          group: typed,
          width,
          invocation: host.invocation,
          ledgerPresent: ledger?.present ?? false,
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "List the stacks, fragments and apps you can build from, with where each comes from and whether it is trusted.",
  ),
);
