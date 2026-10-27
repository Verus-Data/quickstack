import { APP_TAG, DEFAULT_STEP_TIMEOUT } from "../../schemas/entry";
import type { ComposedStep, Composition, MissingTool } from "../compose/compose";
import type { Entry } from "../registry/entry";
import { nest } from "./headings";
import { collapsePaths } from "./paths";
import * as T from "./text";
import { countWords } from "./words";

/**
 * The project root's git state, probed before anything is written: `fresh` gets its own
 * repository, `parent` is inside another work tree, `none` means git isn't installed.
 */
export type GitState = { kind: "fresh" } | { kind: "parent"; toplevel: string } | { kind: "none" };
export type BriefContext = {
  project: string;
  git: GitState;
  /** Paths quickstacks wrote, relative to the project root. */
  written: ReadonlyArray<string>;
  missing: ReadonlyArray<MissingTool>;
  /** `--yes` or `--sandbox`: take every decision's default. */
  yes: boolean;
  /** `Host.invocation`. */
  invocation: string;
};
export type Brief = { text: string; briefWords: number; fixedWords: number };

/** A line of the brief: fixed text from `text.ts`, or entry and generated content. */
type Segment = { fixed: boolean; text: string };

const PHASES = ["setup", "check", "serve", "teardown"] as const;
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const cell = (text: string) => oneLine(text).replaceAll("|", "\\|");

/**
 * The brief an agent follows to a green verify: sections in the plan's order, entry bodies with
 * headings nested under their section, and, with an app, the definition of done split into the
 * base and the application. `briefWords` counts the whole text; `fixedWords` the lines from
 * `text.ts`, so `fixedWords <= briefWords`.
 */
