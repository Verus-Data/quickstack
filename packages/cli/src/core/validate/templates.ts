import { Effect } from "effect";
import type { Finding } from "../../schemas/validate";
import { TEMPLATE_VARIABLES } from "../scaffold/template";
import { type Check, finding } from "./view";

export const templateChecks: Check = (view) =>
  Effect.sync(() => {
    const findings: Finding[] = [];
    for (const entry of view.entries)
      for (const file of view.sources.get(entry.dir)?.files ?? []) {
        if (!file.source.endsWith(".tmpl")) continue;
        for (const match of file.text.matchAll(/\$\{\{[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*\}\}/g)) {
          if (TEMPLATE_VARIABLES.some((name) => name === match[1])) continue;
          findings.push(
            finding(entry, {
              check: "template-expression",
              severity: "warning",
              file: view.file(entry, file.source),
              line: file.text.slice(0, match.index).split("\n").length,
              message: `${match[0]} is read as a template variable; ship Actions expressions without .tmpl`,
            }),
          );
        }
      }
    return { findings };
  });
