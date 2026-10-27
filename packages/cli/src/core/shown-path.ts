import { Effect, FileSystem, Path } from "effect";

/**
 * `target` as text output shows it: relative to `cwd` when it is `cwd` (`.`) or inside it,
 * otherwise `target` unchanged. When the given paths don't nest, their real paths are compared
 * too, so a cwd reached through a symlink, or `/var` against `/private/var` on macOS, still gives
 * the short form. A path that can't be resolved is compared as given.
 */
export const shownPath = Effect.fn("shownPath")(function* (cwd: string, target: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const inside = (from: string, to: string) => {
    const relative = path.relative(from, to);
    if (relative === "") return ".";
    return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
      ? undefined
      : relative;
  };
  const given = inside(cwd, target);
  if (given !== undefined) return given;
  const real = (at: string) => fs.realPath(at).pipe(Effect.orElseSucceed(() => at));
  return inside(yield* real(cwd), yield* real(target)) ?? target;
});