export function renderBrief(composition: Composition, context: BriefContext): Brief {
  const segments: Segment[] = [];
  const fixed = (...lines: ReadonlyArray<string>) => {
    for (const text of lines) segments.push({ fixed: true, text });
  };
  const data = (...lines: ReadonlyArray<string>) => {
    for (const text of lines) segments.push({ fixed: false, text });
  };
  const gap = () => fixed("");
  /** The verify table, then each command in a fence, so a copied command is the command run. */
  const stepTable = (steps: ReadonlyArray<ComposedStep>) => {
    const ordered = runOrder(steps);
    data(...table(ordered));
    fixed("", T.done.commandsBelow, "");
    data(...commandFence(ordered));
  };
  const cli = context.invocation;
  const { stack, app } = composition;
  const base = composition.fragments.filter((fragment) => fragment !== app);
  const sandbox = composition.preset === "sandbox";

  // 1. Title. 2. Untrusted entries, before anything they wrote (their names are in the facts).
  fixed(T.title(oneLine(context.project), oneLine(stack.meta.name)), "");
  if (composition.untrusted.length) {
    fixed(T.untrusted.heading, "", T.untrusted.stop);
    data(
      ...composition.untrusted.map((entry) =>
        T.untrusted.entry(entry.kind, entry.id, entry.origin, entry.dir),
      ),
    );
    const fromProject = composition.untrusted.some((entry) => entry.origin === "project");
    const fromOverride = composition.untrusted.some((entry) => entry.origin !== "project");
    fixed("", T.untrusted.where(fromProject, fromOverride), "", T.untrusted.ask, "");
  }
  // 3. Facts.
  fixed(
    T.facts.stack(oneLine(stack.meta.name), stack.id),
    T.facts.fragments(base.map((fragment) => fragment.id)),
    ...(app ? [T.facts.app(oneLine(app.meta.name), app.id)] : []),
    T.facts.preset(sandbox),
    T.facts.agents(composition.agents),
    T.facts.root,
  );
  if (context.written.length) {
    fixed(T.facts.written);
    data(
      ...collapsePaths(context.written).map((line) => {
        const dir = / \(\d+ files\)$/.exec(line);
        return `  - ${dir ? `${T.code(line.slice(0, dir.index))}${dir[0]}` : T.code(line)}`;
      }),
    );
  }
  if (cli !== "quickstacks") fixed(T.facts.invocation(cli));

  // 3-5. Job, versions, ground rules.
  gap();
  fixed(...T.job(cli));
  gap();
  fixed(...T.versions);
  gap();
  fixed(T.ground.heading, "", T.ground.generators, T.ground.git(context.git));
  if (context.written.length) fixed(T.ground.written);
  fixed(T.ground.agentsMd, ...T.ground.notes);
  if (context.missing.length) fixed(T.ground.missing);

  // 6. Decisions.
  if (composition.decisions.length) {
    gap();
    fixed(T.decisions.heading, "", context.yes ? T.decisions.yes : T.decisions.ask, "");
    data(...composition.decisions.map((decision) => `- ${oneLine(decision.text)}`));
  }

  // 7. Dependencies and tools.
  if (composition.deps.length || composition.tools.length) {
    gap();
    fixed(T.dependencies.heading);
    if (composition.deps.length) {
      fixed("", T.dependencies.packages, "");
      data(...composition.deps.map((dep) => `- ${dep.role}: ${dep.names.join(", ")}`));
    }
    if (composition.tools.length) {
      fixed("", T.dependencies.tools, "");
      data(
        ...composition.tools.map(({ tool }) => {
          const missing = context.missing.find((item) => item.tool === tool);
          return missing
            ? T.dependencies.missing(tool, T.installHint(tool), missing.drop)
            : T.dependencies.found(tool);
        }),
      );
    }
  }

  // 8-9. Stack and fragment guidance; the app's is in the application section.
  const guidance = (heading: string, entry: Entry) => {
    gap();
    fixed(heading);
    const body = nest(entry.body).trim();
    if (body) data("", ...body.split("\n"));
  };
  guidance(T.sections.stack(oneLine(stack.meta.name), stack.id), stack);
  for (const fragment of base)
    guidance(T.sections.fragment(oneLine(fragment.meta.name), fragment.id), fragment);

  // 10. Definition of done, split around the app when there is one.
  const serves = composition.verify.some((step) => step.phase === "serve");
  const steps = composition.verify.filter((step) => !step.tags.includes(APP_TAG));
  const commands = app ? merged([stack, ...base], "commands") : composition.commands;
  const env = app ? merged([stack, ...base], "env") : composition.env;
  gap();
  fixed(app ? T.done.base : T.done.heading, "");
  if (app) fixed(T.done.baseFirst(cli), "");
  if (steps.length) {
    fixed(app ? T.done.baseSteps(cli) : T.done.steps(cli), "");
    stepTable(steps);
  } else fixed(T.done.noSteps(cli));
  if (Object.keys(commands).length) {
    gap();
    fixed(T.done.commands, "");
    data(...commandTable(commands));
  }
  if (Object.keys(env).length) {
    gap();
    fixed(T.done.environment, "");
    data(...envTable(env));
    fixed("", ...environmentNote(cli, Object.keys(env)));
  }
  gap();
  fixed(
    T.done.rules,
    "",
    app ? T.done.rule.runBase(cli) : T.done.rule.run(cli),
    T.done.rule.create,
    T.done.rule.weaken,
    ...(serves ? [T.done.rule.servers, T.done.rule.foreground] : []),
    T.done.rule.timeout,
    T.done.rule.failing,
    T.done.rule.changed(cli),
  );

  if (app) {
    gap();
    fixed(T.application.heading, "", T.application.intro);
    const body = nest(app.body).trim();
    if (body) data("", ...body.split("\n"));
    const appSteps = composition.verify.filter((step) => step.tags.includes(APP_TAG));
    if (appSteps.length) {
      gap();
      fixed(T.application.steps, "", T.application.stepsIntro, "");
      stepTable(appSteps);
    }
    if (Object.keys(app.meta.commands).length) {
      gap();
      fixed(T.application.commands, "");
      data(...commandTable(app.meta.commands));
    }
    const appEnv = Object.fromEntries(
      Object.entries(app.meta.env).filter(([key]) => !Object.hasOwn(env, key)),
    );
    if (Object.keys(appEnv).length) {
      gap();
      fixed(T.application.environment, "");
      data(...envTable(appEnv));
      // When the base has env, it already said to leave the defaults alone.
      const note = environmentNote(cli, Object.keys(appEnv));
      const said = Object.keys(env).length > 0;
      if (note.length > (said ? 1 : 0)) fixed("", ...(said ? note.slice(0, -1) : note));
    }
    fixed("", T.application.done(cli));
  }

  gap();
  fixed(...T.done.qa);
  gap();
  fixed(
    T.done.after,
    "",
    T.done.docs,
    T.done.commit(context.git, oneLine(context.project), stack.id),
    T.done.summary,
  );

  // 11. Sandbox.
  if (sandbox) {
    gap();
    fixed(...T.sandbox);
  }

  const text = `${segments.map((segment) => segment.text).join("\n")}\n`;
  return {
    text,
    briefWords: countWords(text),
    fixedWords: segments
      .filter((segment) => segment.fixed)
      .reduce((sum, segment) => sum + countWords(segment.text), 0),
  };
}

