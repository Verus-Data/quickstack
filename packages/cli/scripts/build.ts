import { mkdirSync, rmSync } from "node:fs";
import { name } from "../package.json";

const startedAt = performance.now();
const binary = `dist/${name}`;
mkdirSync("dist", { recursive: true });
const result = await Bun.build({
  entrypoints: ["src/bin.ts"],
  minify: true,
  sourcemap: "linked",
  compile: {
    outfile: binary,
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
console.log(`Built ${binary} in ${((performance.now() - startedAt) / 1_000).toFixed(2)}s.`);
console.log(`Run \`./${binary}\` from packages/cli to demo the build.`);
console.log(`From the repo root, run \`./packages/cli/${binary}\`.`);
