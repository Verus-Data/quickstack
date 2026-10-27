# Architecture

Load the `ce:architecting-systems` skill before designing or changing a module, service, package boundary, schema or shared contract, and before executing any file in `plans/phases/`. Its Structure, Coupling and Boundaries references matter most here. Load Concurrency as well when touching signal handling or the planned Processes service, and Observability when touching logging. The skill comes from the `claude-essentials` marketplace (`ce` plugin); an agent without it should read the constraints below and continue.

The skill gives general structure. This rule carries the constraints it can't know, which come from the product and the plans rather than from code. AGENTS.md "Architecture map" and "Conventions" cover the per-file layout and service style; don't repeat them in a design.

## Product constraints

The CLI executes nothing it reads and never calls an LLM (plans README decision D2; roadmap "Trust model", point 1). `list`, `show`, `new`, `add`, `validate` and `create` read, compose and write entries; only `verify` runs commands, and only the steps in the project's own manifest. `update` is the one other command that runs a program: it makes one request to the npm registry and calls `npm` with fixed arguments and a checked version, only when a person runs it. A design that runs a generator, an install script or a hook from an entry is wrong, however convenient.

Humans own what lasts and agents own what ages (plans README "Product to preserve"). Composition, layout, enforcement and the definition of done belong in stacks and in the CLI. Versions, generator flags and config formats belong to the agent. A feature that pins a version or freezes a config format in the CLI or in `files/` is drifting toward a template engine, which the product says it isn't.

## Package boundaries

Code two packages share goes in its own package under `packages/`, extracted when the second package needs it and not before (D11). Never import from another package's `src/`. The roadmap already names the first extraction (the entry, manifest and run-record schemas move to `packages/format` in 4.0a); don't do it early.

## Shared contracts

Cross-phase types, error tags, schema versions and shared helpers are owned once, by the roadmap's "Contracts every sub-phase shares" table. A design cites them by the name in its "Symbol" column and never redefines or renames one. A change to a contract updates that table in the same commit as the code.

## Plans

Plan files cite symbols, never line numbers (`errors.ts::exitCode`, not `errors.ts:49`). Plans are hypotheses: verify a claim against the code before building on it, and record what a plan got wrong in that plan's "What this plan may get wrong" section, next to the plan, rather than silently doing something else (plans README "Plan conventions").

## When a fix doesn't take

Load `ce:systematic-debugging`. AGENTS.md "Debugging" already sets the stop rule after two failed fixes.
