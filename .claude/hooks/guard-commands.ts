import { basename } from "node:path";
import { deny, readPayload, text } from "./_lib";
import { commands } from "./_shell";

// In-place edits from the shell skip every Edit/Write hook (lint, typecheck, boundary and secret
// guards, format-on-stop), so the Edit and Write tools are the only way to change a file.
const IN_PLACE =
  "BLOCKED: Shell in-place edits bypass the Edit/Write hooks (lint, typecheck, boundaries, secrets, formatting). Use the Edit or Write tool.";
const inPlaceFlag = (arg: string) =>
  /^-[a-zA-Z]*i/.test(arg) || arg === "--in-place" || arg.startsWith("--in-place=");

const command = text(readPayload()?.tool_input?.command);
for (const { argv, stdin } of commands(command ?? "")) {
  const [executable = "", sub] = argv;
  const name = basename(executable);
  if ((name === "sed" || name === "perl") && argv.slice(1).some(inPlaceFlag)) {
    deny(IN_PLACE);
    break;
  }
  if (/^python[0-9.]*$/.test(name) && /write_text\(|open\([^)]*["'][wa]/.test(stdin.join("\n"))) {
    deny(IN_PLACE);
    break;
  }
  if (
    ["npm", "pnpm", "yarn"].includes(name) &&
    ((name === "yarn" && sub === undefined) ||
      ["install", "i", "add", "ci", "remove", "uninstall", "rm", "update", "up"].includes(
        sub ?? "",
      ))
  ) {
    deny("BLOCKED: bun owns this project's lockfile. Use bun install, bun add, or bun remove.");
    break;
  }
}
