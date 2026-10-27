import { Effect, type FileSystem, type Path } from "effect";
import { EntryInvalid, type PermissionDenied } from "../../errors";
import type { Entry } from "../registry/entry";
import { Registry } from "../registry/registry";
import { renderTemplate, type TemplateValues } from "../scaffold/template";
import type { Composition } from "./compose";

export type RenderedFile = {
  readonly path: string;
  /** Every writer as `<kind>:<id>`, joined with `+` in composition order. */
  readonly owner: string;
  readonly bytes: Uint8Array;
  readonly executable: boolean;
};

/** Fixed values keep fingerprints independent of project settings and the clock. */
export const NEUTRAL_VARS: Readonly<TemplateValues> = Object.freeze({
  project_name: "example",
  project_slug: "example",
  env_prefix: "EXAMPLE",
  package_scope: "",
  author: "",
  year: "2000",
});

type SourceFile = Omit<RenderedFile, "bytes"> &
  ({ bytes: Uint8Array } | { template: { text: string; entry: Entry; source: string } });

/** Read once so project-valued and neutral rendering use the same source snapshot. */
const readFiles = (
  composition: Composition<Entry | null>,
): Effect.Effect<
  ReadonlyArray<SourceFile>,
  EntryInvalid | PermissionDenied,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    // Rendering uses checked reads on already composed entries; no roots need to be loaded.
    const registry = yield* Registry.pipe(Effect.provide(Registry.layer([])));
    const entries = [...(composition.stack ? [composition.stack] : []), ...composition.fragments];
    const encoder = new TextEncoder();
    const files: SourceFile[] = [];
    for (const planned of composition.files) {
      const entry = entries.find(
        (entry) => entry.kind === planned.owner.kind && entry.id === planned.owner.id,
      );
      if (!entry) return yield* Effect.die(new Error("A planned file has no composed owner"));
      const file = {
        path: planned.path,
        owner: planned.owners.map((writer) => `${writer.kind}:${writer.id}`).join("+"),
        executable: (planned.mode & 0o111) !== 0,
      };
      if (planned.kind === "merge") {
        files.push({ ...file, bytes: encoder.encode(planned.content ?? "") });
      } else {
        // An unreadable source stays the registry's `PermissionDenied`, as everywhere else.
        const source = planned.source?.file ?? "";
        if (planned.kind === "copy") {
          files.push({ ...file, bytes: new Uint8Array(yield* registry.bytes(entry, source)) });
        } else {
          const text = yield* registry.read(entry, source);
          files.push({ ...file, template: { text, entry, source } });
        }
      }
    }
    return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  });

/** The single renderer, shared by standalone composition and scaffold's two value sets. */
const renderFiles = (sources: ReadonlyArray<SourceFile>, values: TemplateValues) =>
  Effect.forEach(sources, (source): Effect.Effect<RenderedFile, EntryInvalid> => {
    if ("bytes" in source) return Effect.succeed(source);
    const { template, ...file } = source;
    const rendered = renderTemplate(template.text, values);
    if ("unknown" in rendered)
      return Effect.fail(
        new EntryInvalid({
          details: {
            id: template.entry.id,
            origin: template.entry.origin,
            reason: "template",
            path: template.source,
            line: rendered.line,
          },
        }),
      );
    return Effect.succeed({ ...file, bytes: new TextEncoder().encode(rendered.text) });
  });

/** Render the entry files only; the CLI's own `.quickstacks/` files are separate. */
export const composeFiles = (composition: Composition<Entry | null>, values: TemplateValues) =>
  Effect.flatMap(readFiles(composition), (sources) => renderFiles(sources, values));

/** Scaffold's files and fingerprint input, rendered from one read of every source. */
export const composeFilesWithNeutral = (
  composition: Composition<Entry | null>,
  values: TemplateValues,
) =>
  Effect.gen(function* () {
    const sources = yield* readFiles(composition);
    return {
      files: yield* renderFiles(sources, values),
      neutralFiles: yield* renderFiles(sources, NEUTRAL_VARS),
    };
  });
