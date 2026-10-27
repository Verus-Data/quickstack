/** A value as a shell argument: plain when it is safe, else single-quoted. */
export const shellArg = (text: string) =>
  /^[A-Za-z0-9._/+-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;

/** Literal shell words for static references; expansions remain text and nothing is executed. */
export function shellWords(command: string): string[] {
  return shellTokens(command)
    .filter((token) => !token.operator || token.word !== "\n")
    .map((token) => token.word);
}

type Heredoc = { delimiter: string; stripTabs: boolean; quoted: boolean };

function heredocEnd(command: string, start: number, heredoc: Heredoc): number {
  let offset = start;
  let line = "";
  while (offset < command.length) {
    const newline = command.indexOf("\n", offset);
    const end = newline < 0 ? command.length : newline;
    line += command.slice(offset, end);
    const backslashes = /\\+$/.exec(line)?.[0].length ?? 0;
    if (!heredoc.quoted && newline >= 0 && backslashes % 2 === 1) line = line.slice(0, -1);
    else {
      if ((heredoc.stripTabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) return end;
      line = "";
    }
    offset = end + 1;
  }
  return command.length;
}

/** Shell words and operators in order, with heredoc bodies skipped; newlines are operators. */
export function shellTokens(command: string) {
  const words: { word: string; operator: boolean }[] = [];
  const heredocs: Heredoc[] = [];
  let delimiterTabs: boolean | undefined;
  let word = "";
  let quote: string | undefined;
  let wordQuoted = false;
  let active = false;
  const finish = () => {
    if (active) {
      words.push({ word, operator: false });
      if (delimiterTabs !== undefined) {
        heredocs.push({ delimiter: word, stripTabs: delimiterTabs, quoted: wordQuoted });
        delimiterTabs = undefined;
      }
    }
    word = "";
    wordQuoted = false;
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
      wordQuoted = true;
      active = true;
      return index;
    }
    if (char === "\\") return escapedCharacter(index);
    if (/\s/.test(char)) return whitespace(index, char);
    if (char === "#" && !active) {
      const newline = command.indexOf("\n", index);
      return newline < 0 ? command.length : newline - 1;
    }
    if (/[;&|()<>]/.test(char)) return operator(index, char);
    word += char;
    active = true;
    return index;
  }

  function escapedCharacter(index: number): number {
    if (command[index + 1] === "\n") return index + 1;
    wordQuoted = true;
    word += command[index + 1] ?? "";
    active = true;
    return index + 1;
  }

  function whitespace(index: number, char: string): number {
    finish();
    if (char !== "\n") return index;
    words.push({ word: char, operator: true });
    for (const heredoc of heredocs.splice(0)) index = heredocEnd(command, index + 1, heredoc);
    return index;
  }

  function heredocRedirect(index: number): number {
    finish();
    if (command[index + 2] === "<") {
      words.push({ word: "<<<", operator: true });
      return index + 2;
    }
    delimiterTabs = command[index + 2] === "-";
    words.push({ word: delimiterTabs ? "<<-" : "<<", operator: true });
    return index + (delimiterTabs ? 2 : 1);
  }

  function operator(index: number, char: string): number {
    if (char === "<" && command[index + 1] === "<") return heredocRedirect(index);
    finish();
    words.push({ word: char, operator: true });
    return index;
  }

  function quotedCharacter(index: number, char: string): number {
    if (char === "\\" && quote === '"' && command[index + 1] === "\n") return index + 1;
    if (char === quote) quote = undefined;
    else if (char === "\\" && quote === '"' && /["\\$`]/.test(command[index + 1] ?? ""))
      word += command[++index] ?? "";
    else word += char;
    return index;
  }
}
