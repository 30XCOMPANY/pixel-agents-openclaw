#!/usr/bin/env bash
# [INPUT]: 可选 --json。
# [OUTPUT]: 调用 swarm status，输出 table/json。
# [POS]: 人工巡检入口薄包装。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
SWARM_BIN="${SWARM_BIN:-/Users/oogie/.openclaw/swarm-core/swarm}"

if [[ ! -x "$SWARM_BIN" ]]; then
  echo "ERROR: swarm binary not found or not executable: $SWARM_BIN" >&2
  exit 1
fi

FORMAT="table"
if [[ "${1:-}" == "--json" ]]; then
  FORMAT="json"
fi

exec "$SWARM_BIN" status --repo "$REPO_PATH" --format "$FORMAT"
