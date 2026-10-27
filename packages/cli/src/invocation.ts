import { VERSION } from "./version";

/** npm's cache path identifies an npx invocation, including a symlinked package bin. */
export const invocationFor = (script: string): string =>
  script.split("/").includes("_npx") ? `npx -y @steamfield/stacks@${VERSION}` : "stacks";
