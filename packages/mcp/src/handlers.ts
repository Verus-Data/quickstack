import { Effect } from "effect";
import { EchoTooLong } from "./errors";
import type { EchoParams, EchoSuccess } from "./schemas/echo";
import type { PingSuccess } from "./schemas/ping";
import { ECHO_TOO_LONG_MESSAGE, MAX_ECHO_LENGTH, toolkit } from "./toolkit";

export const pingHandler = (): Effect.Effect<PingSuccess> => Effect.succeed({ alive: true });

export const echoHandler = (params: EchoParams): Effect.Effect<EchoSuccess, EchoTooLong> => {
  if (params.text.length > MAX_ECHO_LENGTH) {
    return Effect.fail(new EchoTooLong({ message: ECHO_TOO_LONG_MESSAGE }));
  }
  return Effect.succeed({ text: params.text, length: params.text.length });
};

export const handlerLayer = toolkit.toLayer({
  ping: pingHandler,
  echo: echoHandler,
});
