/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`), the checkout-local notes rule,
 * and the telemetry notice-relay rule with two shortened ground rules. python-react changed on
 * 2026-10-28 for its home-route-test step and stub-free uv init (proven in R3's bench run).
 * The 0.4.1 version in the brief changed all six digests on 2026-10-29.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:3dd6b92bebd93420c62255ae72d4bb7f6e188a23398d1a57cd61d1d0b5f86e17",
  "astro-blog:sandbox": "sha256:d480f9b524f85bb6519edcccf486336fdbc4e51da6ea80f1b3f4273b97d39824",
  "go-cli:default": "sha256:165634e861eb84f8d2058c321b307ea0a53499bcfeca373ab7c53e75605d606e",
  "go-cli:sandbox": "sha256:a3d7622adf2f2227420207c2cede93da2881f662cfb166b3cb93b1f8428a639b",
  "python-react:default": "sha256:6fa0bf47ad3329b7da76815bd8ab9df4ed0eb9c52c82d30d8c93fd3398f4e9df",
  "python-react:sandbox": "sha256:5d5d330e4306d7673ec4e423dcc2520d144b44f297180a205973ed57948d3d5e",
};
