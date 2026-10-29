import type { SearchMetadata, SearchVocabulary, SearchWhy } from "./schema.js";
import { phraseIn, words } from "./tokens.js";

type FacetConstraint = SearchWhy & { field: "languages" | "platforms"; exclusive: boolean };
type Span = { start: number; end: number };

function occurrences(request: string, aliases: ReadonlyArray<string>) {
  const pattern = [...new Set(aliases)]
    .map((alias) => words(alias).join("[\\s.-]+"))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .join("|");
  return request.matchAll(new RegExp(`\\b(?:${pattern})\\b`, "gi"));
}

function constraintAt(request: string, occurrence: RegExpMatchArray) {
  const index = occurrence.index;
  if (index === undefined) return undefined;
  const before = request.slice(0, index);
  const after = request.slice(index + occurrence[0].length);
  const negative = before.match(/\b(?:no|without|not)\s+$/i)?.[0];
  const free = after.match(/^-free\b/i)?.[0];
  const only = /\bonly\s+$/i.test(before) || /^\s+only\b/i.test(after);
  const exclusive = !negative && !free;
  if (
    (!negative && !free && !only) ||
    (exclusive && roleScoped(before, after)) ||
    /\bnot\s+only\s+$/i.test(before)
  )
    return undefined;
  const start = index - (negative?.length ?? 0);
  const end = index + occurrence[0].length + (free?.length ?? 0);
  return {
    start,
    end,
    exclusive,
    from: exclusive ? `only ${occurrence[0]}` : request.slice(start, end),
  };
}

function roleScoped(before: string, after: string): boolean {
  const role = "(?:front[ -]?end|back[ -]?end|client|ui)";
  return (
    new RegExp(`\\b${role}\\s+(?:uses?\\s+)?(?:only\\s+)?$`, "i").test(before) ||
    new RegExp(`^\\s*(?:only\\s+)?(?:on|in|for)\\s+(?:the\\s+)?${role}\\b`, "i").test(after)
  );
}

/** Remove negated facets before lexical scoring; keep their original text for explanations. */
export function requestConstraints(request: string, vocabulary: SearchVocabulary) {
  const facets: FacetConstraint[] = [];
  const removed: Span[] = [];
  for (const field of ["languages", "platforms"] as const) {
    for (const [matched, aliases] of Object.entries(vocabulary[field])) {
      for (const occurrence of occurrences(request, [matched, ...aliases])) {
        const constraint = constraintAt(request, occurrence);
        if (!constraint) continue;
        const { from, exclusive } = constraint;
        facets.push({ field, matched, from, exclusive });
        if (!exclusive) removed.push(constraint);
      }
    }
  }
  const positive = request
    .split("")
    .map((char, index) =>
      removed.some((span) => index >= span.start && index < span.end) ? " " : char,
    )
    .join("");
  return { positive, facets };
}

export function facetConflicts(
  card: SearchMetadata | undefined,
  facets: ReadonlyArray<FacetConstraint>,
): SearchWhy[] {
  if (card?.kind !== "stack") return [];
  return facets.flatMap((constraint) => {
    const values = card[constraint.field].filter((value) =>
      constraint.exclusive ? value !== constraint.matched : value === constraint.matched,
    );
    return values.length
      ? [
          {
            field: "constraint",
            from: constraint.from,
            matched: `${constraint.from}: entry includes ${values.join(", ")}`,
          },
        ]
      : [];
  });
}

export function existingRepository(request: string): boolean {
  const software = "(?:repo|repository|app|application|project|codebase)";
  const target = `(?:[\\w-]+\\s+){0,3}${software}\\b`;
  // Bind existing/addition intent to a software noun, allowing short modifiers such as React.
  return [
    `\\bexisting\\s+${target}`,
    "\\b(?:my|our)\\s+(?:repo|repository)\\b",
    `\\badd\\b[^.!?;]*\\bto\\s+${target}`,
  ].some((pattern) => new RegExp(pattern, "i").test(request));
}

/** Destination clauses exclude migration sources and trailing qualifications. */
export function hostingTarget(request: string): string | undefined {
  const clause = request.match(
    /\b(?:deploy|deployment|host|hosting|publish|migrate)\b([^;!?]*)/i,
  )?.[1];
  const destination = clause
    ?.match(
      /\b(?:to|on)\s+(.+?)(?=\s+(?:instead|from|with|using|for|without|today|tomorrow|now)\b|[,;!?]|$)/i,
    )?.[1]
    ?.trim();
  if (
    !destination ||
    /^(?:my|our|the|a|an|production|staging|local|a\s+server)\b/i.test(destination)
  )
    return undefined;
  return destination;
}

export function missingTarget(
  target: string | undefined,
  texts: ReadonlyArray<string>,
): SearchWhy[] {
  return target && !texts.some((text) => phraseIn(text, target))
    ? [
        {
          field: "constraint",
          from: target,
          matched: `hosting target ${target} is not matched by this entry`,
        },
      ]
    : [];
}
