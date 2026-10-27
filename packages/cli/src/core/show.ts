import { Effect, Result } from "effect";
import { AppConfig } from "../config";
import { BadInput, NotFound } from "../errors";
import type { Kind } from "../schemas/entry";
import type { LedgerRecord } from "../schemas/ledger";
import type { ShowReport } from "../schemas/show";
import { Output } from "../services/output";
import { countWords } from "./brief/words";
import { targetAgents } from "./compose/agents";
import { compose } from "./compose/compose";
import { fingerprint } from "./fingerprint";
import { lastDefaultRecord, latestMatchingRecord, readLedger } from "./ledger";
import { toRow } from "./list";
import { type Entry, isRejected, outputPath, type RejectedEntry } from "./registry/entry";
import { defaultRoots, Registry, type RegistryRoot, type RegistryRoots } from "./registry/registry";
import { closest } from "./suggest";
import { printable } from "./text";
import { BUDGET, bodyLimit, canonicalBrief, composedLimit } from "./validate/budget";

/** Full review data; neither entries nor tools are executed. */
export const showReport = (id: string, kind: Kind | undefined, reviewRoots?: RegistryRoots) =>
  Effect.gen(function* () {
    const roots = reviewRoots ?? (yield* defaultRoots);
    const settings = yield* (yield* AppConfig).get;
    const output = yield* Output;
    const bundled = roots.find((root) => root.origin === "bundled");
    const ledger = bundled ? yield* readLedger(bundled.path) : undefined;
    if (ledger && (!ledger.fileValid || ledger.skipped.invalid || ledger.skipped.newer))
      yield* output.note(
        "Warning: the bundled ledger runs.json is unreadable or contains unsupported records.",
      );
    const records = ledger?.records ?? [];
    return yield* Effect.gen(function* () {
      const registry = yield* Registry;
      const all = yield* registry.all;
      const match = yield* findEntry(all, id, kind);
      const entry = yield* registry.get(match.kind, id);
      const row = toRow(entry, records);
      const { meta } = entry;
      const files = (yield* registry.files(entry)).map((file) => {
        const agent = /^adapters\/([^/]+)\//.exec(file.source)?.[1];
        return {
          source: file.source,
          path: outputPath(file),
          ...(agent ? { agent } : {}),
        };
      });
      const composition =
        entry.kind === "stack"
          ? yield* compose({
              stack: id,
              with: [],
              without: [],
              preset: "default",
              agents: targetAgents(undefined, settings).slice(0, 1),
              always: [],
              mode: "new",
            })
          : null;
      const lastRun = yield* entryLastRun(entry, records, bundled);
      return {
        ...row,
        path: entry.dir,
        deps: meta.deps,
        tools: meta.tools,
        decisions: meta.decisions,
        env: meta.env,
        commands: meta.commands,
        verify: meta.verify,
        ...selectionMetadata(entry, all),
        files,
        body: entry.body,
        bodyWords: countWords(entry.body),
        bodyCap: bodyLimit(entry),
        briefWords: composition ? canonicalBrief(composition).briefWords : null,
        briefCap: composition ? composedLimit(composition) : BUDGET.composed,
        lastRun,
      } satisfies ShowReport;
    }).pipe(Effect.provide(Registry.layer(roots)));
  });

function selectionMetadata(entry: Entry, all: ReadonlyArray<Entry | RejectedEntry>) {
  const { meta } = entry;
  return meta.kind === "stack"
    ? { fragments: meta.fragments }
    : {
        category: meta.category,
        appliesTo: meta.appliesTo,
        requires: meta.requires,
        conflicts: meta.conflicts,
        requiresTools: meta.requiresTools,
        needsOwnRepo: meta.needsOwnRepo,
        fits: all
          .filter(
            (item) =>
              !isRejected(item) &&
              item.kind === "stack" &&
              (!meta.appliesTo.length ||
                meta.appliesTo.includes(item.id) ||
                item.meta.tags.some((tag) => meta.appliesTo.includes(tag))),
          )
          .map((item) => item.id),
      };
}

const findEntry = (all: ReadonlyArray<Entry | RejectedEntry>, id: string, kind: Kind | undefined) =>
  Effect.gen(function* () {
    const matches = all.filter(
      (entry) => entry.id === id && (kind === undefined || entry.kind === kind),
    );
    if (matches.length > 1)
      return yield* new BadInput({ details: { id, flag: "kind", known: ["stack", "fragment"] } });
    const match = matches[0];
    if (!match)
      return yield* new NotFound({
        details: {
          id,
          ...(kind ? { kind } : {}),
          suggestions: closest(
            id,
            all
              .filter((entry) => kind === undefined || entry.kind === kind)
              .map((entry) => entry.id),
          ),
        },
      });
    return match;
  });

const fragmentRecords = (entry: Entry, records: ReadonlyArray<LedgerRecord>) =>
  Effect.gen(function* () {
    const candidates: LedgerRecord[] = [];
    for (const record of entry.kind === "stack" ? [] : records) {
      if (record.preset !== "default" && record.preset !== "sandbox") continue;
      const current = yield* Effect.result(
        compose({
          stack: record.stack,
          with: record.with,
          without: [],
          preset: record.preset,
          agents: [record.agent],
          always: [],
          mode: "new",
        }),
      );
      if (
        Result.isSuccess(current) &&
        current.success.fragments.some((fragment) => fragment.id === entry.id)
      )
        candidates.push(record);
    }
    return candidates;
  });

