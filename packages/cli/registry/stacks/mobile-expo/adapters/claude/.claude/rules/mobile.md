---
paths:
  - "apps/mobile/src/**"
---

# Mobile app

Read `docs/mobile.md` before writing a screen or debugging one. The rules that break things when ignored:

- Data comes only from hooks in `src/lib/queries/`; nothing else imports `src/lib/api.ts`. Query keys come from `keys.ts`.
- NativeWind utilities with theme tokens. An inline `style` needs one of the four reasons in `docs/mobile.md`, stated in a comment.
- Third-party components get `className` only through `src/components/styled.ts`.
- A blank screen: read `.logs/dev.log`, then `bun run sim:shot`, before changing code.
