import { Effect, type Terminal } from "effect";
import { scriptedTerminal } from "./cli";

type Answer = string | Effect.Effect<string, Terminal.QuitError>;
type Step = Answer | ((screen: string) => Answer);

/** Reuses runCli's Terminal layer, recording the display since the previous read. */
export function terminalScript(steps: ReadonlyArray<Step> = []) {
  const terminal = scriptedTerminal();
  const screens: string[] = [];
  let offset = 0;
  terminal.answers.push(
    ...steps.map((step) =>
      Effect.suspend(() => {
        const screen = terminal.displayed.slice(offset).join("");
        offset = terminal.displayed.length;
        screens.push(screen);
        const answer = typeof step === "function" ? step(screen) : step;
        return typeof answer === "string" ? Effect.succeed(answer) : answer;
      }),
    ),
  );
  return Object.assign(terminal, { screens });
}

/** The existing handoff picker uses numbered `1) Label` rows and line input. */
export function numberedRows(screen: string) {
  return [...screen.matchAll(/^\s*(\d+)\)\s+(.+)$/gm)].map((match) => {
    const [, number, text] = match;
    if (number === undefined || text === undefined) throw new Error("Invalid numbered row");
    return { number, text };
  });
}

/** Select by visible label so adding a row does not silently select a different entry. */
export const choose =
  (...labels: ReadonlyArray<string>) =>
  (screen: string) =>
    labels
      .map((label) => {
        const matches = numberedRows(screen).filter((row) =>
          row.text.toLowerCase().includes(label.toLowerCase()),
        );
        const row = matches[0];
        if (matches.length !== 1 || row === undefined)
          throw new Error(`Expected one picker row for ${label}: ${screen}`);
        return row.number;
      })
      .join(",");
