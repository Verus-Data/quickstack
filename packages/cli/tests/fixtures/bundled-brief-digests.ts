/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` command and `.stacks/` names only.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:7bded8193ecce91756ea5bd234f0d9b8cc546ec0146f650ee17efdeb16a64bc4",
  "astro-blog:sandbox": "sha256:239d1262e937d6fd2e84383d593aca21dbd8a82fe45da0cd24f07020b3da7bd2",
  "go-cli:default": "sha256:8a9eb34549ce33451c752f50f8607e9d09e08f664a651b5ce2982e1c3b7a3846",
  "go-cli:sandbox": "sha256:a7ce034c6fae2e37c8a6ef6999ab3fd8eb1967739789948e3cd5b1f659776771",
  "python-react:default": "sha256:ed4a50c6d7327d10d8cb1c9bca96454faf9d9f57356db305ab7ee313c868a244",
  "python-react:sandbox": "sha256:d8ad5e6cc898514e6a2f4213ffa1496e6bc323f9607bd3882fc9f63491a26dc8",
};
