// PreToolUse (Edit|Write): deny text that ties a tracked file to one machine or one person: an
// absolute path under a home directory (/Users/<name>/, /home/<name>/), a path into ~/Projects,
// or any pattern listed in .claude/hooks/private-patterns.local (gitignored; one JavaScript regex
// per line, # comments). What a tracked file says has to hold on any clone and for any
// maintainer. Files git ignores (logs, .dev/, settings.local.json) and files outside the project
// can't reach history and aren't checked.
//
// Subagents run under the same hooks but see none of the session's memory, which is why this is
// a hook and not only a rule.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { deny, projectRoot, readPayload, text, writtenText } from "./_lib";

type Pattern = { re: RegExp; what: string };

const BUILT_IN: Pattern[] = [
  {
    re: /(^|[^\w])\/(Users|home)\/[A-Za-z0-9._-]+\//,
    what: "an absolute path under a home directory",
  },
  { re: /(~|\$HOME|\$\{HOME\})\/Projects\//, what: "a path into ~/Projects" },
];

function localPatterns(root: string): Pattern[] {
  const file = join(root, ".claude/hooks/private-patterns.local");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .flatMap((line) => {
      try {
        return [{ re: new RegExp(line), what: `the private pattern ${line}` }];
      } catch {
        return []; // A malformed line guards nothing rather than denying everything.
      }
    });
}

function physical(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}

/** The file's path relative to the project, or undefined when it is outside it. */
function relative(root: string, filePath: string): string | undefined {
  const given = root.replace(/\/+$/, "");
  const dirs = [given, physical(given || "/").replace(/\/+$/, "")];
  const dir = dirs.find((d) => filePath.startsWith(`${d}/`));
  if (dir !== undefined) return filePath.slice(dir.length + 1);
  return filePath.startsWith("/") ? undefined : filePath;
}

function ignored(root: string, filePath: string): boolean {
  const git = spawnSync("git", ["-C", root, "check-ignore", "-q", "--", filePath]);
  return git.status === 0;
}

const payload = readPayload();
const filePath = text(payload?.tool_input?.file_path);
const root = projectRoot();
const rel = filePath ? relative(root, filePath) : undefined;
if (rel !== undefined && !ignored(root, filePath)) {
  const added = writtenText(payload?.tool_input);
  for (const { re, what } of [...BUILT_IN, ...localPatterns(root)]) {
    const line = added.split("\n").find((l) => re.test(l));
    if (line === undefined) continue;
    const found = re.exec(line)?.[0].trim() ?? "";
    deny(
      `BLOCKED: ${rel} would contain ${what} ("${found}"). Tracked files must hold on any clone and for any maintainer: use a repo-relative path, describe the thing instead of where it lives, or leave it out. Ask the user if it has to stay.`,
    );
    break;
  }
}
