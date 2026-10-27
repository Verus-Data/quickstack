/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`) only.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:2309082b9b8a775eceb42f1e9ce8b4c0090b41f3b62e047b63a3b30690b629e4",
  "astro-blog:sandbox": "sha256:bba3f1f429c0bf67af1c2a078858449b3366913e722f80eb507b38a9acde320d",
  "go-cli:default": "sha256:7d83fde782a470bbb888ef9ce8d4abf9a485e5f9dc0dffa55e7fa16b4c171b18",
  "go-cli:sandbox": "sha256:0b931317ca746a4c7186a5153ea296fdcb88046f3f2066f2226ecd02df085835",
  "python-react:default": "sha256:bbe36c442941835d093d94f49c2d28f764a3260ffd02c2ada3f77630afc871c9",
  "python-react:sandbox": "sha256:7041ef0995776a6222c633f1f421f13439c1e4d4cad902b01dfbdcfdc8700bf0",
};
