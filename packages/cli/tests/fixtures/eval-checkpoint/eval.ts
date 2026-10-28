import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { applicationTurn } from "./application";

const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
const reportPath = arg("--report");
const requested = arg("--models");
if (!reportPath || !requested || !process.argv.includes("--dry-run")) throw new Error("protocol");
await writeFile("handoff-path.txt", reportPath);
await writeFile(
  "env-names.json",
  JSON.stringify(Object.keys(process.env).filter((key) => /OPENROUTER|OPENAI/i.test(key))),
);
const scenario = process.env.CHECKPOINT_SCENARIO;
if (scenario === "no-report") process.exit(0);
if (scenario === "child-failure-no-report") process.exit(7);
if (scenario === "directory") {
  await mkdir(reportPath);
  process.exit(0);
}
if (scenario === "supplied") {
  await writeFile(reportPath, await readFile("input-report.json"));
  process.exit(0);
}
if (scenario === "malformed") {
  await writeFile(reportPath, '{"secret-provider-controlled":');
  process.exit(0);
}
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const body = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("model" in body) ||
      !("caseId" in body) ||
      typeof body.model !== "string" ||
      typeof body.caseId !== "string"
    ) {
      return new Response("invalid local request", { status: 400 });
    }
    await writeFile("application-calls.txt", `${body.model}:${body.caseId}\n`, { flag: "a" });
    return Response.json({ answer: body.caseId });
  },
});
try {
  const cases = [];
  for (const requestedModel of requested.split(",")) {
    for (const caseId of ["currentTime", "concise-answer", "extract"]) {
      const passed = await applicationTurn(
        server.url.toString().replace(/\/$/, ""),
        requestedModel,
        caseId,
      );
      cases.push({
        caseId,
        requestedModel,
        verdict: passed ? "pass" : "fail",
        finishReason: "stop",
        latencyMs: 10,
        inputTokens: 2,
        outputTokens: 3,
        cost: 0.001,
        servedModel: requestedModel,
        provider: "local",
      });
    }
  }
  const models = requested.split(",").map((requestedModel) => ({
    requestedModel,
    total: 3,
    counts: { pass: 3, fail: 0, error: 0, truncated: 0 },
    inputTokens: 6,
    outputTokens: 9,
    cost: 0.003,
    medianLatencyMs: 10,
  }));
  if (scenario === "failed-outcome" || scenario === "error-outcome") {
    const first = cases[0];
    const model = models[0];
    if (!first || !model) throw new Error("fixture");
    first.verdict = scenario === "failed-outcome" ? "fail" : "error";
    model.counts.pass = 2;
    model.counts[first.verdict === "fail" ? "fail" : "error"] = 1;
  }
  if (scenario === "no-pass") {
    for (const row of cases) row.verdict = "truncated";
    for (const model of models) {
      model.counts.pass = 0;
      model.counts.truncated = 3;
    }
  }
  const createdAt = new Date().toISOString();
  const dates: Record<string, string> = {
    stale: "2000-01-01T00:00:00.000Z",
    future: "2099-01-01T00:00:00.000Z",
  };
  const report = {
    schemaVersion: 1,
    mode: scenario === "live" ? "live" : "stub",
    createdAt: dates[scenario ?? ""] ?? createdAt,
    cases,
    models,
  };
  if (scenario === "aggregate") {
    const first = models[0];
    if (first) first.cost = 99;
  }
  if (scenario === "symlink") {
    await writeFile("symlink-target.json", JSON.stringify(report));
    await symlink(`${process.cwd()}/symlink-target.json`, reportPath);
  } else
    await writeFile(
      reportPath,
      JSON.stringify({
        ...report,
        ...(scenario === "oversized" ? { padding: " ".repeat(1024 * 1024) } : {}),
      }),
    );
  console.log("provider-controlled stdout banner: success");
  if (scenario === "child-failure") process.exitCode = 7;
} finally {
  await server.stop(true);
}
