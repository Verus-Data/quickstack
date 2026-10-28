import { parseArgs } from "node:util";
import { DEFAULT_MODEL } from "./config";

export function argumentsFor(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean" },
      missing: { type: "boolean" },
      stale: { type: "boolean" },
      model: { type: "string" },
      "max-usd": { type: "string" },
      restamp: { type: "string" },
      approve: { type: "string" },
    },
  });
  const maxUsd = Number(values["max-usd"] ?? "1.00");
  if (!Number.isFinite(maxUsd) || maxUsd < 0)
    throw new Error("--max-usd must be a nonnegative number.");
  if (values.restamp && values.approve) throw new Error("Choose --restamp or --approve.");
  if (
    (values.restamp || values.approve) &&
    (positionals.length || values["dry-run"] || values.missing || values.stale)
  )
    throw new Error("Review one id with --restamp or --approve, without drafting flags.");
  return {
    ids: positionals,
    dryRun: values["dry-run"] ?? false,
    missing: values.missing ?? false,
    stale: values.stale ?? false,
    model: values.model ?? DEFAULT_MODEL,
    maxUsd,
    restamp: values.restamp,
    approve: values.approve,
  };
}
export type Options = ReturnType<typeof argumentsFor>;
