/**
 * Gate briefs frozen on 2026-10-27. After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:28b9304f5270a7b13d4ff4c6d780b150b13a80f4e3907a4dc6949212960c2661",
  "astro-blog:sandbox": "sha256:ed7a05c383e26cddedd350bd166783bbca2dea182355d314da1da478ed34916b",
  "go-cli:default": "sha256:09d12fd1a81a63036f398f90b15a366c62314d07506e0a751d8cfa885e50b2a1",
  "go-cli:sandbox": "sha256:0b5eb448a51e2a1c980da476191c5d5825addb839714d401244c877e84040043",
  "python-react:default": "sha256:e16b68770fb2ab1411355b0cd60dcedab7c71045ab6f7fd833d6cee494efc390",
  "python-react:sandbox": "sha256:13d4d0521aa6bfee343d558370de4c661e2ede3a04b38ea5c64a504c2f90732c",
};
