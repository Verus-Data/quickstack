// Telemetry is best effort: failures and defects are swallowed only at this boundary, because
// collection must never change a command's output or exit. Debug logs omit error messages.
import { type RunRecord, TelemetryEvent } from "@stacks/format";
import { Cause, Context, Effect, FileSystem, Layer, Option, Path, Schema } from "effect";
import { HttpClient } from "effect/http";
import { AppConfig } from "../config";
import { Registry, remoteRoots } from "../core/registry/registry";
import { defectTrace } from "../logging";
import type { Consent, TelemetryFlush, TelemetryStatus } from "../schemas/telemetry";
import { Host } from "../services/host";
import { Output } from "../services/output";
import { VERSION } from "../version";
import { deliver } from "./client";
import { completeAddFacts } from "./composition";
import { consent, standingOff } from "./consent";
import {
  type Envelope,
  type ErrorFacts,
  errorEvent,
  publicId,
  type ScaffoldFacts,
  type ShowFacts,
} from "./events";
import { recoverNotice } from "./notice";
import { scaffold, verify } from "./projects";
import { enqueue } from "./spool";
import {
  directory,
  Install,
  installId,
  Notice,
  names,
  read,
  remove,
  type Storage,
  timestamp,
  uuid,
  write,
} from "./storage";

/** The privacy page is `/telemetry` on the host that receives the events. */
export const notice = (endpoint: string) =>
  `stacks collects anonymous usage and verify results, never your code, paths or command output. Privacy and schema: ${new URL("/telemetry", endpoint).href}. Turn it off: stacks telemetry disable`;
const safe = <A, E, R>(effect: Effect.Effect<A, E, R>, fallback: A) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Effect.logDebug("Telemetry unavailable").pipe(
        Effect.annotateLogs({ telemetry: true, defect: defectTrace(Cause.squash(cause)) }),
        Effect.as(fallback),
      ),
    ),
  );
export class Telemetry extends Context.Service<
  Telemetry,
  {
    consent: Effect.Effect<Consent>;
    notify: Effect.Effect<void>;
    status: Effect.Effect<TelemetryStatus>;
    recordScaffold: (input: ScaffoldFacts) => Effect.Effect<void>;
    recordShow: (input: ShowFacts) => Effect.Effect<void>;
    recordError: (input: ErrorFacts) => Effect.Effect<void>;
    recordVerify: (record: RunRecord) => Effect.Effect<void>;
    flush: Effect.Effect<void>;
    flushNow: Effect.Effect<TelemetryFlush>;
    clear: (reset: boolean) => Effect.Effect<boolean>;
  }
