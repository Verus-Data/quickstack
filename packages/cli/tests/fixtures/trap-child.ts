// An interactive child for tests/signals.test.ts: records each signal it receives as a file in
// the directory given as its argument, then exits 7.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] as string;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
  process.on(signal, () => {
    writeFileSync(join(dir, `child-${signal}`), "yes");
    process.exit(7);
  });
writeFileSync(join(dir, "child-ready"), String(process.pid));
setInterval(() => {}, 1000);
