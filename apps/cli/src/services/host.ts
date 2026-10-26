import { Context, Layer } from "effect";
export type HostInfo = { platform: string; executable: string; compiled: boolean; cwd: string };
export class Host extends Context.Service<Host, HostInfo>()("quickstacks/Host") {
  static layer = (value: HostInfo) => Layer.succeed(Host, value);
  static memory = () =>
    Host.layer({ platform: "test", executable: "/test/cli", compiled: false, cwd: "/test" });
}
