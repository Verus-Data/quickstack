# SvelteKit guidance

Read these references before changing the corresponding code. They apply to every agent; Claude rules link here.

SvelteKit and Svelte change config, aliases, component syntax and data APIs between majors. Before using an API or config option from memory, check the installed declarations (`node_modules/@sveltejs/kit/types/index.d.ts`, `node_modules/svelte/types/`), then the matching page on svelte.dev (each docs section has a plain-text `llms.txt` version).

- [routing](routing.md): routes, load functions, form actions, endpoints, the server boundary and errors.
- [testing](testing.md): what Vitest covers, what Playwright covers, and how to run each.
- [typescript](typescript.md): compiler settings and type-safety traps.
- [verification](verification.md): checks before calling work done.
