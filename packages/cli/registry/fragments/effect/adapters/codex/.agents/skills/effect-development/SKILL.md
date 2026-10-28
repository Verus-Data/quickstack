---
name: effect-development
description: "Use before writing Effect code: fresh test layers, virtual time and installed API guidance."
---

Read [shared effect guidance](../../../docs/guidance/effect/index.md) before changes.

Keep the verified API reference in a separate project `effect` skill, generated from installed types. This development skill describes the workflow, not current signatures.

# Effect

When the project skill does not exist, use installed declarations first. After core compilation, create it and maintain it on upgrades as the shared guidance describes.

Use fresh test layers, observe forked failures, and drive time through the test clock. Keep runtime execution at program boundaries. Schema is part of `effect`, not a standalone dependency.
