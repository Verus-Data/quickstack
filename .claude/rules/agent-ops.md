# Agent operations

A tracked file holds on any clone and for any maintainer: no absolute home paths, no machine-specific locations, no maintainer names. `.claude/hooks/guard-repo-content.ts` denies the common shapes; the gitignored `.claude/hooks/private-patterns.local` (one regex per line) can add local ones on a given machine.

Edit files with the Edit and Write tools, not `sed -i`, `perl -i` or a Python heredoc. Lint-on-write, typecheck-on-write, the boundary and secret guards and format-on-stop see only Edit and Write, so a shell edit skips every check; `guard-commands.ts` denies the shell forms.

A subagent sees none of this session's memory or conversation. Its brief carries every constraint it must honor (the first paragraph above whenever it writes repo files), names the files to read, and asks for the deliverable in a file under the scratchpad with the path in the hand-back, so an empty hand-back is a visible failure rather than lost work. Before reporting a delegated task done or stopping it, read its completion notification; a stopped agent's partial edits are reported as partial.

One review pass per deliverable: the architect agent or `ce:devils-advocate` on a plan, `ce:code-reviewer` on a diff. Apply the findings, run the gate and move on. Don't re-review the same document after fixes unless the user asks.
