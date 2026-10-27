import { PACKAGE, VERSION } from "./version";

/** npm's cache path identifies an npx invocation, including a symlinked package bin. */
export const isNpxPath = (path: string): boolean => path.split("/").includes("_npx");

export const invocationFor = (script: string): string =>
  isNpxPath(script) ? `npx -y ${PACKAGE}@${VERSION}` : "stacks";
