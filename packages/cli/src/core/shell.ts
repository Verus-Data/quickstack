/** A value as a shell argument: plain when it is safe, else single-quoted. */
export const shellArg = (text: string) =>
  /^[A-Za-z0-9._/+-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;

/** Literal shell words for static references; expansions remain text and nothing is executed. */
export function shellWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote: string | undefined;
  let active = false;
  const finish = () => {
    if (active) words.push(word);
    word = "";
    active = false;
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index] ?? "";
    if (quote) {
      index = quotedCharacter(index, char);
    } else index = unquotedCharacter(index, char);
  }
  finish();
  return words;

  function unquotedCharacter(index: number, char: string): number {
    if (/["']/.test(char)) {
      quote = char;
      active = true;
      return index;
    }
    if (char === "\\") {
      word += command[++index] ?? "";
      active = true;
      return index;
    }
    if (/\s/.test(char)) {
      finish();
      return index;
    }
    if (char === "#" && !active) {
      const newline = command.indexOf("\n", index);
      return newline < 0 ? command.length : newline;
    }
    if (/[;&|()<>]/.test(char)) {
      finish();
      words.push(char);
      return index;
    }
    word += char;
    active = true;
    return index;
  }

  function quotedCharacter(index: number, char: string): number {
    if (char === quote) quote = undefined;
    else if (char === "\\" && quote === '"' && /["\\$`]/.test(command[index + 1] ?? ""))
      word += command[++index] ?? "";
    else word += char;
    return index;
  }
}
