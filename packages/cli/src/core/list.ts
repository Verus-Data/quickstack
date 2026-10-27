import type { LedgerRecord } from "../schemas/ledger";
import type { ListResult, ListRow } from "../schemas/list";
import type { Manifest } from "../schemas/manifest";
import { fitsStack } from "./compose/selection";
import { lastRun } from "./ledger";
import { type Entry, isRejected, type RejectedEntry } from "./registry/entry";

export const groups = ["stacks", "fragments", "apps"] as const;
export type Group = (typeof groups)[number];

/** `records` is the bundled ledger, so only bundled stacks get a `lastRun` from it. */
export function toRow(entry: Entry, records: ReadonlyArray<LedgerRecord> = []): ListRow {
  const { meta } = entry;
  return {
    id: entry.id,
    kind: entry.kind,
    name: meta.name,
    description: meta.description,
    tags: meta.tags,
    ...(meta.kind === "fragment" ? { category: meta.category, appliesTo: meta.appliesTo } : {}),
    origin: entry.origin,
    trusted: entry.trusted,
    shadows: entry.shadows,
    lastRun:
      entry.kind === "stack" && entry.origin === "bundled" ? lastRun(records, entry.id) : null,
  };
}

export const inGroup = (row: ListRow, group: Group | undefined) =>
  group === undefined ||
  (group === "stacks" && row.kind === "stack") ||
  (group === "fragments" && row.kind === "fragment" && row.category !== "app") ||
  (group === "apps" && row.category === "app");

/** The `list` result: entries in `group` (all when absent), and rejected entries of its kind. */
export function listResult(
  items: ReadonlyArray<Entry | RejectedEntry>,
  group: Group | undefined,
  records: ReadonlyArray<LedgerRecord> = [],
): ListResult {
  let kind: "stack" | "fragment" | undefined;
  if (group !== undefined) kind = group === "stacks" ? "stack" : "fragment";
  return {
    entries: items
      .filter((item): item is Entry => !isRejected(item))
      .map((entry) => toRow(entry, records))
      .filter((row) => inGroup(row, group)),
    rejected: items
      .filter(isRejected)
      .filter((item) => kind === undefined || item.kind === kind)
      .map(({ id, kind, origin, dir, error }) => ({ id, kind, origin, dir, error })),
  };
}

export function projectChoices(all: ReadonlyArray<ListRow>, manifest: Manifest | undefined) {
  const stack = all.find((row) => row.kind === "stack" && row.id === manifest?.stack?.id);
  const applied = manifest?.fragments.map((entry) => entry.id) ?? [];
  const addable = all.filter(
    (row) =>
      row.kind === "fragment" &&
      !applied.includes(row.id) &&
      (!stack || fitsStack(row.appliesTo ?? [], stack)),
  );
  const project = manifest
    ? { stack: manifest.stack?.id ?? null, applied, addable: addable.map((row) => row.id) }
    : undefined;
  return { project, addable };
}
