# App Router

Before using a Next API, open its page under `node_modules/next/dist/docs/01-app/03-api-reference/`. The guides beside it (`02-guides/`) cover forms, Server Actions, caching, revalidation and self-hosting for the installed release.

## Where code goes

- `src/app/` holds routes only: `page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx`, `route.ts` and the Server Actions those pages use. Keep them thin: read from a service, render, or validate and call a service.
- `src/lib/server/` holds everything that touches state, the environment or the outside world. Every module there imports `"server-only"` on its first line, so importing it from a client component fails the build.
- `src/lib/` (outside `server/`) holds code both sides may import: zod schemas, pure formatting, types. Nothing there imports from `server/`.
- `src/components/` holds client components. A file starts with `"use client"` only when it needs state, effects, event handlers or browser APIs.

## Server and client components

- Components are server components unless marked. Fetch data in the server component that needs it and pass plain serializable props down; no class instances, functions or Dates across the boundary unless the installed docs say the type serializes.
- Put `"use client"` as low in the tree as possible. A client component can render server components passed in as `children`, but can't import them.
- Read environment variables only in `src/lib/server/`, parsed once with zod. A variable reaches the browser only with the public prefix the installed docs name, so never put a secret under it.

## Server Actions

- An action is a public POST endpoint anyone can call with any payload. Parse its `FormData` with the shared zod schema on the server every time, even when the form validates in the browser.
- Expected failures (validation, a missing record) return a state object with field errors and the submitted values. Don't throw for them: thrown errors reach `error.tsx` with the message hidden in production.
- After a successful write, invalidate exactly the cached data or path the write changed, using the read-your-own-writes API the installed caching docs recommend. If the list doesn't update, read `08-caching.md` and `09-revalidating.md` in the getting-started docs before marking the page dynamic.
- The form component keeps the action's returned state with React's action-state hook and shows a pending state. It must work for the first submit after a full page load.

## Route handlers

- `route.ts` exports one function per HTTP method. Return `Response.json(...)` with an explicit status. Decode request bodies as `unknown` and parse them with zod before use.
- A handler that reports live state (health, counts) must render per request. Check the installed route handler docs for whether GET handlers are prerendered and how to opt out.
- `/api/health` reads the items service and touches nothing outside the process.

## Errors

- `error.tsx` is a client component that receives the error and a reset function. Show a fixed safe message and a retry button; log the digest, never the raw error, to the console.
- Use the framework's not-found helper for missing records so `not-found.tsx` renders with a 404.
