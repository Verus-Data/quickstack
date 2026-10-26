import { describe, expect, it } from "vitest";
import { denyReason, REPO, runHook, write } from "../helpers/hooks";

const check = (path: string, content: string) =>
  runHook("PreToolUse", "guard-boundaries", write(`${REPO}/${path}`, content));
describe("CLI platform boundaries", () => {
  it.each([
    ["packages/cli/src/core/doctor.ts", 'import { $ } from "bun";'],
    ["packages/cli/src/services/Host.ts", "const p = Bun.argv;"],
    ["packages/cli/src/main.ts", "process.stdout.write('x');"],
    ["packages/cli/src/core/doctor.ts", "process.env.SECRET;"],
    ["packages/cli/src/main.ts", "console.log('x');"],
    ["packages/cli/src/services/Output.ts", "process.stderr.write('x');"],
  ])("denies %s: %s", async (path, content) =>
    expect(denyReason(await check(path, content))).toBeDefined(),
  );
  it.each([
    ["packages/cli/src/bin.ts", 'import { BunRuntime } from "@effect/platform-bun";'],
    ["packages/cli/src/platform/host.ts", "const p = Bun.argv;"],
    ["packages/cli/src/config.ts", "const e = process.env;"],
    ["packages/cli/src/logging.ts", "process.stderr.write('x');"],
    ["packages/cli/src/core/doctor.ts", "// console.log('example')"],
    ["packages/api/src/server.ts", "const p = Bun.serve;"],
    ["packages/shared/src/index.ts", "console.log('x');"],
    ["src/core/doctor.ts", "console.log('x');"],
  ])("allows %s: %s", async (path, content) =>
    expect(denyReason(await check(path, content))).toBeUndefined(),
  );
});
