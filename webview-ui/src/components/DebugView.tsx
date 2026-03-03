import type { ToolActivity } from '../office/types.js'
import type { AgentRuntimeInfo } from '../hooks/useExtensionMessages.js'
import { vscode } from '../vscodeApi.js'

interface DebugViewProps {
  agents: number[]
  selectedAgent: number | null
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  agentRuntime: Record<number, AgentRuntimeInfo>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  onSelectAgent: (id: number) => void
}

/** Z-index just below the floating toolbar (50) so the toolbar stays on top */
const DEBUG_Z = 40

function formatAgo(updatedAt: number): string {
  const deltaSec = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000))
  if (deltaSec < 60) return `${deltaSec}s`
  const mins = Math.floor(deltaSec / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h`
}

function ToolDot({ tool }: { tool: ToolActivity }) {
  return (
    <span
      className={tool.done ? undefined : 'pixel-agents-pulse'}
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: tool.done
          ? 'var(--pixel-status-done)'
          : tool.permissionWait
            ? 'var(--pixel-status-permission)'
            : 'var(--pixel-status-active)',
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}

function ToolLine({ tool }: { tool: ToolActivity }) {
  return (
    <span
      style={{
        fontSize: '22px',
        opacity: tool.done ? 0.5 : 0.8,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      <ToolDot tool={tool} />
      {tool.permissionWait && !tool.done ? 'Needs approval' : tool.status}
    </span>
  )
}

export function DebugView({
  agents,
  selectedAgent,
  agentTools,
  agentStatuses,
  agentRuntime,
  subagentTools,
  onSelectAgent,
}: DebugViewProps) {
  const renderAgentCard = (id: number) => {
    const isSelected = selectedAgent === id
    const tools = agentTools[id] || []
    const subs = subagentTools[id] || {}
    const status = agentStatuses[id]
    const runtime = agentRuntime[id]
    const hasActiveTools = tools.some((t) => !t.done)
    const title = runtime?.agentName || `Agent #${id}`
    const runtimeLine = typeof runtime?.activeSessionCount === 'number' && typeof runtime?.sessionCount === 'number'
      ? `${runtime.activeSessionCount}/${runtime.sessionCount} sessions${runtime.channel ? ` · ${runtime.channel}` : ''}`
      : (runtime?.channel || null)
    return (
      <div
        key={id}
        style={{
          border: `2px solid ${isSelected ? 'var(--pixel-accent)' : 'var(--pixel-border)'}`,
          borderRadius: 0,
          padding: '6px 8px',
          background: isSelected ? 'var(--pixel-active-bg)' : 'var(--pixel-surface)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
          <button
            onClick={() => onSelectAgent(id)}
            style={{
              borderRadius: 0,
              padding: '6px 10px',
              fontSize: '26px',
              color: isSelected ? '#fff' : 'var(--pixel-text)',
              background: isSelected ? 'var(--pixel-accent)' : 'var(--pixel-btn-bg)',
              border: '1px solid var(--pixel-border)',
              fontWeight: isSelected ? 'bold' : undefined,
            }}
          >
            {title}
          </button>
          <button
            onClick={() => vscode.postMessage({ type: 'closeAgent', id })}
            style={{
              borderRadius: 0,
              padding: '6px 8px',
              fontSize: '26px',
              opacity: 0.7,
              color: isSelected ? '#fff' : 'var(--pixel-text)',
              background: isSelected ? 'var(--pixel-accent)' : 'var(--pixel-btn-bg)',
              border: '1px solid var(--pixel-border)',
            }}
            title="Close agent"
          >
            ✕
          </button>
        </span>
        {runtimeLine && (
          <div style={{ fontSize: '18px', opacity: 0.75, marginTop: 4, paddingLeft: 2 }}>
            {runtimeLine}
          </div>
        )}
        {runtime?.sessions && runtime.sessions.length > 0 && (
          <div style={{ marginTop: 4, paddingLeft: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {runtime.sessions.slice(0, 6).map((session) => {
              const stateText = session.isApprovalWait
                ? 'approval-wait'
                : session.isActive
                  ? 'active'
                  : (session.isMentionStandby ? 'mention-only' : 'idle')
              const stateColor = session.isApprovalWait
                ? 'var(--pixel-status-permission)'
                : session.isActive
                  ? 'var(--pixel-status-active)'
                  : '#8a8a8a'
              return (
                <div
                  key={session.sessionId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: '16px',
                    opacity: 0.75,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: stateColor, flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap' }}>{session.channel}</span>
                  <span>{stateText}</span>
                  <span>· {formatAgo(session.updatedAt)}</span>
                </div>
              )
            })}
          </div>
        )}
        {(tools.length > 0 || status === 'waiting') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4, paddingLeft: 4 }}>
            {tools.map((tool) => (
              <div key={tool.toolId}>
                <ToolLine tool={tool} />
                {subs[tool.toolId] && subs[tool.toolId].length > 0 && (
                  <div
                    style={{
                      borderLeft: '2px solid var(--pixel-divider)',
                      marginLeft: 3,
                      paddingLeft: 8,
                      marginTop: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                    }}
                  >
                    {subs[tool.toolId].map((subTool) => (
                      <ToolLine key={subTool.toolId} tool={subTool} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {status === 'waiting' && !hasActiveTools && (
              <span
                style={{
                  fontSize: '22px',
                  opacity: 0.85,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--pixel-status-permission)',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                Might be waiting for input
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'var(--pixel-bg)',
        color: 'var(--pixel-text)',
        zIndex: DEBUG_Z,
        overflow: 'auto',
      }}
    >
      {/* Top padding so cards don't overlap the floating toolbar */}
      <div style={{ padding: '12px 12px 12px', fontSize: '28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agents.map(renderAgentCard)}
        </div>
      </div>
    </div>
  )
}
