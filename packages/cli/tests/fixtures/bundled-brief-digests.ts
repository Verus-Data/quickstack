/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`), and the checkout-local notes rule.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:d704934df231887c07232cc2be49a5ef5021418bf300665aac355319edbbc230",
  "astro-blog:sandbox": "sha256:470d75c57df48ecd209b65f5eb08398667f2379f638f571ab74ef2d96b469b01",
  "go-cli:default": "sha256:84442e64ef2c06eacee4061bdb5f1f8823068ed7449e7943fbedde6d2756d24e",
  "go-cli:sandbox": "sha256:826210d67219f99c070e3c49e8976637271b80db1b672026960eebcc28faff9d",
  "python-react:default": "sha256:1967b70865937ac5b1f2f4946c8fad6b4b68fd6320c26ae29c2c08f941b88425",
  "python-react:sandbox": "sha256:db723a5ee9ea874c3e402b0edb1bae77919dedc9a60a81a278f778a16bd2e6cd",
};
