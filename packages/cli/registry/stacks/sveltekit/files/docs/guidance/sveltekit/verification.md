# Before calling work done

Run `bun run check` (lint, typecheck, test, e2e) and read the output. `stacks verify` runs the same layers plus a separate build and a probe of `/api/health` on the Node server.

- `bun run e2e` builds first. It is the only check that runs form posts, the rerun of load functions and the client bundle in a browser, and the build is what catches server-only modules imported into browser code.
- A clean exit code isn't a pass. A `-t` filter that matches nothing exits 0 with every test skipped; read the counts.
- UI changes: for anything the Playwright specs don't cover, run `bun run dev`, open the page and exercise the path, including the validation error and the error page. Stop the server you started; leave one the user started running, and never `pkill` it.
- The dev server and the Node server print server errors to their own terminal. Read that output before guessing at a cause, and quote it when you report one.
- Never substitute `bun test` for Vitest or force Node tooling onto Bun.
- After a hook-running commit, check `git status` for files a hook rewrote and left unstaged.
