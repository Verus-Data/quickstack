import { rank } from "@steamfield/stacks-format";
import { expect, test } from "vitest";
import { records, vocabulary } from "./helpers/search-command";

test.each(["ts api", "typescript api"])(
  "bundled %s keeps TypeScript first with and without cached quality",
  async (request) => {
    const entries = await records();
    for (const cached of [false, true]) {
      const result = rank({
        request,
        vocabulary: vocabulary(),
        entries: entries.map((record) => ({
          ...record,
          ...(cached && record.entry.id === "python-react"
            ? {
                evidence: {
                  stats: { greenRateLower: 0.75, projects: 70, sample: 60, window: 28 as const },
                },
              }
            : {}),
        })),
      });
      expect(result.stacks[0], `cached: ${cached}`).toMatchObject({
        id: "typescript-api",
        tier: "strong",
      });
    }
  },
);
