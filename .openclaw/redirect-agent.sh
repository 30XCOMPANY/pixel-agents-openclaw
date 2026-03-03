#!/usr/bin/env bash
# [INPUT]: task-id 与纠偏消息。
# [OUTPUT]: 调用 swarm task redirect 把消息注入对应 tmux session。
# [POS]: 项目级兼容包装脚本。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
SWARM_BIN="${SWARM_BIN:-/Users/oogie/.openclaw/swarm-core/swarm}"

if [[ ! -x "$SWARM_BIN" ]]; then
  echo "ERROR: swarm binary not found or not executable: $SWARM_BIN" >&2
  exit 1
fi

TASK_ID="${1:-}"
MESSAGE="${2:-}"

if [[ -z "$TASK_ID" || -z "$MESSAGE" ]]; then
  echo "Usage: .openclaw/redirect-agent.sh <task-id> <message>" >&2
  exit 1
fi

exec "$SWARM_BIN" task redirect --repo "$REPO_PATH" --task-id "$TASK_ID" --message "$MESSAGE"
