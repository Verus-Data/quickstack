import { Effect, Result } from "effect";
import type { Entry, EntryFile } from "../registry/entry";
import { markdownFile } from "../registry/entry";
import { Registry } from "../registry/registry";

export type Source = EntryFile & { text: string };
export type EntrySources = {
  text: string;
  bodyOffset: number;
  files: ReadonlyArray<Source>;
};

/** Source locations and text for checks; entry metadata and bodies stay registry-decoded. */
export const readSources = (entries: ReadonlyArray<Entry>) =>
  Effect.gen(function* () {
    const registry = yield* Registry;
    const sources = new Map<string, EntrySources>();
    for (const entry of entries) {
      const text = yield* registry
        .read(entry, markdownFile(entry.kind))
        .pipe(Effect.orElseSucceed(() => ""));
      const listed = yield* registry.files(entry).pipe(Effect.orElseSucceed(() => []));
      const files: Source[] = [];
      for (const file of listed) {
        const read = yield* Effect.result(registry.read(entry, file.source));
        if (Result.isSuccess(read)) files.push({ ...file, text: read.success });
      }
      sources.set(entry.dir, {
        text,
        bodyOffset: text.split("\n").length - entry.body.split("\n").length,
        files,
      });
    }
    return sources;
  });
