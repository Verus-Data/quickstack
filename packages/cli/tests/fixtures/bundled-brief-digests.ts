/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`), the checkout-local notes rule,
 * and the telemetry notice-relay rule with two shortened ground rules.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:48ae31c89c7453e2ed1f3cfc644036f2035436faf48cb1add5eae34f638a8ba1",
  "astro-blog:sandbox": "sha256:869d0559efa656e0cc1ae078d44c4770b65f853805b619aaeec6482a2b047214",
  "go-cli:default": "sha256:272cd192439e0b8036f58fc66ab8d133c7d1b940057c357db3a1e64cfe37aa7d",
  "go-cli:sandbox": "sha256:0e18911cf1274502c62a6c04d31852e8f882a1992f4e7080008e862dcafec268",
  "python-react:default": "sha256:bd35be98d42118a212b9aa8e3ca8d3e8d8b7cd2e86d8782b107dee30d71db1b2",
  "python-react:sandbox": "sha256:04e1178752f52f1ab62d32b7d3d25575e577321b88be5189257493d87046e3c0",
};
