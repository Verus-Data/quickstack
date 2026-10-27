import { Effect } from "effect";
import type { StackMeta } from "../../schemas/entry";
import type { Finding } from "../../schemas/validate";
import { scanConditionals } from "../compose/conditionals";
import type { Entry } from "../registry/entry";
import { applies } from "./compose-each";
import { type Check, entryFile, finding } from "./view";

export const conditionalReachChecks: Check = (view) =>
  Effect.sync(() => {
    const findings: Finding[] = [];
    for (const entry of view.entries) {
      if (entry.meta.kind !== "fragment") continue;
      const scanned = scanConditionals(entry.body);
      if (!("blocks" in scanned)) continue;
      for (const block of scanned.blocks)
        for (const id of block.condition.stack ?? []) {
          const stack = view.all.find(
            (item): item is Entry & { meta: StackMeta } =>
              "meta" in item && item.meta.kind === "stack" && item.id === id,
          );
          if (!stack || Object.values(stack.meta.fragments).some((ids) => ids.includes(entry.id)))
            continue;
          const allowed = applies(entry.meta, stack);
          findings.push(
            finding(entry, {
              check: "conditional-dead-branch",
              severity: allowed ? "note" : "warning",
              file: entryFile(view, entry),
              line: block.start + (view.sources.get(entry.dir)?.bodyOffset ?? 0),
              message: allowed
                ? `stack=${id} is reachable only when ${entry.id} is added with --with`
                : `stack=${id} cannot include ${entry.id}: its applies_to does not match`,
            }),
          );
        }
    }
    return { findings };
  });
