#!/usr/bin/env bash
# [INPUT]: 旧 run-agent 参数（已废弃）。
# [OUTPUT]: 失败并提示改用 spawn-agent.sh（由 swarm-core 统一调度）。
# [POS]: 兼容占位脚本，防止旧链路静默失效。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

echo "ERROR: run-agent.sh is deprecated. Use .openclaw/spawn-agent.sh instead." >&2
exit 1
