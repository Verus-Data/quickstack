// Run by typecheck-on-write before tsc: regenerate Next's route types when a route file changed
// or they don't exist yet, so tsc doesn't report stale typed-route errors.
import { join } from "node:path";
import { isDir, isExecutable, run } from "./_lib";

const root = process.cwd();
const tool = join(root, "node_modules/.bin/next");
const written = process.argv[2] ?? "";
if (isExecutable(tool) && (written.startsWith("src/app/") || !isDir(join(root, ".next/types")))) {
  await run(tool, ["typegen"], { cwd: root, timeoutSec: 30 });
}
