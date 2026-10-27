# Bundled registry

The stacks and fragments that ship with the CLI: `stacks/<id>/STACK.md` and
`fragments/<id>/FRAGMENT.md`, in the entry format the package README describes. It holds no
entries yet.

Check it with `bun run dev validate` from `packages/cli/`. The bundled registry has to pass with
zero errors and zero warnings, and every reference in it must resolve inside it;
`tests/bundled-registry.test.ts` enforces both.
