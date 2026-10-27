import type { NewResult } from "../../schemas/new";
import { collapsePaths } from "../brief/paths";
import { printable } from "../text";

const gitLine = (result: NewResult) => {
  const failed = result.warnings.find((warning) => warning.code === "git_init_failed");
  if (failed) return `git init failed (exit ${failed.exitCode ?? "unknown"}); no repository`;
  return result.git === "fresh"
    ? "new repository, nothing committed"
    : result.git === "parent"
      ? "part of an existing repository; nothing committed"
      : "git not found; no repository";
};

const warningLine = (warning: NewResult["warnings"][number]) => {
  const id = printable(warning.id);
  switch (warning.code) {
    case "always_not_applicable":
      return `${id} (from your always setting) doesn't apply to this stack; left out`;
    case "always_unknown":
      return `${id} (from your always setting) names no fragment; ignored`;
    case "with_not_applicable":
      return `--with ${id}: the fragment doesn't list this stack; added anyway`;
    case "without_not_selected":
      return `--without ${id}: it wasn't selected anyway`;
    case "git_init_failed":
      return "git init failed; the files are written, without a repository";
  }
};

const missingLine = (item: NewResult["missingTools"][number]) => {
  const owners = item.owners.map((owner) => printable(owner.id)).join(", ");
  const skip = item.drop
    .map(({ id, flag }) =>
      flag === "with" ? `dropping --with ${printable(id)}` : `--without ${printable(id)}`,
    )
    .join(" and ");
  return `${printable(item.tool)} not found (needed by ${owners}${skip ? `; skip with ${skip}` : ""})`;
};

/** A directory as a shell argument: plain when it is safe, else single-quoted. */
const shellArg = (text: string) =>
  /^[A-Za-z0-9._/+-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;

/**
 * `new`'s human output: the stack, fragments, written files collapsed, git, the brief, missing
 * tools with their skip flags, warnings, untrusted entries, then the next step. Every value that
 * came from an entry or the filesystem is escaped for the terminal.
 */
export function renderNew(result: NewResult, context: { shown: string }): string {
  const lines = [
    `Created ${printable(context.shown)} from ${printable(result.stack)}${result.preset === "sandbox" ? " (sandbox)" : ""}.`,
    `Project: ${printable(result.project)}`,
    `Fragments: ${result.fragments.length ? result.fragments.map(printable).join(", ") : "none"}`,
    `Agents: ${result.agents.join(", ")}`,
    `Git: ${gitLine(result)}`,
    `Wrote ${result.written.length} files:`,
    ...collapsePaths(result.written).map((line) => `  ${printable(line)}`),
    `Brief: ${result.brief} (${result.briefWords} words)`,
  ];
  if (result.missingTools.length)
    lines.push(
      "Missing tools (the brief tells the agent):",
      ...result.missingTools.map((item) => `  ${missingLine(item)}`),
    );
  if (result.warnings.length)
    lines.push("Warnings:", ...result.warnings.map((warning) => `  ${warningLine(warning)}`));
  if (result.untrusted.length)
    lines.push(
      "Untrusted entries (the brief makes the agent ask you before using them):",
      ...result.untrusted.map(
        (entry) =>
          `  ${entry.kind} ${printable(entry.id)} (${entry.origin}): ${printable(entry.dir)}`,
      ),
    );
  const cd = context.shown === "." ? "" : `cd ${printable(shellArg(context.shown))}, then `;
  lines.push(
    "",
    `Next: ${cd}start your coding agent there with this prompt:`,
    `  ${result.handoff.next}`,
  );
  return lines.join("\n");
}
