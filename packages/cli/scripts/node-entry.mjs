#!/usr/bin/env node
if (process.versions.bun) {
  process.stderr.write(
    "stacks runs on Node 22 or newer, not Bun. Run stacks directly, or npx -y @steamfield/stacks.\n",
  );
  process.exit(1);
}
if (parseInt(process.versions.node.split(".")[0], 10) < 22) {
  process.stderr.write("stacks needs Node 22 or newer.\n");
  process.exit(1);
}
import("./cli.mjs");
