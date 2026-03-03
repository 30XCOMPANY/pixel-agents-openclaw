#!/usr/bin/env bash
# [INPUT]: task-id，及可选 --cleanup。
# [OUTPUT]: 调用 swarm task kill；可选触发 cleanup tick。
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
DO_CLEANUP="${2:-}"

if [[ -z "$TASK_ID" ]]; then
  echo "Usage: .openclaw/kill-agent.sh <task-id> [--cleanup]" >&2
  exit 1
fi

"$SWARM_BIN" task kill --repo "$REPO_PATH" --task-id "$TASK_ID"

if [[ "$DO_CLEANUP" == "--cleanup" ]]; then
  "$SWARM_BIN" cleanup tick --repo "$REPO_PATH"
fi
