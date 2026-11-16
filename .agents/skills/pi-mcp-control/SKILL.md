---
name: pi-mcp-control
description: Maintain Pi MCP Control's profiles, per-call authorization, local state, and Pi-native configuration panel.
---

# Pi MCP Control

Use this specialization for work in the Pi MCP Control repository. The workspace catalog supplies common Harness procedures; this file records product behavior and safety limits from the local README, examples, policy implementation, and extension entry point.

## Product role and limits

- The extension mediates MCP tools available through Pi's own authorization pipeline. Pi remains the MCP client and owns native server configuration, credentials, and connections.
- This is not a sandbox. It does not cover shell tools or calls made outside Pi's MCP pipeline, and local HMAC records do not authenticate against another process with access to the same key.
- Preserve deny precedence, per-call approval for mutations, and fail-closed behavior. An allow grant never waives approval for a mutation.
- Do not grant credentials, copy credential values into profiles/examples/logs, or inspect live secret-bearing configuration while doing ordinary repository work.

## Authorization and server boundaries

- Defaults enable mediation, select `developer-readonly`, ask about unknown tools, fail closed for mutations, use strict `available` scope, and expire exception grants after 300 seconds.
- A task-scoped grant requires an active task. Grants are limited to their selected task/project scope; a deny outranks grants.
- `/mcpc connect` applies only to a server listed in `managedServers`; it does not install a server or make an arbitrary connection.
- `allow-exe` and `allow-host` widen project allowlists and require deliberate confirmation. Profile switching is a separate session action; it waits until Pi is idle and closes session grants. Revoking a grant narrows session access.
- The optional MCPHub catalog may read a previously verified `mcp_settings.json` only after consent. It reports names/transports and does not connect to servers.

## Configuration and local state

- In a trusted project, `mcpControl` is stored in `.pi/pi-suite.yaml`; profile examples are in `examples/mcp-profiles.yaml`. Untrusted projects use the global Pi Suite configuration instead of writing project settings.
- Do not inspect or modify the user's real project/global Pi settings, profile state, grants, or audit records during routine work. Use synthetic isolated fixtures and keep tests offline.
- Configuration and language edits are drafts until Ctrl+S. A failed save retains the draft. Escape from a submenu returns to the dashboard; at the root, the first Escape warns and the second discards unsaved changes.
- `/mcpc` with no arguments opens the Pi-native dashboard. Preserve the text fallback and direct commands for non-TUI contexts.

## Verification and design boundary

- The declared product test command is `npm test` (`node --test`). For context-only changes, use the focused local context test and `.harness/project.mjs verify`; do not rebuild or install the Pi extension unless product behavior changes.
- Use synthetic offline hosts. Do not invoke live MCP servers, models, network requests, or persistent Pi sessions for routine tests.
- Preserve the attribution/license notice for the included INTEIRO mark. This repository has no selected INTEIRO design-system role; shared Harness metadata does not imply adoption.
- Live Pi sessions, persistent user configuration, publishing, and remote effects need separate authorization.
