import { join } from "node:path";
import { isDir, isExecutable, run } from "./_lib";

const root = process.cwd();
const tool = join(root, "node_modules/.bin/react-router");
const written = process.argv[2] ?? "";
if (
  isExecutable(tool) &&
  (written === "app/routes.ts" ||
    written.startsWith("app/routes/") ||
    !isDir(join(root, ".react-router/types")))
) {
  await run(tool, ["typegen"], { cwd: root, timeoutSec: 15 });
}
