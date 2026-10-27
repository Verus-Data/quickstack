/** Only the option column under FLAGS declares flags; descriptions can mention other commands. */
export function declaredFlags(help: string): Set<string> {
  const flags = new Set<string>();
  let options = false;
  for (const line of help.split("\n")) {
    if (/^[A-Z][A-Z ]*$/.test(line)) options = line === "FLAGS" || line === "GLOBAL FLAGS";
    if (!options) continue;
    const declaration = /^ {2}(--[a-z][a-z-]*)(?=[ ,\t]|$)/.exec(line);
    if (declaration?.[1]) flags.add(declaration[1]);
  }
  return flags;
}

/** The indented lines under one upper-case section heading of a help text. */
export function helpSection(help: string, heading: string): string[] {
  const lines: string[] = [];
  let inside = false;
  for (const line of help.split("\n")) {
    if (/^[A-Z][A-Z ]*$/.test(line)) inside = line === heading;
    else if (inside && /^ {2}\S/.test(line)) lines.push(line);
  }
  return lines;
}
