import { Schema } from "effect";

/** npm versions accepted at the registry boundary and for the running package. */
export const Version = Schema.String.check(
  Schema.isPattern(/^\d{1,9}\.\d{1,9}\.\d{1,9}(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/),
  Schema.isMaxLength(64),
);

function order(left: string | bigint, right: string | bigint): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function identifierOrder(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return order(BigInt(left), BigInt(right));
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return order(left, right);
}

function prereleaseOrder(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  const a = left.split(".");
  const b = right.split(".");
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index];
    const y = b[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const compared = identifierOrder(x, y);
    if (compared !== 0) return compared;
  }
  return 0;
}

function parts(version: string) {
  const dash = version.indexOf("-");
  return {
    numbers: (dash < 0 ? version : version.slice(0, dash)).split("."),
    prerelease: dash < 0 ? undefined : version.slice(dash + 1),
  };
}

/** Semver precedence over versions already decoded with Version. */
export function compareVersions(left: string, right: string): number {
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < 3; index++) {
    const compared = order(BigInt(a.numbers[index] ?? "0"), BigInt(b.numbers[index] ?? "0"));
    if (compared !== 0) return compared;
  }
  return prereleaseOrder(a.prerelease, b.prerelease);
}
