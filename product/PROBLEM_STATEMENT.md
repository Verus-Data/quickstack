# Problem statement

What stacks is for, who it is for, and what has to be true for it to be worth building. Written from the product side so that technical decisions (the format, the CLI, the registry) can be checked against it. The roadmap and plans in this directory should trace back to a line here.

## The problem in one sentence

Developers who start projects with a coding agent can't get a consistent, current, fully tested setup from either side of the table: templates hand them a frozen snapshot that starts aging the day it ships, and an agent with no target builds a different project every time and skips the parts that make a project trustworthy (tests, lint, CI, agent config). Each new project costs an afternoon of setup, and the result is still less complete than what they'd build by hand.

## Who has it

Four kinds of user, in order of how much they matter today.

**The developer who starts projects often.** Senior, opinionated, has a setup they have built by hand five times and would rather write down once. Uses a coding agent for most work. Their frustration is not that they can't set up a project; it's that they keep redoing it, and that an agent left to its own devices doesn't build it the way they would. Success is a project that matches what they'd have built, with the tests and tooling they'd have added, in the time it takes to make coffee.

**The coding agent.** The CLI's main reader. It runs `list --json`, picks a stack, runs `new`, reads the brief, builds, and loops on `verify`. Its frustration is ambiguity: a brief that says "set up testing" without saying which layers, a verify command that doesn't exist, a decision with no default. Success is reaching a green `verify` without asking the user anything the brief could have answered.

**The developer under time pressure.** A technical interview with AI allowed, a hackathon, a spike. They need a running environment with tests in minutes and will never deploy it. Success is time to first passing test.

**The stack author.** Someone with a project they trust who wants to distill it into something reusable, for themselves, their team, or strangers. Their frustration is that the only proof a stack works is an end-to-end agent run, and nothing tells them when their prose has gone stale. Success is knowing a stack still produces a working project without running it by hand.

## What's broken today

Two existing approaches, each with a failure mode the other doesn't have.

**Templates and generators** (Yeoman, cookiecutter, the `create-*` family) ship files with versions in them. The template is correct the day it's published. Six months later a new project starts with outdated dependencies and a deprecated config format, and its first task is a migration. Maintainers spend their time bumping versions instead of improving the template, and most templates stop being maintained. Templates also can't express intent: "mypy strict with the pydantic plugin" has to be a committed `pyproject.toml` that will be wrong for the next mypy.

**A bare agent prompt** ("set up a FastAPI and React project with tests") has the opposite problem. The agent is good at the perishable part: it can read current docs, run the generators, and fix what breaks. It's bad at the durable part. It has no definition of done, so it stops when the dev server starts. It makes a fresh set of layout and tooling choices every run. It skips test setup, lint config, CI, and agent config unless asked, and asking in enough detail is the afternoon the user was trying to save.

