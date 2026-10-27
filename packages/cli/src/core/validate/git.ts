import { Duration, Effect, Option, Path, Result } from "effect";
import { AppConfig } from "../../config";
import type { Finding } from "../../schemas/validate";
import { Processes } from "../../services/processes";
import { markdownFile } from "../registry/entry";
import { Registry } from "../registry/registry";
import { type Check, finding } from "./view";

/** Paths per `git check-ignore` call, well under any argv limit. */
const BATCH = 200;
/**
 * git runs no program it finds in configuration (no hooks, no fsmonitor), and prints paths as
 * given rather than quoting non-ASCII. (`-z` needs `--stdin`, which `exec` doesn't offer; a
 * path git still quotes, one holding a newline or a quote, isn't matched back and goes unreported.)
 */
const HARDENING = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.quotePath=false",
] as const;

/**
 * Inside a git checkout, no file an entry ships (nor its markdown file) may match an ignore rule:
 * an entry's literal `files/.gitignore` applies to the checkout too, so a pattern such as `.env.*`
 * silently keeps the entry's own `files/.env.example.tmpl` out of every commit while local runs
 * pass. `--no-index` checks tracked files against the rules as well. Outside a checkout, or with
 * no git on PATH, there is nothing to check. Runs git through `Processes.exec` (argv, no shell)
 * on paths the CLI listed itself; nothing from an entry is executed.
 */
export const gitChecks: Check = (view) =>
  Effect.gen(function* () {
    if (!view.entries.length) return { findings: [] };
    const processes = yield* Processes;
    const git = yield* processes.which("git");
    if (Option.isNone(git)) return { findings: [] };
    const registry = yield* Registry;
    const path = yield* Path.Path;
    const config = yield* AppConfig;
    const env = Object.fromEntries(
      Object.entries(config.childEnv([])).filter(([key]) => !key.startsWith("GIT_")),
    );
    const owners = new Map<string, { kind: "stack" | "fragment"; id: string }>();
    for (const entry of view.entries) {
      const files = yield* Effect.result(registry.files(entry));
      // An unreadable entry is reported by the file checks.
      if (Result.isFailure(files)) continue;
      for (const source of [markdownFile(entry.kind), ...files.success.map((file) => file.source)])
        owners.set(view.file(entry, source), entry);
    }
    const paths = [...owners.keys()].sort();
    const ignored = new Set<string>();
    for (let start = 0; start < paths.length; start += BATCH) {
      const batch = paths.slice(start, start + BATCH);
      const run = yield* Effect.result(
        processes.exec({
          argv: [git.value, ...HARDENING, "check-ignore", "--no-index", "--", ...batch],
          cwd: view.root,
          env,
          timeout: Duration.seconds(30),
        }),
      );
      // Exit 0: some paths are ignored; 1: none; anything else: not a checkout, or git failed.
      if (Result.isFailure(run) || (run.success.exitCode !== 0 && run.success.exitCode !== 1))
        return { findings: [] };
      for (const name of run.success.stdout.split("\n")) if (name) ignored.add(name);
    }
    const findings: Finding[] = [];
    for (const file of paths) {
      const owner = owners.get(file);
      if (!owner || !ignored.has(file)) continue;
      findings.push(
        finding(owner, {
          check: "git-ignored",
          severity: "warning",
          file,
          message: `git ignores ${path.basename(file)} here, so it never reaches a commit; check the entry's own files/.gitignore`,
        }),
      );
    }
    return { findings };
  });
