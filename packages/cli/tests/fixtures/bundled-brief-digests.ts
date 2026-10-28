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
  "astro-blog:default": "sha256:476099937ad306db8020087887171743797ac6ec1e662d0c235a3d8f53aeebc8",
  "astro-blog:sandbox": "sha256:0add833af5541df73a9bd7b98e006cd144162b2362afea4ec1d9414f73cefe7e",
  "go-cli:default": "sha256:272cd192439e0b8036f58fc66ab8d133c7d1b940057c357db3a1e64cfe37aa7d",
  "go-cli:sandbox": "sha256:0e18911cf1274502c62a6c04d31852e8f882a1992f4e7080008e862dcafec268",
  "python-react:default": "sha256:b335d68474a7b3ff4e1fc6cd87c5de1805b93374a965fbf2b4c908793d5d477c",
  "python-react:sandbox": "sha256:ff3e55961543c30fc6eddb969625263a1ca53881d3776190ebc77d2db219d1c1",
};