The split stacks makes is that humans own what lasts (what the project is made of, how it's laid out, what the tools must enforce, what "working" means) and agents own what ages (versions, generator flags, config formats). Neither existing approach draws that line.

## Evidence

Most of this is first-hand from building the five stacks, not from users. The assumptions log below says what's still unproven.

- Every shipped stack was distilled from a production project that had been set up by hand more than once (`docs/roadmap.md` lists the source project for each). The repetition is real for at least one user.  
- End-to-end runs changed stack prose every time. The astro-blog run hit an agent-specific dev-server behavior that failed `verify` until the stack said what to do; the react-router-ai run produced a project whose improvements were ported back into the stack twice. A bare prompt would have produced those projects without the lessons, and a template could not have carried them forward.  
- Brief size is already spreading. With default fragments, the brief an agent gets is roughly 3,200 words for astro-blog, 3,900 for python-react, 9,300 for typescript-cli, and 10,300 for react-router-ai. The two newest stacks are three times the size of the first ones, which is the first sign that stack prose grows without a budget.  
- Two of the five stacks have not been taken to a green `verify` by an agent since their last change (typescript-cli has never been run; react-router-ai needs a rerun after its second port). The only quality signal the product has is manual and nobody has time to run it.

## Jobs to be done

When I start a new project, I want the same well-tested setup I'd build by hand, without spending the afternoon, so I can start on the actual problem.

When I'm in a timed exercise, I want a running dev environment with tests in a few minutes, so the time goes to the task and not to tooling.

When I've settled on a stack I rebuild often, I want to write it down once, including the agent tooling, so every new project starts where the last one ended.

When I have an existing repo, I want to add a known-good piece (CI, agent hooks, Postgres) without it overwriting what's there, so the repo gets better instead of different.

When I'm an agent asked to set up a project, I want a target I can verify against, so I know when I'm done and don't have to guess at what the user considers complete.

The emotional job underneath all of these is trust: the user wants to start work in a project they don't have to audit first. That is why `verify` exists, why the brief refuses to let the agent weaken a step, and why the CLI never runs commands from an entry.

## What success looks like

Measured per stack, not per release.

| Outcome | Measure |
| :---- | :---- |
| The agent finishes without help | Fraction of `new --sandbox` runs that reach a green `verify` with no user intervention |
| It's faster than by hand | Median time from `new` to green `verify` (target: under 20 minutes for a sandbox run) |
| The result is complete | Every shipped stack's verify covers install, lint, typecheck, test, and a dev-server probe where there is a server |
| Stacks don't rot | A stack that passed last month still passes this month without a prose change |
| People write their own | Stacks and fragments in `~/.stacks` and third-party sources, not only the bundled registry |

None of these are collected today. The stack directory plan proposes telemetry for the first two; the canary in the roadmap's "Later" section is the only way to get the fourth.

## Assumptions

| Assumption | Evidence | Confidence | How to validate |
| :---- | :---- | :---- | :---- |
| Agents can follow a 3,000 to 10,000 word brief faithfully | Four sandbox runs to green, all with prose fixes along the way | Medium for 3,000, low for 10,000 | Rerun the two large stacks and count hesitations and skipped instructions; set a brief budget |
| Version-less prose rots much more slowly than templates | Reasoning, plus one stack (astro-blog) that has survived its runs | Medium | The scheduled canary; count prose edits per stack per quarter |
| `verify` is enough of a definition of done to keep an agent honest | The hash check and the brief's rules; no observed cheating in runs so far | Medium | Inspect projects from runs for no-op targets and weakened tests |
| Users want to bring their own stacks (not only consume a registry) | One user, who built the tool for that | Low | Watch whether anyone besides the author writes a STACK.md |
| Handoff to whatever agent is on PATH is the right entry point | Matches how the author works | Low | Watch whether people use `new` from a terminal or ask their agent to run it |
| A community registry will form | None; the remote registry 404s today | Low | Publish, then count PRs to `registry/` from outside |

The first assumption is the one to test next. It's a one-way door in practice: once stacks are 10,000 words, nobody will cut them.

## What this is not

- Not a template engine. `files/` holds only what is the same across versions; everything else is prose.  
- Not an agent. The CLI never calls an LLM and never runs a command from a stack. The agent the user already has does the work.  
- Not a package manager or version resolver. Versions are the agent's problem on purpose.  
- Not a way to retrofit an existing project onto a stack. `add` applies fragments; it does not restructure what's there.

## Open questions

- **Who is the bundled registry for?** Today it mixes stacks and fragments a stranger would want (python-react, go-cli, ci-github, postgres) with ones that encode one person's tooling (rr, ce-plugin, the Effect and OpenRouter choices in the two newest stacks). If the product is "write your stack down once", those belong in `~/.stacks` or a personal source. If it's a community catalog, they need to earn their place. The registry's origin layering supports either; the bundled content should pick one.  
- **What is the brief budget?** The two newest stacks suggest that without a limit, stacks absorb entire projects. A per-stack cap on brief size, enforced by `validate`, would force the fragment split the roadmap already anticipates.  
- **How does a stack prove it still works?** Manual end-to-end runs don't scale past a handful of stacks. The canary is listed as "Later"; it is the product's CI and probably belongs earlier.  
- **Is the npm name available?** `npm view stacks` resolves to an unrelated package at version 0.75. `npx stacks new ...`, the README's first line, will install that package. The name needs resolving before anything else in the roadmap matters.