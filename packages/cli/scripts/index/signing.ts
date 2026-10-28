import { INDEX_PUBLIC_KEYS, type SignedIndex } from "@steamfield/stacks-format";
import { Effect, FileSystem } from "effect";

const bytes = (pem: string) =>
  Uint8Array.from(Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ""), "base64"));
const payloadBytes = (payload: string) => new TextEncoder().encode(payload);

export const verifySignature = (envelope: SignedIndex, file: string) =>
  Effect.tryPromise({
    try: async () => {
      const trusted = INDEX_PUBLIC_KEYS.find((key) => key.keyId === envelope.keyId);
      if (trusted === undefined || envelope.signature === "")
        throw new Error("unknown key or unsigned file");
      const key = await crypto.subtle.importKey(
        "spki",
        bytes(trusted.publicKey),
        "Ed25519",
        false,
        ["verify"],
      );
      const valid = await crypto.subtle.verify(
        "Ed25519",
        key,
        Buffer.from(envelope.signature, "base64"),
        payloadBytes(envelope.payload),
      );
      if (!valid) throw new Error("invalid signature");
    },
    catch: () =>
      new Error(`${file}: signature verification failed (unsigned, invalid, or untrusted key).`),
  });

export const signIndex = Effect.fn("index.sign")(function* (payload: string, keyPath?: string) {
  if (keyPath === undefined) return { keyId: "unsigned", signature: "", payload };
  const fs = yield* FileSystem.FileSystem;
  const pem = yield* fs
    .readFileString(keyPath)
    .pipe(Effect.mapError(() => new Error(`Signing key could not be read: ${keyPath}`)));
  const signature = yield* Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey("pkcs8", bytes(pem), "Ed25519", false, ["sign"]);
      return Buffer.from(await crypto.subtle.sign("Ed25519", key, payloadBytes(payload))).toString(
        "base64",
      );
    },
    catch: () => new Error(`Signing key is not a PKCS8 Ed25519 private key: ${keyPath}`),
  });
  for (const key of INDEX_PUBLIC_KEYS) {
    const envelope = { keyId: key.keyId, signature, payload };
    const verified = yield* Effect.result(verifySignature(envelope, "v1/index.json"));
    if (verified._tag === "Success") return envelope;
  }
  return yield* Effect.fail(
    new Error(
      "Signing key has no matching public key in INDEX_PUBLIC_KEYS. Add its public key before publishing.",
    ),
  );
});
