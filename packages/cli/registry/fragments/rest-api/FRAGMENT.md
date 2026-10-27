---
schema_version: 1
id: rest-api
kind: fragment
category: tooling
name: REST resource conventions
description: Agent rules for naming and shaping HTTP resources (plural nouns, methods and status codes, one resource shape, cursor pagination, versioning), independent of framework and layout, plus an AGENTS.md section recording the project's choices.
tags: [api, rest, http, conventions]
applies_to: [api]
decisions:
  - "Resource path prefix: /v1 (default), with health and the OpenAPI document outside it; or no version prefix for an internal API."
  - "Wrong method on a declared path: 405 with an Allow header where the router supports it, otherwise the same 404 as an undeclared path (default: whatever the stack's router does, recorded in AGENTS.md)."
---

# REST resource conventions

Agents name endpoints after the task in front of them (`/getUserData`, `/orders/create`), so an API drifts into verbs and synonyms. The shipped rule (`.claude/rules/rest-api.md`, and the matching Cursor rule and Codex and OpenCode skills) loads when API definitions, routes, handlers or schemas are open: plural domain nouns, the method says what happens, statuses from the project's one error table, one shape per resource, every list paginated. It is framework-neutral; the stack owns how a status or header is declared, where routes live, and the error envelope.

When you set up the first resource, check the rule against the installed framework (a 201 with `Location`, rejecting unknown query params without rejecting headers, a wrong method) and record what it does in AGENTS.md rather than editing the rule.

## AGENTS.md

Add a short **API conventions** section next to the architecture notes: the version prefix in use, the error envelope's shape, the pagination parameters (`limit`, `cursor`, the maximum page size), what a wrong method returns, and a pointer to the rule. Name one existing resource as the example to copy.
