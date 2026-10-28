import type { SearchVocabulary, SearchWhy } from "../../schemas/search";
import { phraseFrom, tokens } from "./tokens";
export const categories = ["platforms", "productKinds", "languages", "capabilities"] as const;
export type Category = (typeof categories)[number];
export function vocabularyMatches(request: string, vocabulary: SearchVocabulary): SearchWhy[] {
  return categories.flatMap((field) =>
    Object.entries(vocabulary[field])
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([matched, aliases]) => {
        const sources = [
          ...new Set(
            aliases
              .map((alias) => phraseFrom(request, alias))
              .filter((source) => source !== undefined),
          ),
        ];
        return sources.length === 0 ? [] : [{ field, matched, from: sources.join(" … ") }];
      }),
  );
}
/** Alias words retain their request provenance for coverage and explanations. */
export function matchedWords(request: string, reason: SearchWhy): string[] {
  const candidates = new Set(tokens(reason.from));
  return tokens(request).filter((word) => candidates.has(word));
}
