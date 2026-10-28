import type { SearchMetadata } from "../../schemas/search";
import { phraseIn, tokens, words } from "./tokens";
/** Exclusions match phrases, their content words, or a conventional acronym (TUI). */
export function excluded(request: string, card: SearchMetadata | undefined): boolean {
  const content = new Set(tokens(request));
  return (
    card?.notFor.some((phrase) => {
      const parts = tokens(phrase);
      const acronym = words(phrase)
        .filter((word) => !["a", "an", "the"].includes(word))
        .map((word) => word[0])
        .join("");
      return (
        phraseIn(request, phrase) ||
        (parts.length > 0 && parts.every((word) => content.has(word))) ||
        (acronym.length >= 3 && content.has(acronym))
      );
    }) ?? false
  );
}
