import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { deny, projectRoot, readPayload, text } from "./_lib";
import { type Command, commands } from "./_shell";

/** Resolve symlinks before applying each following component, including `..`. */
function physical(path: string): string {
  let current = "/";
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    current = resolve(current, part);
    try {
      current = realpathSync(current);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      // Missing output is safe to inspect; its existing ancestors have already been resolved.
    }
  }
  return current;
}

function reasonFor(cmd: Command, cwd: string): string | undefined {
  if (cmd.opaque) return "The command is too complex to inspect safely.";
  const [executable = "", ...args] = cmd.argv;
  const name = basename(executable);
  const sub = args[0];
  if (
    ["npm", "pnpm", "yarn"].includes(name) &&
    ((name === "yarn" && sub === undefined) ||
      ["install", "i", "add", "ci", "remove", "uninstall", "rm", "update", "up"].includes(
        sub ?? "",
      ))
  ) {
    return "bun owns this project's lockfile. Use bun install, bun add, or bun remove.";
  }
  if (
    /^mkfs(?:\.|$)/.test(name) ||
    (name === "dd" &&
      args.some((arg) => /^of=\/dev\/(sd|nvme|hd|r?disk|mapper|vd|xvd)/.test(arg))) ||
    cmd.redirects.some((target) => /^\/dev\/(sd|nvme|hd|r?disk|mapper|vd|xvd)/.test(target))
  ) {
    return "Writing or formatting a raw disk device destroys data. Ask the user first.";
  }
  if (name === "rm") {
    const end = args.indexOf("--");
    const options = end < 0 ? args : args.slice(0, end);
    const recursive = options.some((arg) => arg === "--recursive" || /^-[^-]*[rR]/.test(arg));
    if (recursive) {
      if (cmd.remote || cmd.viaXargs || cmd.dir === null) {
        return "Recursive deletion has an unknown target. Name paths inside the project.";
      }
      const root = physical(projectRoot());
      const directory = physical(resolve(cwd, cmd.dir ?? "."));
      for (const [index, target] of args.entries()) {
        if (!(end >= 0 && index > end) && target.startsWith("-")) continue;
        if (cmd.expands[index + 1]) {
          return "Recursive deletion has an unknown target. Name paths inside the project.";
        }
        const path = physical(isAbsolute(target) ? target : `${directory}/${target}`);
        const rel = relative(root, path);
        if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
          return "Recursive deletion outside the project or of its root is blocked. Ask the user first.";
        }
      }
    }
  }
  if (name !== "git") return undefined;

  // Keep Git's global options when probing the selected repository (-C, --git-dir, --work-tree).
  let index = 0;
  for (;;) {
    const option = args[index];
    if (!option?.startsWith("-")) break;
    index += ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"].includes(
      option,
    )
      ? 2
      : 1;
  }
  const global = args.slice(0, index);
  const operation = args[index];
  const rest = args.slice(index + 1);
  if (
    (operation === "push" &&
      rest.some(
        (arg) =>
          /^--force(?:$|=|-with-lease|-if-includes)/.test(arg) ||
          /^-[^-]*f/.test(arg) ||
          arg.startsWith("+"),
      )) ||
    ["filter-branch", "filter-repo"].includes(operation ?? "") ||
    (operation === "rebase" &&
      !rest.some((arg) => ["--abort", "--continue", "--skip", "--quit"].includes(arg))) ||
    (operation === "reflog" && ["expire", "delete"].includes(rest[0] ?? ""))
  ) {
    return "Rewriting Git history can destroy shared work. Ask the user first.";
  }
  if (operation === "reset" && rest.some((arg) => arg === "--hard" || arg.startsWith("--hard="))) {
    if (cmd.remote || cmd.dir === null || cmd.env.some((value) => value.startsWith("GIT_"))) {
      return "Cannot inspect this repository before a hard reset. Ask the user first.";
    }
    const status = spawnSync(
      "git",
      [...global, "-c", "core.fsmonitor=false", "status", "--porcelain"],
      {
        cwd: resolve(cwd, cmd.dir ?? "."),
        encoding: "utf8",
        timeout: 2000,
      },
    );
    if (status.status !== 0 || status.stdout.trim()) {
      return "A hard reset could discard uncommitted work. Commit or stash it, or ask the user first.";
    }
  }
  return undefined;
}

try {
  const payload = readPayload();
  const cwd = text(payload?.cwd) || process.cwd();
  for (const cmd of commands(text(payload?.tool_input?.command))) {
    const reason = reasonFor(cmd, cwd);
    if (reason) {
      deny(`BLOCKED: ${reason}\nNever work around this block.`);
      break;
    }
  }
} catch {
  deny("BLOCKED: The command guard could not inspect this call safely. Ask the user first.");
}
