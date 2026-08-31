---
name: Workflow scanner stale-path failure
description: Distinguishes a Replit workflow-discovery RPC failure from an application startup or preview failure
---

Managed workflow listing/restart can fail before launching anything when its workspace scanner references a deleted temporary directory under `.local/secondary_skills/.tmp-*`. Recreating the directory in the live filesystem may not clear the scanner's cached reference.

**Why:** This failure is outside the YMS processes. The frontend and API can still start cleanly on their configured ports and the development domain can return the rendered application.

**How to apply:** If workflow RPC reports `Ripgrep exited with code 2` for a missing temporary skill path, verify the configured ports and development-domain response independently. Use the existing workflow commands as temporary background processes rather than changing application code or workflow configuration.