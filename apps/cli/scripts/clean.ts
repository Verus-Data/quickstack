import { rmSync } from "node:fs";

for (const path of ["dist", "coverage", "logs", ".dev"])
  rmSync(path, { recursive: true, force: true });
