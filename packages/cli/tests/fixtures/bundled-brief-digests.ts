/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`) only.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:0bfce9d1c4bd7de88fb444019082c9a1b1921c3aeebae6b8417ffc0ab500cad2",
  "astro-blog:sandbox": "sha256:6ada5036252b2298ccd3444468a117cea23effa47dc533ec3ab9e0cb07b34907",
  "go-cli:default": "sha256:662012713c98483d3a1a12a9a0977c48c87d8f182196cc8cd43f47c9a2ff89fc",
  "go-cli:sandbox": "sha256:d4a7fc78546b57fceb8247f3211e1c7b12b2a3afdb2336d42a34d59482f90e8b",
  "python-react:default": "sha256:4d5124c379ad43c162d28c6bf237f4d2ac96de5852656b72b7cce1bdc816b58a",
  "python-react:sandbox": "sha256:1eb4a02c376cc6baac8c366109aa178e67e82231399b3300d541cbc2582111cd",
};
