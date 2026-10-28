import { Effect, Option } from "effect";
import type { AppConfig } from "../config";
import type { Consent } from "../schemas/telemetry";
import { directory, Notice, read, type Storage } from "./storage";

export const standingOff = (reason: Consent) =>
  ["do_not_track", "environment", "config", "ci"].includes(reason);
export const consent = Effect.fn("telemetry.consent")(function* (input: {
  config: AppConfig["Service"];
  store: Storage;
  url: string | undefined;
}) {
  const { config, store, url } = input;
  if (yield* config.noTelemetry) return "flag";
  if (yield* config.offline) return "offline";
  if (config.telemetry.doNotTrack) return "do_not_track";
  if (config.telemetry.disabled) return "environment";
  const settings = yield* Effect.result(config.settings);
  if (settings._tag === "Failure") return "config_invalid";
  if (settings.success.telemetry === false) return "config";
  if (config.ci) return "ci";
  if (!config.releaseBuild) return "source_build";
  if (!url) return "no_endpoint";
  const writable = yield* Effect.result(
    directory(store, store.root).pipe(
      Effect.andThen(Effect.scoped(store.fs.makeTempDirectoryScoped({ directory: store.root }))),
    ),
  );
  if (writable._tag === "Failure") return "home_not_writable";
  const notice = yield* read(store, "notice.json", Notice).pipe(Effect.option);
  if (Option.isNone(notice)) return "not_notified";
  if (notice.value.pending && !notice.value.claimId?.startsWith("second:")) return "not_notified";
  return "enabled";
});
