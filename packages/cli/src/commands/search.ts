import { SearchResult } from "@steamfield/stacks-format";
import { Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { renderSearch } from "../core/search/report";
import { search } from "../core/search/run";
import { textWidth } from "../core/wrap";
import { BadInput } from "../errors";
import { Host } from "../services/host";
import { Invocation } from "../services/invocation";
import { Output } from "../services/output";

export const searchCommand = Command.make(
  "search",
  {
    request: Argument.String("request").pipe(
      Argument.withDescription("What you want to build, in your own words (1 to 500 characters)."),
      Argument.atLeast(1),
    ),
    local: Flag.Boolean("local").pipe(
      Flag.withDescription("Rank locally without sending the request to the API."),
      Flag.withDefault(false),
    ),
    kind: Flag.Literals("kind", ["stack", "fragment"]).pipe(
      Flag.withDescription("Search only stacks or only fragments."),
      Flag.optional,
    ),
    limit: Flag.Int("limit").pipe(
      Flag.withDescription("Maximum hits per list, from 1 to 20 (default 5)."),
      Flag.withDefault(5),
    ),
  },
  ({ request: words, kind, limit, local }) =>
    Effect.gen(function* () {
      const request = words.join(" ").trim();
      const length = [...request].length;
      if (length === 0 || length > 500)
        return yield* new BadInput({ details: { flag: "request", id: "", length } });
      if (limit < 1 || limit > 20)
        return yield* new BadInput({ details: { flag: "limit", id: String(limit) } });
      const result = yield* search(request, {
        limit,
        kind: Option.getOrUndefined(kind),
        local,
      });
      const output = yield* Output;
      const host = yield* Host;
      yield* (yield* Invocation).annotate({
        requestLength: String(length),
        remote: result.remote,
        stacks: String(result.stacks.length),
        fragments: String(result.fragments.length),
      });
      yield* output.result(
        Schema.encodeSync(SearchResult)(result),
        renderSearch(result, {
          invocation: host.invocation,
          width: textWidth(output.audience === "human", host.columns),
          measure: host.stringWidth,
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Rank stacks and fragments using the API and local entries, falling back to local ranking. Use --local to keep the request on this machine. Exits 0 even when nothing fits strongly, 2 for invalid input (Usage; BadInput), 6 for unreadable registries (PermissionDenied), 130 when interrupted.",
  ),
  Command.withShortDescription("Find stacks and fragments for what you want to build."),
  Command.withExamples(({ commandPath }) => [
    {
      command: `${commandPath.join(" ")} "an iOS health app" --json`,
      description: "Compare fit, explanations and cached evidence.",
    },
    {
      command: `${commandPath.join(" ")} go cli --kind stack --limit 3`,
      description: "Find a stack for a Go command-line tool.",
    },
  ]),
);
