import { ByteSize, Effect, type FileSystem, type Path } from "effect";

const MAX_BYTES = 2 * 1024 * 1024;

/** Read a regular file only when its resolved path stays under the project root. */
export const readProjectFile = Effect.fn("deps.readProjectFile")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  relative: string,
) {
  const file = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (file !== root && !file.startsWith(prefix)) return null;
  const real = yield* fs.realPath(file).pipe(Effect.orElseSucceed(() => null));
  if (real === null || (real !== root && !real.startsWith(prefix))) return null;
  const info = yield* fs.stat(file).pipe(Effect.orElseSucceed(() => null));
  if (info?.type !== "File" || ByteSize.toBigInt(info.size) > BigInt(MAX_BYTES)) return null;
  const bytes = yield* fs.readFile(file).pipe(Effect.orElseSucceed(() => null));
  if (bytes === null || bytes.byteLength > MAX_BYTES) return null;
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/u, "");
});
