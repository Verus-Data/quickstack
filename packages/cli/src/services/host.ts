import { Context, Layer } from "effect";
export type HostInfo = {
  platform: string;
  executable: string;
  compiled: boolean;
  cwd: string;
  /** Whether stdin and stdout are terminals; bin.ts reads them so core never touches the streams. */
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  /** The terminal's width when stdout is one; human layouts wrap to it when it is narrower. */
  stdoutColumns?: number;
  /**
   * The bundled registry root. A stub repo path (`packages/cli/registry/`) until 0.2 resolves it
   * inside the npm package; core code never computes it.
   */
  registry: string;
  /** How a person runs this CLI, for copy-paste `Next:` lines. A fixed `quickstacks` until 0.2. */
  invocation: string;
};
export class Host extends Context.Service<Host, HostInfo>()("quickstacks/Host") {
  static layer = (value: HostInfo) => Layer.succeed(Host, value);
  static memory = (overrides: Partial<HostInfo> = {}) =>
    Host.layer({
      platform: "test",
      executable: "/test/cli",
      compiled: false,
      cwd: "/test",
      stdinIsTTY: false,
      stdoutIsTTY: false,
      registry: "/test/registry",
      invocation: "quickstacks",
      ...overrides,
    });
}
