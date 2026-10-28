import { Tool, Toolkit } from "effect/ai";
import { CliFailure } from "./errors";
import { CliRunner } from "./run";
import {
  ListParams,
  ListSuccess,
  NewParams,
  NewSuccess,
  VerifyParams,
  VerifySuccess,
} from "./schemas/tools";

export const quickstacksList = Tool.make("quickstacks_list", {
  description:
    "List available quickstacks stacks and fragments. Returns each entry's id, kind, name, description, tags, origin, trusted flag, shadows and lastRun. Pass kind to filter to stacks or fragments only. Use this first to pick a stack.",
  parameters: ListParams,
  success: ListSuccess,
  failure: CliFailure,
  failureMode: "return",
  dependencies: [CliRunner],
});

export const quickstacksNew = Tool.make("quickstacks_new", {
  description:
    "Scaffold a new project from a stack: writes starter files and .quickstacks/BRIEF.md into the target directory. Runs nothing from the stack; verify is the definition of done. Pass stack (required), dir (optional, defaults to ./<stack>), sandbox (default true), and optional with/without fragment lists. Returns the project path, stack, fragments, agents, written files, brief word count, and handoff info. Fails with CliFailure carrying the CLI's tag, message and details verbatim — NotFound with suggestions, TargetNotEmpty, etc.",
  parameters: NewParams,
  success: NewSuccess,
  failure: CliFailure,
  failureMode: "return",
  dependencies: [CliRunner],
});

export const quickstacksVerify = Tool.make("quickstacks_verify", {
  description:
    "Run the project's verify steps from .quickstacks/manifest.json in the given directory (defaults to the server's working directory). Returns the outcome (green/partial/failed/changed/interrupted), totals, duration, and per-step results. A failed outcome is a successful call — do not treat it as an error. Only fails when the CLI itself cannot run. Use this in a loop after new until the outcome is green.",
  parameters: VerifyParams,
  success: VerifySuccess,
  failure: CliFailure,
  failureMode: "return",
  dependencies: [CliRunner],
});

export const toolkit = Toolkit.make(quickstacksList, quickstacksNew, quickstacksVerify);
