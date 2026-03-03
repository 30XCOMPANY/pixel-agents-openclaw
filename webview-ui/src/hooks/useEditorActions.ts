/**
 * [INPUT]: 依赖 OfficeState/EditorState 与 editorActions/editorHelpers 的纯变换能力，依赖 vscodeApi 持久化布局
 * [OUTPUT]: 对外提供 useEditorActions hook，暴露编辑模式全部命令与状态
 * [POS]: webview 编辑交互编排层，连接工具栏/键盘/画布三端行为
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState, useCallback, useRef } from 'react'
import type { OfficeState } from '../office/engine/officeState.js'
import type { EditorState } from '../office/editor/editorState.js'
import { EditTool } from '../office/types.js'
import { TileType } from '../office/types.js'
import type { OfficeLayout, EditTool as EditToolType, TileType as TileTypeVal, FloorColor } from '../office/types.js'
import {
  paintTile,
  removeFurniture,
  moveFurniture,
  duplicateFurniture,
  rotateFurniture,
  toggleFurnitureState,
} from '../office/editor/editorActions.js'
import { getRotatedType, getToggledType } from '../office/layout/furnitureCatalog.js'
import { createLayoutFromPreset } from '../office/layout/layoutPresets.js'
import type { LayoutPresetId } from '../office/layout/layoutPresets.js'
import {
  findFurnitureAtTile,
  expandLayoutToIncludeTile,
  shouldPushUndoForStroke,
  isBrushTool,
} from '../office/editor/editorHelpers.js'
import { runEditorToolAction } from '../office/editor/editorToolDispatch.js'
import { defaultZoom } from '../office/toolUtils.js'
import { vscode } from '../vscodeApi.js'
import { LAYOUT_SAVE_DEBOUNCE_MS, ZOOM_MIN, ZOOM_MAX } from '../constants.js'

export interface EditorActions {
  isEditMode: boolean
  editorTick: number
  isDirty: boolean
  zoom: number
  panRef: React.MutableRefObject<{ x: number; y: number }>
  saveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  setLastSavedLayout: (layout: OfficeLayout) => void
  handleOpenClaude: () => void
  handleToggleEditMode: () => void
  handleToolChange: (tool: EditToolType) => void
  handleTileTypeChange: (type: TileTypeVal) => void
  handleFloorColorChange: (color: FloorColor) => void
  handleWallColorChange: (color: FloorColor) => void
  handleSelectedFurnitureColorChange: (color: FloorColor | null) => void
  handleFurnitureTypeChange: (type: string) => void // FurnitureType enum or asset ID
  handleDeleteSelected: () => void
  handleDuplicateSelected: () => void
  handleNudgeSelected: (dx: number, dy: number) => void
  handleRotateSelected: () => void
  handleToggleState: () => void
  handleUndo: () => void
  handleRedo: () => void
  handleReset: () => void
  handleSave: () => void
  handleApplyLayoutPreset: (presetId: LayoutPresetId) => void
  handleZoomChange: (zoom: number) => void
  handleEditorTileAction: (col: number, row: number) => void
  handleEditorEraseAction: (col: number, row: number) => void
  handleEditorSelectionChange: () => void
  handleDragMove: (uid: string, newCol: number, newRow: number) => void
  handleEditorStrokeStart: () => void
  handleEditorStrokeEnd: () => void
}

function cloneColor(color: FloorColor): FloorColor {
  return { ...color }
}

export function useEditorActions(
  getOfficeState: () => OfficeState,
  editorState: EditorState,
): EditorActions {
  const [isEditMode, setIsEditMode] = useState(false)
  const [editorTick, setEditorTick] = useState(0)
  const [isDirty, setIsDirty] = useState(false)
  const [zoom, setZoom] = useState(defaultZoom)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panRef = useRef({ x: 0, y: 0 })
  const lastSavedLayoutRef = useRef<OfficeLayout | null>(null)
  const strokeActiveRef = useRef(false)
  const strokeUndoPushedRef = useRef(false)

  // Track one-time undo checkpoints for slider interactions
  const wallColorEditActiveRef = useRef(false)
  const colorEditUidRef = useRef<string | null>(null)

  const bumpEditorTick = useCallback(() => {
    setEditorTick((n) => n + 1)
  }, [])

  const setDirtyState = useCallback((dirty: boolean) => {
    editorState.setDirty(dirty)
    setIsDirty(dirty)
  }, [editorState])

  // Called by useExtensionMessages on layoutLoaded to set the initial checkpoint
  const setLastSavedLayout = useCallback((layout: OfficeLayout) => {
    lastSavedLayoutRef.current = structuredClone(layout)
  }, [])

  // Debounced layout save
  const saveLayout = useCallback((layout: OfficeLayout) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      vscode.postMessage({ type: 'saveLayout', layout })
    }, LAYOUT_SAVE_DEBOUNCE_MS)
  }, [])

  // Rebuild office state + persist layout. Optionally update dirty/tick flags.
  const rebuildAndPersist = useCallback((
    newLayout: OfficeLayout,
    opts?: { markDirty?: boolean; bumpTick?: boolean },
  ) => {
    const os = getOfficeState()
    os.rebuildFromLayout(newLayout)
    saveLayout(newLayout)
    if (opts?.markDirty ?? true) {
      setDirtyState(true)
    }
    if (opts?.bumpTick ?? true) {
      bumpEditorTick()
    }
  }, [getOfficeState, saveLayout, setDirtyState, bumpEditorTick])

  // Apply a layout edit: push undo, clear redo, rebuild state, save, mark dirty
  const applyEdit = useCallback((newLayout: OfficeLayout, opts?: { pushUndo?: boolean; undoLayout?: OfficeLayout }): boolean => {
    const os = getOfficeState()
    const current = os.getLayout()
    if (newLayout === current) return false

    const pushUndo = opts?.pushUndo ?? true
    if (pushUndo) {
      editorState.pushUndo(opts?.undoLayout ?? current)
      editorState.clearRedo()
    }

    rebuildAndPersist(newLayout, { markDirty: true, bumpTick: true })
    return true
  }, [getOfficeState, editorState, rebuildAndPersist])

  const applyStrokeAwareEdit = useCallback((
    oldLayout: OfficeLayout,
    newLayout: OfficeLayout,
    undoLayout?: OfficeLayout,
  ): boolean => {
    if (newLayout === oldLayout) return false

    const pushUndo = shouldPushUndoForStroke(
      strokeActiveRef.current,
      editorState.isDragging,
      strokeUndoPushedRef.current,
    )

    const changed = applyEdit(newLayout, { pushUndo, undoLayout })
    if (!changed) return false

    if (strokeActiveRef.current || editorState.isDragging) {
      strokeUndoPushedRef.current = true
    }

    return true
  }, [applyEdit, editorState])

  const selectFurnitureAtTile = useCallback((layout: OfficeLayout, col: number, row: number) => {
    const hit = findFurnitureAtTile(layout, col, row)
    editorState.setSelectedFurnitureUid(hit ? hit.uid : null)
    bumpEditorTick()
  }, [editorState, bumpEditorTick])

  const handleOpenClaude = useCallback(() => {
    vscode.postMessage({ type: 'openClaude' })
  }, [])

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => {
      const next = !prev
      editorState.setEditMode(next)

      if (!next) {
        editorState.clearSelection()
        editorState.clearGhost()
        editorState.clearDrag()
        wallColorEditActiveRef.current = false
        strokeActiveRef.current = false
        strokeUndoPushedRef.current = false
        return next
      }

      // Initialize wallColor from existing wall tiles so new walls match
      const os = getOfficeState()
      const layout = os.getLayout()
      if (!layout.tileColors) return next

      for (let i = 0; i < layout.tiles.length; i++) {
        const color = layout.tileColors[i]
        if (layout.tiles[i] !== TileType.WALL || !color) continue
        editorState.setWallColor(cloneColor(color))
        break
      }

      return next
    })
  }, [editorState, getOfficeState])

  const handleToolChange = useCallback((tool: EditToolType) => {
    editorState.toggleTool(tool)
    editorState.clearSelection()
    editorState.clearGhost()
    editorState.clearDrag()
    colorEditUidRef.current = null
    wallColorEditActiveRef.current = false
    bumpEditorTick()
  }, [editorState, bumpEditorTick])

  const handleTileTypeChange = useCallback((type: TileTypeVal) => {
    editorState.setSelectedTileType(type)
    bumpEditorTick()
  }, [editorState, bumpEditorTick])

  const handleFloorColorChange = useCallback((color: FloorColor) => {
    editorState.setFloorColor(color)
    bumpEditorTick()
  }, [editorState, bumpEditorTick])

  const handleWallColorChange = useCallback((color: FloorColor) => {
    editorState.setWallColor(color)

    const os = getOfficeState()
    const layout = os.getLayout()
    const existingColors = layout.tileColors || new Array(layout.tiles.length).fill(null)
    const newColors = [...existingColors]

    let changed = false
    for (let i = 0; i < layout.tiles.length; i++) {
      if (layout.tiles[i] !== TileType.WALL) continue
      newColors[i] = cloneColor(color)
      changed = true
    }

    if (changed) {
      if (!wallColorEditActiveRef.current) {
        editorState.pushUndo(layout)
        editorState.clearRedo()
        wallColorEditActiveRef.current = true
      }

      const newLayout = { ...layout, tileColors: newColors }
      rebuildAndPersist(newLayout, { markDirty: true, bumpTick: false })
    }

    bumpEditorTick()
  }, [editorState, getOfficeState, rebuildAndPersist, bumpEditorTick])

  const handleSelectedFurnitureColorChange = useCallback((color: FloorColor | null) => {
    const uid = editorState.selectedFurnitureUid
    if (!uid) return

    const os = getOfficeState()
    const layout = os.getLayout()

    if (colorEditUidRef.current !== uid) {
      editorState.pushUndo(layout)
      editorState.clearRedo()
      colorEditUidRef.current = uid
    }

    const newFurniture = layout.furniture.map((f) => (
      f.uid === uid
        ? { ...f, color: color ? cloneColor(color) : undefined }
        : f
    ))

    rebuildAndPersist({ ...layout, furniture: newFurniture }, { markDirty: true, bumpTick: true })
  }, [getOfficeState, editorState, rebuildAndPersist])

  const handleFurnitureTypeChange = useCallback((type: string) => {
    if (editorState.selectedFurnitureType === type) {
      editorState.clearSelectedFurnitureType()
      editorState.clearGhost()
    } else {
      editorState.setSelectedFurnitureType(type)
    }
    bumpEditorTick()
  }, [editorState, bumpEditorTick])

  const handleDeleteSelected = useCallback(() => {
    const uid = editorState.selectedFurnitureUid
    if (!uid) return

    const os = getOfficeState()
    const layout = os.getLayout()
    const newLayout = removeFurniture(layout, uid)
    if (newLayout === layout) return

    applyEdit(newLayout)
    editorState.clearSelection()
    colorEditUidRef.current = null
  }, [getOfficeState, editorState, applyEdit])

  const handleDuplicateSelected = useCallback(() => {
    const uid = editorState.selectedFurnitureUid
    if (!uid) return

    const os = getOfficeState()
    const layout = os.getLayout()
    const newLayout = duplicateFurniture(layout, uid)
    if (newLayout === layout) return

    applyEdit(newLayout)
    const last = newLayout.furniture[newLayout.furniture.length - 1]
    if (last) editorState.setSelectedFurnitureUid(last.uid)
    bumpEditorTick()
  }, [getOfficeState, editorState, applyEdit, bumpEditorTick])

  const handleNudgeSelected = useCallback((dx: number, dy: number) => {
    const uid = editorState.selectedFurnitureUid
    if (!uid) return

    const os = getOfficeState()
    const layout = os.getLayout()
    const item = layout.furniture.find((f) => f.uid === uid)
    if (!item) return

    const newLayout = moveFurniture(layout, uid, item.col + dx, item.row + dy)
    if (newLayout !== layout) {
      applyEdit(newLayout)
    }
  }, [getOfficeState, editorState, applyEdit])

  const handleRotateSelected = useCallback(() => {
    if (editorState.activeTool === EditTool.FURNITURE_PLACE) {
      const rotated = getRotatedType(editorState.selectedFurnitureType, 'cw')
      if (rotated) {
        editorState.setSelectedFurnitureType(rotated)
        bumpEditorTick()
      }
      return
    }

    const uid = editorState.selectedFurnitureUid
    if (!uid) return

    const os = getOfficeState()
    const newLayout = rotateFurniture(os.getLayout(), uid, 'cw')
    if (newLayout !== os.getLayout()) {
      applyEdit(newLayout)
    }
  }, [getOfficeState, editorState, applyEdit, bumpEditorTick])

  const handleToggleState = useCallback(() => {
    if (editorState.activeTool === EditTool.FURNITURE_PLACE) {
      const toggled = getToggledType(editorState.selectedFurnitureType)
      if (toggled) {
        editorState.setSelectedFurnitureType(toggled)
        bumpEditorTick()
      }
      return
    }

    const uid = editorState.selectedFurnitureUid
    if (!uid) return

    const os = getOfficeState()
    const newLayout = toggleFurnitureState(os.getLayout(), uid)
    if (newLayout !== os.getLayout()) {
      applyEdit(newLayout)
    }
  }, [getOfficeState, editorState, applyEdit, bumpEditorTick])

  const restoreFromHistory = useCallback((layout: OfficeLayout, pushCurrent: () => void) => {
    const os = getOfficeState()
    pushCurrent()
    os.rebuildFromLayout(layout)
    saveLayout(layout)
    setDirtyState(true)
    bumpEditorTick()
  }, [getOfficeState, saveLayout, setDirtyState, bumpEditorTick])

  const handleUndo = useCallback(() => {
    const prev = editorState.popUndo()
    if (!prev) return

    restoreFromHistory(prev, () => {
      const os = getOfficeState()
      editorState.pushRedo(os.getLayout())
    })
  }, [editorState, getOfficeState, restoreFromHistory])

  const handleRedo = useCallback(() => {
    const next = editorState.popRedo()
    if (!next) return

    restoreFromHistory(next, () => {
      const os = getOfficeState()
      editorState.pushUndo(os.getLayout())
    })
  }, [editorState, getOfficeState, restoreFromHistory])

  const handleReset = useCallback(() => {
    if (!lastSavedLayoutRef.current) return
    const saved = structuredClone(lastSavedLayoutRef.current)
    applyEdit(saved)
    editorState.reset()
    setDirtyState(false)
  }, [editorState, applyEdit, setDirtyState])

  const handleSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const os = getOfficeState()
    const layout = os.getLayout()
    lastSavedLayoutRef.current = structuredClone(layout)
    vscode.postMessage({ type: 'saveLayout', layout })
    setDirtyState(false)
  }, [getOfficeState, setDirtyState])

  const handleApplyLayoutPreset = useCallback((presetId: LayoutPresetId) => {
    const presetLayout = createLayoutFromPreset(presetId)
    const changed = applyEdit(presetLayout)
    if (!changed) return

    editorState.clearSelection()
    editorState.clearGhost()
    editorState.clearDrag()
    colorEditUidRef.current = null
    wallColorEditActiveRef.current = false
  }, [applyEdit, editorState])

  // Notify React that imperative editor selection changed (e.g., from OfficeCanvas mouseUp)
  const handleEditorSelectionChange = useCallback(() => {
    colorEditUidRef.current = null
    bumpEditorTick()
  }, [bumpEditorTick])

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom)))
  }, [])

  const handleDragMove = useCallback((uid: string, newCol: number, newRow: number) => {
    const os = getOfficeState()
    const layout = os.getLayout()
    const newLayout = moveFurniture(layout, uid, newCol, newRow)
    if (newLayout !== layout) {
      applyEdit(newLayout)
    }
  }, [getOfficeState, applyEdit])

  const handleEditorTileAction = useCallback((col: number, row: number) => {
    const os = getOfficeState()
    const sourceLayout = os.getLayout()
    let layout = sourceLayout
    let targetCol = col
    let targetRow = row

    // Handle ghost border expansion for floor/wall tools.
    if (editorState.activeTool === EditTool.TILE_PAINT || editorState.activeTool === EditTool.WALL_PAINT) {
      const expansion = expandLayoutToIncludeTile(layout, col, row)
      if (expansion) {
        layout = expansion.layout
        targetCol = expansion.col
        targetRow = expansion.row
        os.rebuildFromLayout(layout, expansion.shift)
      }
    }

    runEditorToolAction({
      editorState,
      layout,
      col: targetCol,
      row: targetRow,
      applyEdit: (newLayout) => applyEdit(newLayout, { undoLayout: sourceLayout }),
      applyStrokeAwareEdit: (oldLayout, newLayout) => applyStrokeAwareEdit(oldLayout, newLayout, sourceLayout),
      selectFurnitureAtTile,
      bumpEditorTick,
    })
  }, [getOfficeState, editorState, applyEdit, applyStrokeAwareEdit, bumpEditorTick, selectFurnitureAtTile])

  const handleEditorEraseAction = useCallback((col: number, row: number) => {
    const os = getOfficeState()
    const layout = os.getLayout()
    if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return

    const idx = row * layout.cols + col
    if (layout.tiles[idx] === TileType.VOID) return

    const newLayout = paintTile(layout, col, row, TileType.VOID)
    applyStrokeAwareEdit(layout, newLayout)
  }, [getOfficeState, applyStrokeAwareEdit])

  const handleEditorStrokeStart = useCallback(() => {
    strokeActiveRef.current = true
    strokeUndoPushedRef.current = false
    if (isBrushTool(editorState.activeTool)) {
      editorState.startStroke()
    }
  }, [editorState])

  const handleEditorStrokeEnd = useCallback(() => {
    strokeActiveRef.current = false
    strokeUndoPushedRef.current = false
    editorState.endStroke()
  }, [editorState])

  return {
    isEditMode,
    editorTick,
    isDirty,
    zoom,
    panRef,
    saveTimerRef,
    setLastSavedLayout,
    handleOpenClaude,
    handleToggleEditMode,
    handleToolChange,
    handleTileTypeChange,
    handleFloorColorChange,
    handleWallColorChange,
    handleSelectedFurnitureColorChange,
    handleFurnitureTypeChange,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleNudgeSelected,
    handleRotateSelected,
    handleToggleState,
    handleUndo,
    handleRedo,
    handleReset,
    handleSave,
    handleApplyLayoutPreset,
    handleZoomChange,
    handleEditorTileAction,
    handleEditorEraseAction,
    handleEditorSelectionChange,
    handleDragMove,
    handleEditorStrokeStart,
    handleEditorStrokeEnd,
  }
}
