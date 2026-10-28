import {
  type DirectoryData,
  Kebab,
  type Kind,
  LastRun,
  type OfficialNames,
  VerifyStep,
  withStepDefaults,
} from "@stacks/format";
import { Effect, FileSystem, Path, Schema } from "effect";
import { parseDocument } from "yaml";
import { compose } from "../../src/core/compose/compose";
import { latestMatchingRecord, ledgerAdapterSets, readLedger } from "../../src/core/ledger";
import { markdownFile, splitFrontmatter } from "../../src/core/registry/entry";
import type { LedgerRecord } from "../../src/schemas/ledger";
import { releaseTags, withReleaseRegistry } from "./history";

export type RemovedRef = Pick<DirectoryData["removed"][number], "id" | "kind">;
export type Last = DirectoryData["removed"][number]["last"];

// Old releases can use a frontmatter version today's full entry decoder cannot read.
// Only the static fields the directory needs are decoded here.
const HistoricalMeta = Schema.Struct({
  id: Kebab,
  name: Schema.String.check(Schema.isPattern(/\S/)),
  description: Schema.String.check(Schema.isPattern(/\S/)),
  tags: Schema.Array(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  verify: Schema.Array(VerifyStep).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
});

export const historicalMetadata = (text: string) =>
  Effect.try({
    try: () => {
      const parts = splitFrontmatter(text);
      if (parts === undefined) throw new Error("missing frontmatter");
      const doc = parseDocument(parts.frontmatter, { logLevel: "silent" });
      if (doc.errors.length || doc.warnings.length) throw new Error("invalid YAML");
      const value: unknown = doc.toJS({ maxAliasCount: 100 });
      return value;
    },
    catch: () => new Error("Could not read historical directory metadata."),
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(HistoricalMeta)));

export function staticContent(meta: typeof HistoricalMeta.Type): Last {
  return {
    name: meta.name,
    description: meta.description,
    tags: meta.tags,
    steps: meta.verify.map(withStepDefaults).map((step) => ({
      name: step.name,
      phase: step.phase,
      run: step.run,
      ...(step.layer === undefined ? {} : { layer: step.layer }),
    })),
  };
}

const releaseMetadata = Effect.fn("index.releaseMetadata")(function* (root: string, kind: Kind) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = path.join(root, `${kind}s`);
  const found: (typeof HistoricalMeta.Type)[] = [];
  if (!(yield* fs.exists(directory))) return found;
  for (const name of (yield* fs.readDirectory(directory)).sort()) {
    const file = path.join(directory, name, markdownFile(kind));
    if (!(yield* fs.exists(file))) continue;
    const attempt = yield* Effect.result(historicalMetadata(yield* fs.readFileString(file)));
    if (attempt._tag === "Success") found.push(attempt.success);
  }
  return found;
});

const recordIncludes = Effect.fn("index.recordIncludes")(function* (
  record: LedgerRecord,
  ref: RemovedRef,
) {
  if (ref.kind === "stack") return record.stack === ref.id && record.with.length === 0;
  if (record.preset !== "default" && record.preset !== "sandbox") return false;
  const attempt = yield* Effect.result(
    compose({
      stack: record.stack,
      with: record.with,
      without: [],
      preset: record.preset,
      agents: ledgerAdapterSets(record.agent)[0] ?? [],
      always: [],
      mode: "new",
    }),
  );
  return (
    attempt._tag === "Success" && attempt.success.fragments.some((entry) => entry.id === ref.id)
  );
});

const historicalRun = Effect.fn("index.historicalRun")(function* (root: string, ref: RemovedRef) {
  const { records } = yield* readLedger(root);
  const candidates: LedgerRecord[] = [];
  for (const record of records)
    if (record.result === "pass" && (yield* recordIncludes(record, ref))) candidates.push(record);
  const record = latestMatchingRecord(candidates, () => true);
  if (record === null) return undefined;
  const decoded = yield* Effect.result(
    Schema.decodeUnknownEffect(LastRun)({ ...record, result: "pass" }),
  );
  return decoded._tag === "Success" ? decoded.success : undefined;
});

const releaseContent = Effect.fn("index.releaseContent")(function* (
  root: string,
  tag: string,
  refs: ReadonlyArray<RemovedRef>,
) {
  const found = new Map<string, Last>();
  for (const kind of ["stack", "fragment"] as const) {
    const metadata = yield* releaseMetadata(root, kind);
    for (const ref of refs.filter((ref) => ref.kind === kind)) {
      const meta = metadata.find((meta) => meta.id === ref.id);
      if (meta === undefined) continue;
      const lastRun = yield* historicalRun(root, ref);
      found.set(`${kind}/${ref.id}`, {
        ...staticContent(meta),
        version: tag,
        ...(lastRun === undefined ? {} : { lastRun }),
      });
    }
  }
  return found;
});

export const releasedContent = Effect.fn("index.releasedContent")(function* (
  cwd: string,
  refs: ReadonlyArray<RemovedRef>,
  names: OfficialNames,
) {
  const found = new Map<string, Last>();
  if (refs.length === 0) return found;
  for (const tag of (yield* releaseTags(cwd)).reverse()) {
    const missing = refs.filter((ref) => !found.has(`${ref.kind}/${ref.id}`));
    if (missing.length === 0) break;
    const source = names.sources.find(
      (source) => source.origin === "release" && source.version === tag.slice(1),
    );
    const shipped = missing.filter((ref) =>
      ref.kind === "stack"
        ? source?.stacks.some((entry) => entry.id === ref.id)
        : source?.fragments.includes(ref.id),
    );
    if (shipped.length === 0) continue;
    const content = yield* withReleaseRegistry(cwd, tag, (root) =>
      releaseContent(root, tag, shipped),
    );
    for (const ref of shipped)
      if (!content.has(`${ref.kind}/${ref.id}`))
        return yield* Effect.fail(
          new Error(`${tag}: ${ref.kind}/${ref.id}: could not recover last directory content.`),
        );
    for (const [key, last] of content) found.set(key, last);
  }
  return found;
});
