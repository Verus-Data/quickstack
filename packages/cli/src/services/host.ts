import { Context, Layer } from "effect";
export type HostInfo = {
  platform: string;
  executable: string;
  compiled: boolean;
  cwd: string;
  /** Whether stdin and stdout are terminals; bin.ts reads them so core never touches the streams. */
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
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
      ...overrides,
    });
}
