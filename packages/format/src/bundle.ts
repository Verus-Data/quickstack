import { Effect, Schema } from "effect";
import { Kebab, Kind } from "./entry.js";

/** Literal entry-relative paths, including dotfiles; never traversal or platform separators. */
export const BundlePath = Schema.String.check(
  Schema.makeFilter(
    (path) =>
      (path.length > 0 &&
        !path.startsWith("/") &&
        !path.includes("\\") &&
        !path.includes("\0") &&
        !path.split("/").includes("..")) ||
      "expected a relative bundle path without traversal, backslashes or NUL",
  ),
);
export type BundlePath = typeof BundlePath.Type;

const isBase64 = Schema.is(Schema.String.check(Schema.isBase64()));

/** Raw entry files, before composition or template rendering. */
export const EntryBundle = Schema.Struct({
  id: Kebab,
  kind: Kind,
  files: Schema.Array(
    Schema.Struct({
      path: BundlePath,
      executable: Schema.Boolean,
      encoding: Schema.Literals(["utf8", "base64"]),
      content: Schema.String,
    }).check(
      Schema.makeFilter((file) =>
        file.encoding === "base64" && !isBase64(file.content)
          ? { path: ["content"], issue: "expected base64 content" }
          : undefined,
      ),
    ),
  ).check(
    Schema.makeFilter(
      (files) =>
        new Set(files.map((file) => file.path)).size === files.length ||
        "bundle paths must be unique",
    ),
  ),
});
export type EntryBundle = typeof EntryBundle.Type;

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function canonicalFile(file: EntryBundle["files"][number]) {
  const encoder = new TextEncoder();
  const bytes =
    file.encoding === "utf8"
      ? encoder.encode(file.content)
      : Uint8Array.from(atob(file.content), (character) => character.charCodeAt(0));
  // Preserve a leading BOM as content, too. Replacement characters only count if their bytes match.
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  const utf8 = compareBytes(bytes, encoder.encode(text)) === 0;
  return {
    path: file.path,
    executable: file.executable,
    encoding: utf8 ? "utf8" : "base64",
    content: utf8 ? text : btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")),
  };
}

/** Fixed JSON keys and UTF-8 path ordering; file bytes are never normalized. */
export function canonicalBundle(bundle: EntryBundle): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const files = bundle.files
    .map((file) => ({ file, pathBytes: encoder.encode(file.path) }))
    .sort((left, right) => compareBytes(left.pathBytes, right.pathBytes))
    .map(({ file }) => canonicalFile(file));
  return encoder.encode(JSON.stringify({ id: bundle.id, kind: bundle.kind, files }));
}

export const bundleDigest = Effect.fn("format.bundleDigest")(function* (bundle: EntryBundle) {
  const digest = yield* Effect.promise(() =>
    crypto.subtle.digest("SHA-256", canonicalBundle(bundle)),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
});
