/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`), the checkout-local notes rule,
 * and the telemetry notice-relay rule with two shortened ground rules. python-react changed on
 * 2026-10-28 for its home-route-test step and stub-free uv init (proven in R3's bench run).
 * The 0.4.1 version in the brief changed all six digests on 2026-10-29, and the registry
 * metadata pass (fragment names and descriptions in the brief) changed them again that day;
 * those briefs await a bench run (plans/HANDOFF.md, "Registry metadata pass").
 * These digests changed on 2026-10-29 for the stack audit fixes and await a bench run.
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:64e48702a9a03c5fdf2002c877ba74fbea5668fc712fb6479fd929f9376ed73d",
  "astro-blog:sandbox": "sha256:def4d8223b9184494955a6d44dce333d74498726502109971793b8b9b3f8e3d9",
  "go-cli:default": "sha256:9a2a650807a78fb57ec1b0484861608a59d6d509a807facd4c5678109c46e5a4",
  "go-cli:sandbox": "sha256:112353eb56296fd105919463ece63a7a20a43bcd8da67f8c5d52b1a07c57f585",
  "python-react:default": "sha256:4216fe123bbae4cdcc649e18be9327a011035ace4ea0fa5bc84fbb9e69e13e63",
  "python-react:sandbox": "sha256:492d83c7bbfb4a673d8420bd230e04707f197a73ffdf87e89a51181eb9f46a97",
};
