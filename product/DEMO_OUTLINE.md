# Demo outline

Status: DRAFT 2026-10-27. A produced Loom video targeting 4:45. Shared-stack discovery leads the story; Rho is the example starter. Scenes depend on what works at rehearsal.

## The story

Tell your agent what you want to build, and let it find a suitable starting point that someone else has already worked through.

stacks brings shared project recipes together with evidence about their use. Developers can contribute their setups; other people and their agents can inspect the catalog, compare candidates and build from one. Stack usage and dependency trends help with that choice. Recorded verification results show what actually passed.

This is familiar behavior: people look at a GitHub project's usage and stars when deciding whether to adopt it. stacks applies that idea to project foundations, with evidence about how projects built from them turn out. Popularity is one signal alongside suitability and successful runs.

The selected stack gives the agent reusable engineering decisions and checks that define done. The agent handles current dependencies and configuration. Saving your own setup is one way to contribute to this shared catalog; someone starting a project should also benefit without ever writing a stack.

The video follows a product request through discovery to a working starter, then opens the website to inspect the evidence behind the choice. Keep the Rho result small: one working connection and a place to start experimenting.

The [problem statement](PROBLEM_STATEMENT.md) covers setup consistency and reuse. This outline brings collaborative discovery to the front of the pitch. Implementation gaps are listed under “What must work for this story.”

## Video sequence

Target 4:45, leaving 15 seconds below the submission limit. The quoted passages are draft narration. Graphics and transitions are included in these timings, not added afterward.

### 0:00–0:20 · Start with someone else's experience

**Screen:** Open with a six-second Claude Motion animation. A product request appears beside a small set of stack cards from different contributors. One card becomes a project folder. Cut to the actual catalog for the rest of the introduction.

**Narration:**

> Someone has already worked through the setup your next project needs. stacks makes those starting points discoverable, with evidence you and your agent can use to choose one.

**Graphic direction:** Use simple labels: “What I want to build,” “Shared stacks,” and “My project.” No invented author names, adoption counts or success badges. This is a concept illustration; the real catalog follows immediately.

### 0:20–0:45 · Ask for a product foundation

**Screen:** Enter the request in the coding agent. Show the agent inspecting the available stacks.

> I want to build a small web tool using Rho. Find a suitable stack, explain your choice, then get me to a working local starter with a simple Rho example.

**Narration:**

> I'm describing what I want to build. The agent can look for a stack that fits, including setups contributed by other developers.

Use the catalog that actually exists. If the entries are maintainer-authored, identify them that way. The demo establishes the workflow; it does not need invented community activity.

**Transition:** Carry the phrase “small web tool using Rho” into a small caption beside the shortlist. Keep the requirement visible while the agent compares options.

### 0:45–1:25 · Show why the agent chose this stack

**Screen:** The agent compares genuinely suitable candidates. Show their purpose and requirements, then the relevant usage or run evidence. Hold its recommendation on screen.

**Narration:**

> These are the candidates that fit the project. The agent can weigh how much they're used, what their dependencies look like, and the evidence that they build successfully. It explains the choice before starting.

Capture the actual recommendation, including one reason to prefer the chosen stack and one tradeoff. Compare popularity and successful builds as separate signals. Only show a dependency trend influencing the recommendation if the agent actually read that data.

If only one entry fits, say so and inspect its evidence. Do not stage a false competition or force the agent to select Rho despite its findings.

**Transition:** Highlight the chosen entry. Match-cut its name in the recommendation to the same name in the scaffold command.

### 1:25–1:45 · Turn the choice into a build brief

**Screen:** Run the tested scaffold command in a fresh directory. Open the generated brief beside its verification steps.

**Narration:**

> stacks combines this recipe with shared pieces like CI and agent tooling. It gives my agent the build instructions and the checks the finished project has to pass.

Follow one requirement from the selected stack or fragment into the brief. Keep its name visible so the viewer can recognize its implementation later.

**Transition:** Use a two-second overlay showing the stack and selected fragments feeding into the brief, then land on the agent reading that real file.

### 1:45–2:40 · Watch the agent build

**Screen:** The agent reads the brief, installs dependencies and implements the starter. Accelerate waiting, then return to normal speed for a useful decision or result.

**Narration:**

> My coding agent handles the current tooling and implementation. Here is the requirement from the brief, now in the project and covered by a test.

If the recorded run contains a failure, show the cause, fix and rerun. Otherwise show the clean run. Keep elapsed build time visible during accelerated footage.

**Transition:** Follow the real verification command into its output. A small “Building” caption can change to “Checking”; hold the result before cutting away.

### 2:40–3:15 · Show what passing means

**Screen:** Required checks pass. Inspect the test from the previous scene, then cut to a labeled controlled demonstration: change a verify command in a disposable copy and show stacks refusing to run it.

**Narration:**

> These checks were declared before the build. If I change a verification command, stacks detects it and stops. The agent has to meet the declared checks.

