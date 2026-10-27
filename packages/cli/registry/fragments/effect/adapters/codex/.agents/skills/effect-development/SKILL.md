---
name: effect-development
description: "Use before writing Effect code: fresh test layers, virtual time and installed API guidance."
---

Keep the verified API reference in a separate project `effect` skill, generated from installed types. This development skill describes the workflow, not current signatures.

# Effect

Load the project's Effect skill before writing Effect code or looking up its APIs. Check the installed package's type declarations when documentation disagrees. Keep the skill current when dependencies change; do not copy examples from a different major.

Use fresh test layers, observe forked failures, and drive time through the test clock. Keep runtime execution at program boundaries. Schema is part of `effect`, not a standalone dependency.
