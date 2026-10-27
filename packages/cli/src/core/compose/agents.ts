import type { Settings } from "../../schemas/config";
import type { AgentId } from "../../schemas/entry";

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
  const chosen = flag?.length ? flag : settings.agents?.length ? settings.agents : fallback;
  return [...new Set(chosen)];
}