Return to the completed project. Show actual scaffold duration and total time to green, plus the agent/model and manual interventions. Record warm or cold cache conditions. Use measured numbers in the voiceover.

Changed-command detection protects the declared commands. It does not establish that test assertions are complete or prevent an agent from weakening application tests.

**Transition:** Cut from the passing result to the running example. Use the same project name in both shots.

### 3:15–3:30 · Run the Rho example

**Screen:** Execute one sandbox request, show its response, then open the example source.

**Narration:**

> The Rho connection works. I can start changing this example, with the project setup and tests already in place.

Keep the sandbox label visible. Stop at the starter; there is no transaction-review feature to build.

### 3:30–4:30 · Inspect the evidence yourself

**Screen:** Open the website on the selected stack. Show its source or contribution history, usage evidence and one relevant dependency trend. If a different stack has the needed history, identify the switch.

**Narration:**

> I can inspect the same choice on the website. Here is where the stack came from, how it's being used, and what happened when people built with it. I can also see which dependencies are gaining use when I'm deciding what to build on.

Spend this minute on one decision, not a tour of charts. For example, show why a frequently used candidate fits the requested project, or why stronger verification evidence makes another suitable candidate worth considering. Use the finding the records support.

Trace one displayed metric to its source records. Keep its sample and time window visible. Dependency trends describe the reporting stacks projects, not the whole software industry.

**Transition:** Match-cut the selected entry's name on the website back to the working project. This connects discovery to the result without another explanatory graphic.

### 4:30–4:45 · Leave a usable next step

**Screen:** The working starter beside the exact tested quickstart. Show where to find the catalog and the demonstrated stack.

**Narration:**

> Tell your agent what you want to build. It can find a shared starting point, explain why it fits, and get you to a project you can work on.

Hold the command and link long enough to read. Mention contributing a stack only if there is a usable contribution route to show.

## Motion graphics and transitions

Keep the motion graphics brief enough that most of the video is visibly working software. The six-second opener and two-second composition overlay are the only standalone explanatory animations planned. Other transitions connect recorded screens.

| Transition | Treatment | Purpose |
| --- | --- | --- |
| Product request to shortlist | Carry the request into a small caption | Keep the selection grounded in what the user asked for |
| Recommendation to scaffold command | Match the selected stack name across the cut | Make it clear the agent builds the stack it chose |
| Stack and fragments to brief | Two-second overlay over real files | Explain composition without scrolling through every file |
| Build to verification | Change a small state caption; show real output | Distinguish implementation from passing checks |
| Verification to Rho example | Direct cut with the project name retained | Connect a passing check to a runnable result |
| Website to finished project | Match the stack name again | Show the outcome of discovery |

For Claude Motion, prepare the intro and composition overlay as separate clips. Use the actual product typography and colors where available, with large text and quiet movement. Keep captions in the same positions across clips. Avoid spinning terminals, simulated typing and animated charts that could be mistaken for recorded results.

Cut on an action or result. Let important text settle before the next cut, and leave terminal output at normal speed when the viewer needs to read it. Music, if used, should stay below narration and never carry information the screen omits.

## What the agent should weigh

Start with fit: the kind of product, language or runtime constraints, required integrations and the developer's preferences. Then compare the evidence for the candidates that remain.

| Signal | How it helps |
| --- | --- |
| Stack purpose and requirements | Establish whether the stack fits the product |
| Usage and recent growth | Show which suitable stacks people are adopting |
| Dependency adoption and version trends | Inform preferences about the tools the project will use |
| Verification outcomes and sample size | Show how often observed projects reach passing checks |
| Time to green and failure patterns | Set expectations for setup effort |
| Source and contribution history | Let the developer inspect the recipe and how it has changed |

The recommendation should cite the evidence it used. Popularity can inform a decision without overriding an explicit requirement. Call a stack “battle-tested” only when the run history supports that description.

## Keep the Rho starter small

The request can describe an intended Rho-based product while the demo stops at its development foundation. The starter provides project structure, connection setup and a minimal example, with tests, lint and typechecking. Use an official SDK if verified for the chosen language; otherwise call it an API client.

A successful sandbox request in a command or small local page is enough. The developer should be able to open the example, change it and run its test immediately. Exclude charge thresholds, duplicate detection and application deployment.

If the Rho starter cannot complete reliably, use an already proven stack for the same discovery-and-build workflow. Track eligibility remains an organizer decision.

## What must work for this story

This pitch includes shared contributions and evidence-informed agent selection. The current plans only cover parts of that experience:

- The [registry index plan](../plans/phases/phase-4.0c-registry-index.md) serves the official registry and excludes third-party entries. Show an actual source or accepted contribution, and name the contribution route that exists. An open submission catalog is a product direction until implemented.
- The [stats presentation plan](../plans/phases/phase-4.2b-stats-in-cli-and-directory.md) gives agents stack statistics through `list --json` and `show --json`. The [browsing plan](../plans/phases/phase-4.2c-directory-browsing.md) has trending views, but its CLI ignores the trending field. [Dependency statistics](../plans/phases/phase-4.2e-dependency-trends-and-pages.md) are planned for the website, not the CLI. Capture the actual browser, CLI or API access the agent uses; a person viewing a chart does not demonstrate that the agent consulted it.
- The [handoff](../plans/HANDOFF.md) defers storage and telemetry until after the demo. Reconcile that scope with the demonstrated discovery features before recording. This outline does not change implementation status.

