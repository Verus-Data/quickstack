/** Maintainers add SPKI PEM Ed25519 public keys here before signing a release. */
export const INDEX_PUBLIC_KEYS: ReadonlyArray<{
  readonly keyId: string;
  readonly publicKey: string;
}> = [];
