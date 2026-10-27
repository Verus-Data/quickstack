---
paths:
  - "app/**"
  - "scripts/**"
  - "tests/**"
  - "e2e/**"
---

# Before calling work done

Run `bun run check` (lint, typecheck, test, e2e) and read the output. `bun run e2e` builds first, the only check that catches server code leaking into the client bundle, and is the only one that runs the real client in a browser.

- A clean exit code isn't a pass. A `-t` filter that matches nothing exits 0 with every test skipped; read the counts.
- UI changes: for anything the e2e smoke doesn't cover, exercise the path in a browser if you have one, including the error and not-configured states.
- To run the app yourself, `bun run dev:bg`: it reuses the dev server already running from this checkout or starts one, and returns once it's healthy, printing its URL (use the port it prints). Then hit the routes, the error responses as well as the successes. For any failure, read `logs/server.jsonl` (structured, one `request` line per call with its `requestId`) and `logs/dev.log` (the whole terminal, including Vite and render errors) before guessing; AGENTS.md, Debugging, has `jq` queries. When done, `bun run dev:stop` if you started the server; leave the user's running. Never `pkill` it.
- Never substitute `bun test` for Vitest or force Node tooling onto Bun.
- A green commit isn't a complete one: after a hook-running commit, check `git status` for files a hook rewrote and left unstaged.
- Don't report a cause you didn't observe. Quote the error output you're basing it on.