Choose the footage and narration to match the working system:

| Available evidence | Discovery scene | Website scene |
| --- | --- | --- |
| Working analytics with real observations | Agent reads available metrics and explains their bearing on its choice | Trace the same evidence and one useful dependency trend |
| Working analytics with sample data | Label the dataset throughout; show the agent using the actual pipeline's output | Demonstrate computation and browsing without claiming adoption |
| Catalog with bench evidence only | Agent compares descriptions, requirements and recorded bench results | Inspect the source and last run; describe usage trends as planned |

With only bench evidence, keep the discovery comparison but omit claims about popularity influencing it. Shorten the website scene to 30 seconds and use the rest for an edit and test in the completed starter, or finish early. This still demonstrates reuse of a shared starting point; it does not establish the full analytics-driven discovery experience.

Public metrics use finalized days and minimum samples. A just-completed demo run should not appear instantly in them. Keep sample data isolated from public telemetry and distinguish maintainer bench results from community observations.

A concrete example of improving a shared recipe is in the [Astro bench notes](../plans/runs/2026-10-27-astro-blog.md): earlier runs hit generator flag problems, and the stack was updated with the working invocation. If useful, show that finding alongside the current instruction and explain who made the correction. It is maintainer evidence, not a discovery by the analytics pipeline.

## What earns each judging criterion

| Criterion | Evidence in the submission |
| --- | --- |
| Technical execution and completeness | A product request leads to an explained stack choice, a fresh scaffold, passing checks and a working starter |
| Technical depth | Show data reaching the agent's selection, a composed requirement reaching its implementation, and a real changed-command refusal |
| Value and insight quality | Explain why one existing stack fits the request, using evidence a developer can inspect |
| Usability | Give the viewer a tested route from the catalog to a runnable project |
| Creativity and product feel | Connect shared recipes and adoption evidence to the agent's build workflow; keep transitions and screens readable |
| Performance | Report actual selection/setup time and interventions, separating CLI overhead from agent/build time |

A speedup claim needs a comparable bare-agent run using the same task, model and acceptance checks. Account for stack-authoring effort separately. Without that comparison, report measured elapsed time. Claims about scale need measured workloads.

The run report counts interventions from the agent's notes. Check that count against the recording. If time permits, have someone who did not author the stack follow the discovery and quickstart path and record where they needed help.

## Capture and deliver

Keep source footage of the complete workflow, including the agent's actual evidence reads and recommendation. Label acceleration, replayed footage and prebuilt projects. Preserve the connection between the selected stack, its composition and the project shown at the end.

Record the controlled changed-command example in a disposable copy, restore the command before rerunning, and label the cut back to the successful project.

Loom accepts externally recorded videos on paid Business, Business + AI and Enterprise roles. Uploads are unavailable on Starter and Business + AI trials. Assemble the clip in the editor, then use **New Video > Upload Video**. A practical export is 1080p at 30 fps, MP4 with H.264 video and AAC audio. See [upload requirements](https://support.atlassian.com/loom/docs/upload-or-import-videos/) and [workspace roles](https://support.atlassian.com/loom/docs/understand-workspaces-roles-and-permissions), checked October 27, 2026.

The event slide says to use Loom to record and submit, without explicitly addressing edited uploads. Confirm that point with the organizer before committing to the upload route. Direct recording in Loom remains the fallback; [Starter recordings have a five-minute limit](https://www.atlassian.com/software/loom/pricing). Allow processing time and check the final share link, audio and text legibility.

## Supporting material

At the live table, keep the catalog, agent session and completed project open. Let a judge inspect the choice, then rerun the checks and example. Keep a local recording available if connectivity fails.

Link to the demonstrated revision, stack source and generated example. Include reproduction commands and the code for composition and verification. If discovery analytics are part of the completed submission, give judges access to that implementation and its data instructions. The hosted code is in a private repository; arrange access through the organizer's accepted mechanism.

The supplied slide requires a GitHub link, project description and Loom video by **5 pm Thursday, October 29**, with 15–20 minutes needed to submit. Confirm the event timezone.

Before recording:

- Verify the selected entry can be obtained through the submitted quickstart.
- Rehearse the agent's discovery path and capture the evidence it actually uses.
- Reproduce the starter from a fresh directory, recording timings and any help needed.
- Choose the website footage supported by the working software and available records.
- Align [PITCH.md](PITCH.md) and [PREP.md](PREP.md), which still describe the old transaction-review demo. Reconcile the broader collaborative positioning with the problem statement and registry plans before implementation.
