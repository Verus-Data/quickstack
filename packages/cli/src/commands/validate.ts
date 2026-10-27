import { Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { shownPath } from "../core/shown-path";
import { validate } from "../core/validate/index";
import { previewBrief } from "../core/validate/preview";
import { renderPreview, renderReport } from "../core/validate/report";
import { resolveTarget } from "../core/validate/target";
import { BadInput, ValidationFailed } from "../errors";
import { BriefPreview, ValidateReport } from "../schemas/validate";
import { Host } from "../services/host";
import { Output } from "../services/output";

/** Repeated flags, each value also split on commas: `--with a --with b,c`. */
const ids = (values: ReadonlyArray<string>) =>
  values.flatMap((value) => value.split(",")).filter((value) => value !== "");

export const validateCommand = Command.make(
  "validate",
  {
    path: Argument.String("path").pipe(
      Argument.withDescription(
        "A registry root (holding stacks/ or fragments/) or one entry directory inside one. Omit it to check the bundled registry.",
      ),
      Argument.optional,
    ),
    brief: Flag.String("brief").pipe(
      Flag.withDescription(
        "Print the brief this stack composes to, with its word counts, instead of checking. Rendered on the same fixed context the budget uses, so counts match on every machine. Writes nothing.",
      ),
      Flag.optional,
    ),
    with: Flag.String("with").pipe(
      Flag.withDescription("With --brief: add an optional fragment or app (repeatable)."),
      Flag.atLeast(0),
    ),
    without: Flag.String("without").pipe(
      Flag.withDescription("With --brief: leave out a default fragment (repeatable)."),
      Flag.atLeast(0),
    ),
    sandbox: Flag.Boolean("sandbox").pipe(
      Flag.withDescription("With --brief: render the sandbox preset."),
      Flag.withDefault(false),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const host = yield* Host;
      const output = yield* Output;
      const path = Option.getOrUndefined(flags.path);
      const stack = Option.getOrUndefined(flags.brief);
      // The composition flags shape a --brief preview; alone they would be silently ignored.
      const stray = flags.with.length
        ? "--with"
        : flags.without.length
          ? "--without"
          : flags.sandbox
            ? "--sandbox"
            : undefined;
      if (stack === undefined && stray !== undefined)
        return yield* new BadInput({ details: { id: stray, flag: "brief" } });
      const target = yield* resolveTarget(path);
      if (stack !== undefined) {
        const preview = yield* previewBrief(target, {
          stack,
          with: ids(flags.with),
          without: ids(flags.without),
          preset: flags.sandbox ? "sandbox" : "default",
        });
        return yield* output.result(
          Schema.encodeSync(BriefPreview)(preview),
          renderPreview(preview),
        );
      }
      const report = yield* validate(target);
      const firstStack = report.findings.some((finding) => finding.severity === "error")
        ? undefined
        : report.sizes.find((row) => row.kind === "composed")?.entry;
      yield* output.result(
        Schema.encodeSync(ValidateReport)(report),
        renderReport(report, {
          invocation: host.invocation,
          path,
          firstStack,
          audience: output.audience,
          root: output.audience === "agent" ? yield* shownPath(host.cwd, report.root) : report.root,
        }),
      );
      const count = (severity: string) =>
        report.findings.filter((finding) => finding.severity === severity).length;
      if (count("error"))
        return yield* new ValidationFailed({
          details: { errors: count("error"), warnings: count("warning") },
        });
    }),
).pipe(
  Command.withDescription(
    "Check stacks and fragments before an agent builds from them: frontmatter, references, conditional prose, compositions, verify layers (install, lint, typecheck, test) and word budgets. Reads files only; exits 2 with the report on stdout when there are errors.",
  ),
);
