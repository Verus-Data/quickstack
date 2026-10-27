import type { BriefPreview, Finding, SizeRow, ValidateReport } from "../../schemas/validate";
import { printable } from "../text";

const n = (value: number) => value.toLocaleString("en-US");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A path or id as one shell word: as is when it is plain, single-quoted otherwise. */
export function shellWord(text: string): string {
  return /^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`;
}

/**
 * The label of a size row: `go-cli body`, `go-cli (sandbox) + postgres`, `effect shipped`. An id
 * both a stack and a fragment use gets its kind (`twin (fragment) body`).
 */
function sizeLabel(row: SizeRow, shared: ReadonlySet<string>): string {
  if (row.kind !== "composed") {
    const kind = shared.has(row.entry) ? ` (${row.entryKind})` : "";
    return `${printable(row.entry)}${kind} ${row.kind}`;
  }
  const added = row.with === undefined ? "" : ` + ${printable(row.with)}`;
  return `${printable(row.entry)} (${row.preset})${added}`;
}

function findingLine(finding: Finding, checkWidth: number): string {
  const where = finding.file
    ? `${printable(finding.file)}${finding.line === undefined ? "" : `:${finding.line}`}: `
    : "";
  return `  ${finding.severity.padEnd(7)}  ${finding.check.padEnd(checkWidth)}  ${where}${printable(finding.message)}`;
}

/**
 * The human report: a header, findings grouped by entry, the size table, a total line, and a
 * `Next:` line. Every value from an entry goes through `printable`.
 */
export function renderReport(
  report: ValidateReport,
  options: { invocation: string; path: string | undefined; firstStack: string | undefined },
): string {
  const { stacks, fragments } = report.entries;
  const counted = `${plural(stacks, "stack")}, ${plural(fragments, "fragment")}`;
  const out = [
    `Validated ${printable(report.root)}${report.bundled ? " (bundled registry)" : ""}: ${counted}`,
  ];
  const checkWidth = Math.max(0, ...report.findings.map((finding) => finding.check.length));
  let group: string | undefined;
  for (const finding of report.findings) {
    const heading =
      finding.entry === undefined ? "registry" : `${finding.kind} ${printable(finding.entry)}`;
    if (heading !== group) out.push("", heading);
    group = heading;
    out.push(findingLine(finding, checkWidth));
  }
  if (report.sizes.length) {
    out.push("", "Sizes (words)");
    const ids = (kind: SizeRow["entryKind"]) =>
      new Set(report.sizes.filter((row) => row.entryKind === kind).map((row) => row.entry));
    const fragments = ids("fragment");
    const shared = new Set([...ids("stack")].filter((id) => fragments.has(id)));
    const label = (row: SizeRow) => sizeLabel(row, shared);
    const width = Math.max(...report.sizes.map((row) => label(row).length));
    const numbers = Math.max(...report.sizes.map((row) => n(row.words).length));
    for (const row of report.sizes) {
      const limit = row.limit === undefined ? "" : ` / ${n(row.limit)}`;
      const fixed = row.fixedWords === undefined ? "" : `   fixed ${n(row.fixedWords)}`;
      const over = row.limit !== undefined && row.words > row.limit ? "   over" : "";
      out.push(
        `  ${label(row).padEnd(width)}  ${n(row.words).padStart(numbers)}${limit}${fixed}${over}`,
      );
    }
  }
  const tally = (severity: Finding["severity"]) =>
    report.findings.filter((finding) => finding.severity === severity).length;
  const errors = tally("error");
  out.push(
    "",
    `${counted}: ${plural(errors, "error")}, ${plural(tally("warning"), "warning")}, ${plural(tally("note"), "note")}`,
  );
  const target = options.path === undefined ? "" : ` ${shellWord(printable(options.path))}`;
  if (errors)
    out.push(`Next: fix the errors above, then run ${options.invocation} validate${target}`);
  else if (options.firstStack !== undefined)
    out.push(
      `Next: ${options.invocation} validate${target} --brief ${shellWord(options.firstStack)} --sandbox`,
    );
  return out.join("\n");
}

/** `validate --brief` in human mode: the brief as written, then its counts after a rule. */
export function renderPreview(preview: BriefPreview): string {
  const over = preview.briefWords > preview.limit;
  const summary = [
    `Brief: ${n(preview.briefWords)} words (fixed text ${n(preview.fixedWords)}), limit ${n(preview.limit)}${over ? `, over by ${n(preview.briefWords - preview.limit)}` : ""}`,
    `Stack: ${printable(preview.stack)} (${preview.preset})`,
    `Fragments: ${preview.fragments.length ? preview.fragments.map(printable).join(", ") : "none"}`,
    ...preview.warnings.map(
      (warning) => `Warning: ${warning.code.replaceAll("_", " ")}: ${printable(warning.id)}`,
    ),
  ];
  // Entry prose reaches the terminal: escape control characters, keeping tabs (Makefile recipes).
  const brief = preview.brief
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t").map(printable).join("\t"))
    .join("\n");
  return `${brief}\n\n---\n${summary.join("\n")}`;
}