/** One record merged over `entries` in order, later keys replacing earlier ones. */
function merged(entries: ReadonlyArray<Entry>, field: "commands" | "env"): Record<string, string> {
  return Object.fromEntries(new Map(entries.flatMap((entry) => Object.entries(entry.meta[field]))));
}

/** Run order: by phase, then composition order within a phase. */
function runOrder(steps: ReadonlyArray<ComposedStep>): ComposedStep[] {
  return PHASES.flatMap((phase) => steps.filter((step) => step.phase === phase));
}

/** The verify table. Commands stay out of it: escaping `|` in a cell would change them. */
function table(ordered: ReadonlyArray<ComposedStep>): string[] {
  return [
    ...T.done.tableHead,
    ...ordered.map((step) => {
      const expects = [
        ...(step.expect ? [T.done.within(step.expect.http, step.expect.within)] : []),
        ...(step.skipByDefault ? [T.done.skipped] : []),
        ...(step.timeout !== DEFAULT_STEP_TIMEOUT ? [T.done.timeout(step.timeout)] : []),
      ];
      return `| ${cell(T.code(step.name))} | ${step.phase} | ${step.layer ?? ""} | ${cell(expects.join("; "))} |`;
    }),
  ];
}

/**
 * Each step's command as written, under a `# name` comment, in a fence longer than any backtick
 * run in the commands so none can close it.
 */
function commandFence(ordered: ReadonlyArray<ComposedStep>): string[] {
  const longest = Math.max(
    0,
    ...ordered.flatMap((step) => (step.run.match(/`+/g) ?? []).map((run) => run.length)),
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [
    `${fence}sh`,
    ...ordered.flatMap((step) => [
      `# ${oneLine(step.name)}${step.cwd ? T.done.inDir(oneLine(step.cwd)) : ""}`,
      ...step.run.split("\n"),
    ]),
    fence,
  ];
}

function commandTable(commands: Record<string, string>): string[] {
  return [
    ...T.done.commandsHead,
    ...Object.entries(commands).map(
      ([name, purpose]) => `| ${cell(T.code(name))} | ${cell(purpose)} |`,
    ),
  ];
}

function envTable(env: Record<string, string>): string[] {
  return [
    ...T.done.environmentHead,
    ...Object.entries(env).map(
      ([key, value]) => `| ${cell(T.code(key))} | ${cell(T.code(value))} |`,
    ),
  ];
}

/** How to override a busy port (when a variable looks like one), and to leave the defaults alone. */
function environmentNote(cli: string, keys: ReadonlyArray<string>): string[] {
  const port = keys.find((key) => /PORT/i.test(key));
  return [...(port ? [T.done.ports(cli, port)] : []), T.done.keepDefaults];
}
