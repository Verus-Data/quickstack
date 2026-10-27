import { Context, type Effect, Layer } from "effect";
import type { Socket } from "effect/socket";

/**
 * Opens plain TCP connections as Effect sockets; the connection is dialed when the socket's
 * `reader` is acquired. `src/platform/net.ts` supplies the real layer, so core code that checks a
 * port never imports a platform module.
 */
export class Tcp extends Context.Service<
  Tcp,
  { connect: (host: string, port: number) => Effect.Effect<Socket.Socket> }
>()("quickstacks/Tcp") {
  static layer = (connect: (host: string, port: number) => Effect.Effect<Socket.Socket>) =>
    Layer.succeed(Tcp, { connect });
}
