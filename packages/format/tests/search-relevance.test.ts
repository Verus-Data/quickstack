import { rank } from "@steamfield/stacks-format";
import { expect, test } from "vitest";
import { hostingInput, relevanceInput } from "./helpers/search-relevance";

test.each(["ts api", "typescript api"])(
  "cached quality preserves a clear lexical lead for %s",
  (request) => {
    const input = relevanceInput(request);
    const plain = rank(input);
    expect(plain.stacks[0]?.id).toBe("typed-api");
    const result = rank({
      ...input,
      entries: input.entries.map((record) => ({
        ...record,
        evidence: {
          stats: {
            greenRateLower: record.entry.id === "typed-api" ? 0 : 1,
            projects: 100,
            sample: 100,
            window: 28,
          },
        },
      })),
    });
    expect(result.stacks[0]?.id).toBe("typed-api");
  },
);

test.each([
  "TypeScript only, no Python, for a server rendered React dashboard",
  "a React dashboard without Python",
  "a React dashboard, not Python",
  "a Python-free React dashboard",
  "only TypeScript for a React dashboard",
  "a React dashboard with no Python on the backend",
  "a React dashboard without Python on the backend",
  "a React dashboard with a backend without Python",
])("language constraints demote the mixed backend for %s", (request) => {
  const result = rank(relevanceInput(request));
  expect(result.stacks[0]).toMatchObject({ id: "typed-web", tier: "strong" });
  expect(result.stacks.find((hit) => hit.id === "mixed-web")?.tier).not.toBe("strong");
  expect(result.understood.languages).not.toContain("python");
});

test("TypeScript only on the frontend leaves a Python API eligible", () => {
  const result = rank(relevanceInput("Python API with TypeScript only on frontend"));
  expect(result.stacks[0]).toMatchObject({ id: "mixed-web", tier: "strong" });
});

test("not only is additive rather than an exclusive language constraint", () => {
  const result = rank(relevanceInput("a React dashboard with not only TypeScript but Python"));
  expect(result.stacks.find((hit) => hit.id === "mixed-web")).toMatchObject({
    tier: "strong",
    penalties: [],
  });
});

test("a negated platform demotes entries even when another platform matches", () => {
  const result = rank(relevanceInput("browser tests without server"));
  expect(result.understood.platforms).toEqual(["web"]);
  expect(result.understood.unmatched).not.toContain("server");
  expect(result.stacks.length).toBeGreaterThan(0);
  for (const hit of result.stacks) {
    expect(hit.tier).not.toBe("strong");
    expect(hit.why).toContainEqual(
      expect.objectContaining({ field: "constraint", from: "without server" }),
    );
  }
});

test("an unsupported hosting destination has no strong hit in either kind", () => {
  const result = rank(hostingInput("deploy my existing app to Fly.io"));
  expect(result.noStrongMatch).toBe(true);
  expect([...result.stacks, ...result.fragments].filter((hit) => hit.tier === "strong")).toEqual(
    [],
  );
  expect(result.fragments.find((hit) => hit.id === "pages")?.why).toContainEqual(
    expect.objectContaining({ field: "constraint", matched: expect.stringContaining("Fly.io") }),
  );
});

test.each([
  "migrate to Cloudflare Pages",
  "migrate from Fly.io to Cloudflare Pages",
  "how to migrate to Cloudflare Pages",
  "deploy to Cloudflare Pages today",
  "how to deploy to Cloudflare Pages today",
])("the destination wins over the source for %s", (request) => {
  const result = rank(relevanceInput(request));
  expect(result.fragments[0]).toMatchObject({ id: "pages", tier: "strong" });
  expect(result.noStrongMatch).toBe(false);
});

test.each([
  "add e2e browser tests to my existing React repo",
  "browser tests for my repo",
  "add browser tests to a React repository",
  "add e2e browser tests to my React app",
  "add browser tests to our TypeScript project",
])("scaffolds cannot strongly satisfy an existing repository addition: %s", (request) => {
  const result = rank(relevanceInput(request));
  expect(result.noStrongMatch).toBe(true);
  expect(result.stacks.length).toBeGreaterThan(0);
  expect(result.stacks.every((hit) => hit.tier !== "strong")).toBe(true);
  expect(result.stacks[0]?.why).toContainEqual(
    expect.objectContaining({
      field: "constraint",
      matched: expect.stringContaining("existing repository"),
    }),
  );
});

test("a new dashboard for an existing business remains a scaffold request", () => {
  const result = rank(relevanceInput("new React dashboard for my existing business"));
  expect(result.stacks[0]).toMatchObject({ id: "typed-web", tier: "strong", penalties: [] });
  expect(result.noStrongMatch).toBe(false);
});

test.each([undefined, "stack", "fragment"] as const)(
  "noStrongMatch describes only returned kinds (%s)",
  (kind) => {
    for (const request of ["migrate to Cloudflare Pages", "React dashboard"]) {
      const result = rank({ ...relevanceInput(request), kind });
      expect(result.noStrongMatch).toBe(
        ![...result.stacks, ...result.fragments].some((hit) => hit.tier === "strong"),
      );
    }
  },
);
