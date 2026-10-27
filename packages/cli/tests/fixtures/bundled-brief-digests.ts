/**
 * Gate briefs frozen on 2026-10-27, updated for the scoped npm invocation only. After proving
 * an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:975fab1d4fb0a435938e7d5ce7b467cba3687a4a4bb0dc3d2ef15a7ca2e84b88",
  "astro-blog:sandbox": "sha256:ed632f9065f1e4c13af94f7ef0c3b58de7fe71e46e7645c0125ba924e2122632",
  "go-cli:default": "sha256:49f579e88d24f3fea6b037fb81d710b0876883f0ce0431dfd7de0a1e082cc8eb",
  "go-cli:sandbox": "sha256:a5fc6362d05c8aec3663fa2b74cfc1855c358fb2cc6978f996e65670be5944a0",
  "python-react:default": "sha256:b329e9af7fa697793ef2b1d069360fc8a03ef6b84fdd6cb67529a9648d107712",
  "python-react:sandbox": "sha256:a06fca76b8d532706dce8077ef8eb28a71a2516eef20ae95ee7142446f626898",
};
