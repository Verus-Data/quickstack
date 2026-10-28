import type { SearchHit, SearchResult } from "@steamfield/stacks-format";
import { printable } from "../text";
import { wrap } from "../wrap";

const localReasons = {
  local_flag: "--local",
  offline: "offline",
  do_not_track: "DO_NOT_TRACK",
  backoff: "API backoff",
  no_endpoint: "no API endpoint configured",
};

function reasons(hit: SearchHit): string {
  const phrases = new Map<string, string[]>();
  for (const reason of hit.why) {
    const fields = phrases.get(reason.matched) ?? [];
    fields.push(reason.field);
    phrases.set(reason.matched, fields);
  }
  return [...phrases]
    .map(([phrase, fields]) => `${printable(phrase)} (${fields.map(printable).join(", ")})`)
    .join("; ");
}
function hitBlock(hit: SearchHit, human: boolean): string {
  const stats = hit.evidence.stats;
  const lastRun = hit.evidence.lastRun;
  const evidence = [
    stats
      ? `green lower ${stats.greenRateLower}, sample ${stats.sample}, ${stats.projects} projects / ${stats.window} days`
      : "",
    lastRun ? `last run ${lastRun.date}: ${lastRun.result}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return [
    `${hit.kind} ${hit.id}${human ? ` · ${printable(hit.name)}` : ""} (${hit.tier}${hit.trusted ? "" : ", untrusted"})`,
    printable(hit.summary),
    ...(hit.why.length ? [`Why: ${reasons(hit)}`] : []),
    ...(hit.penalties.length
      ? [
          `Penalties: ${hit.penalties
            .map(
              (penalty) =>
                `${penalty.kind} (${penalty.request ? `${printable(penalty.request)}; ` : ""}entry: ${printable(penalty.entry)})`,
            )
            .join(", ")}`,
        ]
      : []),
    ...(hit.caveats ?? []).map((caveat) => `Caveat: ${printable(caveat)}`),
    ...(evidence ? [`Evidence: ${printable(evidence)}`] : []),
  ].join("\n");
}
function next(result: SearchResult, invocation: string): string {
  if (!result.stacks.length && !result.fragments.length)
    return `Next: ask the user to describe the product differently, then run ${invocation} search "<request>" or ${invocation} list.`;
  const trusted = result.stacks.find((hit) => hit.trusted);
  if (!trusted) return "Next: ask the user before using any of these matches.";
  const confirmation = result.noStrongMatch
    ? "confirm with the user before using a weak match; then "
    : "";
  return `Next: ${confirmation}${invocation} show ${trusted.id}, then ${invocation} new ${trusted.id} <dir>.`;
}
export function renderSearch(
  result: SearchResult,
  options: { invocation: string; human: boolean; width: number; measure: (text: string) => number },
): string {
  const empty = !result.stacks.length && !result.fragments.length;
  const text = [
    ...(result.remote === "unavailable" ? ["Ranked locally: API unavailable.", ""] : []),
    ...(result.remote === "off" && result.remoteReason
      ? [`Ranked locally: ${localReasons[result.remoteReason]}.`, ""]
      : []),
    ...(empty ? ["Nothing matched.", ""] : []),
    ...(!empty && result.noStrongMatch
      ? ["Nothing fits strongly. Confirm the fit with the user.", ""]
      : []),
    ...(result.understood.unmatched.length
      ? [`Unmatched: ${result.understood.unmatched.map(printable).join(", ")}`, ""]
      : []),
    ...(empty
      ? []
      : [
          [...result.stacks, ...result.fragments]
            .map((hit) => hitBlock(hit, options.human))
            .join("\n\n"),
          "",
        ]),
    next(result, options.invocation),
  ].join("\n");
  return wrap(text, options.width, options.measure);
}
