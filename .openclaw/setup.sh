#!/usr/bin/env bash
# [INPUT]: 目标仓库路径（可选，默认当前脚本父目录）。
# [OUTPUT]: 调用 swarm seed 完成项目播种。
# [POS]: 兼容 setup 入口，统一切到全局播种机制。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_REPO="${1:-$DEFAULT_REPO}"
SWARM_BIN="${SWARM_BIN:-/Users/oogie/.openclaw/swarm-core/swarm}"

if [[ ! -x "$SWARM_BIN" ]]; then
  echo "ERROR: swarm binary not found or not executable: $SWARM_BIN" >&2
  exit 1
fi

exec "$SWARM_BIN" seed --repo "$TARGET_REPO"
