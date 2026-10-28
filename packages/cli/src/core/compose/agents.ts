import type { AgentId } from "@steamfield/stacks-format";
import type { Settings } from "../../schemas/config";

/**
 * The agents a composition ships adapters for: `new --agents` when given, else `Settings.agents`
 * when set and non-empty, else Claude Code. A detected calling agent doesn't change the set (open
 * question 28). Duplicates are dropped, keeping the first.
 */
export function targetAgents(
  flag: ReadonlyArray<AgentId> | undefined,
  settings: Pick<Settings, "agents">,
): ReadonlyArray<AgentId> {
  const fallback: ReadonlyArray<AgentId> = ["claude"];
  let chosen = fallback;
  if (flag?.length) chosen = flag;
  else if (settings.agents?.length) chosen = settings.agents;
  return [...new Set(chosen)];
}
