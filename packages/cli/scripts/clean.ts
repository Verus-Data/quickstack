import { rmSync } from "node:fs";

for (const path of ["dist", "coverage", "logs", ".dev"])
  rmSync(path, { recursive: true, force: true });
console.log("Cleaned dist/, coverage/, logs/ and .dev/ (local development data and state).");
