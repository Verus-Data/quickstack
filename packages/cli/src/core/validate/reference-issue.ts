import type { Finding } from "../../schemas/validate";

export type ReferenceIssue = {
  check: string;
  severity: Finding["severity"];
  needle: string;
  message: string;
  matches?: (config: unknown) => boolean;
};
