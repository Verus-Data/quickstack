// PreToolUse (Edit|Write): deny client-side modules that import server-only code.
//
// Anything under app/.server/ (or named *.server.ts[x]) must never reach the browser bundle.
// Route modules and root.tsx may import it (React Router strips loader/action-only imports from
// the client build), but components, hooks, client libs, and shared schemas may not: the build
// fails, or worse, a secret ends up in the bundle. Schemas stay importable from both sides, so
// they can't depend on server code either.
import { anyLine, deny, readPayload, text, writtenText } from "./_lib";

// Client-side directories and the extensions checked in each, at any depth below the directory
// (app/components/chat/composer.tsx).
const CLIENT_DIRS: [string, string[]][] = [
  ["/app/components/", [".ts", ".tsx"]],
  ["/app/hooks/", [".ts", ".tsx"]],
  ["/app/lib/", [".ts", ".tsx"]],
  ["/app/schemas/", [".ts"]],
];

function isClientModule(filePath: string): boolean {
  const client = CLIENT_DIRS.some(([dir, exts]) => {
    const at = filePath.indexOf(dir);
    return (
      at !== -1 &&
      exts.some((ext) => filePath.endsWith(ext) && at + dir.length <= filePath.length - ext.length)
    );
  });
  // Server-only files may live under those dirs by name; they're allowed.
  const serverOnly =
    filePath.endsWith(".server.ts") ||
    filePath.endsWith(".server.tsx") ||
    filePath.includes("/.server/");
  return client && !serverOnly;
}

// import/export ... from "<spec>" or import("<spec>") where spec points into .server/ or at a
// *.server module.
const SERVER_IMPORT =
  /(from|import)[ \t\n\v\f\r]*\(?[ \t\n\v\f\r]*["'][^"']*(\/\.server(\/|["'])|\.server["'])/;

const payload = readPayload();
const filePath = text(payload?.tool_input?.file_path);
if (filePath && isClientModule(filePath)) {
  const written = writtenText(payload?.tool_input);
  if (written && anyLine(SERVER_IMPORT, written)) {
    deny(
      `BLOCKED: ${filePath} is client-side code and imports server-only code (app/.server/ or a *.server module). Move the logic behind a loader, action, or resource route and pass the data down, or put shared types in app/schemas/.`,
    );
  }
}
