import { Effect, Result } from "effect";
import type { Finding, SizeRow } from "../../schemas/validate";
import { countWords } from "../brief/words";
import { type Entry, type EntryFile, outputPath } from "../registry/entry";
import { Registry } from "../registry/registry";
import { type Check, entryFile, finding, type View } from "./view";

/**
 * Shipped files: every `merge` path is one of the entry's own files, each copy of a merge file
 * parses as JSON (checked per entry, so a fragment no budgeted composition includes is still
 * checked), and Markdown under `files/` and `adapters/` is counted as a `shipped` size row with
 * no limit, so prose moved out of the body stays visible.
 */
export const fileChecks: Check = (view) =>
  Effect.gen(function* () {
    const findings: Finding[] = [];
    const sizes: SizeRow[] = [];
    for (const entry of view.entries) {
      const checked = yield* checkEntryFiles(view, entry);
      findings.push(...checked.findings);
      sizes.push(...checked.sizes);
    }
    return { findings, sizes };
  });

/** An entry file that couldn't be read while checking: a finding, so the rest still reports. */
export function unreadable(
  view: Parameters<Check>[0],
  entry: Entry,
  error: { _tag: string; details?: { path?: string } | undefined },
): Finding {
  const at = error.details?.path;
  return finding(entry, {
    check: "schema",
    severity: "error",
    file: entryFile(view, entry),
    message:
      error._tag === "PermissionDenied"
        ? `a file in the entry is unreadable${at ? `: ${at}` : ""}`
        : `a file in the entry can't be used${at ? `: ${at}` : ""}`,
  });
}

const checkEntryFiles = (view: View, entry: Entry) =>
  Effect.gen(function* () {
    const registry = yield* Registry;
    const findings: Finding[] = [];
    const sizes: SizeRow[] = [];
    const listed = yield* Effect.result(registry.files(entry));
    if (Result.isFailure(listed)) {
      findings.push(unreadable(view, entry, listed.failure));
      return { findings, sizes };
    }
    const files = listed.success;
    const checkMerge = (target: string) =>
      Effect.gen(function* () {
        const copies = files.filter((file) => outputPath(file) === target);
        if (!copies.length)
          findings.push(
            finding(entry, {
              check: "merge-path-missing",
              severity: "error",
              file: entryFile(view, entry),
              message: `merge lists ${target}, which this entry doesn't ship under files/ or adapters/<agent>/`,
            }),
          );
        for (const copy of copies) findings.push(...(yield* checkMergeCopy(view, entry, copy)));
      });
    for (const target of entry.meta.merge) yield* checkMerge(target);
    let words = 0;
    for (const file of files.filter((file) => /\.md$/i.test(outputPath(file)))) {
      const text = yield* Effect.result(registry.read(entry, file.source));
      if (Result.isSuccess(text)) words += countWords(text.success);
      else findings.push(unreadable(view, entry, text.failure));
    }
    if (words) sizes.push({ kind: "shipped", entryKind: entry.kind, entry: entry.id, words });
    return { findings, sizes };
  });

const checkMergeCopy = (view: View, entry: Entry, copy: EntryFile) =>
  Effect.gen(function* () {
    const registry = yield* Registry;
    const findings: Finding[] = [];
    // A template on a merge path is 1.1's merge_template; compose reports it.
    if (outputPath(copy) !== copy.path) return findings;
    const text = yield* Effect.result(registry.read(entry, copy.source));
    if (Result.isFailure(text)) {
      findings.push(unreadable(view, entry, text.failure));
      return findings;
    }
    if (Result.isFailure(Result.try(() => JSON.parse(text.success) as unknown)))
      findings.push(
        finding(entry, {
          check: "merge-json",
          severity: "error",
          file: view.file(entry, copy.source),
          message: `${copy.source} is listed under merge but isn't valid JSON`,
        }),
      );
    return findings;
  });
