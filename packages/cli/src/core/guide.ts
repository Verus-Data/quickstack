import { BRIEF_PATH, MANIFEST_PATH } from "../project-layout";
/**
 * The agent guide: what `stacks` with no arguments and `stacks guide` print, and the
 * footer on the root's `--help`. One text, reached three ways; it reads neither a project nor a
 * registry, so it works anywhere. `cli` is `Host.invocation`.
 */
export const guideText = (cli: string) =>
  [
    `stacks starts projects for coding agents. It writes starter files and ${BRIEF_PATH}; verify runs the manifest's checks.`,
    "",
    "The loop:",
    `When the user describes what they want to build, run ${cli} search "<their words>" --json, compare the strong matches using why and evidence, and tell the user your pick and one tradeoff before ${cli} new. If noStrongMatch is true, say nothing fits well.`,
    `1. ${cli} list --json lists entries; ${cli} show <id> --json reviews one.`,
    `2. ${cli} new <stack> <dir> --sandbox --json writes the project. Drop --sandbox to make decisions or deploy.`,
    `3. Read <dir>/${BRIEF_PATH} and carry it out.`,
    `4. ${cli} verify in <dir>: fix failures until green.`,
    "",
    `Existing repo: ${cli} add <fragment...> --json; follow the brief, merge incoming files and verify.`,
    "",
    "Rules:",
    "- Never pick an entry list --json marks untrusted unless the user named it.",
    `- Never edit ${MANIFEST_PATH}.`,
    "- Weakening, skipping or deleting a verify step counts as failure.",
    "- If verify reports VerifyChanged, stop and ask the user: only they can accept the change.",
    "- Ask the user only what the brief says to ask.",
    `- Relay a telemetry notice once, including ${cli} telemetry disable. Never enable collection for the user.`,
    "",
    `${cli} <command> --help shows each command's flags, exit codes and examples.`,
    `On failure, follow Next (next in --json). ${cli} schema <name> prints each result's JSON Schema.`,
    "",
    "The user's own stacks and fragments go in $XDG_CONFIG_HOME/stacks/stacks/<id>/ and fragments/<id>/ (default ~/.config/stacks/).",
  ].join("\n");

/** Before the guide for a person at a terminal (the human audience), who isn't its reader. */
export const humanLead = (cli: string) =>
  `This guide is written for coding agents. To start a project yourself, run ${cli} list, then ${cli} new <stack> <dir>; ${cli} --help lists every command.`;

/** The commands the guide's loop uses, for `--json` callers. */
export const guideCommands = (cli: string) => [
  { name: "list", run: `${cli} list --json`, purpose: "See the stacks and fragments you can use." },
  { name: "show", run: `${cli} show <id> --json`, purpose: "Review an entry before you pick it." },
  {
    name: "new",
    run: `${cli} new <stack> <dir> --sandbox --json`,
    purpose: "Write the project and its brief.",
  },
  {
    name: "add",
    run: `${cli} add <fragment...> --json`,
    purpose: "Apply fragments to an existing repository.",
  },
  {
    name: "verify",
    run: `${cli} verify`,
    purpose: "Run the project's checks; done when it passes.",
  },
  {
    name: "validate",
    run: `${cli} validate <path>`,
    purpose: "Check a stack or fragment before using it.",
  },
  { name: "guide", run: `${cli} guide`, purpose: "Print this guide." },
];

/** The last lines of the root's `--help`, so an agent that reaches for `--help` finds the loop. */
export const helpFooter = (cli: string) =>
  [
    `Start here (agents): ${cli} list --json, pick a stack and tell the user why,`,
    `then ${cli} new <stack> <dir> --sandbox --json, then follow ${BRIEF_PATH}`,
    `until ${cli} verify is green. Run ${cli} with no arguments for the full guide.`,
  ].join("\n");
