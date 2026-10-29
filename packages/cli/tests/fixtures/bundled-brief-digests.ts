/**
 * Gate briefs frozen on 2026-10-27, updated for the `stacks` rename and each release's
 * version (the brief names `npx -y @steamfield/stacks@<version>`), the checkout-local notes rule,
 * and the telemetry notice-relay rule with two shortened ground rules. python-react changed on
 * 2026-10-28 for its home-route-test step and stub-free uv init (proven in R3's bench run).
 * The 0.4.1 version in the brief changed all six digests on 2026-10-29, and the registry
 * metadata pass (fragment names and descriptions in the brief) changed them again that day;
 * those briefs await a bench run (plans/HANDOFF.md, "Registry metadata pass").
 * After proving an intentional brief change, regenerate each
 * key from `bun run dev validate --brief <stack> [--sandbox] --json` at the repo root:
 * parse stdout as JSON and sha256 its `brief` string as UTF-8, with no added newline.
 * Both presets use validate's canonical context, not new's machine-dependent brief.
 */
export const briefDigests: Readonly<Record<string, string>> = {
  "astro-blog:default": "sha256:64e48702a9a03c5fdf2002c877ba74fbea5668fc712fb6479fd929f9376ed73d",
  "astro-blog:sandbox": "sha256:4a6e668771e418a4ae7f7afb0dc376169e2934f132c236dee48d685e7e19143f",
  "go-cli:default": "sha256:333df1e1bb1548c6936d88769200d0d1537d0cb1f432e2c7c56fd81965c49502",
  "go-cli:sandbox": "sha256:478367d094936a6012708adccb30e7ed9672bbd739d44740317ecca38f3098fb",
  "python-react:default": "sha256:892fc3c4fa15427ca0a65db585dc3669c2604fa477f66615b1b8e0dfc9c90990",
  "python-react:sandbox": "sha256:0adb5e6138457518c3bfede61c875937940d5c7c112273bffeefd2b6b8572ec9",
};
