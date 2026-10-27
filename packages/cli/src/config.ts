import { homedir } from "node:os";
import { Config, ConfigProvider, Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { InvalidConfig } from "./errors";
import { Settings } from "./schemas";
import { SLUG } from "./version";
export type Environment = Record<string, string | undefined>;
export type Paths = {
  config: string;
  data: string;
  cache: string;
  /** The user registry root, beside config.json: `$XDG_CONFIG_HOME/quickstacks/`. */
  user: string;
  /**
   * QUICKSTACKS_REGISTRY_DIR as given: replaces `Host.registry` as the bundled root when set.
   * `registry.ts::bundledRoot` resolves it against `Host.cwd`.
   */
  registry?: string;
};
export type LogSettings = {
  level: "Trace" | "Debug" | "Info" | "Warn" | "Error" | "Fatal" | "None";
  format: "human" | "json";
  file: string;
  noColor: boolean;
};
function provider(env: Environment) {
  return ConfigProvider.layer(
    ConfigProvider.fromEnvRecord(
      Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== "")),
    ),
  );
}
const text = (key: string, fallback = "") => Config.String(key).pipe(Config.withDefault(fallback));
export function configLayer(env: Environment = process.env) {
  const captured = { ...env };
  return Layer.effect(
    AppConfig,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const read = <A>(program: Config.Config<A>) =>
        program.pipe(Effect.provide(provider(captured)), Effect.orDie);
      const paths = Effect.gen(function* () {
        const home = yield* read(text("HOME", homedir()));
        const xdg = (key: string, ...fallback: string[]) =>
          read(text(key, path.join(home, ...fallback)));
        const config = yield* xdg("XDG_CONFIG_HOME", ".config");
        const data = yield* read(
          text(
            "QUICKSTACKS_DATA_DIR",
            path.join(yield* xdg("XDG_DATA_HOME", ".local", "share"), SLUG),
          ),
        );
        const cache = path.join(yield* xdg("XDG_CACHE_HOME", ".cache"), SLUG);
        const registry = yield* read(text("QUICKSTACKS_REGISTRY_DIR"));
        return {
          config: path.join(config, SLUG, "config.json"),
          data,
          cache,
          user: path.join(config, SLUG),
          ...(registry ? { registry } : {}),
        };
      });
      const get = yield* Effect.cached(
        Effect.gen(function* () {
          const locations = yield* paths;
          const exists = yield* fs.exists(locations.config);
          if (!exists) return { dataDir: locations.data };
          const raw = yield* fs.readFileString(locations.config);
          const unknown = yield* Effect.try({
            try: () => JSON.parse(raw) as unknown,
            catch: () => new InvalidConfig(),
          });
          const file = yield* Schema.decodeUnknownEffect(Settings, { onExcessProperty: "error" })(
            unknown,
          );
          const override = yield* read(text("QUICKSTACKS_DATA_DIR"));
          return { ...file, dataDir: override || file.dataDir || locations.data };
        }).pipe(Effect.mapError(() => new InvalidConfig())),
      );
      const logging = Effect.gen(function* () {
        const raw = (yield* read(text("LOG_LEVEL", "warn"))).toLowerCase();
        const levels = {
          trace: "Trace",
          debug: "Debug",
          info: "Info",
          warn: "Warn",
          error: "Error",
          fatal: "Fatal",
          none: "None",
        } as const;
        const level = levels[raw as keyof typeof levels] ?? "Warn";
        const format = yield* read(text("QUICKSTACKS_LOG_FORMAT"));
        return {
          level,
          format: format === "json" ? ("json" as const) : ("human" as const),
          file: yield* read(text("QUICKSTACKS_LOG_FILE")),
          noColor: Boolean(yield* read(text("NO_COLOR"))),
        };
      });
      // A child's whole environment: what was captured, minus `remove`, plus `set`. Nothing is
      // inherited from the live process environment.
      const childEnv = (remove: readonly string[], set: Record<string, string> = {}) => {
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(captured))
          if (value !== undefined && !remove.includes(key)) env[key] = value;
        return { ...env, ...set };
      };
      return { get, paths, logging, childEnv };
    }),
  );
}
export class AppConfig extends Context.Service<
  AppConfig,
  {
    get: Effect.Effect<Settings, InvalidConfig>;
    paths: Effect.Effect<Paths>;
    logging: Effect.Effect<LogSettings>;
    /**
     * The whole environment for a child process, built from the environment this layer captured
     * (including its `PATH`): every captured name except `remove`, then `set` on top.
     */
    childEnv: (remove: readonly string[], set?: Record<string, string>) => Record<string, string>;
  }
>()("quickstacks/AppConfig") {
  static layer = () => configLayer();
  static memory = (env: Environment = {}) => configLayer(env);
}
