// Offline OpenCode host. Model the documented formatter dispatch after a write,
// including the built-in Ruff default that remains enabled in formatter objects.
// Commands execute real project-local tools; this is not live OpenCode proof.
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { $ } from "bun";

const [project, tool] = process.argv.slice(2);
const plugins = [];
for (const name of await readdir(join(project, ".opencode/plugins"))) {
  const mod = await import(pathToFileURL(join(project, ".opencode/plugins", name)).href);
  for (const factory of Object.values(mod)) {
    if (typeof factory === "function") plugins.push(await factory({ directory: project, $ }));
  }
}
const file = join(project, "changed.py");
const patch = [
  "*** Begin Patch",
  "*** Update File: changed.py",
  "@@",
  "-x=0",
  "+x=1",
  "*** Update File: old.py",
  "*** Move to: moved.py",
  "@@",
  "-x=0",
  "+x=1",
  "*** End Patch",
].join("\n");
const input = {
  tool,
  sessionID: "patch-lifecycle",
  args: tool === "apply_patch" ? { patchText: patch } : { filePath: file, content: "x=1\n" },
};
const output = { output: "File written" };
for (const plugin of plugins) await plugin["tool.execute.after"]?.(input, output);

const config = JSON.parse(await readFile(join(project, "opencode.json"), "utf8"));
// The other built-ins are unavailable in this fixture. Ruff is available on PATH.
if (config.formatter && config.formatter.ruff?.disabled !== true) {
  await $`ruff format ${file}`.cwd(project).quiet();
}
for (const formatter of Object.values(config.formatter ?? {})) {
  if (formatter.disabled || !formatter.command || !formatter.extensions?.includes(extname(file)))
    continue;
  const command = formatter.command.map((arg) => arg.replaceAll("$FILE", file));
  await $`${command}`.cwd(project).quiet();
}
const afterWrite = await readFile(file, "utf8");
for (const plugin of plugins) {
  await plugin.event?.({ event: { type: "file.edited", properties: { file } } });
  await plugin.event?.({
    event: { type: "session.idle", properties: { sessionID: input.sessionID } },
  });
}
process.stdout.write(JSON.stringify({ afterWrite, output: output.output }));
