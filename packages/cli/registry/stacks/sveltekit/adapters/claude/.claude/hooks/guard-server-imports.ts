// PreToolUse (Edit|Write): deny browser code that imports server-only modules.
//
// Components (.svelte), universal load files (+page.ts, +layout.ts) and the client hooks file run
// in the browser. Importing src/lib/server/, a *.server module or the private environment module
// from them fails the build and the dev page load at best, and leaks a secret at worst. SvelteKit
// enforces this itself when it builds; this hook stops it at write time, before an agent builds
// more code on top. Server load files, actions, +server.ts endpoints and server hooks may import
// server code, so they aren't checked.
import { anyLine, deny, readPayload, text, writtenText } from "./_lib";

// Files that ship to the browser.
const BROWSER_FILE = /(\.svelte|\/\+(page|layout)\.(ts|js)|\/hooks\.client\.(ts|js))$/;

// import/export ... from "<spec>" or import("<spec>") where spec is a lib/server module (by any
// alias or a relative path), a *.server module, or a private environment module (older releases
// split it into static and dynamic modules; newer ones have one).
const SERVER_IMPORT =
  /(from|import)[ \t\n\v\f\r]*\(?[ \t\n\v\f\r]*["'](([^"']*[/$#])?lib\/server(\/[^"']*)?|[^"']*\.server(\.(ts|js))?|\$env\/(static|dynamic)\/private|\$app\/env\/private)["']/;

const payload = readPayload();
const filePath = text(payload?.tool_input?.file_path);
if (filePath && BROWSER_FILE.test(filePath) && !filePath.includes("/lib/server/")) {
  const written = writtenText(payload?.tool_input);
  if (written && anyLine(SERVER_IMPORT, written)) {
    deny(
      `BLOCKED: ${filePath} runs in the browser and imports server-only code (src/lib/server/, a *.server module or private environment variables). Load the data in +page.server.ts or +layout.server.ts and pass it down as props; put shared schemas and types in src/lib/.`,
    );
  }
}
