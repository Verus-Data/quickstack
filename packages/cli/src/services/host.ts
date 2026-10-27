import { Context, Layer } from "effect";
export type HostInfo = {
  platform: string;
  executable: string;
  cwd: string;
  /** Whether stdin and stdout are terminals; bin.ts reads them so core never touches the streams. */
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  /** The terminal's width when stdout is one; human layouts wrap to it when it is narrower. */
  stdoutColumns?: number;
  /**
   * The bundled registry root, resolved by bin.ts; core code never computes it.
   */
  registry: string;
  /** The bundled skill directory, resolved by bin.ts beside the registry. */
  skill: string;
  /** The authoring guide, resolved by bin.ts beside the registry and skill. */
  authoring: string;
  /** How a person runs this CLI, for copy-paste `Next:` lines. */
  invocation: string;
};
export class Host extends Context.Service<Host, HostInfo>()("quickstack/Host") {
  static layer = (value: HostInfo) => Layer.succeed(Host, value);
  static memory = (overrides: Partial<HostInfo> = {}) =>
    Host.layer({
      platform: "test",
      executable: "/test/cli",
      cwd: "/test",
      stdinIsTTY: false,
      stdoutIsTTY: false,
      registry: "/test/registry",
      skill: "/test/skill",
      authoring: "/test/docs/authoring.md",
      invocation: "quickstack",
      ...overrides,
    });
}
