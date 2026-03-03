/**
 * [INPUT]: 依赖 OfficeState、Agent 列表、容器 ref 与画布视口参数
 * [OUTPUT]: 对外提供 AgentLabels 组件，用于渲染角色顶部标签与状态点
 * [POS]: 叠加层 UI，被 App 挂载在 OfficeCanvas 之上
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState, useEffect } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { SubagentCharacter } from '../hooks/useExtensionMessages.js'
import { TILE_SIZE, CharacterState } from '../office/types.js'

interface AgentLabelsProps {
  officeState: OfficeState
  agents: number[]
  agentStatuses: Record<number, string>
  containerRef: React.RefObject<HTMLDivElement | null>
  zoom: number
  panRef: React.RefObject<{ x: number; y: number }>
  subagentCharacters: SubagentCharacter[]
}

interface OverlayFrame {
  dpr: number
  deviceOffsetX: number
  deviceOffsetY: number
}

function buildFrame(
  officeState: OfficeState,
  containerRef: React.RefObject<HTMLDivElement | null>,
  zoom: number,
  panRef: React.RefObject<{ x: number; y: number }>,
): OverlayFrame | null {
  const el = containerRef.current
  if (!el) return null

  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const canvasW = Math.round(rect.width * dpr)
  const canvasH = Math.round(rect.height * dpr)
  const layout = officeState.getLayout()
  const mapW = layout.cols * TILE_SIZE * zoom
  const mapH = layout.rows * TILE_SIZE * zoom
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x)
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y)

  return { dpr, deviceOffsetX, deviceOffsetY }
}

export function AgentLabels({
  officeState,
  agents,
  agentStatuses,
  containerRef,
  zoom,
  panRef,
  subagentCharacters,
}: AgentLabelsProps) {
  const [frame, setFrame] = useState<OverlayFrame | null>(null)

  useEffect(() => {
    let rafId = 0

    const tick = () => {
      setFrame(buildFrame(officeState, containerRef, zoom, panRef))
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [officeState, containerRef, zoom, panRef])

  if (!frame) return null

  const { dpr, deviceOffsetX, deviceOffsetY } = frame

  // Build sub-agent label lookup
  const subLabelMap = new Map<number, string>()
  for (const sub of subagentCharacters) {
    subLabelMap.set(sub.id, sub.label)
  }

  // All character IDs to render labels for (regular agents + sub-agents)
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)]

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id)
        if (!ch) return null

        // Character position: device pixels → CSS pixels (follow sitting offset)
        const sittingOffset = ch.state === CharacterState.TYPE ? 6 : 0
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - 24) * zoom) / dpr

        const status = agentStatuses[id]
        const isWaiting = status === 'waiting'
        const isActive = ch.isActive
        const isSub = ch.isSubagent

        let dotColor = 'transparent'
        if (isWaiting) {
          dotColor = 'var(--pixel-status-permission)'
        } else if (isActive) {
          dotColor = 'var(--pixel-status-active)'
        }

        const labelText = subLabelMap.get(id) || `Agent #${id}`

        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY - 16,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 40,
            }}
          >
            {dotColor !== 'transparent' && (
              <span
                className={isActive && !isWaiting ? 'pixel-agents-pulse' : undefined}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor,
                  marginBottom: 2,
                }}
              />
            )}
            <span
              style={{
                fontSize: isSub ? '16px' : '18px',
                fontStyle: isSub ? 'italic' : undefined,
                color: 'var(--pixel-text)',
                background: 'var(--pixel-label-bg)',
                border: '1px solid var(--pixel-label-border)',
                textShadow: 'var(--pixel-label-shadow)',
                padding: '1px 4px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
                maxWidth: isSub ? 120 : undefined,
                overflow: isSub ? 'hidden' : undefined,
                textOverflow: isSub ? 'ellipsis' : undefined,
              }}
            >
              {labelText}
            </span>
          </div>
        )
      })}
    </>
  )
}
