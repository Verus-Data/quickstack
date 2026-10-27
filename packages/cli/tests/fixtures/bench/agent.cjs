#!/usr/bin/env node
const { spawn, spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync, rmSync } = require("node:fs");
const { dirname, join } = require("node:path");
const config = JSON.parse(readFileSync(`${__filename}.json`, "utf8"));
const args = process.argv.slice(2);
if (args.includes("--version")) {
  if (config.scenario === "version-error") {
    process.stderr.write("fixture agent version unavailable\n");
    process.exit(7);
  }
  process.stdout.write(`${config.agent} 1.2.3\n`);
  process.exit(0);
}
const cwd = process.cwd();
writeFileSync(config.observation, JSON.stringify({ args, cwd, env: process.env }));
if (config.scenario === "block") {
  writeFileSync(config.parentPid, String(process.pid));
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
    require('node:fs').writeFileSync(${JSON.stringify(config.childPid)}, String(process.pid));
    process.send('ready');
    setInterval(() => {}, 1000);
  `,
    ],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  child.once("message", () => writeFileSync(config.blocked, "ready"));
  // Wait for the descendant to exit so the parent reaps it before leaving the group.
  process.on("SIGTERM", () => child.once("exit", () => process.exit(0)));
  setInterval(() => {}, 1000);
} else {
  const scenario = config.scenario;
  if (!["infra", "notes-error", "malformed"].includes(scenario)) {
    writeFileSync("one.txt", "one\n");
    writeFileSync("two.txt", "two\n");
  }
  if (!["infra", "malformed"].includes(scenario)) {
    if (scenario === "no-notes") rmSync(".quickstacks/NOTES.md", { force: true });
    else writeFileSync(".quickstacks/NOTES.md", config.notes);
  }
  if (scenario === "tamper") {
    const file = ".quickstacks/manifest.json";
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    manifest.verify[0].run = "true";
    writeFileSync(file, JSON.stringify(manifest));
  }
  if (scenario === "success" || scenario === "no-notes") {
    const wrapper = join(dirname(cwd), "bench", "verify");
    const verified = spawnSync(wrapper, ["--json"], { cwd, env: process.env });
    if (verified.error) throw verified.error;
    if (verified.status !== 0) {
      process.stderr.write(verified.stderr);
      process.exit(9);
    }
  }
  const debugAt = args.indexOf("--debug-file");
  if (debugAt >= 0 && args[debugAt + 1]) writeFileSync(args[debugAt + 1], config.hooks);
  const error = ["infra", "write-error", "notes-error"].includes(scenario);
  let result = error ? config.error : config.success;
  if (scenario === "malformed") result = '{"type":"result",';
  process.stdout.write(result);
  process.exitCode = error || scenario === "nonzero" ? 1 : 0;
}
