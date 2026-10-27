import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { CreateResult } from "../src/schemas/create";
import {
  createCli,
  createFailure,
  createWorkspace,
  entryPath,
  entrySnapshot,
  putCreate,
  releaseCreate,
  userRoot,
} from "./helpers/create";

afterEach(releaseCreate);

test.each(["json", "human", "agent"])(
  "%s creates a personal fragment and refuses a repeat without changing the entry",
  async (audience) => {
    const home = createWorkspace();
    const registry = createWorkspace();
    const args = ["create", "fragment", "team-check", ...(audience === "json" ? ["--json"] : [])];
    const options = { host: { registry, stdoutIsTTY: audience === "human" } };
    const created = await createCli(home, args, options);
    expect(created.status).toBe(0);
    expect(created.stderr).toBe("");
    if (audience === "json") {
      expect(Schema.decodeUnknownSync(CreateResult)(JSON.parse(created.stdout))).toMatchObject({
        kind: "fragment",
        id: "team-check",
        path: entryPath(home, "fragment", "team-check"),
      });
    } else {
      expect(created.stdout).toContain("team-check");
      expect(created.stdout).toContain("Next:");
    }
    const before = entrySnapshot(userRoot(home));
    const refused = await createCli(home, args, options);
    expect(refused.status).toBe(2);
    expect(refused.stdout).toBe("");
    if (audience === "json") {
      expect(JSON.parse(refused.stderr)).toMatchObject({
        error: { tag: "BadInput", details: { flag: "create_target" } },
      });
    } else {
      expect(refused.stderr).toContain("Next:");
      expect(refused.stderr).toContain("team-check");
    }
    expect(entrySnapshot(userRoot(home))).toEqual(before);
  },
);

test("a file blocking the personal registry is a permission failure without partial parents", async () => {
  const home = createWorkspace();
  const registry = createWorkspace();
  putCreate(home, "config/quickstacks", "my configuration file\n");
  const before = entrySnapshot(home);
  createFailure(
    await createCli(home, ["create", "stack", "team-api", "--json"], { host: { registry } }),
    6,
    "PermissionDenied",
  );
  expect(entrySnapshot(home)).toEqual(before);
  expect(readFileSync(join(home, "config/quickstacks"), "utf8")).toBe("my configuration file\n");
});

test("--from user is refused before replacing an existing source", async () => {
  const home = createWorkspace();
  putCreate(home, "config/quickstacks/fragments/keep/FRAGMENT.md", "unfinished personal entry\n");
  const before = entrySnapshot(home);
  const error = createFailure(
    await createCli(home, ["create", "fragment", "copy", "--from", "user", "--json"]),
    2,
    "BadInput",
  );
  expect(error.details).toEqual({ id: "user", flag: "from" });
  expect(entrySnapshot(home)).toEqual(before);
  expect(existsSync(entryPath(home, "fragment", "copy"))).toBe(false);
});
