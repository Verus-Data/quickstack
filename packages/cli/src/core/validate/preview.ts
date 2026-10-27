import { Effect } from "effect";
import { NotFound } from "../../errors";
import type { BriefPreview } from "../../schemas/validate";
import { targetAgents } from "../compose/agents";
import { compose } from "../compose/compose";
import { Registry } from "../registry/registry";
import { canonicalBrief, composedLimit } from "./budget";
import { validationRoots } from "./index";
import type { Target } from "./target";

export type PreviewOptions = {
  stack: string;
  with: ReadonlyArray<string>;
  without: ReadonlyArray<string>;
  preset: "default" | "sandbox";
};

/**
 * The brief `new` would render for a composition, without writing anything: composed through the
 * same roots `validate` uses for `target`, and rendered with the canonical context, so its counts
 * are the ones the budget checks. Compose failures (an unknown id, a conflict) are the command's.
 */
export const previewBrief = (target: Target, options: PreviewOptions) =>
  Effect.gen(function* () {
    const roots = yield* validationRoots(target);
    const composition = yield* compose({
      ...options,
      agents: targetAgents(undefined, {}),
      always: [],
      mode: "new",
    }).pipe(
      Effect.provide(Registry.layer(roots)),
      // `list` doesn't read a root given to validate, so the not-found hint names this root.
      Effect.mapError((error) =>
        error._tag === "NotFound" && error.details && !target.bundled
          ? new NotFound({ details: { ...error.details, root: target.root } })
          : error,
      ),
    );
    const brief = canonicalBrief(composition);
    return {
      stack: composition.stack.id,
      preset: composition.preset,
      fragments: composition.fragments.map((fragment) => fragment.id),
      app: composition.app?.id ?? null,
      briefWords: brief.briefWords,
      fixedWords: brief.fixedWords,
      limit: composedLimit(composition),
      warnings: composition.warnings.map(({ code, id }) => ({ code, id })),
      brief: brief.text,
    } satisfies BriefPreview;
  });
