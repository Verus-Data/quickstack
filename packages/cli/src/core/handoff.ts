import { BRIEF_PATH } from "../project-layout";
import type { AgentId, DetectedAgent } from "../schemas/entry";
import type { Audience } from "../services/output";
import { printable } from "./text";

/** Why `new` printed the prompt instead of launching an agent. */
export type PrintReason =
  | "json"
  | "no-launch"
  | "not-a-terminal"
  | "untrusted"
  | "no-agent-found"
  | "agent-not-found";

/**
 * What `new` does once the project is written: tell the agent that called it what to do next,
 * launch an agent CLI with the prompt, or print the prompt for the user.
 */
export type HandoffDecision =
  | {
      kind: "inside-agent";
      agent: Exclude<DetectedAgent, "none">;
      untrusted: ReadonlyArray<string>;
    }
  | { kind: "launch"; agent: AgentId; bin: string; args: ReadonlyArray<string> }
  | { kind: "print"; reason: PrintReason; agent?: AgentId; untrusted: ReadonlyArray<string> };

/**
 * How each agent CLI starts an interactive session with a first prompt. `checked` is the date
 * the row was last checked against the agent's documentation; unset until someone has.
 */
export const LAUNCH_ARGS: Readonly<
  Record<AgentId, { bin: string; args: (prompt: string) => string[]; checked?: string }>
> = {
  claude: { bin: "claude", args: (prompt) => [prompt] },
  codex: { bin: "codex", args: (prompt) => [prompt] },
  opencode: { bin: "opencode", args: (prompt) => ["--prompt", prompt] },
  cursor: { bin: "cursor-agent", args: (prompt) => [prompt] },
};

/** Tried after `Settings.agents`, when `--launch` isn't given. */
export const LAUNCH_ORDER: ReadonlyArray<AgentId> = ["claude", "codex", "opencode", "cursor"];

/** The one prompt every outcome gives the agent. No quotes or backticks, so it pastes into a shell. */
export const agentPrompt = (invocation: string) =>
  `Read ${BRIEF_PATH} and carry it out. It's your full task for this project; you're done when ${invocation} verify passes.`;

export type HandoffInput = {
  /** `AppConfig.agent`. */
  detected: DetectedAgent;
  json: boolean;
  /** False with `--no-launch`. */
  launch: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  /** Ids of the composed entries with `trusted: false`. */
  untrusted: ReadonlyArray<string>;
  /** `--launch`. */
  preferred?: AgentId;
  /** `Settings.agents`, in the user's order. */
  configured: ReadonlyArray<AgentId>;
  /** Each agent's binary that `Processes.which` found, by agent. */
  found: ReadonlyMap<AgentId, string>;
  /** `agentPrompt(Host.invocation)`. */
  prompt: string;
};

/** The agents to try, in order: `--launch` alone, else the configured ones, then the rest. */
export const candidates = (preferred: AgentId | undefined, configured: ReadonlyArray<AgentId>) =>
  preferred ? [preferred] : [...new Set([...configured, ...LAUNCH_ORDER])];

/**
 * The handoff, first matching rule wins: a detected agent; `--json`; `--no-launch`; no terminal;
 * an untrusted entry; else the first agent binary found. An untrusted entry never reaches
 * `launch`.
 */
export function decideHandoff(input: HandoffInput): HandoffDecision {
  const { untrusted } = input;
  if (input.detected !== "none") return { kind: "inside-agent", agent: input.detected, untrusted };
  const print = (reason: PrintReason, agent?: AgentId): HandoffDecision => ({
    kind: "print",
    reason,
    ...(agent ? { agent } : {}),
    untrusted,
  });
  if (input.json) return print("json");
  if (!input.launch) return print("no-launch");
  if (!input.stdinIsTTY || !input.stdoutIsTTY) return print("not-a-terminal");
  if (untrusted.length) return print("untrusted");
  for (const agent of candidates(input.preferred, input.configured)) {
    const bin = input.found.get(agent);
    if (bin) return { kind: "launch", agent, bin, args: LAUNCH_ARGS[agent].args(input.prompt) };
  }
  return input.preferred ? print("agent-not-found", input.preferred) : print("no-agent-found");
}

/** The manifest's `handoff` record. */
export const handoffRecord = (decision: HandoffDecision, at: string) => ({
  kind: decision.kind,
  ...(decision.kind === "print" ? {} : { agent: decision.agent }),
  at,
});

/** A directory as a shell argument: plain when it is safe, else single-quoted. */
const shellArg = (text: string) =>
  /^[A-Za-z0-9._/+-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
/** A prompt as a shell argument: double quotes read better when nothing inside expands. */
const quote = (text: string) =>
  /^[A-Za-z0-9._/+-]+$/.test(text) || !/^[^"$`\\!]*$/.test(text) ? shellArg(text) : `"${text}"`;

/**
 * The text after `new`'s summary for an outcome other than `launch`. `shown` is how the summary
 * showed the project (`core/shown-path.ts::shownPath`: relative when under the cwd). A human also
 * gets a ready-to-run example command; an agent has the prompt on the line above it already.
 */
export function renderHandoff(
  decision: Exclude<HandoffDecision, { kind: "launch" }>,
  context: { shown: string; invocation: string; audience: Audience },
): string {
  const ids = decision.untrusted.map(printable).join(", ");
  const where = context.shown === "." ? "the current directory" : printable(context.shown);
  if (decision.kind === "inside-agent")
    return decision.untrusted.length
      ? `STOP: this project uses entries this machine hasn't trusted: ${ids}. Don't start. Show the user the list and ${BRIEF_PATH}'s first section, and continue only if they confirm.`
      : `NEXT STEP FOR THE AGENT: read ${BRIEF_PATH} now and carry it out, working in ${where}. Loop on ${context.invocation} verify until it passes. Don't stop here to report back; the brief says when to ask the user.`;
  const prompt = agentPrompt(context.invocation);
  const example = LAUNCH_ARGS[decision.agent ?? "claude"];
  const dir = printable(shellArg(context.shown));
  const lines: string[] = [];
  if (decision.reason === "untrusted")
    lines.push(
      `Not launching an agent: this project uses entries this machine hasn't trusted (${ids}; listed above). Read them and the brief's first section before an agent acts on it.`,
    );
  if (decision.reason === "agent-not-found") lines.push(`${example.bin} isn't on PATH.`);
  if (decision.reason === "no-agent-found")
    lines.push(
      `No agent CLI found on PATH (looked for ${LAUNCH_ORDER.map((id) => LAUNCH_ARGS[id].bin).join(", ")}).`,
    );
  lines.push(`Next: open ${dir} in your coding agent and give it this prompt:`, `  ${prompt}`);
  if (context.audience === "human")
    lines.push(
      `For example: ${context.shown === "." ? "" : `cd ${dir} && `}${[example.bin, ...example.args(prompt).map(quote)].join(" ")}`,
    );
  return lines.join("\n");
}
