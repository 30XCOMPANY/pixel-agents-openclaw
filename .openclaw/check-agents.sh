#!/usr/bin/env bash
# [INPUT]: 项目目录，兼容旧巡检入口参数。
# [OUTPUT]: 调用 swarm monitor tick 执行确定性监控循环。
# [POS]: cron 入口薄包装。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
SWARM_BIN="${SWARM_BIN:-/Users/oogie/.openclaw/swarm-core/swarm}"

if [[ ! -x "$SWARM_BIN" ]]; then
  echo "ERROR: swarm binary not found or not executable: $SWARM_BIN" >&2
  exit 1
fi

exec "$SWARM_BIN" monitor tick --repo "$REPO_PATH"
