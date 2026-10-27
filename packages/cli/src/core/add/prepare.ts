import { Effect } from "effect";
import { ComposeConflict } from "../../errors";
import { Host } from "../../services/host";
import { Output } from "../../services/output";
import type { AddOptions } from "../add";
import { targetAgents } from "../compose/agents";
import { compose } from "../compose/compose";
import { composeFiles } from "../compose/files";
import { missingToolsOnPath } from "../compose/tools";
import { buildManifest } from "../manifest";
import { gitInstalled } from "../scaffold/git";
import { templateValues } from "../scaffold/values";
import { printable } from "../text";
import { inferName } from "./name";
import { planAdd } from "./plan";
import type { AddProject } from "./project";

/** Compose only the requested delta, then render and classify its files before opening a writer. */
export const prepareAdd = (options: AddOptions, project: AddProject) =>
  Effect.gen(function* () {
    const { previous, settings, stack, existing } = project;
    const host = yield* Host;
    const composition = yield* compose({
      stack: stack?.id ?? null,
      with: options.fragments,
      without: [],
      preset: previous?.preset ?? (options.sandbox ? "sandbox" : "default"),
      agents: previous?.agents ?? targetAgents(options.agents, settings),
      always: [],
      mode: "add",
      existing,
    });
    const warnings = [...project.warnings, ...composition.warnings];
    const missing = yield* missingToolsOnPath(composition);
    const output = yield* Output;
    for (const item of missing) {
      warnings.push({ code: "missing_tool", id: item.tool });
      yield* output.progress(
        `Warning: ${printable(item.tool)} is not on PATH (needed by ${item.owners.map((owner) => printable(owner.id)).join(", ")}).`,
      );
    }
    const inferred =
      previous?.name !== undefined
        ? { name: { value: previous.name, source: "manifest" }, warnings: [] }
        : yield* inferName(options.root);
    warnings.push(...inferred.warnings);
    const name = inferred.name;
    const values = yield* templateValues({
      name: name.value,
      settings,
      git: { cwd: options.root, installed: yield* gitInstalled },
    });
    const rendered = yield* composeFiles(composition, values);
    const files = yield* Effect.forEach(composition.files, (file) => {
      const renderedFile = rendered.find((item) => item.path === file.path);
      return renderedFile
        ? Effect.succeed({ file, bytes: renderedFile.bytes })
        : Effect.die(new Error("A planned add file has no rendered bytes"));
    });
    const plan = yield* planAdd({ root: options.root, composition, rendered: files });
    const built = yield* buildManifest(composition, { briefWords: 0, mode: "add" });
    for (const step of built.verify)
      if (previous?.verify.some((old) => old.name === step.name))
        return yield* new ComposeConflict({
          details: { reason: "step_name", ids: [step.owner], step: step.name },
        });
    const added = composition.fragments.map((entry) => entry.id);
    const present = new Set([...existing, ...added]);
    const missingRequired =
      stack?.meta.kind === "stack"
        ? stack.meta.fragments.required
            .filter((id) => !present.has(id))
            .map((id) => ({ id, command: `${host.invocation} add ${id}` }))
        : [];
    return { composition, missing, name, plan, built, added, missingRequired, warnings };
  });
