import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { name, version } from "../package.json";

const packed = Bun.spawnSync(["bun", "pm", "pack", "--destination", "dist/pack", "--quiet"], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
if (packed.exitCode !== 0) process.exit(packed.exitCode);
const filename = `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
const tarball = `dist/pack/${filename}`;
restoreGitignores(tarball);
const digest = createHash("sha256").update(readFileSync(tarball)).digest("hex");
writeFileSync(`${tarball}.sha256`, `${digest}  ${filename}\n`);

/** npm packers and installers drop .gitignore; bin.ts exposes these escaped assets as data. */
function restoreGitignores(archive: string) {
  const files = readdirSync("registry", { recursive: true, encoding: "utf8" })
    .filter((file) => file.split(/[\\/]/).at(-1) === ".gitignore")
    .sort();
  if (!files.length) return;
  const staging = mkdtempSync(join(tmpdir(), "quickstack-pack-"));
  try {
    const tar = join(staging, "package.tar");
    writeFileSync(tar, gunzipSync(readFileSync(archive)));
    const additions = files.map((file) => `package/registry/${file}.quickstack`);
    for (const [index, file] of files.entries()) {
      const target = additions[index];
      if (target === undefined) throw new Error("Missing registry archive path");
      if (existsSync(join("registry", `${file}.quickstack`)))
        throw new Error("Registry packaging escape collides");
      mkdirSync(dirname(join(staging, target)), { recursive: true });
      copyFileSync(join("registry", file), join(staging, target));
    }
    // Append preserves the packer's manifest, modes and all existing archive members.
    execFileSync("tar", ["-rf", tar, "-C", staging, ...additions]);
    writeFileSync(archive, gzipSync(readFileSync(tar), { level: 9 }));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
