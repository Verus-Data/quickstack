/**
 * Gate briefs frozen on 2026-10-27. After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:63989033b58fd2ebbffb186565679676083c8ed3e55aeb80f1aeaa319d8fdb51",
  "astro-blog:sandbox": "sha256:45eaa9e82d74413d0a32b61e98058d28768b1755341c108699e2ec6f3b064669",
  "go-cli:default": "sha256:e7ebf50dc885df1dad3de2513516ecf74ca00e3c8cec2dae55062497c5883210",
  "go-cli:sandbox": "sha256:ff0c9781dae830081405ed1fee7c7ac390d9af88be93bc476ba9cc24f75f205f",
  "python-react:default": "sha256:27a6e87fccbb68f7ae6fac8494edfe8144e8b0842599f3a9c6f4d9f71dc6d71d",
  "python-react:sandbox": "sha256:28f17b84c50e8bc97ac003b093256a67c05e231561c8a6f496d6db84da19db1f",
};
