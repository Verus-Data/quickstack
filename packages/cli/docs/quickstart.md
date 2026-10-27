# Quick start

This guide takes you from nothing to a project your coding agent is building, in about five minutes. You'll install the CLI, pick a stack, preview it, write the project, and run the check that says when it's done.

quickstack does the setup work that's easy to get subtly wrong: picking the pieces, laying out the project, and writing down what "working" means. Your coding agent (Claude Code, Codex, OpenCode or Cursor) does the building. The CLI never writes application code and never runs an install script; it writes a few starter files and a brief, and the agent takes it from there.

```mermaid
flowchart LR
  L["list / show<br/>pick a stack"] --> D["new --dry-run<br/>preview"]
  D --> N["new<br/>write the project"]
  N --> A(["Agent builds<br/>from the brief"])
  A --> V{"verify"}
  V -- "failed" --> A
  V ==>|green| G(("Done"))

  classDef you fill:#1e3a8a,stroke:#60a5fa,stroke-width:2px,color:#dbeafe
  classDef agent fill:#581c87,stroke:#c084fc,stroke-width:2px,color:#f3e8ff
  classDef done fill:#065f46,stroke:#10b981,stroke-width:2px,color:#d1fae5
  class L,D,N you
  class A,V agent
  class G done
```

The blue steps are yours, and this guide walks through each one. The purple loop is the agent's.

## What you need