>()("stacks/Telemetry") {
  static layer = (options: { officialUrl?: string } = {}) =>
    Layer.effect(
      Telemetry,
      Effect.gen(function* () {
        const config = yield* AppConfig;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const host = yield* Host;
        const client = yield* HttpClient.HttpClient;
        const files = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
        const registryContext = yield* Effect.context<
          AppConfig | Host | FileSystem.FileSystem | Path.Path
        >();
        const output = yield* Effect.serviceOption(Output);
        const store: Storage = {
          fs,
          path,
          root: path.join((yield* config.paths).state, "telemetry"),
        };
        const url = config.telemetry.url ?? options.officialUrl;
        let noticeRun = false;
        let ownsNotice: string | undefined;
        yield* Effect.addFinalizer(() =>
          safe(
            Effect.gen(function* () {
              if (!ownsNotice || Option.isNone(output)) return;
              const current = yield* read(store, "notice.json", Notice).pipe(Effect.option);
              if (Option.isNone(current) || current.value.claimId !== ownsNotice) return;
              if (yield* output.value.noticeDelivered)
                yield* write(store, "notice.json", { noticeShownAt: yield* timestamp });
              else yield* remove(store, "notice.json");
            }),
            undefined,
          ),
        );
        const purge = Effect.gen(function* () {
          yield* remove(store, "spool");
          yield* remove(store, "claims");
        });
        const check = consent({ config, store, url }).pipe(
          Effect.tap((reason) => (standingOff(reason) ? safe(purge, undefined) : Effect.void)),
        );
        const notify = safe(
          Effect.gen(function* () {
            // Consent is never not_notified without an endpoint (no_endpoint wins).
            if ((yield* check) !== "not_notified" || url === undefined) return;
            noticeRun = true;
            if (Option.isNone(output)) return;
            yield* directory(store, store.root);
            yield* recoverNotice(store);
            const claimId = yield* uuid;
            const created = yield* Effect.result(
              fs.writeFileString(
                path.join(store.root, "notice.json"),
                JSON.stringify({ noticeShownAt: yield* timestamp, pending: true, claimId }),
                { flag: "wx", mode: 0o600 },
              ),
            );
            if (created._tag === "Success") {
              ownsNotice = claimId;
              yield* output.value.notice(notice(url));
              if (yield* output.value.noticeDelivered) {
                yield* write(store, "notice.json", { noticeShownAt: yield* timestamp });
                ownsNotice = undefined;
              }
            }
          }),
          undefined,
        );
        const envelope = Effect.gen(function* (): Effect.fn.Return<Envelope, unknown> {
          return {
            schemaVersion: 1,
            eventId: yield* uuid,
            installId: yield* installId(store),
            cliVersion: VERSION,
            os: host.platform === "darwin" || host.platform === "linux" ? host.platform : "other",
            nodeMajor: host.nodeMajor,
            agent: yield* config.agent,
            sentAt: yield* timestamp,
          };
        });
        const queue = (build: Effect.Effect<Omit<TelemetryEvent, keyof Envelope>, unknown>) =>
          safe(
            Effect.gen(function* () {
              yield* notify;
              if (noticeRun || (yield* check) !== "enabled") return;
              const event = yield* Schema.decodeUnknownEffect(TelemetryEvent, {
                onExcessProperty: "error",
              })({ ...(yield* envelope), ...(yield* build) });
              if (config.telemetry.debug) {
                if (Option.isSome(output)) yield* output.value.note(JSON.stringify(event));
              } else yield* enqueue(store, event);
            }),
            undefined,
          );
        const recordScaffold = (input: ScaffoldFacts) => {
          const facts: Effect.Effect<ScaffoldFacts, unknown> =
            input.type === "new"
              ? Effect.succeed(input)
              : completeAddFacts(input).pipe(
                  Effect.provide(Layer.unwrap(Effect.map(remoteRoots, Registry.layer))),
                  Effect.provideContext(registryContext),
                );
          return queue(facts.pipe(Effect.flatMap((value) => scaffold(store, value))));
        };
        const recordVerify = (record: RunRecord) =>
          queue(verify({ store, cwd: host.cwd, record }).pipe(Effect.provideContext(files)));
        const flush = (deadline: number) =>
          safe(
            Effect.gen(function* (): Effect.fn.Return<TelemetryFlush, unknown> {
              const reason = yield* check;
              if (standingOff(reason)) yield* purge;
              if (reason !== "enabled" || noticeRun || config.telemetry.debug || !url)
                return {
                  sent: 0,
                  kept: (yield* names(store, "spool")).length,
                  rejected: 0,
                  reason,
                };
              return yield* deliver({ store, client, url, deadline });
            }),
            { sent: 0, kept: 0, rejected: 0, reason: "home_not_writable" } satisfies TelemetryFlush,
          );
        const status = safe(
          Effect.gen(function* (): Effect.fn.Return<TelemetryStatus, unknown> {
            const reason = yield* check;
            const install = yield* read(store, "install.json", Install).pipe(Effect.option);
            const notice = yield* read(store, "notice.json", Notice).pipe(Effect.option);
            return {
              reason,
              ...(Option.isSome(install) ? install.value : {}),
              ...(Option.isSome(notice) && !notice.value.pending
                ? { noticeShownAt: notice.value.noticeShownAt }
                : {}),
              spooled: (yield* names(store, "spool")).length,
            };
          }),
          { reason: "home_not_writable", spooled: 0 } satisfies TelemetryStatus,
        );
        return {
          consent: safe(check, "home_not_writable"),
          notify,
          status,
          recordScaffold,
          recordVerify,
          recordShow: (entry: ShowFacts) =>
            queue(
              Effect.sync(() => ({ type: "show" as const, kind: entry.kind, id: publicId(entry) })),
            ),
          recordError: (input: ErrorFacts) => queue(Effect.sync(() => errorEvent(input))),
          flush: flush(800).pipe(Effect.asVoid),
          flushNow: flush(5000),
          clear: (reset: boolean) =>
            safe(
              Effect.gen(function* () {
                yield* purge;
                for (const name of ["projects", "install.json", "flush.json"])
                  yield* remove(store, name);
                if (reset) yield* installId(store);
                return true;
              }),
              false,
            ),
        };
      }),
    );
}
