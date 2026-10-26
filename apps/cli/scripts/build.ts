import { mkdirSync, rmSync } from "node:fs";
import { name } from "../package.json";

mkdirSync("dist", { recursive: true });
const result = await Bun.build({
  entrypoints: ["src/bin.ts"],
  minify: true,
  sourcemap: "linked",
  compile: {
    outfile: `dist/${name}`,
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadPackageJson: false,
    autoloadTsconfig: false,
  },
});
if (!result.success) throw new AggregateError(result.logs, "Binary build failed");
for (const output of result.outputs)
  if (output.kind === "sourcemap") rmSync(output.path, { force: true });
rmSync(`dist/${name}.map`, { force: true });
