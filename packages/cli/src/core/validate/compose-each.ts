import { Effect, Result } from "effect";
import { AgentId, type FragmentMeta, type StackMeta } from "../../schemas/entry";
import type { Finding } from "../../schemas/validate";
import { compose } from "../compose/compose";
import type { Entry } from "../registry/entry";
import { canonicalBrief, composedLimit } from "./budget";
import { uniqueFindings } from "./composed";
import { compositionPlans, describe, replacementDefaults } from "./compositions";
import { type Check, entryFile, finding } from "./view";

export function applies(fragment: FragmentMeta, stack: Entry & { meta: StackMeta }): boolean {
  return (
    fragment.appliesTo.length === 0 ||
    fragment.appliesTo.includes(stack.id) ||
    stack.meta.tags.some((tag) => fragment.appliesTo.includes(tag))
  );
}

export const composeEachChecks: Check = (view) =>
  Effect.gen(function* () {
    const findings: Finding[] = [];
    const stacks = view.all.filter(
      (item): item is Entry & { meta: StackMeta } => "meta" in item && item.meta.kind === "stack",
    );
    const agents = AgentId.literals.filter((agent) =>
      [...view.sources.values()].some((sources) =>
        sources.files.some((file) => file.source.startsWith(`adapters/${agent}/`)),
      ),
    );
    for (const fragment of view.entries) {
      if (fragment.meta.kind !== "fragment") continue;
      for (const stack of stacks) {
        const listed = Object.values(stack.meta.fragments).some((ids) => ids.includes(fragment.id));
        if (!listed && (!fragment.meta.appliesTo.length || !applies(fragment.meta, stack)))
          continue;
        const inBase = [...stack.meta.fragments.required, ...stack.meta.fragments.default].includes(
          fragment.id,
        );
        const plan = compositionPlans(view, stack).find((plan) =>
          inBase ? plan.added === undefined : plan.added === fragment.id,
        );
        const budgeted = listed || plan !== undefined;
        // 1.5 owns listed fragments and apps when the stack itself is being validated.
        if (budgeted && view.entries.some((entry) => entry.dir === stack.dir)) continue;
        const without = plan?.without ?? replacementDefaults(view, stack, fragment.id);
        for (const targets of agents.length ? agents.map((agent) => [agent]) : [[]]) {
          for (const preset of ["default", "sandbox"] as const) {
            const result = yield* Effect.result(
              compose({
                stack: stack.id,
                with: plan?.with ?? [fragment.id],
                without,
                preset,
                agents: targets,
                always: [],
                mode: "new",
              }),
            );
            if (Result.isSuccess(result)) {
              const limit = composedLimit(result.success);
              if (canonicalBrief(result.success).briefWords > limit)
                findings.push(
                  finding(fragment, {
                    check: budgeted ? "budget-composed" : "compose-each",
                    severity: "error",
                    file: entryFile(view, fragment),
                    message: `${fragment.id} with ${stack.id}: composed brief exceeds ${limit.toLocaleString("en-US")} words`,
                  }),
                );
              continue;
            }
            const error = result.failure;
            if (error._tag !== "ComposeConflict") continue; // The entry/reference checks own invalid inputs.
            if ((yield* view.composed).failures.has(JSON.stringify([stack.id, error.details])))
              continue;
            findings.push(
              finding(fragment, {
                check: budgeted ? describe(error).check : "compose-each",
                severity: "error",
                file: entryFile(view, fragment),
                message: `${fragment.id} with ${stack.id}: ${describe(error).message}`,
              }),
            );
          }
        }
      }
    }
    return { findings: uniqueFindings(findings) };
  });
