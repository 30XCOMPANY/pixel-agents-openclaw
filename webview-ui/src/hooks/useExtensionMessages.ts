/**
 * [INPUT]: 依赖 OfficeState getter、通信层 vscodeApi 与布局/素材初始化工具，消费 OpenClaw 事件协议
 * [OUTPUT]: 对外提供 useExtensionMessages，基于 reducer 入口消费扩展消息并映射为前端状态
 * [POS]: Webview 数据接入层，连接后端事件流与画布/工具 UI，并统一事件协议与状态收敛
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect, useReducer, useRef } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { OfficeLayout, ToolActivity } from '../office/types.js'
import { extractToolName } from '../office/toolUtils.js'
import { migrateLayoutColors } from '../office/layout/layoutSerializer.js'
import { buildDynamicCatalog } from '../office/layout/furnitureCatalog.js'
import { setFloorSprites } from '../office/floorTiles.js'
import { setWallSprites } from '../office/wallTiles.js'
import { setCharacterTemplates } from '../office/sprites/spriteData.js'
import { vscode } from '../vscodeApi.js'
import { playDoneSound, setSoundEnabled } from '../notificationSound.js'

export interface SubagentCharacter {
  id: number
  parentAgentId: number
  parentToolId: string
  label: string
}

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  partOfGroup?: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
}

export interface ExtensionMessageState {
  agents: number[]
  selectedAgent: number | null
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  agentRuntime: Record<number, AgentRuntimeInfo>
  subagentTools: Record<number, Record<string, ToolActivity[]>>
  subagentCharacters: SubagentCharacter[]
  layoutReady: boolean
  loadedAssets?: { catalog: FurnitureAsset[]; sprites: Record<string, string[][]> }
}

type IncomingMessage = {
  type?: string
  [key: string]: unknown
}

interface ProtocolMessage extends IncomingMessage {
  type: string
  id?: number
  event_id?: string
  timestamp?: number
  agent_id?: number
  session_id?: string
}

export interface AgentRuntimeInfo {
  agentName?: string
  sessionId?: string
  sessionCount?: number
  activeSessionCount?: number
  mentionStandbyCount?: number
  approvalWaitCount?: number
  errorCount?: number
  channel?: string
  currentTask?: string
  status?: string
  sessions?: AgentSessionRuntimeInfo[]
  timestamp?: number
}

export interface AgentSessionRuntimeInfo {
  sessionId: string
  sessionKey: string
  updatedAt: number
  channel: string
  chatType: string
  isActive: boolean
  isMentionStandby: boolean
  isApprovalWait: boolean
  hasError: boolean
}

interface PendingAgent {
  id: number
  palette?: number
  hueShift?: number
  seatId?: string
  runtime?: AgentRuntimeInfo
}

interface ExtensionReducerState extends ExtensionMessageState {
  pendingAgents: PendingAgent[]
}

type ExtensionReducerAction = {
  type: 'apply'
  message: ProtocolMessage
  derivedSubagent?: SubagentCharacter
}

const initialExtensionState: ExtensionReducerState = {
  agents: [],
  selectedAgent: null,
  agentTools: {},
  agentStatuses: {},
  agentRuntime: {},
  subagentTools: {},
  subagentCharacters: [],
  layoutReady: false,
  loadedAssets: undefined,
  pendingAgents: [],
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function messageAgentId(msg: ProtocolMessage): number | null {
  const id = asNumber(msg.id)
  if (id !== null) return id
  return asNumber(msg.agent_id)
}

function readString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function readNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(obj[key])
    if (value !== null) return value
  }
  return undefined
}

function readBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const value = obj[key]
  return typeof value === 'boolean' ? value : undefined
}

function sanitizeSessionRuntime(value: unknown): AgentSessionRuntimeInfo | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const sessionId = readString(raw, 'sessionId')
  const sessionKey = readString(raw, 'sessionKey')
  const updatedAt = readNumber(raw, 'updatedAt')
  if (!sessionId || !sessionKey || typeof updatedAt !== 'number') return null
  return {
    sessionId,
    sessionKey,
    updatedAt,
    channel: readString(raw, 'channel') || 'unknown',
    chatType: readString(raw, 'chatType') || 'unknown',
    isActive: readBoolean(raw, 'isActive') === true,
    isMentionStandby: readBoolean(raw, 'isMentionStandby') === true,
    isApprovalWait: readBoolean(raw, 'isApprovalWait') === true,
    hasError: readBoolean(raw, 'hasError') === true,
  }
}

function readSessions(raw: Record<string, unknown>): AgentSessionRuntimeInfo[] | undefined {
  const sessions = raw.sessions
  if (!Array.isArray(sessions)) return undefined
  const parsed = sessions
    .map((item) => sanitizeSessionRuntime(item))
    .filter((item): item is AgentSessionRuntimeInfo => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return parsed
}

function getRuntimePatch(raw: Record<string, unknown>): AgentRuntimeInfo {
  const patch: AgentRuntimeInfo = {}
  const agentName = readString(raw, 'agentName', 'agent_name')
  const sessionId = readString(raw, 'sessionId', 'session_id')
  const channel = readString(raw, 'channel')
  const currentTask = readString(raw, 'currentTask')
  const status = readString(raw, 'status')
  const sessionCount = readNumber(raw, 'sessionCount')
  const activeSessionCount = readNumber(raw, 'activeSessionCount')
  const mentionStandbyCount = readNumber(raw, 'mentionStandbyCount')
  const approvalWaitCount = readNumber(raw, 'approvalWaitCount')
  const errorCount = readNumber(raw, 'errorCount')
  const sessions = readSessions(raw)
  const timestamp = readNumber(raw, 'timestamp')
  if (agentName) patch.agentName = agentName
  if (sessionId) patch.sessionId = sessionId
  if (typeof sessionCount === 'number') patch.sessionCount = sessionCount
  if (typeof activeSessionCount === 'number') patch.activeSessionCount = activeSessionCount
  if (typeof mentionStandbyCount === 'number') patch.mentionStandbyCount = mentionStandbyCount
  if (typeof approvalWaitCount === 'number') patch.approvalWaitCount = approvalWaitCount
  if (typeof errorCount === 'number') patch.errorCount = errorCount
  if (channel) patch.channel = channel
  if (currentTask) patch.currentTask = currentTask
  if (status) patch.status = status
  if (sessions) patch.sessions = sessions
  if (typeof timestamp === 'number') patch.timestamp = timestamp
  return patch
}

function hasRuntimePatch(patch: AgentRuntimeInfo): boolean {
  return Object.keys(patch).length > 0
}

function mergeRuntime(
  current: Record<number, AgentRuntimeInfo>,
  id: number,
  patch: AgentRuntimeInfo,
): Record<number, AgentRuntimeInfo> {
  if (!hasRuntimePatch(patch)) return current
  return {
    ...current,
    [id]: { ...(current[id] || {}), ...patch },
  }
}

function upsertAgentStatus(
  current: Record<number, string>,
  id: number,
  status: string | null,
): Record<number, string> {
  if (!status) return current
  if (status === 'active') {
    if (!(id in current)) return current
    const next = { ...current }
    delete next[id]
    return next
  }
  return { ...current, [id]: status }
}

function uniqueSorted(ids: number[]): number[] {
  return Array.from(new Set(ids)).sort((a, b) => a - b)
}

function mergePendingAgents(
  base: PendingAgent[],
  incoming: number[],
  meta: Record<number, { palette?: number; hueShift?: number; seatId?: string; [key: string]: unknown }>,
): PendingAgent[] {
  const seen = new Set(base.map((p) => p.id))
  const next = [...base]
  for (const id of incoming) {
    if (seen.has(id)) continue
    const m = meta[id]
    const runtime = m ? getRuntimePatch(m) : {}
    next.push({ id, palette: m?.palette, hueShift: m?.hueShift, seatId: m?.seatId, runtime })
    seen.add(id)
  }
  return next
}

function extensionStateReducer(state: ExtensionReducerState, action: ExtensionReducerAction): ExtensionReducerState {
  if (action.type !== 'apply') return state
  const msg = action.message

  if (msg.type === 'layoutLoaded') {
    return {
      ...state,
      layoutReady: true,
      pendingAgents: [],
    }
  }

  if (msg.type === 'agentCreated') {
    const id = messageAgentId(msg)
    if (id === null) return state
    const runtimePatch = getRuntimePatch(msg as Record<string, unknown>)
    return {
      ...state,
      agents: state.agents.includes(id) ? state.agents : [...state.agents, id],
      selectedAgent: id,
      agentRuntime: mergeRuntime(state.agentRuntime, id, runtimePatch),
      agentStatuses: upsertAgentStatus(state.agentStatuses, id, runtimePatch.status ?? null),
    }
  }

  if (msg.type === 'agentClosed') {
    const id = messageAgentId(msg)
    if (id === null) return state
    const nextAgentTools = { ...state.agentTools }
    const nextStatuses = { ...state.agentStatuses }
    const nextRuntime = { ...state.agentRuntime }
    const nextSubagentTools = { ...state.subagentTools }
    delete nextAgentTools[id]
    delete nextStatuses[id]
    delete nextRuntime[id]
    delete nextSubagentTools[id]
    return {
      ...state,
      agents: state.agents.filter((a) => a !== id),
      selectedAgent: state.selectedAgent === id ? null : state.selectedAgent,
      agentTools: nextAgentTools,
      agentStatuses: nextStatuses,
      agentRuntime: nextRuntime,
      subagentTools: nextSubagentTools,
      subagentCharacters: state.subagentCharacters.filter((s) => s.parentAgentId !== id),
    }
  }

  if (msg.type === 'existingAgents') {
    const incoming = Array.isArray(msg.agents)
      ? msg.agents.filter((id): id is number => typeof id === 'number')
      : []
    const meta = (msg.agentMeta || {}) as Record<number, { palette?: number; hueShift?: number; seatId?: string; [key: string]: unknown }>
    let nextRuntime = state.agentRuntime
    for (const id of incoming) {
      const runtimePatch = getRuntimePatch((meta[id] || {}) as Record<string, unknown>)
      nextRuntime = mergeRuntime(nextRuntime, id, runtimePatch)
    }
    if (!state.layoutReady) {
      return {
        ...state,
        agents: uniqueSorted([...state.agents, ...incoming]),
        agentRuntime: nextRuntime,
        pendingAgents: mergePendingAgents(state.pendingAgents, incoming, meta),
      }
    }
    return {
      ...state,
      agents: uniqueSorted([...state.agents, ...incoming]),
      agentRuntime: nextRuntime,
    }
  }

  if (msg.type === 'agentToolStart') {
    const id = messageAgentId(msg)
    const toolId = typeof msg.toolId === 'string' ? msg.toolId : null
    const status = typeof msg.status === 'string' ? msg.status : ''
    if (id === null || !toolId) return state
    const list = state.agentTools[id] || []
    if (list.some((t) => t.toolId === toolId)) return state
    return {
      ...state,
      agentTools: { ...state.agentTools, [id]: [...list, { toolId, status, done: false }] },
      subagentCharacters: action.derivedSubagent
        ? state.subagentCharacters.some((s) => s.id === action.derivedSubagent!.id)
          ? state.subagentCharacters
          : [...state.subagentCharacters, action.derivedSubagent]
        : state.subagentCharacters,
    }
  }

  if (msg.type === 'agentToolDone') {
    const id = messageAgentId(msg)
    const toolId = typeof msg.toolId === 'string' ? msg.toolId : null
    if (id === null || !toolId) return state
    const list = state.agentTools[id]
    if (!list) return state
    return {
      ...state,
      agentTools: {
        ...state.agentTools,
        [id]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
      },
    }
  }

  if (msg.type === 'agentToolsClear') {
    const id = messageAgentId(msg)
    if (id === null) return state
    const nextAgentTools = { ...state.agentTools }
    const nextSubagentTools = { ...state.subagentTools }
    delete nextAgentTools[id]
    delete nextSubagentTools[id]
    return {
      ...state,
      agentTools: nextAgentTools,
      subagentTools: nextSubagentTools,
      subagentCharacters: state.subagentCharacters.filter((s) => s.parentAgentId !== id),
    }
  }

  if (msg.type === 'agentSelected') {
    const id = messageAgentId(msg)
    if (id === null) return state
    return { ...state, selectedAgent: id }
  }

  if (msg.type === 'agentStatus') {
    const id = messageAgentId(msg)
    const status = typeof msg.status === 'string' ? msg.status : null
    if (id === null || !status) return state
    return {
      ...state,
      agentStatuses: upsertAgentStatus(state.agentStatuses, id, status),
      agentRuntime: mergeRuntime(state.agentRuntime, id, { status }),
    }
  }

  if (msg.type === 'agentSnapshot') {
    const id = messageAgentId(msg)
    if (id === null) return state
    const runtimePatch = getRuntimePatch(msg as Record<string, unknown>)
    return {
      ...state,
      agentRuntime: mergeRuntime(state.agentRuntime, id, runtimePatch),
      agentStatuses: upsertAgentStatus(state.agentStatuses, id, runtimePatch.status ?? null),
    }
  }

  if (msg.type === 'agentToolPermission') {
    const id = messageAgentId(msg)
    if (id === null) return state
    const list = state.agentTools[id]
    if (!list) return state
    return {
      ...state,
      agentTools: {
        ...state.agentTools,
        [id]: list.map((t) => (t.done ? t : { ...t, permissionWait: true })),
      },
    }
  }

  if (msg.type === 'agentToolPermissionClear') {
    const id = messageAgentId(msg)
    if (id === null) return state
    const list = state.agentTools[id]
    if (!list || !list.some((t) => t.permissionWait)) return state
    return {
      ...state,
      agentTools: {
        ...state.agentTools,
        [id]: list.map((t) => (t.permissionWait ? { ...t, permissionWait: false } : t)),
      },
    }
  }

  if (msg.type === 'subagentToolStart') {
    const id = messageAgentId(msg)
    const parentToolId = typeof msg.parentToolId === 'string' ? msg.parentToolId : null
    const toolId = typeof msg.toolId === 'string' ? msg.toolId : null
    const status = typeof msg.status === 'string' ? msg.status : ''
    if (id === null || !parentToolId || !toolId) return state
    const agentSubs = state.subagentTools[id] || {}
    const list = agentSubs[parentToolId] || []
    if (list.some((t) => t.toolId === toolId)) return state
    return {
      ...state,
      subagentTools: {
        ...state.subagentTools,
        [id]: { ...agentSubs, [parentToolId]: [...list, { toolId, status, done: false }] },
      },
    }
  }

  if (msg.type === 'subagentToolDone') {
    const id = messageAgentId(msg)
    const parentToolId = typeof msg.parentToolId === 'string' ? msg.parentToolId : null
    const toolId = typeof msg.toolId === 'string' ? msg.toolId : null
    if (id === null || !parentToolId || !toolId) return state
    const agentSubs = state.subagentTools[id]
    if (!agentSubs) return state
    const list = agentSubs[parentToolId]
    if (!list) return state
    return {
      ...state,
      subagentTools: {
        ...state.subagentTools,
        [id]: {
          ...agentSubs,
          [parentToolId]: list.map((t) => (t.toolId === toolId ? { ...t, done: true } : t)),
        },
      },
    }
  }

  if (msg.type === 'subagentClear') {
    const id = messageAgentId(msg)
    const parentToolId = typeof msg.parentToolId === 'string' ? msg.parentToolId : null
    if (id === null || !parentToolId) return state
    const agentSubs = state.subagentTools[id]
    if (!agentSubs || !(parentToolId in agentSubs)) return state
    const nextAgentSubs = { ...agentSubs }
    delete nextAgentSubs[parentToolId]
    const nextSubagentTools = { ...state.subagentTools }
    if (Object.keys(nextAgentSubs).length === 0) {
      delete nextSubagentTools[id]
    } else {
      nextSubagentTools[id] = nextAgentSubs
    }
    return {
      ...state,
      subagentTools: nextSubagentTools,
      subagentCharacters: state.subagentCharacters.filter(
        (s) => !(s.parentAgentId === id && s.parentToolId === parentToolId),
      ),
    }
  }

  if (msg.type === 'furnitureAssetsLoaded') {
    const catalog = Array.isArray(msg.catalog) ? (msg.catalog as FurnitureAsset[]) : []
    const sprites = (msg.sprites || {}) as Record<string, string[][]>
    return {
      ...state,
      loadedAssets: { catalog, sprites },
    }
  }

  return state
}

function normalizeIncomingMessage(rawMsg: unknown): ProtocolMessage | null {
  if (!rawMsg || typeof rawMsg !== 'object') return null
  const raw = rawMsg as Record<string, unknown>
  if (typeof raw.type !== 'string' || raw.type.length === 0) return null

  const normalized: ProtocolMessage = { ...raw, type: raw.type }
  const id = asNumber(raw.id)
  const agentId = asNumber(raw.agent_id)
  const timestamp = asNumber(raw.timestamp)
  if (id !== null) normalized.id = id
  else if (agentId !== null) normalized.id = agentId
  if (agentId !== null) normalized.agent_id = agentId
  if (timestamp !== null) normalized.timestamp = timestamp
  if (typeof raw.event_id === 'string') normalized.event_id = raw.event_id
  if (typeof raw.session_id === 'string') normalized.session_id = raw.session_id
  return normalized
}

function saveAgentSeats(os: OfficeState): void {
  const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {}
  for (const ch of os.characters.values()) {
    if (ch.isSubagent) continue
    seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId }
  }
  vscode.postMessage({ type: 'saveAgentSeats', seats })
}

export function useExtensionMessages(
  getOfficeState: () => OfficeState,
  onLayoutLoaded?: (layout: OfficeLayout) => void,
  isEditDirty?: () => boolean,
): ExtensionMessageState {
  const [state, dispatch] = useReducer(extensionStateReducer, initialExtensionState)
  const stateRef = useRef(state)
  const seenEventIdsRef = useRef<Set<string>>(new Set())
  const seenEventOrderRef = useRef<string[]>([])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const processMessage = (rawMsg: unknown) => {
      const msg = normalizeIncomingMessage(rawMsg)
      if (!msg) return
      if (msg.event_id) {
        if (seenEventIdsRef.current.has(msg.event_id)) return
        seenEventIdsRef.current.add(msg.event_id)
        seenEventOrderRef.current.push(msg.event_id)
        if (seenEventOrderRef.current.length > 2048) {
          const dropped = seenEventOrderRef.current.shift()
          if (dropped) seenEventIdsRef.current.delete(dropped)
        }
      }

      const os = getOfficeState()
      let derivedSubagent: SubagentCharacter | undefined

      if (msg.type === 'layoutLoaded') {
        // Skip external layout updates while editor has unsaved changes
        if (stateRef.current.layoutReady && isEditDirty?.()) {
          console.log('[Webview] Skipping external layout update — editor has unsaved changes')
          return
        }
        const rawLayout = msg.layout as OfficeLayout | null
        const layout = rawLayout && rawLayout.version === 1 ? migrateLayoutColors(rawLayout) : null
        if (layout) {
          os.rebuildFromLayout(layout)
          onLayoutLoaded?.(layout)
        } else {
          // Default layout — snapshot whatever OfficeState built
          onLayoutLoaded?.(os.getLayout())
        }
        // Add buffered agents now that layout (and seats) are correct
        for (const p of stateRef.current.pendingAgents) {
          os.addAgent(p.id, p.palette, p.hueShift, p.seatId, true)
          const isActive = p.runtime?.status === 'active' || (p.runtime?.activeSessionCount ?? 0) > 0
          os.setAgentActive(p.id, isActive)
        }
        dispatch({ type: 'apply', message: msg })
        if (os.characters.size > 0) {
          saveAgentSeats(os)
        }
      } else if (msg.type === 'agentCreated') {
        const id = messageAgentId(msg)
        if (id === null) return
        const palette = typeof msg.palette === 'number' ? (msg.palette as number) : undefined
        const hueShift = typeof msg.hueShift === 'number' ? (msg.hueShift as number) : undefined
        const seatId = typeof msg.seatId === 'string' ? (msg.seatId as string) : undefined
        os.addAgent(id, palette, hueShift, seatId)
        os.setAgentActive(id, msg.status === 'active')
        saveAgentSeats(os)
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'agentClosed') {
        const id = messageAgentId(msg)
        if (id === null) return
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id)
        os.removeAgent(id)
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'existingAgents') {
        const incoming = msg.agents as number[]
        const meta = (msg.agentMeta || {}) as Record<number, { palette?: number; hueShift?: number; seatId?: string; [key: string]: unknown }>
        // Before layout is ready, buffer and apply after layoutLoaded.
        // After layout is ready (SSE reconnect / server order differences), add immediately.
        if (stateRef.current.layoutReady) {
          const resolvedIncoming = Array.isArray(incoming)
            ? incoming.filter((id): id is number => typeof id === 'number')
            : []
          for (const id of resolvedIncoming) {
            const m = meta[id]
            os.addAgent(id, m?.palette, m?.hueShift, m?.seatId, true)
            const runtime = m ? getRuntimePatch(m as Record<string, unknown>) : {}
            const isActive = runtime.status === 'active' || (runtime.activeSessionCount ?? 0) > 0
            os.setAgentActive(id, isActive)
          }
          if (resolvedIncoming.length > 0) saveAgentSeats(os)
        }
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'agentToolStart') {
        const id = messageAgentId(msg)
        const toolId = typeof msg.toolId === 'string' ? (msg.toolId as string) : null
        const status = typeof msg.status === 'string' ? (msg.status as string) : ''
        if (id === null || !toolId) return
        const toolName = extractToolName(status)
        os.setAgentTool(id, toolName)
        os.setAgentActive(id, true)
        os.clearPermissionBubble(id)
        // Create sub-agent character for Task tool subtasks
        if (status.startsWith('Subtask:')) {
          const label = status.slice('Subtask:'.length).trim()
          const subId = os.addSubagent(id, toolId)
          derivedSubagent = { id: subId, parentAgentId: id, parentToolId: toolId, label }
        }
        dispatch({ type: 'apply', message: msg, derivedSubagent })
      } else if (msg.type === 'agentToolDone') {
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'agentToolsClear') {
        const id = messageAgentId(msg)
        if (id === null) return
        // Remove all sub-agent characters belonging to this agent
        os.removeAllSubagents(id)
        os.setAgentTool(id, null)
        os.clearPermissionBubble(id)
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'agentSelected') {
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'agentStatus') {
        const id = messageAgentId(msg)
        const status = typeof msg.status === 'string' ? (msg.status as string) : null
        if (id === null || !status) return
        os.setAgentActive(id, status === 'active')
        if (status === 'waiting') {
          os.showWaitingBubble(id)
          playDoneSound()
        }
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'agentSnapshot') {
        const id = messageAgentId(msg)
        if (id === null) return
        const runtime = getRuntimePatch(msg as Record<string, unknown>)
        const isActive = runtime.status === 'active' || (runtime.activeSessionCount ?? 0) > 0
        os.setAgentActive(id, isActive)
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'agentToolPermission') {
        const id = messageAgentId(msg)
        if (id === null) return
        os.showPermissionBubble(id)
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'subagentToolPermission') {
        const id = messageAgentId(msg)
        if (id === null) return
        const parentToolId = msg.parentToolId as string
        // Show permission bubble on the sub-agent character
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          os.showPermissionBubble(subId)
        }
      } else if (msg.type === 'agentToolPermissionClear') {
        const id = messageAgentId(msg)
        if (id === null) return
        os.clearPermissionBubble(id)
        // Also clear permission bubbles on all sub-agent characters of this parent
        for (const [subId, meta] of os.subagentMeta) {
          if (meta.parentAgentId === id) {
            os.clearPermissionBubble(subId)
          }
        }
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'subagentToolStart') {
        const id = messageAgentId(msg)
        const parentToolId = msg.parentToolId as string
        const status = msg.status as string
        dispatch({ type: 'apply', message: msg })
        // Update sub-agent character's tool and active state
        if (id === null) return
        const subId = os.getSubagentId(id, parentToolId)
        if (subId !== null) {
          const subToolName = extractToolName(status)
          os.setAgentTool(subId, subToolName)
          os.setAgentActive(subId, true)
        }
      } else if (msg.type === 'subagentToolDone') {
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'subagentClear') {
        const id = messageAgentId(msg)
        if (id === null) return
        const parentToolId = msg.parentToolId as string
        // Remove sub-agent character
        os.removeSubagent(id, parentToolId)
        dispatch({ type: 'apply', message: msg })
      } else if (msg.type === 'characterSpritesLoaded') {
        const characters = Array.isArray(msg.characters)
          ? (msg.characters as Array<{ down: string[][][]; up: string[][][]; right: string[][][] }>)
          : []
        if (characters.length > 0) {
          console.log(`[Webview] Received ${characters.length} pre-colored character sprites`)
          setCharacterTemplates(characters)
        } else {
          console.log('[Webview] No character sprites payload, using built-in fallback sprites')
        }
      } else if (msg.type === 'floorTilesLoaded') {
        const sprites = Array.isArray(msg.sprites) ? (msg.sprites as string[][][]) : null
        if (sprites && sprites.length > 0) {
          console.log(`[Webview] Received ${sprites.length} floor tile patterns`)
          setFloorSprites(sprites)
        } else {
          console.log('[Webview] No floor tile payload, using built-in fallback floor tile')
        }
      } else if (msg.type === 'wallTilesLoaded') {
        const sprites = Array.isArray(msg.sprites) ? (msg.sprites as string[][][]) : null
        if (sprites && sprites.length > 0) {
          console.log(`[Webview] Received ${sprites.length} wall tile sprites`)
          setWallSprites(sprites)
        } else {
          console.log('[Webview] No wall tile payload, using built-in fallback wall rendering')
        }
      } else if (msg.type === 'settingsLoaded') {
        const soundOn = msg.soundEnabled as boolean
        setSoundEnabled(soundOn)
      } else if (msg.type === 'furnitureAssetsLoaded') {
        try {
          const catalog = msg.catalog as FurnitureAsset[]
          const sprites = msg.sprites as Record<string, string[][]>
          console.log(`[Webview] Loaded ${catalog.length} furniture assets`)
          // Build dynamic catalog immediately so getCatalogEntry() works when layoutLoaded arrives next
          buildDynamicCatalog({ catalog, sprites })
          dispatch({ type: 'apply', message: { ...msg, catalog, sprites } })
        } catch (err) {
          console.error('[Webview] Error processing furnitureAssetsLoaded:', err)
        }
      }
    }

    // VS Code webview messages
    const windowHandler = (event: MessageEvent) => processMessage(event.data)
    window.addEventListener('message', windowHandler)

    // Browser SSE messages (OpenClaw mode)
    vscode.addMessageHandler(processMessage)

    vscode.postMessage({ type: 'webviewReady' })

    return () => {
      window.removeEventListener('message', windowHandler)
      vscode.removeMessageHandler(processMessage)
    }
  }, [getOfficeState, isEditDirty, onLayoutLoaded])

  return {
    agents: state.agents,
    selectedAgent: state.selectedAgent,
    agentTools: state.agentTools,
    agentStatuses: state.agentStatuses,
    agentRuntime: state.agentRuntime,
    subagentTools: state.subagentTools,
    subagentCharacters: state.subagentCharacters,
    layoutReady: state.layoutReady,
    loadedAssets: state.loadedAssets,
  }
}
