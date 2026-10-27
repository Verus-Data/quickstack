# Bench agent fixtures

Synthetic, redacted samples based on the documented headless wire formats, checked
2026-10-27. No sample was obtained by calling a model or using a real credential.

- Claude's single result object: [headless JSON output](https://code.claude.com/docs/en/headless#get-structured-output)
  and the `SDKResultMessage` success/error union in the
  [TypeScript Agent SDK reference](https://platform.claude.com/docs/en/agent-sdk/typescript).
  The error sample uses `error_max_turns`, not a made-up authentication subtype.
- Codex's JSONL events: [non-interactive output](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable).
  A successful invocation has one `turn.completed`; an error has `error` and `turn.failed`,
  with an error message rather than Claude's `subtype` field.
- Claude hook diagnostics: [hook debugging](https://code.claude.com/docs/en/hooks-guide#debug-techniques)
  documents `--debug-file`; the diagnostic lines are representative, not a stable public
  protocol. A configured hook is not evidence it ran. Duplicate executions and a personal
  hook exercise the distinction between shipped hooks and unrelated log entries.
- D24 auth: Claude uses `CLAUDE_CODE_OAUTH_TOKEN`; Codex uses `CODEX_ACCESS_TOKEN`, documented
  in [Codex environment variables](https://learn.chatgpt.com/docs/config-file/environment-variables#authentication-and-network).
  Only obviously fake token values are used.

`agent.cjs` is installed as `claude` and `codex` on the fixture PATH. Its adjacent JSON
configuration chooses a scenario without adding test-only environment variables to the
bench's child allowlist. Observations go outside the project so an infra scenario really
leaves the scaffold snapshot unchanged.
