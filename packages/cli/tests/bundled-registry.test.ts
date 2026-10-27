import { join } from "node:path";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { ValidateReport } from "../src/schemas/validate";
import { quiet, runCli } from "./helpers/cli";

// The registry that ships with the CLI: every entry in it must validate with zero errors and zero
// warnings, and resolve only inside itself. Notes never fail this gate.
const bundled = join(import.meta.dirname, "..", "registry");

test("the bundled registry validates with zero errors and zero warnings [1.5#14] [1.6a#1]", async () => {
  const result = await runCli(["validate", "--json"], {
    env: { ...quiet, PATH: process.env.PATH ?? "" },
    host: { registry: bundled },
  });
  const report = Schema.decodeUnknownSync(ValidateReport)(JSON.parse(result.stdout));
  expect(report.root).toBe(bundled);
  expect(report.bundled).toBe(true);
  expect(report.findings.filter((finding) => finding.severity !== "note")).toEqual([]);
  expect(result.status).toBe(0);
});
