import type { ListResult, ListRow } from "../schemas/list";
import { type Entry, isRejected, type RejectedEntry } from "./registry/entry";
import { printable } from "./text";

export const groups = ["stacks", "fragments", "apps"] as const;
export type Group = (typeof groups)[number];

export function toRow(entry: Entry): ListRow {
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
    lastRun: null,
  };
}

const inGroup = (row: ListRow, group: Group | undefined) =>
  group === undefined ||
  (group === "stacks" && row.kind === "stack") ||
  (group === "fragments" && row.kind === "fragment" && row.category !== "app") ||
  (group === "apps" && row.category === "app");

/** The `list` result: entries in `group` (all when absent), and rejected entries of its kind. */
export function listResult(
  items: ReadonlyArray<Entry | RejectedEntry>,
  group: Group | undefined,
): ListResult {
  const kind = group === undefined ? undefined : group === "stacks" ? "stack" : "fragment";
  return {
    entries: items
      .filter((item): item is Entry => !isRejected(item))
      .map(toRow)
      .filter((row) => inGroup(row, group)),
    rejected: items
      .filter(isRejected)
      .filter((item) => kind === undefined || item.kind === kind)
      .map(({ id, kind, origin, dir, error }) => ({ id, kind, origin, dir, error })),
  };
}

/** Words of `text` in lines no wider than `width` (with `indent`); a long word gets its own line. */
export function wrap(text: string, width: number, indent: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      lines.push(indent + line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(indent + line);
  return lines;
}

const sections = [
  { title: "Stacks", group: "stacks" },
  { title: "Fragments", group: "fragments" },
  { title: "Apps", group: "apps" },
] as const;

/**
 * The human view: one section per group with rows, a Rejected block, then `Next:` lines. `all`
 * is every row in the registry (not only this group), which picks the stack `Next:` names. Every
 * field from an entry goes through `printable`, so no file can steer the terminal.
 */
export function renderList(
  result: ListResult,
  all: ReadonlyArray<ListRow>,
  options: { group: Group | undefined; width: number; invocation: string },
): string {
  const { width, invocation } = options;
  const rows = result.entries;
  const showOrigin = new Set(rows.map((row) => row.origin)).size > 1;
  const originWidth = Math.max(0, ...rows.map((row) => row.origin.length));
  const line = (row: ListRow, idWidth: number) =>
    [
      printable(row.id).padEnd(idWidth),
      ...(showOrigin ? [row.origin.padEnd(originWidth)] : []),
      ...(row.category === "app"
        ? [`on ${printable((row.appliesTo ?? []).join(", "))}`]
        : row.category
          ? [row.category]
          : []),
      ...(row.trusted ? [] : ["untrusted"]),
      ...(row.shadows.length ? [`shadows ${row.shadows.join(", ")}`] : []),
    ]
      .join("  ")
      .trimEnd();
  const out: string[] = [];
  for (const section of sections) {
    const members = rows.filter((row) => inGroup(row, section.group));
    if (!members.length) continue;
    if (out.length) out.push("");
    out.push(section.title);
    const idWidth = Math.max(...members.map((row) => printable(row.id).length));
    // Whitespace (newlines included) folds to single spaces before escaping, as wrap would.
    for (const row of members)
      out.push(
        `  ${line(row, idWidth)}`,
        ...wrap(printable(row.description.replace(/\s+/g, " ")), width, "    "),
      );
  }
  if (!rows.length) {
    const what = options.group ?? "stacks or fragments";
    out.push(`No ${what} found.`);
  }
  if (result.rejected.length) {
    out.push("", "Rejected");
    // The directory goes on its own line, whole, so it can be copied.
    for (const entry of result.rejected)
      out.push(
        `  ${entry.kind} ${printable(entry.id)} (${entry.origin}): ${printable(entry.error)}`,
        `    ${printable(entry.dir)}`,
      );
  }
  out.push("", ...nextLines(all, result.rejected.length > 0, options.group, invocation));
  return out.join("\n");
}

function nextLines(
  all: ReadonlyArray<ListRow>,
  rejected: boolean,
  group: Group | undefined,
  invocation: string,
) {
  const stacks = all.filter((row) => row.kind === "stack");
  // No stacks: a rejected entry is the likelier cause; otherwise the registry path is wrong.
  if (!stacks.length)
    return [
      rejected
        ? `Next: fix or remove the rejected entries above, then run ${invocation} list`
        : `Next: ${invocation} doctor`,
    ];
  // Only a trusted stack and app are ever suggested; an untrusted one is for the reader to judge.
  const trusted = stacks.filter((row) => row.trusted);
  const stack = trusted[0];
  if (!stack) return [`Next: ${invocation} list --json`];
  const ids = new Set(trusted.map((row) => row.id));
  const app =
    group === "apps"
      ? all
          .filter((row) => row.category === "app" && row.trusted)
          .flatMap((row) =>
            (row.appliesTo ?? []).filter((id) => ids.has(id)).map((on) => ({ id: row.id, on })),
          )[0]
      : undefined;
  return [
    app
      ? `Next: ${invocation} new ${app.on} my-project --with ${app.id} --sandbox`
      : `Next: ${invocation} new ${stack.id} my-project --sandbox`,
    `Next: ${invocation} list --json`,
  ];
}
