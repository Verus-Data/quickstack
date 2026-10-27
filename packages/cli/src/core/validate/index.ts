import { Effect, Path } from "effect";
import type { Finding, SizeRow, ValidateReport } from "../../schemas/validate";
import { type Entry, isRejected, type RejectedEntry } from "../registry/entry";
import { defaultRoots, Registry, type RegistryRoots } from "../registry/registry";
import { bodyChecks, compositionChecks } from "./compositions";
import { conditionalChecks } from "./conditionals";
import { fileChecks } from "./files";
import { loadChecks, metadataChecks } from "./format";
import { gitChecks } from "./git";
import { referenceChecks } from "./references";
import type { Target } from "./target";
import type { Check, View } from "./view";

/**
 * Every check group, in report order within an entry. A later sub-phase (2.2) adds its own
 * modules here without touching these.
 */
export const checks: ReadonlyArray<Check> = [
  loadChecks,
  metadataChecks,
  referenceChecks,
  conditionalChecks,
  fileChecks,
  gitChecks,
  bodyChecks,
  compositionChecks,
];

/**
 * The registry roots `validate` resolves through: the target root first, so its entries shadow
 * every other origin, then this invocation's own origins. The bundled registry resolves only
 * inside itself, since it ships to users who have nobody else's user directory.
 */
export const validationRoots = (target: Target) =>
  Effect.gen(function* () {
    if (target.bundled) return [{ origin: "bundled", path: target.root }] satisfies RegistryRoots;
    const others = yield* defaultRoots;
    // The root keeps the origin it already has for this invocation; any other directory is
    // treated like the user directory, the place an author's own entries live.
    const origin = others.find((root) => root.path === target.root)?.origin ?? "user";
    return [
      { origin, path: target.root },
      ...others.filter((root) => root.path !== target.root),
    ] satisfies RegistryRoots;
  });

const severityRank = { error: 0, warning: 1, note: 2 } as const;
const kindRank = (kind: Finding["kind"]) => (kind === undefined ? 0 : kind === "stack" ? 1 : 2);
function compareFindings(a: Finding, b: Finding): number {
  return (
    kindRank(a.kind) - kindRank(b.kind) ||
    (a.entry ?? "").localeCompare(b.entry ?? "", "en") ||
    severityRank[a.severity] - severityRank[b.severity] ||
    (a.file ?? "").localeCompare(b.file ?? "", "en") ||
    (a.line ?? 0) - (b.line ?? 0) ||
    a.check.localeCompare(b.check, "en") ||
    a.message.localeCompare(b.message, "en")
  );
}
const sizeRank = { body: 0, composed: 1, shipped: 2 } as const;

/**
 * Validates the entries under `target.root` (or the one entry `target.only` names). Never stops
 * at the first bad entry: every problem is a finding. Fails only when a root can't be read.
 */
export const validate = (target: Target) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const roots = yield* validationRoots(target);
    return yield* Effect.gen(function* () {
      const registry = yield* Registry;
      const all = yield* registry.all;
      const inRoot = (item: { dir: string }) =>
        path.dirname(path.dirname(item.dir)) === target.root;
      const wanted = (item: { kind: string; id: string }) =>
        target.only === undefined || (target.only.kind === item.kind && target.only.id === item.id);
      const validated = all.filter((item) => inRoot(item) && wanted(item));
      const view: View = {
        root: target.root,
        bundled: target.bundled,
        entries: validated.filter((item): item is Entry => !isRejected(item)),
        rejected: validated.filter((item): item is RejectedEntry => isRejected(item)),
        all,
        wanted,
        inRoot,
        file: (item, inside) =>
          [path.relative(target.root, item.dir).split(path.sep).join("/"), inside]
            .filter(Boolean)
            .join("/"),
      };
      const findings: Finding[] = [];
      const sizes: SizeRow[] = [];
      for (const check of checks) {
        const result = yield* check(view);
        findings.push(...result.findings);
        sizes.push(...(result.sizes ?? []));
      }
      const count = (kind: "stack" | "fragment") =>
        validated.filter((item) => item.kind === kind).length;
      return {
        root: target.root,
        bundled: target.bundled,
        entries: { stacks: count("stack"), fragments: count("fragment") },
        findings: findings.sort(compareFindings),
        // Stable sort: within a kind, rows stay in the order the checks produced them.
        sizes: sizes.sort((a, b) => sizeRank[a.kind] - sizeRank[b.kind]),
      } satisfies ValidateReport;
    }).pipe(Effect.provide(Registry.layer(roots)));
  });
