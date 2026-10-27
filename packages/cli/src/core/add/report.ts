import type { AddResult } from "../../schemas/add";
import type { Audience } from "../../services/output";
import { printable } from "../text";

/** The add summary; callers shorten project and untrusted paths with shownPath for agents. */
export function renderAdd(
  result: Omit<AddResult, "handoff">,
  context: { shown: string; audience: Audience; invocation: string },
): string {
  return [
    `Added ${result.added.map(printable).join(", ")} to ${printable(context.shown)}`,
    ...(result.written.length ? [`Written: ${result.written.map(printable).join(", ")}`] : []),
    ...(result.skipped.length ? [`Skipped: ${result.skipped.map(printable).join(", ")}`] : []),
    ...result.warnings.map(
      (warning) => `Warning: ${printable(warning.code)}: ${printable(warning.id)}`,
    ),
    ...(result.mergeNeeded.length
      ? [
          "",
          "Merge needed",
          ...result.mergeNeeded.flatMap((item) =>
            item.incoming.map((incoming) => `  ${printable(item.path)}: ${printable(incoming)}`),
          ),
        ]
      : []),
    ...result.missingRequired.map(
      (item) => `Missing required: ${printable(item.id)}. Next: ${printable(item.command)}`,
    ),
    ...result.untrusted.map(
      (entry) => `Untrusted: ${printable(entry.id)} (${entry.origin}): ${printable(entry.dir)}`,
    ),
    ...(!result.digestRecorded
      ? [
          `Stop: ask the user to review the new steps and run ${context.invocation} verify --accept-changes in their terminal.`,
        ]
      : []),
    `Brief: ${result.brief}`,
  ].join("\n");
}