- [Node](https://nodejs.org) 22 or newer, on macOS or Linux. `npx` comes with it.
- git.
- A coding agent CLI on your PATH, if you want quickstack to hand the project over for you. `claude`, `codex`, `opencode` and `cursor-agent` are recognized.
- Whatever the stack builds with. A Go stack needs Go, a Python stack needs uv, and so on. quickstack tells you if something is missing; it never fails because of it.

## Get the CLI

quickstack is on npm as `@steamfield/stacks`, so there's nothing to clone or build. The quickest way in is `npx`, which downloads the package on first use and runs it:

```sh
npx @steamfield/stacks --version
npx @steamfield/stacks list stacks
```

If you'll use it more than once, install it globally. The command it installs is `stacks`:

```sh
npm install -g @steamfield/stacks
stacks --version
```

If `--version` prints a version, you're set. `stacks doctor` shows where it looks for everything, if you ever need to check.

The rest of this guide writes `stacks <command>`. With `npx`, use `npx @steamfield/stacks` in its place: `npx @steamfield/stacks new typescript-cli my-cli`. Every command works the same either way, and the brief records the exact command your agent should use for `verify`.

Want to run it from source instead, to try a change or write a stack against an unreleased version? Clone [the repository](https://github.com/tryopendata/quickstack) and follow its development quick start.

## Pick a stack

A stack is a recipe for one kind of project: a Go CLI, an Astro blog, a FastAPI backend with a React frontend. List them:

```sh
stacks list stacks
```

```text
Stacks
  astro-blog               proven 2026-10-27
    A static Astro blog with MDX posts in a zod-validated content collection ...
  go-cli                   proven 2026-10-27
    A Go command-line tool with cobra commands, viper config ...
  typescript-cli           proven 2026-10-27
    A Bun-compiled TypeScript CLI with Effect commands and services ...
```

"proven" means a coding agent built that stack's default setup from scratch on that date and every check passed. "unproven" means nobody has recorded such a run yet.

Read one before you commit to it:

```sh
stacks show typescript-cli
```

`show` prints everything the stack would tell your agent: the layout it wants, the decisions it will ask about, the checks that define done, and the files it ships. It only reads; nothing runs.

This guide uses `typescript-cli`. Swap in any stack id.

## Preview the project

Ask for a dry run first. It does everything except write:

```sh
stacks new typescript-cli my-cli --sandbox --dry-run
```

```text
Planned my-cli from typescript-cli (sandbox).
Fragments: agent-ops, ci-github, claude-harness, effect-schema, effect, git-hooks
Agents: claude
Git: would create a new repository
Would write 58 files:
  ...
Brief: .quickstack/BRIEF.md (4666 words)
Dry run: nothing was written.
```

Two things in that output are worth understanding.

The `Fragments:` line lists the add-ons this stack pulls in. A fragment is one capability, such as CI, git hooks or a database, that several stacks can share. `typescript-cli` includes some by default; `list fragments` shows the rest, and `--with` and `--without` change the set.

`--sandbox` means "local only". The agent takes the default for every decision instead of asking you, and nothing gets deployed or released. It's the fastest way to see a stack working. Drop `--sandbox` when you want to make the decisions yourself.

## Write the project

Run the same command without `--dry-run`:

```sh
stacks new typescript-cli my-cli --sandbox
```

quickstack writes the starter files, creates a git repository, and then starts your coding agent in `my-cli/` with one instruction: read the brief and carry it out. You'll be talking to the agent from here on.

If you'd rather start the agent yourself, add `--no-launch`. quickstack then prints the prompt to give it:

```text
Next: open /path/to/my-cli in your coding agent and give it this prompt:
  Read .quickstack/BRIEF.md and carry it out. It's your full task for this project; you're done when stacks verify passes.
```

## What landed in your project

Most of what `new` wrote is ordinary project files: `README.md`, `AGENTS.md`, config for your agent under `.claude/`, a CI workflow. The interesting part is `.quickstack/`:

| File | What it is | Committed? |
| --- | --- | --- |
| `BRIEF.md` | The agent's task: what to build, which decisions to ask about, and the checks that must pass | No |
| `manifest.json` | The project's record: which stack and fragments it came from, and its verify steps | Yes |
| `NOTES.md` | Where the agent writes down questions it asked and problems it found with the brief | No |
| `state/` | Verify's run history | No |

The brief is long (thousands of words) because it's written for the agent, which reads all of it. You don't need to read it, but skimming its "Decisions" and "Definition of done" sections tells you what you're getting.

## Run verify

`verify` is the definition of done. It runs the checks listed in the manifest (install, lint, typecheck, tests, and whatever else the stack and its fragments require) and reports which pass:

```sh
cd my-cli
stacks verify
```

Run it straight after `new`, before the agent has built anything, and it fails at the first step, which is expected:

```text
verify: failed (full run; 0 passed, 1 failed, 12 skipped; 0.0s)

  failed   setup     install               (exit 1, 0.0s)  exited with status 1
      | error: Bun could not find a package.json file to install from
  skipped  check     lint                  an earlier setup step failed
  ...

Next: fix the code or config these steps exercise, not the steps, then run stacks verify again.
```

The agent runs this same command in a loop: fix what failed, run again. When every step passes, verify prints `verify: green` and exits 0, and the project is done.

Two rules keep that honest. The agent may not edit the steps, and verify checks this itself: before running anything, it compares the steps against a copy recorded when the project was made, and refuses to run if they differ. If you change a step on purpose, accept the change from your own terminal:

```sh
stacks verify --accept-changes
```

An agent can't run that command; it's refused whenever an agent is detected.

## Check the history

```sh
stacks runs
```

`runs` summarizes every verify run for this project: how many there were, the last outcome, how long it took to reach the first green run, and how many questions the agent had to ask you.

## Add fragments to a project you already have

quickstack works on existing repositories too. `add` applies fragments without overwriting anything:

```sh
cd my-existing-repo
stacks add ci-github git-hooks
```

```mermaid
flowchart LR
  F["each file a<br/>fragment ships"] --> E{"already in<br/>the project?"}
  E -- "no" --> W["written"]
  E -- "yes, same bytes" --> S["skipped"]
  E -- "yes, different" --> I["parked in<br/>.quickstack/incoming/"]
  I --> M(["agent merges it<br/>per the brief"])

  classDef ok fill:#065f46,stroke:#10b981,stroke-width:2px,color:#d1fae5
  classDef neutral fill:#374151,stroke:#9ca3af,stroke-width:2px,color:#e5e7eb
  classDef warn fill:#78350f,stroke:#fbbf24,stroke-width:2px,color:#fef3c7
  classDef agent fill:#581c87,stroke:#c084fc,stroke-width:2px,color:#f3e8ff
  class W ok
  class F,E,S neutral
  class I warn
  class M agent
```

New files are written. When a file already exists, quickstack leaves it alone and parks its own version under `.quickstack/incoming/`, and the brief asks your agent to merge the two. Then `verify` checks the whole project, the same as for a new one.

`stacks list fragments` shows what you can add. Inside a project quickstack made, plain `stacks list` shows only the fragments that fit it.

## Let your agent drive instead

Everything above also works the other way round: you ask your agent for a project and it runs quickstack. Install the skill once:

```sh
stacks skill install        # or: npx @steamfield/stacks skill install
```

That puts a short skill file where Claude Code finds it (`~/.claude/skills/quickstack/SKILL.md`). Then, in any Claude Code session, ask for something like "start me a Go CLI with tests and CI". The agent picks a stack, tells you which and why, writes the project and builds it until verify passes. [Using quickstack with an agent](agents.md) covers other agents and what the agent sees.

## Where to go next

- [Concepts](concepts.md) explains stacks, fragments, the brief and verify properly.
- [Command reference](reference/commands.md) lists every flag.
- [Authoring](authoring.md) shows how to write your own stack or fragment.
- `stacks <command> --help` gives any command's flags, exit codes and examples.
