import { parseArgs } from "node:util";
import { Effect } from "effect";

export const help = `Usage: bun scripts/bench.ts <stack> [options]

--with <a,b>          Add fragments
--preset <preset>     sandbox (default) or default
--agent <agent>       claude or codex (default: detected agent, else claude)
--max-minutes <n>     Agent wall-clock limit, including fractional minutes (default: 60)
--cli <entry.mjs>     Install this Node entry and its sibling cli.mjs instead of building
--existing <dir>      Continue a kept bench root with matching composition
--keep                Keep the throwaway root
--no-record           Skip the run note and ledger write
--help                Show this help`;

export const options = (args: readonly string[]) =>
  Effect.try<Options | null, Error>({
    try: () => {
      const { values, positionals } = parseArgs({
        args: [...args],
        allowPositionals: true,
        options: {
          with: { type: "string" },
          preset: { type: "string", default: "sandbox" },
          agent: { type: "string" },
          "max-minutes": { type: "string", default: "60" },
          cli: { type: "string" },
          existing: { type: "string" },
          keep: { type: "boolean", default: false },
          "no-record": { type: "boolean", default: false },
          help: { type: "boolean", default: false },
        },
      });
      if (values.help) return null;
      const stack = positionals[0];
      if (!stack || positionals.length !== 1) throw new Error(help);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(stack)) throw new Error("Invalid stack id");
      const preset = values.preset;
      if (preset !== "sandbox" && preset !== "default")
        throw new Error("--preset must be sandbox or default");
      const minutes = Number(values["max-minutes"]);
      if (!Number.isFinite(minutes) || minutes <= 0)
        throw new Error("--max-minutes must be a positive number");
      return {
        stack,
        with: [...new Set((values.with ?? "").split(",").filter(Boolean))].sort(),
        preset,
        agent: values.agent,
        minutes,
        cli: values.cli,
        existing: values.existing,
        keep: values.keep,
        noRecord: values["no-record"],
      };
    },
    catch: (error) => (error instanceof Error ? error : new Error("Invalid bench arguments")),
  });

export type Options = {
  stack: string;
  with: string[];
  preset: "sandbox" | "default";
  agent: string | undefined;
  minutes: number;
  cli: string | undefined;
  existing: string | undefined;
  keep: boolean;
  noRecord: boolean;
};
