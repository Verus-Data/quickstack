import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tempDir(parent = tmpdir()) {
  const path = realpathSync(mkdtempSync(join(parent, "stacks-format-")));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}
