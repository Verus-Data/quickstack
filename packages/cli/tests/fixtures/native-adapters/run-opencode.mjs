// An offline host for the documented OpenCode local-plugin boundary, using the real Bun shell.
// Initialization/import failures escape; only a tool hook's rejection is a permission denial.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { $ } from "bun";

const project = process.argv[2];
if (!project) throw new Error("Missing project");
const plugins = [];
for (const name of (await readdir(join(project, ".opencode/plugins"))).sort()) {
  if (!/\.[cm]?[jt]s$/.test(name)) continue;
  const mod = await import(pathToFileURL(join(project, ".opencode/plugins", name)).href);
  for (const value of Object.values(mod)) {
    if (typeof value !== "function") continue;
    plugins.push(
      await value({
        directory: project,
        worktree: project,
        project: { id: "fixture", worktree: project },
        $,
      }),
    );
  }
}
if (!plugins.some((p) => typeof p["tool.execute.before"] === "function")) {
  throw new Error("No tool.execute.before handler");
}
const cases = JSON.parse(await new Response(Bun.stdin.stream()).text());
if (process.argv[3] === "lifecycle") {
  const file = join(project, "changed.py");
  const input = {
    tool: "write",
    sessionID: "fixture-session",
    callID: "fixture-call",
    args: { filePath: file, content: await readFile(file, "utf8") },
  };
  const output = { title: "Write", output: "File written", metadata: {} };
  for (const plugin of plugins) {
    await plugin["tool.execute.after"]?.(input, output);
    await plugin.event?.({ event: { type: "file.edited", properties: { file } } });
  }
  const afterWrite = await readFile(file, "utf8");
  for (const plugin of plugins)
    await plugin.event?.({
      event: { type: "session.idle", properties: { sessionID: input.sessionID } },
    });
  process.stdout.write(JSON.stringify({ afterWrite, output }));
  process.exit(0);
}
const results = [];
for (const sample of cases) {
  let reason = "";
  try {
    for (const plugin of plugins)
      await plugin["tool.execute.before"]?.(sample.input, sample.output);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    reason = error.message;
  }
  results.push({ blocked: reason.length > 0, reason });
}
process.stdout.write(JSON.stringify(results));
