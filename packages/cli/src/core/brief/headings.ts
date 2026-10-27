const ATX = /^ {0,3}(#{1,6})(?=[ \t]|$)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * An entry body nested under a brief section whose heading is `level - 1` deep: a leading level-1
 * heading is dropped when more content follows (the section heading names the entry). Other ATX
 * headings shift so the shallowest lands at `level`, keeping relative depth and clamping at
 * `######`. Lines inside fenced code blocks are never touched; setext headings are left alone.
 */
export function nest(body: string, level = 3): string {
  const lines = body.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  if (
    lines.filter((line) => line.trim() !== "").length > 1 &&
    first !== -1 &&
    /^ {0,3}#(?:[ \t]|$)/.test(lines[first] ?? "")
  ) {
    lines.splice(first, 1);
    // The blank lines after the dropped heading go with it.
    while (lines[first]?.trim() === "") lines.splice(first, 1);
  }
  let fence: string | undefined;
  const depths = lines.map((line) => {
    const opener = FENCE.exec(line)?.[1];
    if (opener) {
      if (fence === undefined) fence = opener;
      else if (opener[0] === fence[0] && opener.length >= fence.length) fence = undefined;
      return 0;
    }
    if (fence !== undefined) return 0;
    return ATX.exec(line)?.[1]?.length ?? 0;
  });
  const present = depths.filter((depth) => depth > 0);
  if (!present.length) return lines.join("\n");
  const shift = level - Math.min(...present);
  return lines
    .map((line, i) => {
      const depth = depths[i] ?? 0;
      if (!depth) return line;
      const indent = line.length - line.trimStart().length;
      const next = Math.min(6, Math.max(1, depth + shift));
      return `${"#".repeat(next)}${line.slice(indent + depth)}`;
    })
    .join("\n");
}
