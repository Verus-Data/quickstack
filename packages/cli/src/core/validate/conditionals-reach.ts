import { Effect } from "effect";
import type { FragmentMeta, StackMeta } from "../../schemas/entry";
import type { Finding } from "../../schemas/validate";
import { scanConditionals } from "../compose/conditionals";
import type { Entry } from "../registry/entry";
import { applies } from "./compose-each";
import { type Check, entryFile, finding, type View } from "./view";

function reachFinding(
  view: View,
  entry: Entry & { meta: FragmentMeta },
  id: string,
  start: number,
): Finding | undefined {
  const stack = view.all.find(
    (item): item is Entry & { meta: StackMeta } =>
      "meta" in item && item.meta.kind === "stack" && item.id === id,
  );
  if (!stack || Object.values(stack.meta.fragments).some((ids) => ids.includes(entry.id)))
    return undefined;
  const allowed = applies(entry.meta, stack);
  return finding(entry, {
    check: "conditional-dead-branch",
    severity: allowed ? "note" : "warning",
    file: entryFile(view, entry),
    line: start + (view.sources.get(entry.dir)?.bodyOffset ?? 0),
    message: allowed
      ? `stack=${id} is reachable only when ${entry.id} is added with --with`
      : `stack=${id} cannot include ${entry.id}: its applies_to does not match`,
  });
}

export const conditionalReachChecks: Check = (view) =>
  Effect.sync(() => {
    const findings: Finding[] = [];
    for (const entry of view.entries) findings.push(...entryReachFindings(view, entry));
    return { findings };
  });

function entryReachFindings(view: View, entry: Entry): Finding[] {
  const findings: Finding[] = [];
  if (entry.meta.kind !== "fragment") return findings;
  const scanned = scanConditionals(entry.body);
  if (!("blocks" in scanned)) return findings;
  for (const block of scanned.blocks)
    for (const id of block.condition.stack ?? []) {
      const found = reachFinding(view, { ...entry, meta: entry.meta }, id, block.start);
      if (found) findings.push(found);
    }
  return findings;
}
