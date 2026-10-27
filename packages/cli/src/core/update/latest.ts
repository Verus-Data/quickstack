import { Duration, Effect, Option, Schema } from "effect";
import { HttpClient } from "effect/http";
import { UpstreamUnavailable } from "../../errors";
import { PACKAGE } from "../../version";
import { Version } from "./version";

const Document = Schema.Struct({ version: Version });
const unavailable = (status?: number) =>
  new UpstreamUnavailable({
    details: { service: "npm-registry", ...(status === undefined ? {} : { status }) },
  });

/** One bounded request, with upstream text decoded before it can enter output or argv. */
export const latestVersion = Effect.fn("update.latestVersion")(function* (
  timeout = Duration.seconds(10),
) {
  const client = yield* HttpClient.HttpClient;
  const request = Effect.gen(function* () {
    const response = yield* HttpClient.withScope(client)
      .get(`https://registry.npmjs.org/${PACKAGE.replace("/", "%2f")}/latest`, {
        headers: { accept: "application/json" },
      })
      .pipe(Effect.mapError(() => unavailable()));
    if (response.status < 200 || response.status >= 300) return yield* unavailable(response.status);
    const body = yield* response.json.pipe(Effect.mapError(() => unavailable(response.status)));
    const decoded = yield* Schema.decodeUnknownEffect(Document)(body).pipe(
      Effect.mapError(() => unavailable(response.status)),
    );
    return decoded.version;
  });
  const result = yield* request.pipe(Effect.scoped, Effect.timeoutOption(timeout));
  if (Option.isNone(result)) return yield* unavailable();
  return result.value;
});
