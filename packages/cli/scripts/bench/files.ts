import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { Effect, FileSystem, Path, type PlatformError } from "effect";

export const shellArg = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Includes ignored files (especially NOTES), symlinks and empty directories. */
export const snapshot = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entry = (at: string): Effect.Effect<string[], PlatformError.PlatformError> =>
      Effect.gen(function* () {
        const file = path.join(root, at);
        const info = yield* fs.lstat(file);
        if (info.type === "Directory") return [`${at}/`, ...(yield* walk(at))];
        if (info.type === "SymbolicLink") return [`${at}:link:${yield* fs.readLink(file)}`];
        if (info.type === "File")
          return [
            `${at}:${createHash("sha256")
              .update(yield* fs.readFile(file))
              .digest("hex")}`,
          ];
        return [`${at}:${info.type}`];
      });
    const walk = (rel: string): Effect.Effect<string[], PlatformError.PlatformError> =>
      Effect.gen(function* () {
        const entries: string[] = [];
        for (const name of [...(yield* fs.readDirectory(path.join(root, rel)))].sort())
          entries.push(...(yield* entry(path.join(rel, name))));
        return entries;
      });
    return JSON.stringify(yield* walk(""));
  });

/** Ask the OS for a port; close the listener before the scaffold can use it. */
export const freePort = () =>
  Effect.callback<string, Error>((resume) => {
    const server = createServer();
    server.once("error", () => resume(Effect.fail(new Error("Could not allocate bench port"))));
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        resume(
          address && typeof address !== "string"
            ? Effect.succeed(String(address.port))
            : Effect.fail(new Error("Could not allocate bench port")),
        ),
      );
    });
    return Effect.sync(() => {
      server.close();
    });
  });
