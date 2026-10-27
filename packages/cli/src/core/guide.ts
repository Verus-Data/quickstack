import { BRIEF_PATH, MANIFEST_PATH } from "../project-layout";
/**
 * The agent guide: what `quickstacks` with no arguments and `quickstacks guide` print, and the
 * footer on the root's `--help`. One text, reached three ways; it reads neither a project nor a
 * registry, so it works anywhere. `cli` is `Host.invocation`.
 */
export const guideText = (cli: string) =>
  [
    `quickstacks starts projects for coding agents. It writes a stack's starter files and a brief, ${BRIEF_PATH}, and verify is the definition of done: the project's own checks, run from its manifest.`,
    "",
    "The loop:",
    `1. ${cli} list --json: pick a stack and tell the user why.`,
    `2. ${cli} new <stack> <dir> --sandbox --json: writes the project.`,
    `3. Read <dir>/${BRIEF_PATH} and carry it out.`,
    `4. ${cli} verify in <dir>: fix what fails and run it again until it passes.`,
    "",
    `Existing repo: ${cli} add <fragment...> --json, then follow the add brief, merge incoming files and verify the whole project.`,
    "",
    "Rules:",
    "- Never pick an entry list --json marks untrusted unless the user named it.",
    `- Never edit ${MANIFEST_PATH}.`,
    "- Weakening, skipping or deleting a verify step counts as failure.",
    "- If verify reports VerifyChanged, stop and ask the user: only they can accept the change.",
    "- Ask the user only what the brief says to ask.",
    "",
    `On failure, do what the error's Next line (the envelope's next field with --json) says. ${cli} schema <name> prints the JSON Schema of any --json result.`,
    "",
    "The user's own stacks and fragments go in $XDG_CONFIG_HOME/quickstacks/stacks/<id>/ and fragments/<id>/ (default ~/.config/quickstacks/).",
  ].join("\n");

/** Before the guide for a person at a terminal (the human audience), who isn't its reader. */
export const humanLead = (cli: string) =>
  `This guide is written for coding agents. To start a project yourself, run ${cli} list, then ${cli} new <stack> <dir>; ${cli} --help lists every command.`;

/** The commands the guide's loop uses, for `--json` callers. */
export const guideCommands = (cli: string) => [
  { name: "list", run: `${cli} list --json`, purpose: "See the stacks and fragments you can use." },
  {
    name: "new",
    run: `${cli} new <stack> <dir> --sandbox --json`,
    purpose: "Write the project and its brief.",
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
    `then ${cli} new <stack> <dir> --json, then follow ${BRIEF_PATH}`,
    `until ${cli} verify is green. Run ${cli} with no arguments for the full guide.`,
  ].join("\n");
