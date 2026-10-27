/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename only.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:2c5383c8f4fa005262d69c39652bdd4683b6986f6f7858cb46579acc054e48a8",
  "astro-blog:sandbox": "sha256:54151a3f8e4e2746a56f296f0d43ebae0241b86efa8571d090a8d7649c9e26bf",
  "go-cli:default": "sha256:655b0d3daad7bc89065c0bd9c4833a0953eb4d35a766a063f83f0cf945624dc0",
  "go-cli:sandbox": "sha256:753bdde1dcdd4f4d96ee268d6c935c200c93414376e8dc294ddd9926e6e6f46e",
  "python-react:default": "sha256:cecef580dcfc5cd4b6b092ba68895d49bd97942df1785426ca45a824abe02e58",
  "python-react:sandbox": "sha256:216793c7df95fae4af6ca324170180bd2618d31a563d814bc7ddc62dc843a746",
};
