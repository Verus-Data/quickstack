// Run by typecheck-on-write before tsc: regenerate SvelteKit's tsconfig and route types when a
// route or the Vite config changed, or they don't exist yet, so tsc doesn't report a missing
// ./$types module or an unresolvable tsconfig.
import { join } from "node:path";
import { isDir, isExecutable, run } from "./_lib";

const root = process.cwd();
const tool = join(root, "node_modules/.bin/svelte-kit");
const written = process.argv[2] ?? "";
const changesTypes =
  written.startsWith("src/routes/") ||
  written.startsWith("src/params/") ||
  /^(vite|svelte)\.config\./.test(written);
if (isExecutable(tool) && (changesTypes || !isDir(join(root, ".svelte-kit/types")))) {
  await run(tool, ["sync"], { cwd: root, timeoutSec: 30 });
}
