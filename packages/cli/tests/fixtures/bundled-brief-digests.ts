/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`), and the checkout-local notes rule.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:ef4bc3283dded5f309fde9b1f51e0c51288e95cb830e9aa60fe4259aef328f5c",
  "astro-blog:sandbox": "sha256:55399feab146ae387cebe1b371f84d741b865e86b10335b1491c75953d65511f",
  "go-cli:default": "sha256:382a4e110e8a3a9b1f35bfb3d154eb639af9698e0f61b081d5479d94e7d765fb",
  "go-cli:sandbox": "sha256:017277d5cfca846d324aebda75d309f05f0e705ca4626fd442e3026dacc9f8a8",
  "python-react:default": "sha256:11b0bb6ebbdd96c99071ca989b73177e228b9b0354477f005112056c4becf3df",
  "python-react:sandbox": "sha256:82362481ffa7c9bc5f4d0fe7a0d8ebd46184bac364215a79fdab4a1200927ae1",
};
