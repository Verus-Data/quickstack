#!/usr/bin/env node
if (process.versions.bun) {
  process.stderr.write("quickstack runs on Node. Bun is not supported; run it with npx or node.\n");
  process.exit(1);
}
if (parseInt(process.versions.node.split(".")[0], 10) < 22) {
  process.stderr.write("quickstack needs Node 22 or newer.\n");
  process.exit(1);
}
import("./cli.mjs");
