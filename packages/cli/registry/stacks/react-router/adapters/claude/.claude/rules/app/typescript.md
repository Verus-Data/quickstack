---
paths:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "tests/**/*.ts"
  - "tests/**/*.tsx"
  - "scripts/**/*.ts"
  - "evals/**/*.ts"
  - "e2e/**/*.ts"
---

# TypeScript

Only the things that are easy to get wrong here. Effect-specific typing is in the `effect` skill.

## Compiler and config

- This is TypeScript 7 (the Go port). The binary is `tsc`; there is no `tsgo`. 7.0 has no programmatic API (`require("typescript")` exports only `version`), so don't add scripts or tools that need the compiler API.
- Options removed in 6.0/7.0 are hard errors, not warnings: `baseUrl` (`paths` entries are relative, `"./app/*"`), `moduleResolution: node`/`node10`, `downlevelIteration`, and `esModuleInterop` or `allowSyntheticDefaultImports` set to false.
- `erasableSyntaxOnly` is on (TS1294): no `enum` (use a union of literals or an `as const` object), no namespaces, no constructor parameter properties (declare the field and assign it).
- `types` defaults to `[]`, so `@types/*` packages aren't picked up automatically. A new global types package goes in `types` in `tsconfig.json`.
- `lib` is `ES2023`, so some built-ins Node 24 has at runtime don't type-check (`Object.groupBy`, `Promise.withResolvers`, Set methods, iterator helpers). The error is TS2550 ("change your target library"), or TS2339 for iterator helpers like `.values().map`. Either raise `lib` on purpose or don't use the API; don't cast or polyfill around it. `lib` covers client code too, so check browser support before raising it, not only Node's.
- Imports are extensionless or use `~/`. Don't add `.ts` or `.js` extensions.

## Places strict mode still gives you `any`

`JSON.parse`, `Response.json()`, and the `reason` in `promise.catch((e) => ...)` are `any`; only `try/catch` variables are `unknown`. On the server, request bodies and third-party responses are trust boundaries: decode with an Effect Schema, or type the value as `unknown` first (`request.json() as Promise<unknown>` in `http.ts`), never cast straight to the expected shape. Client code reading the app's own resource routes may cast to the shared schema type (components can't import Effect).

## Narrowing that doesn't work

- `.filter(Boolean)` does not narrow, despite inferred type predicates: `[1, undefined].filter(Boolean)` is still `(number | undefined)[]`. Write `.filter((x) => x !== undefined)`. Inference also stops if the callback has a `: boolean` annotation or more than one `return`.
- With `noUncheckedIndexedAccess`, `arr[i]`, `record[key]`, and `const [first] = arr` are `T | undefined`, and `arr.length > 0` doesn't narrow `arr[0]`. Use `for...of`, `.entries()`, or check the element itself, not `!`.
- `Array.isArray(x)` on `string | readonly string[]` narrows the true branch to `any[]` and doesn't narrow the false branch. Test the other member instead (`typeof x === "string"`).
- An `interface` isn't assignable to `Record<string, unknown>` (no implicit index signature); a `type` alias is. When a shape has to pass as a record, declare it with `type`. Keep `interface` elsewhere, as the code does.
- `(["a", "b"] as const).includes(s)` rejects `s: string`. Widen the array (`(arr as readonly string[]).includes(s)`) or write a guard; don't cast `s`.

## Promises

Nothing lints floating promises: tsc doesn't, and Biome's `noFloatingPromises` is a nursery rule that isn't enabled. Every promise's rejection must be handled (await it, return it, or end the chain with `.catch`), and `void` marks a deliberate fire-and-forget. Effect code brings promises in as described in `effect-server.md`.
