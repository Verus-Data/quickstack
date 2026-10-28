import { Schema } from "effect";
import { expect, test } from "vitest";
import { cli } from "../src/cli";
import { countWords } from "../src/core/brief/words";
import { guideCommands } from "../src/core/guide";
import { GuideResult } from "../src/schemas/guide";
import { runCli } from "./helpers/cli";

const decode = (stdout: string) => Schema.decodeUnknownSync(GuideResult)(JSON.parse(stdout));
const FOOTER =
  'Start here (agents): stacks search "<their words>" --json, then stacks show <id> --json.\nExplain your pick and one tradeoff, then stacks new <stack> <dir> --sandbox --json.\nFollow .stacks/BRIEF.md; run stacks verify, then stacks verify --all before calling it done.\nBrowse or recover with stacks list --json. Run stacks guide for the full guide.';

test("stacks with no arguments prints the agent guide, under 250 words, with the trust and VerifyChanged rules [1.4#11]", async () => {
  const { status, stdout, stderr } = await runCli([]);
  expect(stderr).toBe("");
  expect(status).toBe(0);
  expect(stdout.startsWith("stacks starts projects for coding agents.")).toBe(true);
  expect(countWords(stdout)).toBeLessThan(250);
  expect(stdout).toContain(
    "- Never pick an entry list --json marks untrusted unless the user named it.\n",
  );
  expect(stdout).toContain(
    "- If verify reports VerifyChanged, stop and ask the user: only they can accept the change.\n",
  );
  expect(stdout).toContain("stacks new <stack> <dir> --sandbox --json");
  expect(stdout).toContain("prefer the higher `stats.greenRateLower` and say why");
  expect(stdout).toContain(
    "If noStrongMatch, say nothing fits well; run stacks list --json and offer the closest entries.",
  );
  expect(stdout).toContain(
    "`stats` are aggregate outcomes across all projects using that stack over the window shown, not a promise for this project.",
  );
  expect(stdout).toContain("if neither has stats, prefer the more recent `lastRun`.");
  expect(stdout).not.toContain("SUBCOMMANDS");
});

test("--help still shows the framework help [1.4#11]", async () => {
  const { status, stdout, stderr } = await runCli(["--help"]);
  expect(stderr).toBe("");
  expect(status).toBe(0);
  expect(stdout).toContain("SUBCOMMANDS");
  expect(stdout).toContain("GLOBAL FLAGS");
});

test("stacks --json with no subcommand returns the guide and its commands [1.4#11]", async () => {
  const { status, stdout, stderr } = await runCli(["--json"]);
  expect(stderr).toBe("");
  expect(status).toBe(0);
  const result = decode(stdout);
  expect(result.guide.startsWith("stacks starts projects")).toBe(true);
  expect(result.commands.map((command) => command.name)).toEqual([
    "search",
    "show",
    "new",
    "verify",
    "list",
    "add",
    "validate",
    "guide",
  ]);
});

test("guide prints exactly the bare root's text, in both modes, and is listed in --help [1.4#12]", async () => {
  const bare = await runCli([]);
  const guide = await runCli(["guide"]);
  expect(guide.status).toBe(0);
  expect(guide.stderr).toBe("");
  expect(guide.stdout).toBe(bare.stdout);
  const bareJson = await runCli(["--json"]);
  const guideJson = await runCli(["guide", "--json"]);
  expect(guideJson.status).toBe(0);
  expect(decode(guideJson.stdout)).toEqual(decode(bareJson.stdout));
  expect((await runCli(["--help"])).stdout).toMatch(/\n {2}guide {2,}Print the guide/);
});

test("every command the guide lists is a real subcommand [1.4#12]", () => {
  const names = cli.subcommands.flatMap((group) => group.commands).map((command) => command.name);
  for (const { name } of guideCommands("stacks")) expect(names).toContain(name);
});

test("the root --help ends with the Start here footer; a subcommand's help doesn't [1.4#13]", async () => {
  const root = await runCli(["--help"], { host: { invocation: "npx -y stacks@1.2.3" } });
  expect(root.status).toBe(0);
  expect(root.stdout).toContain(
    '\n\nStart here (agents): npx -y stacks@1.2.3 search "<their words>" --json,',
  );
  expect(root.stdout.trimEnd()).toMatch(/Run npx -y stacks@1\.2\.3 guide for the full guide\.$/);
  const plain = await runCli(["--help"]);
  expect(plain.stdout.trimEnd().endsWith(FOOTER)).toBe(true);
  const json = await runCli(["--help", "--json"]);
  expect((JSON.parse(json.stdout) as { help: string }).help.endsWith(FOOTER)).toBe(true);
  const sub = await runCli(["new", "--help"]);
  expect(sub.status).toBe(0);
  expect(sub.stdout).toContain("--no-launch");
  expect(sub.stdout).not.toContain("Start here");
});

test.each(["stacks", "npx -y stacks@1.2.3"])(
  "%s guide, help footer and structured commands teach the same discovery and verification loop",
  async (invocation) => {
    const opts = { host: { invocation } };
    const guide = decode((await runCli(["guide", "--json"], opts)).stdout);
    const help = (await runCli(["--help"], opts)).stdout;
    const footer = help.slice(help.indexOf("Start here (agents):"));
    const commands = guide.commands.map(({ run, purpose }) => `${run} ${purpose}`).join("\n");
    const escaped = invocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const text of [guide.guide, footer, commands]) {
      const loop = [
        ...text.matchAll(new RegExp(`${escaped} (search|show|new|verify)(?= |[.,;]|$)`, "g")),
      ].map((match) => match[1]);
      expect(loop).toEqual(["search", "show", "new", "verify", "verify"]);
      expect(text).toContain(`${invocation} search "<their words>" --json`);
      expect(text).toContain(`${invocation} verify --all`);
      expect(text).toContain(`${invocation} list --json`);
    }
    expect(footer).toContain("Explain your pick and one tradeoff");
  },
);
