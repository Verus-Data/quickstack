import { SearchMetadata } from "@steamfield/stacks-format";
import { Console, Duration, Effect, Schema, SchemaIssue } from "effect";
import { decodeSidecar } from "../../src/core/search/sidecar";
import type { DecorateConfig } from "./config";

const Response = Schema.Struct({
  choices: Schema.Array(Schema.Struct({ message: Schema.Struct({ content: Schema.String }) })),
  usage: Schema.Struct({ total_tokens: Schema.Number, cost: Schema.Number }),
});
export type Budget = { total: number; highest: number; max: number };

/** Keep provider-controlled values, property names and parser messages out of corrections. */
function draftSchemaError(error: Schema.SchemaError): Error {
  const issues = SchemaIssue.makeFormatterStandardSchemaV1({
    leafHook: () => "invalid",
    checkHook: () => "invalid",
  })(error.issue).issues;
  const fields = [
    ...new Set(
      issues.flatMap(({ path }) => {
        const key = path?.[0];
        return typeof key === "string" &&
          SearchMetadata.members.some(({ fields }) => Object.hasOwn(fields, key))
          ? [key]
          : [];
      }),
    ),
  ];
  return new Error(`Invalid JSON/schema${fields.length ? ` at ${fields.join(", ")}` : ""}.`);
}

/** Stored cards remain backward compatible; new drafts must include the editorial copy. */
const decodeDraft = Effect.fn("decorate.decodeDraft")(function* (content: string) {
  const card = yield* decodeSidecar(new TextEncoder().encode(content)).pipe(
    Effect.mapError(draftSchemaError),
  );
  const missing = (["description", "seoDescription", "projectExamples", "plain"] as const).filter(
    (field) =>
      card[field] === undefined ||
      (field === "projectExamples" && card.projectExamples?.length === 0),
  );
  if (missing.length)
    return yield* Effect.fail(
      new Error(
        `New drafts require ${missing.join(", ")}; projectExamples must contain at least one example.`,
      ),
    );
  return card;
});

const request = Effect.fn("decorate.request")(function* (options: {
  config: DecorateConfig;
  model: string;
  prompt: string;
}) {
  for (let attempt = 0; ; attempt++) {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${options.config.base}/chat/completions`, {
          method: "POST",
          signal: AbortSignal.timeout(60_000),
          headers: {
            Authorization: `Bearer ${options.config.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: options.prompt }],
          }),
        }),
      catch: () => new Error("OpenRouter transport request failed."),
    });
    if (response.ok) {
      const body = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => new Error("OpenRouter returned invalid response JSON."),
      });
      return yield* Schema.decodeUnknownEffect(Response)(body).pipe(
        Effect.mapError(() => new Error("OpenRouter response is missing content or usage cost.")),
      );
    }
    yield* Effect.tryPromise({
      try: () => response.body?.cancel() ?? Promise.resolve(),
      catch: () => new Error("Could not close OpenRouter response."),
    });
    const retry = response.status === 408 || response.status === 429 || response.status >= 500;
    if (!retry || attempt >= 3)
      return yield* Effect.fail(new Error(`OpenRouter HTTP ${response.status}.`));
    yield* Effect.sleep(Duration.millis(250 * 2 ** attempt));
  }
});

/** Every paid response, even invalid model output, counts toward the cap. */
export const draft = Effect.fn("decorate.draft")(function* (options: {
  config: DecorateConfig;
  model: string;
  prompt: string;
  id: string;
  budget: Budget;
}): Effect.fn.Return<SearchMetadata | undefined, Error> {
  let prompt = options.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (
      options.budget.total >= options.budget.max ||
      options.budget.total + options.budget.highest > options.budget.max
    ) {
      yield* Console.log(`Budget cap reached before ${options.id}; no request sent.`);
      return undefined;
    }
    const response = yield* request({ ...options, prompt });
    const cost = response.usage.cost;
    if (!Number.isFinite(cost) || cost < 0)
      return yield* Effect.fail(new Error("OpenRouter reported invalid cost."));
    options.budget.total += cost;
    options.budget.highest = Math.max(options.budget.highest, cost);
    yield* Console.log(
      `${options.id}: model=${options.model} tokens=${response.usage.total_tokens} cost=$${cost.toFixed(6)}`,
    );
    const content = response.choices[0]?.message.content ?? "";
    const decoded = yield* Effect.result(decodeDraft(content));
    if (decoded._tag === "Success") return decoded.success;
    // Never echo provider content: schema diagnostics may include credentials supplied by a provider.
    const diagnostic = String(decoded.failure).replaceAll(
      options.config.key ?? "\\0",
      "[redacted]",
    );
    prompt = `${options.prompt}\nPrevious output failed JSON/schema decoding. Correct this error:\n${diagnostic}`;
  }
  yield* Console.log(`Skipped ${options.id}: invalid JSON/schema after one correction retry.`);
  return undefined;
});
