import type { ShowReport } from "../schemas/show";
import { printable } from "./text";
import { BUDGET } from "./validate/budget";

function lastRunLine(lastRun: ShowReport["lastRun"]): string {
  if (!lastRun) return "Last run: none";
  return `Last run: ${lastRun.result} ${lastRun.date}${lastRun.stack ? ` on ${lastRun.stack}` : ""}, ${lastRun.sameContent ? "same content" : "changed content"}`;
}

/** Complete text review, including commands and every unfiltered guidance branch. */
export function renderShow(report: ShowReport, invocation: string): string {
  const list = (values: ReadonlyArray<string>) => (values.length ? values.join(", ") : "none");
  const out = [
    `${report.name} (${report.id}), ${report.kind}, origin ${report.origin}, ${report.trusted ? "trusted" : "untrusted"}`,
    report.description,
    `Path: ${report.path}`,
    `Shadows: ${list(report.shadows)}`,
    `Tags: ${list(report.tags)}`,
    ...Object.entries(report.deps).map(([role, names]) => `Dependencies (${role}): ${list(names)}`),
    `Tools: ${list(report.tools)}`,
    ...(report.decisions.length
      ? ["Decisions:", ...report.decisions.map((decision) => `  - ${decision}`)]
      : ["Decisions: none"]),
    ...Object.entries(report.env).map(([key, value]) => `Environment: ${key}=${value}`),
    ...Object.entries(report.commands).map(([key, value]) => `Command: ${key}: ${value}`),
  ];
  if (report.fragments)
    out.push(
      `Fragments: required ${list(report.fragments.required)}; default ${list(report.fragments.default)}; optional ${list(report.fragments.optional)}`,
    );
  if (report.category)
    out.push(
      `Category: ${report.category}`,
      `Applies to: ${list(report.appliesTo ?? [])}`,
      `Fits: ${list(report.fits ?? [])}`,
      `Requires: ${list(report.requires ?? [])}`,
      `Conflicts: ${list(report.conflicts ?? [])}`,
      `Requires tools: ${list(report.requiresTools ?? [])}`,
      `Needs own repository: ${report.needsOwnRepo ? "yes" : "no"}`,
    );
  out.push(
    "Verify:",
    ...report.verify.map((step) => {
      // Everything but the name and command, e.g. `phase setup, layer install`.
      const { name, run, ...rest } = step;
      const extra = Object.entries(rest).map(
        ([key, value]) => `${key} ${typeof value === "string" ? value : JSON.stringify(value)}`,
      );
      return `  ${name}: ${run}${extra.length ? ` (${extra.join(", ")})` : ""}`;
    }),
  );
  out.push(
    "Files:",
    ...(report.files.length
      ? report.files.map(
          (file) => `  ${file.path}${file.agent ? ` (${file.agent})` : ""} <- ${file.source}`,
        )
      : ["  none"]),
  );
  out.push(
    `Body: ${report.bodyWords.toLocaleString("en-US")} words (cap ${report.bodyCap.toLocaleString("en-US")})`,
  );
  if (report.briefWords !== null)
    out.push(
      `Brief: ${report.briefWords.toLocaleString("en-US")} words with defaults (cap ${report.briefCap.toLocaleString("en-US")}; ${BUDGET.composedWithApp.toLocaleString("en-US")} with an app)`,
    );
  out.push(lastRunLine(report.lastRun));
  out.push(
    "",
    "--- guidance ---",
    ...report.body.trimEnd().split("\n"),
    "",
    report.kind === "stack"
      ? `Next: ${invocation} validate --brief ${report.id} --sandbox`
      : `Next: ${invocation} new <stack> --with ${report.id}`,
  );
  return out.map((line) => line.split("\t").map(printable).join("\t")).join("\n");
}
