import type { ListResult, ListRow } from "../schemas/list";
import { plainStyle, type Style } from "../services/output";
import { type Group, inGroup } from "./list";
import { printable } from "./text";
import { wrapWords } from "./wrap";

/** Words of `text` in lines no wider than `width` (with `indent`); a long word gets its own line. */
function descriptionLines(
  text: string,
  width: number,
  measure = (s: string) => s.length,
): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  return wrapWords(normalized, width - measure("    "), measure)
    .split("\n")
    .map((line) => `    ${line}`);
}

const sections = [
  { title: "Stacks", group: "stacks" },
  { title: "Fragments", group: "fragments" },
  { title: "Apps", group: "apps" },
] as const;

function categoryFields(row: ListRow): string[] {
  if (row.category === "app") return [`on ${printable((row.appliesTo ?? []).join(", "))}`];
  return row.category ? [row.category] : [];
}

function ledgerFields(row: ListRow, present: boolean | undefined, style: Style): string[] {
  if ((!present && row.origin !== "index") || row.kind !== "stack") return [];
  if (!row.lastRun) return [style("dim", "unproven")];
  const result = row.lastRun.result === "pass" ? "historical pass" : row.lastRun.result;
  return [
    `${style(row.lastRun.result === "pass" ? "ok" : "warn", result)} ${printable(row.lastRun.date)}`,
  ];
}

/**
 * The human view: one section per group with rows, a Rejected block, then `Next:` lines. `all`
 * is every row in the registry (not only this group), which picks the stack `Next:` names. Every
 * field from an entry goes through `printable`, so no file can steer the terminal.
 */
export function renderList(
  result: ListResult,
  all: ReadonlyArray<ListRow>,
  options: {
    group: Group | undefined;
    width: number;
    invocation: string;
    ledgerPresent?: boolean;
    measure?: (text: string) => number;
    style?: Style;
  },
): string {
  const { width, invocation } = options;
  const style = options.style ?? plainStyle;
  const rows = result.entries;
  const showOrigin = new Set(rows.map((row) => row.origin)).size > 1;
  const originWidth = Math.max(0, ...rows.map((row) => row.origin.length));
  const line = (row: ListRow, idWidth: number) =>
    [
      printable(row.id).padEnd(idWidth),
      ...(showOrigin ? [row.origin.padEnd(originWidth)] : []),
      ...categoryFields(row),
      ...ledgerFields(row, options.ledgerPresent, style),
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
        ...descriptionLines(
          printable(row.description.replace(/\s+/g, " ")),
          width,
          options.measure,
        ),
      );
  }
  if (!rows.length) {
    const what = options.group ?? "stacks or fragments";
    out.push(`No ${what} found.`);
  }
  out.push(...rejectedLines(result.rejected));
  out.push(
    "",
    ...nextLines(all, result.rejected.length > 0, options.group, invocation).map((line) =>
      style("next", line),
    ),
  );
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
type AddableContext = {
  addable: ReadonlyArray<ListRow>;
  rejected: ListResult["rejected"];
  width: number;
  invocation: string;
  dirFlag: string;
  measure?: (text: string) => number;
  style?: Style;
};
export function renderAddable({
  addable,
  rejected,
  width,
  invocation,
  dirFlag,
  measure,
  style = plainStyle,
}: AddableContext): string {
  return [
    "Fragments you can add",
    ...addable.flatMap((row) => [
      `  ${printable(row.id)}${row.trusted ? "" : "  untrusted"}`,
      ...descriptionLines(printable(row.description.replace(/\s+/g, " ")), width, measure),
      `    ${style("next", `Next: ${invocation} add ${row.id}${dirFlag}`)}`,
    ]),
    ...rejectedLines(rejected),
    "",
    style("next", `Next: ${invocation} list stacks${dirFlag}`),
  ].join("\n");
}

function rejectedLines(rejected: ListResult["rejected"]): string[] {
  if (!rejected.length) return [];
  return [
    "",
    "Rejected",
    // The directory goes on its own line, whole, so it can be copied.
    ...rejected.flatMap((entry) => [
      `  ${entry.kind} ${printable(entry.id)} (${entry.origin}): ${printable(entry.error)}`,
      `    ${printable(entry.dir)}`,
    ]),
  ];
}
