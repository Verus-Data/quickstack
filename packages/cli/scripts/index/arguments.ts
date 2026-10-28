import { parseArgs } from "node:util";
import { Effect } from "effect";

const usage =
  "Usage: build:index --out <dir> --previous <url|none> (--key <path> | --unsigned), or --check <base-url>";

function httpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(usage);
  return url;
}

export const argumentsFor = (args: string[]) =>
  Effect.try({
    try: () => {
      const { values } = parseArgs({
        args: args.filter((arg) => arg !== "--"),
        options: {
          out: { type: "string" },
          previous: { type: "string" },
          key: { type: "string" },
          unsigned: { type: "boolean" },
          check: { type: "string" },
        },
      });
      if (values.check !== undefined) {
        if (Object.keys(values).length !== 1) throw new Error(usage);
        return { mode: "check", base: httpUrl(values.check) } as const;
      }
      if (!values.out || !values.previous || Boolean(values.key) === Boolean(values.unsigned))
        throw new Error(usage);
      return {
        mode: "build",
        out: values.out,
        previous: values.previous === "none" ? null : httpUrl(values.previous),
        key: values.key,
      } as const;
    },
    catch: () => new Error(usage),
  });
