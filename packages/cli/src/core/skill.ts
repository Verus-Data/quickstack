import { Duration, Effect, FileSystem, Option, Path, Random } from "effect";
import { AppConfig, GIT_REPOSITORY_VARIABLES } from "../config";
import { NotFound, PermissionDenied, TargetNotEmpty } from "../errors";
import type { SkillResult } from "../schemas/skill";
import { Host } from "../services/host";
import { Processes } from "../services/processes";
import { openProject, within } from "./scaffold/write";

// A skill loads whole whenever it triggers, so it pays for itself only when it is short.
export const SKILL_WORDS = 600;

/** The git toplevel, or cwd when git is absent or cwd is outside a work tree. */
const projectRoot = Effect.gen(function* () {
  const { cwd } = yield* Host;
  const config = yield* AppConfig;
  const processes = yield* Processes;
  const git = yield* processes.which("git");
  if (Option.isNone(git)) return cwd;
  const found = yield* processes
    .exec({
      argv: [git.value, "rev-parse", "--show-toplevel"],
      cwd,
      env: config.childEnv(GIT_REPOSITORY_VARIABLES),
      timeout: Duration.seconds(10),
    })
    .pipe(Effect.catchTag("SpawnFailed", () => Effect.succeed(undefined)));
  const toplevel = found?.stdout.replace(/\n$/, "");
  return found && !found.timedOut && !found.truncated && found.exitCode === 0 && toplevel
    ? toplevel
    : cwd;
});

export const installSkill = (options: { project: boolean; force: boolean; print: boolean }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const host = yield* Host;
    const source = path.join(host.skill, "SKILL.md");
    const text = yield* fs
      .readFileString(source)
      .pipe(
        Effect.mapError((error) =>
          error.reason._tag === "NotFound" || error.reason._tag === "BadResource"
            ? new NotFound({ details: { path: host.skill, suggestions: [] } })
            : new PermissionDenied({ details: { reason: "read", path: source } }),
        ),
      );
    if (options.print) return { path: null, action: "printed", text } satisfies SkillResult;

    // Use only the captured HOME: config.paths deliberately falls back to the OS home.
    const home = (yield* AppConfig).childEnv([]).HOME;
    if (!options.project && !home?.trim())
      return yield* new PermissionDenied({ details: { reason: "unwritable", path: "$HOME" } });
    const base = options.project ? yield* projectRoot : path.resolve(host.cwd, home ?? "");
    const skills = path.join(base, ".claude", "skills");
    const target = path.join(skills, "quickstacks", "SKILL.md");
    const occupied = (blocker?: "non-file") =>
      new TargetNotEmpty({
        details: {
          path: path.dirname(target),
          entries: ["SKILL.md"],
          ...(blocker ? { blocker } : {}),
        },
      });
    const denied = () => new PermissionDenied({ details: { reason: "unwritable", path: target } });
    const escaped = () => new PermissionDenied({ details: { reason: "escape", path: target } });

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const writer = yield* openProject(skills);
        yield* writer.directory("quickstacks");
        const file = path.join(writer.root, "quickstacks", "SKILL.md");
        const parentInside = fs.realPath(path.dirname(file)).pipe(
          Effect.map((real) => within(writer.root, real, path.sep)),
          Effect.mapError(denied),
        );
        const replaceSkill = (bytes: Uint8Array) =>
          Effect.gen(function* () {
            // Stage through the safe writer, then rename: a failed write keeps the user's copy.
            const suffix = (yield* Random.nextIntBetween(0, 0xffffff)).toString(16);
            const temporary = `quickstacks/.SKILL.${suffix}.tmp`;
            yield* writer.write(temporary, bytes);
            if (!(yield* parentInside)) return yield* escaped();
            const latest = yield* fs.lstat(file).pipe(Effect.mapError(denied));
            if (latest.type === "SymbolicLink") return yield* escaped();
            if (latest.type !== "File") return yield* occupied("non-file");
            yield* fs.rename(path.join(writer.root, temporary), file).pipe(Effect.mapError(denied));
          });
        const inspectSkill = Effect.gen(function* () {
          const info = yield* fs
            .lstat(file)
            .pipe(
              Effect.catch((error) =>
                error.reason._tag === "NotFound"
                  ? Effect.succeed(undefined)
                  : Effect.fail(denied()),
              ),
            );
          if (info?.type === "SymbolicLink") return yield* escaped();
          if (info && info.type !== "File") return yield* occupied("non-file");
          return info;
        });
        const info = yield* inspectSkill;
        const bytes = new TextEncoder().encode(text);
        if (info) {
          const current = yield* fs.readFile(file).pipe(Effect.mapError(denied));
          if (current.length === bytes.length && current.every((byte, i) => byte === bytes[i]))
            return { path: target, action: "unchanged" } satisfies SkillResult;
          if (!options.force) return yield* occupied();

          yield* replaceSkill(bytes);
        } else {
          yield* writer.write("quickstacks/SKILL.md", bytes);
        }
        return { path: target, action: "written" } satisfies SkillResult;
      }),
    );
  });
