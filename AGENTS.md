# pixel-agents-openclaw - OpenClaw Seeded Project

This repository is managed by OpenClaw swarm seeding for reusable multi-agent delivery workflows.

<directory>
.openclaw/ - Project thin control plane (seeded wrappers + SQLite state + compatibility projection)
.github/ - Project module
.vscode/ - Project module
.worktrees/ - Project module
scripts/ - Project module
src/ - Project module
webview-ui/ - Project module
</directory>

<config>
.gitignore - Project file
.vscodeignore - Project file
CLAUDE.md - Project file
CODE_OF_CONDUCT.md - Project file
CONTRIBUTORS.md - Project file
esbuild.js - Project file
eslint.config.mjs - Project file
icon.png - Project file
LICENSE - Project file
package-lock.json - Project file
</config>

Rules
- Keep project-specific behavior in code; keep orchestration behavior in `.openclaw/` wrappers and `swarm-core`.
- Treat `.openclaw/swarm.db` as task truth source and `active-tasks.json` as compatibility projection only.

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
