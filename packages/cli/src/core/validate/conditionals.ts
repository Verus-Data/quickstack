import { Effect } from "effect";
import type { ConditionalProblem } from "../../errors";
import type { Finding } from "../../schemas/validate";
import { scanConditionals } from "../compose/conditionals";
import { markdownFile } from "../registry/entry";
import { Registry } from "../registry/registry";
import { type Check, entryFile, finding } from "./view";

const PROBLEMS: Record<ConditionalProblem, string> = {
  unclosed: "a when block has no end marker",
  nested: "a when block opens inside another; blocks don't nest",
  stray_end: "an end marker closes no block",
  unknown_key: "a when marker has an unknown key (stack, tag, tag!=, mode, preset, with)",
  bad_value: "a when marker has an empty value, or a mode or preset value that doesn't exist",
  empty: "a when marker has no condition",
  repeated: "a when marker repeats a key; use commas for alternatives",
  unknown_marker: "an unknown quickstacks: directive (when, end and fill exist)",
  not_alone: "a marker shares its line with other text",
};

/**
 * Conditional prose in each body: the first malformed marker (1.1's `ConditionalProblem`), with
 * its line in the file; otherwise every `stack=` and `with=` id names an entry of the resolution
 * set, and every `tag=` or `tag!=` value is a tag some stack declares.
 */
export const conditionalChecks: Check = (view) =>
  Effect.gen(function* () {
    const registry = yield* Registry;
    const findings: Finding[] = [];
    /**
     * A `stack=` or `with=` id: unknown is an error; found only outside the root is the same
     * `resolved-outside-root` note `referenceChecks` gives, since the block then depends on this
     * machine.
     */
    const resolve = (kind: "stack" | "fragment", key: string, id: string) => {
      const target = view.all.find((item) => item.kind === kind && item.id === id);
      if (!target)
        return {
          check: "conditional-ids",
          severity: "error",
          message: `${key}=${id} names no ${kind}, so the block is never kept`,
        } as const;
      if (view.inRoot(target)) return undefined;
      return {
        check: "resolved-outside-root",
        severity: "note",
        message: `${key}=${id} names a ${kind} found in the ${target.origin} registry`,
      } as const;
    };
    const tags = new Set(
      view.all.flatMap((item) =>
        "meta" in item && item.meta.kind === "stack" ? item.meta.tags : [],
      ),
    );
    for (const entry of view.entries) {
      const file = entryFile(view, entry);
      // The body is the file's tail, so file lines are body lines plus the lines before it.
      const text = yield* Effect.option(registry.read(entry, markdownFile(entry.kind)));
      const offset =
        text._tag === "Some" ? text.value.split("\n").length - entry.body.split("\n").length : 0;
      const scanned = scanConditionals(entry.body);
      if (!("blocks" in scanned)) {
        findings.push(
          finding(entry, {
            check: "conditional-syntax",
            severity: "error",
            file,
            line: scanned.line + offset,
            problem: scanned.problem,
            message: PROBLEMS[scanned.problem],
          }),
        );
        continue;
      }
      for (const block of scanned.blocks) {
        const line = block.start + offset;
        for (const [kind, key, ids] of [
          ["stack", "stack", block.condition.stack ?? []],
          ["fragment", "with", block.condition.with ?? []],
        ] as const)
          for (const id of ids) {
            const found = resolve(kind, key, id);
            if (found) findings.push(finding(entry, { ...found, file, line }));
          }
        for (const [key, values] of [
          ["tag", block.condition.tag ?? []],
          ["tag!", block.condition["tag!="] ?? []],
        ] as const)
          for (const tag of values)
            if (!tags.has(tag))
              findings.push(
                finding(entry, {
                  check: "conditional-tag",
                  severity: "warning",
                  file,
                  line,
                  message: `${key}=${tag} is a tag no stack declares`,
                }),
              );
      }
    }
    return { findings };
  });
