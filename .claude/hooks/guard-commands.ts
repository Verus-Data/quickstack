import { basename } from "node:path";
import { deny, readPayload, text } from "./_lib";
import { commands } from "./_shell";

const command = text(readPayload()?.tool_input?.command);
for (const { argv } of commands(command ?? "")) {
  const [executable = "", sub] = argv;
  const name = basename(executable);
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
