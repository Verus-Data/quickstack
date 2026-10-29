// PreToolUse (Edit|Write): deny client components that import server-only code.
//
// A module marked "use client" ships to the browser. Importing src/lib/server/ (or the
// server-only package) from it fails the production build at best and leaks a secret at worst.
// Server components, route handlers and Server Actions may import server code; only client
// modules are checked. A file counts as a client module when the text being written or the file
// already on disk starts with the "use client" directive.
import { readFileSync } from "node:fs";
import { anyLine, deny, isFile, readPayload, text, writtenText } from "./_lib";

const SOURCE = /\.(ts|tsx|js|jsx|mts|mjs)$/;

// The directive as the first statement: optional comments and blank lines, then the string.
const USE_CLIENT = /^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;

// import/export ... from "<spec>" or import("<spec>") where spec is src/lib/server (by alias or
// relative path) or the server-only package.
const SERVER_IMPORT =
  /(from|import)[ \t\n\v\f\r]*\(?[ \t\n\v\f\r]*["']([^"']*\/lib\/server(\/[^"']*)?|server-only)["']/;

function onDisk(filePath: string): string {
  try {
    return isFile(filePath) ? readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

const payload = readPayload();
const filePath = text(payload?.tool_input?.file_path);
if (filePath && SOURCE.test(filePath) && !filePath.includes("/lib/server/")) {
  const written = writtenText(payload?.tool_input);
  const client = USE_CLIENT.test(written) || USE_CLIENT.test(onDisk(filePath));
  if (client && written && anyLine(SERVER_IMPORT, written)) {
    deny(
      `BLOCKED: ${filePath} is a client component ("use client") and imports server-only code (src/lib/server/ or server-only). Load the data in a server component or Server Action and pass plain props down; put shared schemas and types in src/lib/.`,
    );
  }
}
