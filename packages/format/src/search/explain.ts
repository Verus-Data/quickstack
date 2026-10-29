import type { SearchMetadata, SearchWhy } from "./schema.js";
import { phraseFrom, tokens, words } from "./tokens.js";

export function constraintReasons(existing: boolean, request: string): SearchWhy[] {
  return existing
    ? [
        {
          field: "constraint",
          from: request,
          matched: "an existing repository needs a fragment; this entry scaffolds a new project",
        },
      ]
    : [];
}
/** Exclusions match phrases, their content words, or a conventional acronym (TUI). */
export function excluded(
  request: string,
  card: SearchMetadata | undefined,
): { request: string; entry: string } | undefined {
  const content = new Set(tokens(request));
  for (const phrase of card?.notFor ?? []) {
    const parts = tokens(phrase);
    const direct = phraseFrom(request, phrase);
    if (direct) return { request: direct, entry: phrase };
    if (parts.length > 0 && parts.every((word) => content.has(word))) {
      const matched = words(request).filter((word) =>
        tokens(word).some((part) => parts.includes(part)),
      );
      return { request: matched.join(" "), entry: phrase };
    }
    const acronym = words(phrase)
      .filter((word) => !["a", "an", "the"].includes(word))
      .map((word) => word[0])
      .join("");
    if (acronym.length >= 3 && content.has(acronym))
      return { request: phraseFrom(request, acronym) ?? acronym, entry: phrase };
  }
  return undefined;
}
