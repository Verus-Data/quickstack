/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`), and the checkout-local notes rule.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:5db4f9dbc089644e4e9b4824ec8162182b622b386c41b0ba04c58c71b3c8b2d6",
  "astro-blog:sandbox": "sha256:9a0839a4159824ca42c075a4d5a1f8ec30185c5d5ca97791596fb21e8a040d2d",
  "go-cli:default": "sha256:382a4e110e8a3a9b1f35bfb3d154eb639af9698e0f61b081d5479d94e7d765fb",
  "go-cli:sandbox": "sha256:017277d5cfca846d324aebda75d309f05f0e705ca4626fd442e3026dacc9f8a8",
  "python-react:default": "sha256:65329223512afd2b88d9de69aa76e4c67a167eb3798a03b1b402369a85ce65dd",
  "python-react:sandbox": "sha256:dac51a04951a42eca482e661c067141319672e2e12d82d68d2dec91cce2d7823",
};
