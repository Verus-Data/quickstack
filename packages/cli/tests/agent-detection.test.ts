import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { expect, test } from "vitest";
import {
  AGENT_MARKER_NAMES,
  AgentMarkers,
  AppConfig,
  detectAgent,
  type Environment,
} from "../src/config";
import { targetAgents } from "../src/core/compose/agents";
import { compose } from "../src/core/compose/compose";
import { buildManifest } from "../src/core/manifest";
import { Registry } from "../src/core/registry/registry";
import { Output } from "../src/services/output";
import { runCli, tempDir } from "./helpers/cli";
import { bundledAt } from "./helpers/compose";
import { composeRegistry } from "./helpers/registry";

/** `AppConfig.agent` as the real command path sees it: through `runCli`'s AppLayer. */
async function detected(env: Environment): Promise<string> {
  const program = Effect.gen(function* () {
    const agent = yield* (yield* AppConfig).agent;
    yield* (yield* Output).result({ agent }, agent);
  });
  const result = await runCli(["--json"], { env, program });
  expect(result.status).toBe(0);
  return (JSON.parse(result.stdout) as { agent: string }).agent;
}

test.each(AgentMarkers.map((marker) => [marker.name, marker] as const))(
  "the %s marker is detected",
  async (_name, marker) => {
    const value = marker.equals ?? (marker.agent === "by-value" ? "codex-cli" : "1");
    const expected = marker.agent === "by-value" ? "codex" : marker.agent;
    expect(await detected({ [marker.name]: value })).toBe(expected);
  },
);

test("AI_AGENT names a known agent by prefix; any other value is other; no marker is none", async () => {
  expect(await detected({ AI_AGENT: "claude-code" })).toBe("claude");
  expect(await detected({ AI_AGENT: "Cursor Agent" })).toBe("cursor");
  expect(await detected({ AI_AGENT: "foo" })).toBe("other");
  expect(await detected({})).toBe("none");
});

test("blank markers and the wrong Cursor host role don't count", () => {
  expect(detectAgent({ CLAUDECODE: "", AI_AGENT: "" })).toBe("none");
  expect(detectAgent({ CURSOR_EXTENSION_HOST_ROLE: "user" })).toBe("none");
  expect(detectAgent({ CURSOR_TRACE_ID: "abc" })).toBe("none");
});

test("markers are checked in table order", () => {
  expect(detectAgent({ AI_AGENT: "foo", CODEX_CI: "1", CLAUDECODE: "1" })).toBe("claude");
  expect(detectAgent({ AI_AGENT: "foo", OPENCODE: "1" })).toBe("opencode");
});

test("the strip list holds every marker name, AI_AGENT included, once each", () => {
  expect(new Set(AGENT_MARKER_NAMES)).toEqual(new Set(AgentMarkers.map((m) => m.name)));
  expect(AGENT_MARKER_NAMES).toContain("AI_AGENT");
  expect(AGENT_MARKER_NAMES.length).toBe(new Set(AGENT_MARKER_NAMES).size);
});

const markerName = Schema.Literals(AGENT_MARKER_NAMES as [string, ...string[]]);
const other = Schema.Record(
  Schema.String.check(Schema.isPattern(/^[a-z][a-z_]*$/, { expected: "a lowercase name" })),
  Schema.String,
);
it.prop(
  "any environment holding a marker with a non-empty value detects an agent",
  [markerName, Schema.String.check(Schema.isMinLength(1)), other],
  ([name, value, rest]) => {
    const env = { ...rest, [name]: name === "CURSOR_EXTENSION_HOST_ROLE" ? "agent-exec" : value };
    expect(detectAgent(env)).not.toBe("none");
  },
);

test("a detected agent doesn't change the target agents or the manifest's agents", async () => {
  const dir = tempDir();
  try {
    const env = {
      HOME: dir.path,
      XDG_CONFIG_HOME: join(dir.path, "config"),
      CODEX_THREAD_ID: "thread-1",
    };
    const { agent, manifest, files } = await Effect.runPromise(
      Effect.gen(function* () {
        const config = yield* AppConfig;
        const settings = yield* config.get;
        const composition = yield* compose({
          stack: "web-stack",
          with: [],
          without: [],
          preset: "default",
          mode: "new",
          always: [],
          agents: targetAgents(undefined, settings),
        });
        return {
          agent: yield* config.agent,
          manifest: yield* buildManifest(composition, { briefWords: 1 }),
          files: composition.files.map((file) => file.path),
        };
      }).pipe(
        Effect.provide(Registry.layer(bundledAt(composeRegistry))),
        Effect.provide(AppConfig.memory(env)),
        Effect.provide(NodeServices.layer),
      ),
    );
    expect(agent).toBe("codex");
    expect(manifest.agents).toEqual(["claude"]);
    expect(files).toContain(".claude/settings.json");
    expect(files).not.toContain(".codex/config.toml");
  } finally {
    dir.cleanup();
  }
});
