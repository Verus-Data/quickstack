import { describe, expect, it } from "vitest";
import { denyReason, REPO, runHook, write } from "../helpers/hooks";

const check = (path: string, content: string) =>
  runHook("PreToolUse", "guard-boundaries", write(`${REPO}/${path}`, content));
describe("CLI platform boundaries", () => {
  it.each([
    ["apps/cli/src/core/doctor.ts", 'import { $ } from "bun";'],
    ["apps/cli/src/services/Host.ts", "const p = Bun.argv;"],
    ["apps/cli/src/main.ts", "process.stdout.write('x');"],
    ["apps/cli/src/core/doctor.ts", "process.env.SECRET;"],
    ["apps/cli/src/main.ts", "console.log('x');"],
    ["apps/cli/src/services/Output.ts", "process.stderr.write('x');"],
  ])("denies %s: %s", async (path, content) =>
    expect(denyReason(await check(path, content))).toBeDefined(),
  );
  it.each([
    ["apps/cli/src/bin.ts", 'import { BunRuntime } from "@effect/platform-bun";'],
    ["apps/cli/src/platform/host.ts", "const p = Bun.argv;"],
    ["apps/cli/src/config.ts", "const e = process.env;"],
    ["apps/cli/src/logging.ts", "process.stderr.write('x');"],
    ["apps/cli/src/core/doctor.ts", "// console.log('example')"],
    ["apps/api/src/server.ts", "const p = Bun.serve;"],
    ["packages/shared/src/index.ts", "console.log('x');"],
    ["src/core/doctor.ts", "console.log('x');"],
  ])("allows %s: %s", async (path, content) =>
    expect(denyReason(await check(path, content))).toBeUndefined(),
  );
});
