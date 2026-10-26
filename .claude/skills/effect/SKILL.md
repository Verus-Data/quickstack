---
name: effect
description: Load before changing CLI programs, services, configuration, schemas, logging or tests.
---

# Effect 4 in this CLI

Checked against effect, @effect/platform-bun, @effect/platform-node and @effect/vitest 4.0.6. Package exports and installed matching declarations are authoritative. Resolve an import with import.meta.resolve before searching its `.d.ts`; do not infer paths from an older prerelease. Consult installed effect/ai-docs/src and https://effect.website for current-major context. Recheck these notes with each dependency bump.

## Verified entry points

- Command, Flag and CliError: `effect/cli` (direct paths include effect/cli/Command and effect/cli/Flag).
- FileSystem, Path, Stdio, Context, Schema, Config, Effect: effect exports.
- TestClock: `effect/testing` or `effect/testing/TestClock`.
- BunServices: @effect/platform-bun; NodeServices: @effect/platform-node.
- Test integrations: @effect/vitest. CLI/platform APIs remain marked unstable in these stable package declarations; check installed APIs.

## Commands and services

Command.make builds real commands; withSubcommands composes the tree. withSharedFlags makes flags available before/after subcommands. Flag.Boolean requires an explicit fallback when omitted: use withDefault(false). Command.runWith accepts raw argument arrays and `{version,renderErrors:false}`. ShowHelp with no nested errors is successful help; with errors it is failure. Framework help uses Console.log, so main captures Console and discards it on failure. Output owns application writes.

Services use Context.Service<Self,Shape>() with namespaced identifiers. Capture dependencies in Layer.effect; this API handles Scope requirements from acquireRelease (do not use an old Layer.scoped recipe). Allocate new state per build. Effect.cached returns a lazy cached Effect; config caches live inside a layer, never global state. Layer identity memoizes within a build; separate invocations build fresh scopes. Effect.fn can name effectful functions. Execute only at runInvocation, the one outer boundary.

Effect.fail/Schema.TaggedError are typed failures; Effect.die is a defect. catchTag/catchTags handle selected tags, catchCause handles all reasons at an owning boundary. Effect.result returns Result with Success.success or Failure.failure, not Either. Runtime Exit has Success.value and Failure.cause; Cause.reasons can be narrowed with isFailReason/isDieReason/isInterruptReason. Pending interrupts may remain after masked cleanup: runInvocation maps that final interruption to 130.

Scope owns finalizers and child fibers. forkChild/forkScoped differ from old fork recipes; observe every fork using join or an owning boundary. Effect.callback takes resume and AbortSignal and can return cleanup; capture context before leaving the Effect and reenter that context, not another ambient runtime. tryPromise receives a signal; pass it to real cancellable I/O. runPromiseExit accepts signal. BunRuntime.runMain supports disableErrorReporting but is not used here: main/runInvocation own outcomes without duplicate runtime logging.

## Config, logs and clock

Config.String and other constructors are capitalized in this major. Normalize blank env values, then build a fresh ConfigProvider.fromEnvRecord; config.ts is the only ordinary env reader. Layer building never reads fallible config files. Schema decoding is lazy inside commands. Paths/log settings are read independently; invalid level safely falls back.

Logger.make gets date, logLevel, message, cause and fiber. Read annotations through fiber.getRef(References.CurrentLogAnnotations); use References.MinimumLogLevel for filtering. Levels are title-case values inside Effect, lowercased in JSON. Queue plain sanitized entries in the logger callback; flush them with captured FileSystem/Output services, avoiding new runtimes in callbacks. Clock.currentTimeMillis and Effect.sleep are test-clock driven.

## Schemas and testing

Schema.Struct describes DTOs and Class describes identities/behavior. Schema/type share a name. Brand domain identifiers with Schema.brand and use TaggedError for safe typed failures. Decode unknown values using decodeUnknownEffect; encode at output. Refinements are `.check(Schema.makeFilter(...))`; metadata is `.annotate`. Keep metadata on its intended node, especially around checks.

Schema.toJsonSchemaDocument returns a document with `.schema`; onExcessProperty:error closes objects and should also be used during decoding when extras must fail. Identifiers influence refs; avoid tool-facing identifiers unless the consumer supports refs. Schema.toStandardSchemaV1 adapts Standard Schema consumers. Never install @effect/schema.

@effect/vitest `it.effect` supplies test scope/time; TestClock.adjust advances timers. Fork timers before advancing and join them afterwards. When real I/O intervenes, wait on an observed condition, not guessed sleeps. `it.prop` and `it.effect.prop` accept schemas/arbitraries for property checks. it.layer intentionally shares services across tests; fresh layers prove isolation. A separately run runtime uses live services, independent of the surrounding test clock. Assert failures and defects using Exit/Cause or through runCli's actual exit/stream contract.
