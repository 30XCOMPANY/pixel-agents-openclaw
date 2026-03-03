#!/usr/bin/env bash
# [INPUT]: 项目目录，兼容旧清理入口参数。
# [OUTPUT]: 调用 swarm cleanup tick 清理终态任务资源。
# [POS]: cron 清理入口薄包装。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
SWARM_BIN="${SWARM_BIN:-/Users/oogie/.openclaw/swarm-core/swarm}"

if [[ ! -x "$SWARM_BIN" ]]; then
  echo "ERROR: swarm binary not found or not executable: $SWARM_BIN" >&2
  exit 1
fi

if [[ "${1:-}" == "--dry-run" ]]; then
  exec "$SWARM_BIN" status --repo "$REPO_PATH" --format table
fi

exec "$SWARM_BIN" cleanup tick --repo "$REPO_PATH"
