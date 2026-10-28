import type { Kind } from "@steamfield/stacks-format";
import type { Effect, FileSystem, Path } from "effect";
import type { AppConfig } from "../../config";
import type { PermissionDenied } from "../../errors";
import type { Finding, SizeRow } from "../../schemas/validate";
import type { Processes } from "../../services/processes";
import type { ComposeOptions, Composition } from "../compose/compose";
import { type Entry, markdownFile, type RejectedEntry } from "../registry/entry";
import type { Registry } from "../registry/registry";
import type { composedFiles } from "./composed";
import type { EntrySources } from "./sources";

/**
 * What every check reads. `entries` and `rejected` are the validated set (under the root, and
 * only the one entry when `validate` was given an entry directory); `all` is the resolution set,
 * every winning entry of every origin, with the root's entries shadowing the rest.
 */
export type View = {
  /** A preview's selection and original options, for recomposing each shipped adapter. */
  composition?: Composition & { options: ComposeOptions };
  root: string;
  bundled: boolean;
  only?: { kind: Kind; id: string };
  entries: ReadonlyArray<Entry>;
  rejected: ReadonlyArray<RejectedEntry>;
  all: ReadonlyArray<Entry | RejectedEntry>;
  sources: ReadonlyMap<string, EntrySources>;
  composed: ReturnType<typeof composedFiles>;
  /** Whether an entry under the root is in the validated set (false for all but `only`). */
  wanted: (item: { kind: Kind; id: string }) => boolean;
  /** Whether an entry of the resolution set lives under the validated root. */
  inRoot: (item: { dir: string }) => boolean;
  /** `stacks/<id>/STACK.md` (or a file inside the entry), relative to the root. */
  file: (item: { kind: Kind; dir: string }, inside?: string) => string;
};

export type CheckResult = { findings: ReadonlyArray<Finding>; sizes?: ReadonlyArray<SizeRow> };
export type CheckEnv = Registry | FileSystem.FileSystem | Path.Path | Processes | AppConfig;
/** One check group: findings (and size rows) for the validated set. Problems are findings, not failures. */
export type Check = (view: View) => Effect.Effect<CheckResult, PermissionDenied, CheckEnv>;

/** `inRoot` and `file` for the registry at `root`, whose entries live at `<kind dir>/<id>`. */
export function rootPaths(path: Path.Path, root: string): Pick<View, "inRoot" | "file"> {
  return {
    inRoot: (item) => path.dirname(path.dirname(item.dir)) === root,
    file: (item, inside) =>
      [path.relative(root, item.dir).split(path.sep).join("/"), inside].filter(Boolean).join("/"),
  };
}

/** A finding about one entry. */
export function finding(
  entry: { kind: Kind; id: string },
  fields: Omit<Finding, "kind" | "entry">,
): Finding {
  return { ...fields, kind: entry.kind, entry: entry.id };
}

/** The entry's markdown file, relative to the root. */
export const entryFile = (view: Pick<View, "file">, entry: { kind: Kind; dir: string }) =>
  view.file(entry, markdownFile(entry.kind));
