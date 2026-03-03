#!/usr/bin/env bash
# [INPUT]: 兼容旧脚本参数或简写描述，映射到 swarm task spawn。
# [OUTPUT]: 调用全局 swarm CLI 创建任务、worktree、tmux session。
# [POS]: 项目级薄包装入口；仅做参数适配，不承载业务逻辑。
# [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
SWARM_BIN="${SWARM_BIN:-/Users/oogie/.openclaw/swarm-core/swarm}"

usage() {
  cat <<'EOF'
Usage:
  .openclaw/spawn-agent.sh --id <task-id> --prompt "<text>" [--agent <auto|codex|claude|claudecode|opencode|gemini-cli>]
  .openclaw/spawn-agent.sh --id <task-id> --prompt-file <path> [--agent ...]
  .openclaw/spawn-agent.sh "<task description>" [codex|claude|claudecode|opencode|gemini-cli]
EOF
}

if [[ ! -x "$SWARM_BIN" ]]; then
  echo "ERROR: swarm binary not found or not executable: $SWARM_BIN" >&2
  exit 1
fi

lower() {
  echo "$1" | tr '[:upper:]' '[:lower:]'
}

DESCRIPTION=""
TASK_ID=""
PROMPT=""
PROMPT_FILE=""
DRIVER="auto"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 0 && "${1:-}" != -* ]]; then
  DESCRIPTION="$1"
  shift
  if [[ $# -gt 0 && "${1:-}" != -* ]]; then
    maybe_driver="$(lower "${1:-}")"
    case "$maybe_driver" in
      codex|claude|claudecode|opencode|gemini-cli|auto)
        DRIVER="$maybe_driver"
        shift
        ;;
    esac
  fi
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id|--task-id)
      TASK_ID="${2:-}"
      shift 2
      ;;
    --desc|--description)
      DESCRIPTION="${2:-}"
      shift 2
      ;;
    --agent|--driver)
      DRIVER="${2:-auto}"
      shift 2
      ;;
    --prompt)
      PROMPT="${2:-}"
      shift 2
      ;;
    --prompt-file)
      PROMPT_FILE="${2:-}"
      shift 2
      ;;
    --repo)
      REPO_PATH="${2:-$REPO_PATH}"
      shift 2
      ;;
    --model|--effort|--branch|--worktree|--session)
      shift 2
      ;;
    --no-notify|--notify)
      shift
      ;;
    *)
      if [[ -z "$DESCRIPTION" ]]; then
        DESCRIPTION="$1"
      fi
      shift
      ;;
  esac
done

DRIVER="$(lower "$DRIVER")"
case "$DRIVER" in
  claude)
    DRIVER="claudecode"
    ;;
  codex|claudecode|opencode|gemini-cli|auto)
    ;;
  *)
    DRIVER="auto"
    ;;
esac

if [[ -z "$TASK_ID" ]]; then
  base="${DESCRIPTION:-task}"
  slug="$(echo "$base" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-' | sed 's/^-*//; s/-*$//')"
  slug="${slug:0:48}"
  [[ -z "$slug" ]] && slug="task"
  TASK_ID="${slug}-$(date +%s)"
fi

if [[ -n "$PROMPT_FILE" ]]; then
  if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "ERROR: prompt file not found: $PROMPT_FILE" >&2
    exit 1
  fi
elif [[ -z "$PROMPT" ]]; then
  if [[ -n "$DESCRIPTION" ]]; then
    PROMPT="$DESCRIPTION"
  else
    echo "ERROR: prompt is required (--prompt or --prompt-file)" >&2
    exit 1
  fi
fi

"$SWARM_BIN" seed --repo "$REPO_PATH" >/dev/null

if [[ -n "$PROMPT_FILE" ]]; then
  exec "$SWARM_BIN" task spawn \
    --repo "$REPO_PATH" \
    --task-id "$TASK_ID" \
    --driver "$DRIVER" \
    --prompt-file "$PROMPT_FILE"
fi

exec "$SWARM_BIN" task spawn \
  --repo "$REPO_PATH" \
  --task-id "$TASK_ID" \
  --driver "$DRIVER" \
  --prompt "$PROMPT"
