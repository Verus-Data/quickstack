# R9. Follow-up work and explicit deferrals

None of this blocks submission. Each item starts only when its condition holds; give it
its own plan or phase file when it starts, and link it here.

| Pri | Work | Start condition | Exit |
| --- | --- | --- | --- |
| P1 | Scheduled canaries (`plans/phases/phase-5.1-scheduled-canary.md`) | An isolated runner and credentials are provisioned by the user | A scheduled run of a current recipe records proof and surfaces failures. Manual bench runs (R3's procedure) bridge the gap |
| P1 | Wider library proof | After R6 | Remaining bundled stacks proven in batches with R3's procedure, including the behavior check; recipe fixes feed R7's index |
| P1 | Search judgments review (phase 4.5a) | User time | The 47 judgments reviewed by the user; the golden set updated |
| P1 | Real `stacks update` (phase 4.4d) | The first patch release after R5 | On a machine with the R5 version installed globally by npm, `stacks update` moves it to the patch. 4.4d tested only a fake npm |
| P1 | Agent picker leftovers (phase 4.4c) | Next CLI release | The live Codex app link and Copilot's agent marker checked by hand |
| P1 | CI release and checks (phase 5.0, draft, not agreed) | The user agrees the phase | Both repositories already have `.github/workflows/ci.yml`; 5.0 decides release automation. Until then, releases follow R5 by hand |
| P1 | CI index build and deploy (phase 5.2, draft, not agreed) | R7 done and 5.0 agreed | The signed index builds and deploys from CI instead of the user's checkout, which removes R5 step 3's manual precondition |
| P1 | Worktree and branch cleanup | R0's inventory; after R6 | The user removes the worktrees and branches R0 listed as superseded |
| P2 | Dependency decision cohorts | The accepted directory RFC's separate data milestone | Producer-defined eligible populations, outside-default adoption, valid drop denominators. Never inferred from installed counts |
| P2 | Community contribution and third-party sources | External author demand plus the roadmap's trust requirements | An outside author can create and validate a recipe |
| P2 | Embeddings (4.5d), MCP (4.3), Workers (4.0f) | Their phase files' start conditions | Not needed for the CLI-led submission |

Out of scope for this plan: accounts, ratings, AI recommendation chat, automatic agent
execution, a comparison builder.
