import { TelemetryAccepted, type TelemetryBatch } from "@steamfield/stacks-format";
import { Clock, Effect, Option, Schema } from "effect";
import { type HttpClient, HttpClientRequest } from "effect/http";
import type { TelemetryFlush } from "../schemas/telemetry";
import { claim, recover, restore, trim } from "./spool";
import { DAY, installId, names, Project, read, remove, type Storage, write } from "./storage";

const State = Schema.fromJsonString(
  Schema.Struct({
    until: Schema.Number,
    projectCursor: Schema.optionalKey(Schema.String),
  }),
);
type State = typeof State.Type;
type Delivery = { store: Storage; client: HttpClient.HttpClient; url: string; deadline: number };
const pruneProjects = Effect.fn("telemetry.pruneProjects")(function* (
  store: Storage,
  cursor?: string,
) {
  const now = yield* Clock.currentTimeMillis;
  const all = (yield* names(store, "projects")).filter((name) => name.endsWith(".json")).sort();
  const ordered =
    cursor === undefined
      ? all
      : [...all.filter((name) => name > cursor), ...all.filter((name) => name <= cursor)];
  const batch = ordered.slice(0, 50);
  for (const name of batch) {
    const file = store.path.join("projects", name);
    const project = yield* Effect.result(read(store, file, Schema.fromJsonString(Project)));
    if (project._tag === "Failure" || now - Date.parse(project.success.scaffoldedAt) > 365 * DAY)
      yield* remove(store, file);
  }
  return batch.at(-1);
});
function retryDelay(value: string | undefined, now: number) {
  if (value === undefined) return 600_000;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 600_000;
}
const post = Effect.fn("telemetry.post")(function* (input: {
  client: HttpClient.HttpClient;
  url: string;
  events: readonly TelemetryBatch["events"][number][];
}) {
  const response = yield* input.client.execute(
    HttpClientRequest.post(`${input.url.replace(/\/$/, "")}/v1/events`).pipe(
      HttpClientRequest.bodyJsonUnsafe({ events: input.events }),
    ),
  );
  if (response.status !== 202)
    return { accepted: false as const, retryAfter: response.headers["retry-after"] };
  const value = yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(TelemetryAccepted, { onExcessProperty: "error" })),
  );
  const sent = new Set(input.events.map((event) => event.eventId));
  if (value.rejected.some((id) => !sent.has(id)))
    return { accepted: false as const, retryAfter: undefined };
  return { accepted: true as const, rejected: new Set(value.rejected) };
});
const countPending = (store: Storage) =>
  names(store, "spool").pipe(
    Effect.map((files) => files.filter((file) => file.endsWith(".json")).length),
  );
const saveState = (store: Storage, state: State) => write(store, "flush.json", state);
const send = Effect.fn("telemetry.send")(function* (input: Delivery, state: State) {
  const { store } = input;
  yield* recover(store);
  const cursor = yield* pruneProjects(store, state.projectCursor);
  const next = { until: 0, ...(cursor === undefined ? {} : { projectCursor: cursor }) };
  if (cursor !== undefined) yield* saveState(store, next);
  const events = yield* trim(store);
  if (!events.length) return { sent: 0, kept: 0, rejected: 0, reason: "enabled" as const };
  // An existing spool never permits delivery under an identity that could not be persisted.
  yield* installId(store);
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const batch = yield* Effect.acquireRelease(claim(store, events), (batch) =>
        restore(store, batch.dir).pipe(Effect.ignore),
      );
      if (!batch.events.length)
        return {
          sent: 0,
          kept: yield* countPending(store),
          rejected: 0,
          reason: "enabled" as const,
        };
      const attempt = yield* post({
        ...input,
        events: batch.events.map(({ event }) => event),
      }).pipe(Effect.result);
      if (attempt._tag === "Success" && attempt.success.accepted) {
        const rejected = attempt.success.rejected.size;
        for (const item of batch.events) yield* remove(store, item.file);
        yield* saveState(store, next);
        return {
          sent: batch.events.length - rejected,
          kept: yield* countPending(store),
          rejected,
          reason: "enabled" as const,
        };
      }
      const after = attempt._tag === "Success" ? attempt.success.retryAfter : undefined;
      const now = yield* Clock.currentTimeMillis;
      yield* saveState(store, { ...next, until: now + retryDelay(after, now) });
      return { sent: 0, kept: events.length, rejected: 0, reason: "enabled" as const };
    }),
  );
});
export const deliver = Effect.fn("telemetry.deliver")(function* (
  input: Delivery,
): Effect.fn.Return<TelemetryFlush, unknown> {
  const { store } = input;
  const result = yield* Effect.gen(function* () {
    const state = yield* read(store, "flush.json", State).pipe(
      Effect.orElseSucceed(() => ({ until: 0 })),
    );
    if (state.until > (yield* Clock.currentTimeMillis))
      return { sent: 0, kept: yield* countPending(store), rejected: 0, reason: "enabled" as const };
    return yield* send(input, state);
  }).pipe(Effect.timeoutOption(input.deadline));
  if (Option.isSome(result)) return result.value;
  const previous = yield* read(store, "flush.json", State).pipe(
    Effect.orElseSucceed(() => ({ until: 0 })),
  );
  yield* saveState(store, { ...previous, until: (yield* Clock.currentTimeMillis) + 600_000 });
  return { sent: 0, kept: yield* countPending(store), rejected: 0, reason: "enabled" };
});
