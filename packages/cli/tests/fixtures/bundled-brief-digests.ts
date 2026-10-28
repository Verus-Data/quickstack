/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`), the checkout-local notes rule,
 * and the telemetry notice-relay rule with two shortened ground rules. python-react changed on
 * 2026-10-28 for its home-route-test step and stub-free uv init (proven in R3's bench run).
 * The 0.4.0 version in the brief changed all six digests on 2026-10-28.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:d88ad5087619b3cfd40e5d40c2337235beb6ecca4acd0b1b7a7dbe9b13960795",
  "astro-blog:sandbox": "sha256:ca0668224f5078bdaa8d2d82ac96c544c8dd3f98f07a8168d1679a4c6d7c7436",
  "go-cli:default": "sha256:78994241a7f8d59e315714598afe5264dcd636118d48a4eef73a202e66eecaed",
  "go-cli:sandbox": "sha256:e91727184709b9612fa30527c4211aa5ec9613c44b2025fef74cd52a1101ebf4",
  "python-react:default": "sha256:a64c12cb15db8ba72147173602467a278f93dceadcb475d162ecb19ad7817d1e",
  "python-react:sandbox": "sha256:269c63666d11f7ff80f5ff72ee6921da600347f81a95ddcd4b398c25925122cb",
};
