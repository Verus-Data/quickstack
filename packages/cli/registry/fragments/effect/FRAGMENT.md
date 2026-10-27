---
schema_version: 1
id: effect
kind: fragment
category: tooling
name: Effect testing and development
description: Effect test layers, virtual time, installed-API guidance, and a shared rule for Effect programs.
tags: [typescript, effect, testing]
applies_to: [typescript]
requires: [effect-schema]
deps:
  dev: ["@effect/vitest"]
decisions:
  - "Effect major: 4 (default). If the latest release is still a prerelease, pin every Effect package to the same one (with transitive overrides where needed) and record the pins under Build workarounds; otherwise use caret ranges. Check peer ranges before selecting Vitest and its coverage package."
---

# Effect testing and development

The stack owns its runtime, services, errors, and logging. This fragment adds optional testing patterns and development guidance; removing it must not remove the stack's architecture.

## Testing

Use `@effect/vitest` with fresh real service layers. Fake only third-party boundaries. A test layer factory must allocate new state on each build; test isolation explicitly. Layers are memoized, so two layer builds share a static memory layer's state unless it is wrapped in `Layer.fresh`. Avoid shared `it.layer` state unless intentional. Inject configuration with `Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env }))` or `ConfigProvider.layer`; `Effect.withConfigProvider` is gone, and Config constructors are capitalized (`Config.String`). Tests through separate route or CLI runtimes use the live clock; test time-dependent programs directly with provided layers.

`it.effect` supplies the TestClock, TestConsole, and a scope. For timers, fork the program, advance the TestClock, then join. When real local I/O occurs between clock steps, yield the event loop and wait on a condition. Never sleep to guess when a test is ready. Assert both typed failures and defect behavior without swallowing causes.

## Installed API guidance

Write `.claude/skills/effect/SKILL.md` after the core compiles, checking every claim against installed `.d.ts` files. Describe when to load it, where the current-major docs live, and that local types are authoritative. Resolve module import paths through the installed package exports before checking the corresponding declarations; do not infer directories from older releases. Cover:

- Service classes and namespaced identifiers, static layers, named Effect functions, typed failures versus defects, scope and cancellation, callbacks and captured runtime context.
- Migration traps for Context services, catch helpers, Result/Either, schema annotations and checks, fork helpers, scoped layers, log levels, and TestClock imports. Use the installed release's names.
- Config, custom logger inputs and annotations, clock-driven time, promise cancellation, layer memoization and boundary-only runtime execution.
- Schema decoding at trust boundaries, closed JSON schemas, annotations, references, and Standard Schema adapters.
- `@effect/vitest` virtual time, test scope, failure assertions, property tests, and state sharing.

Extend it for the CLI, platform, or AI modules only when the project uses them. Link it from AGENTS.md and the shipped `.claude/rules/effect.md` rule. Do not ship a frozen library API reference.

## Gotchas

Effect APIs can change during prereleases. Bump all Effect packages together, rerun the project's check command, and update the generated skill. Never install `@effect/schema`; Schema belongs to `effect`. Empty config strings count as absent. The default ConfigProvider may snapshot `process.env`; scripts invoked repeatedly must build a fresh provider each run. Forked fibers can fail silently: observe or log their cause at the owning boundary. Catch typed failures deliberately; defects remain defects.
