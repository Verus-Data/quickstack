/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` command name only. After proving
 * an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:85c8dcd4bf5978f768fea8de5f1d21a4acf43b93ddf614656b5156ce6ea6debe",
  "astro-blog:sandbox": "sha256:c5aac45a1b8fa60a2eeb8ec29d3731de12557b09a8ae0a6bc878ee5a1e16a680",
  "go-cli:default": "sha256:8f9f6a57902e2eaba7a3506ce6702ca5f36d9ff41b009f2187bfa278f9dfc87f",
  "go-cli:sandbox": "sha256:d46355ee12da9b5de1aa2e19129a8d58f5d3bb2220dae283bcc4091b9fce6d5f",
  "python-react:default": "sha256:8c07d858a2841864f313ce9cf81302b3c4c032cf1e7465787bd42efd20a0aed3",
  "python-react:sandbox": "sha256:c47c3b5097eaced5b2d5bc34694db42a3350da6bec74b84b7df492f8bf2bed47",
};