const bundledLastRun = (entry: Entry, records: ReadonlyArray<LedgerRecord>) =>
  Effect.gen(function* () {
    const candidates = yield* fragmentRecords(entry, records);
    const record =
      entry.kind === "stack"
        ? lastDefaultRecord(records, entry.id)
        : latestMatchingRecord(candidates, () => true);
    if (!record) return null;
    const stack = record.stack;
    const added = record.with;
    if (record.preset !== "default" && record.preset !== "sandbox")
      return {
        date: record.date,
        result: record.result,
        fingerprint: record.fingerprint,
        agent: record.agent,
        preset: record.preset,
        ...(entry.kind === "fragment" ? { stack } : {}),
        sameContent: false,
      };
    const current = yield* Effect.result(
      compose({
        stack,
        with: added,
        without: [],
        preset: record.preset,
        agents: [record.agent],
        always: [],
        mode: "new",
      }).pipe(Effect.flatMap(fingerprint)),
    );
    return {
      date: record.date,
      result: record.result,
      fingerprint: record.fingerprint,
      agent: record.agent,
      preset: record.preset,
      ...(entry.kind === "fragment" ? { stack } : {}),
      sameContent: Result.isSuccess(current) && current.success === record.fingerprint,
    };
  });

const entryLastRun = (
  entry: Entry,
  records: ReadonlyArray<LedgerRecord>,
  bundled: RegistryRoot | undefined,
) =>
  Effect.gen(function* () {
    let lastRun: ShowReport["lastRun"] = null;
    if (entry.origin === "bundled" && bundled) {
      // A bundled run is compared only to bundled inputs, never a local shadow of a fragment.
      lastRun = yield* bundledLastRun(entry, records).pipe(
        Effect.provide(Registry.layer([bundled])),
      );
    }
    return lastRun;
  });

function lastRunLine(lastRun: ShowReport["lastRun"]): string {
  if (!lastRun) return "Last run: none";
  return `Last run: ${lastRun.result} ${lastRun.date}${lastRun.stack ? ` on ${lastRun.stack}` : ""}, ${lastRun.sameContent ? "same content" : "changed content"}`;
}

/** Complete text review, including commands and every unfiltered guidance branch. */
export function renderShow(report: ShowReport, invocation: string): string {
  const list = (values: ReadonlyArray<string>) => (values.length ? values.join(", ") : "none");
  const out = [
    `${report.name} (${report.id}), ${report.kind}, origin ${report.origin}, ${report.trusted ? "trusted" : "untrusted"}`,
    report.description,
    `Path: ${report.path}`,
    `Shadows: ${list(report.shadows)}`,
    `Tags: ${list(report.tags)}`,
    ...Object.entries(report.deps).map(([role, names]) => `Dependencies (${role}): ${list(names)}`),
    `Tools: ${list(report.tools)}`,
    ...(report.decisions.length
      ? ["Decisions:", ...report.decisions.map((decision) => `  - ${decision}`)]
      : ["Decisions: none"]),
    ...Object.entries(report.env).map(([key, value]) => `Environment: ${key}=${value}`),
    ...Object.entries(report.commands).map(([key, value]) => `Command: ${key}: ${value}`),
  ];
  if (report.fragments)
    out.push(
      `Fragments: required ${list(report.fragments.required)}; default ${list(report.fragments.default)}; optional ${list(report.fragments.optional)}`,
    );
  if (report.category)
    out.push(
      `Category: ${report.category}`,
      `Applies to: ${list(report.appliesTo ?? [])}`,
      `Fits: ${list(report.fits ?? [])}`,
      `Requires: ${list(report.requires ?? [])}`,
      `Conflicts: ${list(report.conflicts ?? [])}`,
      `Requires tools: ${list(report.requiresTools ?? [])}`,
      `Needs own repository: ${report.needsOwnRepo ? "yes" : "no"}`,
    );
  out.push(
    "Verify:",
    ...report.verify.map((step) => {
      // Everything but the name and command, e.g. `phase setup, layer install`.
      const { name, run, ...rest } = step;
      const extra = Object.entries(rest).map(
        ([key, value]) => `${key} ${typeof value === "string" ? value : JSON.stringify(value)}`,
      );
      return `  ${name}: ${run}${extra.length ? ` (${extra.join(", ")})` : ""}`;
    }),
  );
  out.push(
    "Files:",
    ...(report.files.length
      ? report.files.map(
          (file) => `  ${file.path}${file.agent ? ` (${file.agent})` : ""} <- ${file.source}`,
        )
      : ["  none"]),
  );
  out.push(
    `Body: ${report.bodyWords.toLocaleString("en-US")} words (cap ${report.bodyCap.toLocaleString("en-US")})`,
  );
  if (report.briefWords !== null)
    out.push(
      `Brief: ${report.briefWords.toLocaleString("en-US")} words with defaults (cap ${report.briefCap.toLocaleString("en-US")}; ${BUDGET.composedWithApp.toLocaleString("en-US")} with an app)`,
    );
  out.push(lastRunLine(report.lastRun));
  out.push(
    "",
    "--- guidance ---",
    ...report.body.trimEnd().split("\n"),
    "",
    report.kind === "stack"
      ? `Next: ${invocation} validate --brief ${report.id} --sandbox`
      : `Next: ${invocation} new <stack> --with ${report.id}`,
  );
  return out.map((line) => line.split("\t").map(printable).join("\t")).join("\n");
}
