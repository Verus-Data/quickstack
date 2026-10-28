# R9. Follow-up work and explicit deferrals

None of this blocks submission. Each item starts only when its condition holds; give it
its own plan or phase file when it starts, and link it here.

| Pri | Work | Start condition | Exit |
| --- | --- | --- | --- |
| P1 | Scheduled canaries (`plans/phases/phase-5.1-scheduled-canary.md`) | An isolated runner and credentials are provisioned by the user | A scheduled run of a current recipe records proof and surfaces failures. Manual bench runs (R3's procedure) bridge the gap |
| P1 | Wider library proof | After R6 | Remaining bundled stacks proven in batches with R3's procedure, including the behavior check; recipe fixes feed R7's index |
| P1 | Search judgments review (phase 4.5a) | User time | The 47 judgments reviewed by the user; the golden set updated |
| P1 | Worktree and branch cleanup | R0's inventory; after R6 | The user removes the worktrees and branches R0 listed as superseded |
| P2 | Dependency decision cohorts | The accepted directory RFC's separate data milestone | Producer-defined eligible populations, outside-default adoption, valid drop denominators. Never inferred from installed counts |
| P2 | Community contribution and third-party sources | External author demand plus the roadmap's trust requirements | An outside author can create and validate a recipe |
| P2 | Embeddings (4.5d), MCP (4.3), Workers (4.0f) | Their phase files' start conditions | Not needed for the CLI-led submission |

Out of scope for this plan: accounts, ratings, AI recommendation chat, automatic agent
execution, a comparison builder.
