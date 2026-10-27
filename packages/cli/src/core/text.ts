/** C0 and C1 control characters and DEL: what a terminal acts on instead of printing. */
const isControl = (code: number) => code < 0x20 || (code >= 0x7f && code <= 0x9f);

/**
 * `text` with every control character escaped (`\u001b`), for human output and log messages
 * built from entry content, so a file can't move the cursor, color the terminal or start a line.
 */
export function printable(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    out += isControl(code) ? `\\u${code.toString(16).padStart(4, "0")}` : char;
  }
  return out;
}
