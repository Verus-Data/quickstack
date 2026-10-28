import { Option } from "effect";

/** Human text wraps at the terminal, between 20 and 80 columns; agent text never wraps. */
export function textWidth(human: boolean, columns: Option.Option<number>): number {
  if (!human) return Number.POSITIVE_INFINITY;
  return Option.match(columns, {
    onNone: () => 80,
    onSome: (value) => Math.min(80, Math.max(20, value)),
  });
}

/** Wrap prose at spaces; preserve code, lists, fences and paragraph breaks. */
export function wrap(text: string, width: number, measure: (text: string) => number): string {
  if (!(width > 0) || !Number.isFinite(width)) return text;
  let fence: string | undefined;
  return text
    .split("\n")
    .map((line) => {
      if (fence) {
        if (new RegExp(`^ {0,3}${fence.charAt(0)}{${fence.length},}\\s*$`).test(line))
          fence = undefined;
        return line;
      }
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        fence = marker;
        return line;
      }
      return /^(?:\s|-)/.test(line) ? line : wrapWords(line, width, measure);
    })
    .join("\n");
}

/** Wrap plain prose, including descriptions whose first word resembles Markdown. */
export function wrapWords(text: string, width: number, measure: (text: string) => number): string {
  if (!(width > 0) || !Number.isFinite(width)) return text;
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/ +/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next) > width) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  lines.push(current);
  return lines.join("\n");
}
