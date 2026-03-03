/**
 * [INPUT]: 依赖 ../types 的 EditTool/TileType 与布局类型，依赖 constants 的 undo 上限与默认颜色
 * [OUTPUT]: 对外提供 EditorState 类与编辑状态变更 API
 * [POS]: office/editor 的状态容器层，被 useEditorActions/useEditorKeyboard/OfficeCanvas 共同驱动
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { EditTool, TileType } from '../types.js'
import type { TileType as TileTypeVal, OfficeLayout, FloorColor } from '../types.js'
import { UNDO_STACK_MAX_SIZE, DEFAULT_FLOOR_COLOR, DEFAULT_WALL_COLOR } from '../../constants.js'

export class EditorState {
  isEditMode = false
  activeTool: EditTool = EditTool.SELECT
  selectedTileType: TileTypeVal = TileType.FLOOR_1
  selectedFurnitureType: string = 'desk' // FurnitureType.DESK or asset ID

  // Floor color settings (applied to new tiles when painting)
  floorColor: FloorColor = { ...DEFAULT_FLOOR_COLOR }

  // Wall color settings (applied to new wall tiles when painting)
  wallColor: FloorColor = { ...DEFAULT_WALL_COLOR }

  // Tracks toggle direction during wall drag (true=adding walls, false=removing, null=undecided)
  wallDragAdding: boolean | null = null

  // Picked furniture color (copied by pick tool, applied on placement)
  pickedFurnitureColor: FloorColor | null = null

  // Ghost preview position
  ghostCol = -1
  ghostRow = -1
  ghostValid = false

  // Selection
  selectedFurnitureUid: string | null = null

  // Mouse drag state (tile paint)
  isDragging = false

  // Undo / Redo stacks
  undoStack: OfficeLayout[] = []
  redoStack: OfficeLayout[] = []

  // Dirty flag — true when layout differs from last save
  isDirty = false

  // Drag-to-move state
  dragUid: string | null = null
  dragStartCol = 0
  dragStartRow = 0
  dragOffsetCol = 0
  dragOffsetRow = 0
  isDragMoving = false

  setEditMode(next: boolean): void {
    this.isEditMode = next
  }

  setActiveTool(tool: EditTool): void {
    this.activeTool = tool
  }

  toggleTool(tool: EditTool): void {
    this.activeTool = this.activeTool === tool ? EditTool.SELECT : tool
  }

  setSelectedTileType(type: TileTypeVal): void {
    this.selectedTileType = type
  }

  setSelectedFurnitureType(type: string): void {
    this.selectedFurnitureType = type
  }

  clearSelectedFurnitureType(): void {
    this.selectedFurnitureType = ''
  }

  setFloorColor(color: FloorColor): void {
    this.floorColor = color
  }

  setWallColor(color: FloorColor): void {
    this.wallColor = color
  }

  setPickedFurnitureColor(color: FloorColor | null): void {
    this.pickedFurnitureColor = color
  }

  setWallDragAdding(next: boolean | null): void {
    this.wallDragAdding = next
  }

  setGhost(col: number, row: number, valid = false): void {
    this.ghostCol = col
    this.ghostRow = row
    this.ghostValid = valid
  }

  setSelectedFurnitureUid(uid: string | null): void {
    this.selectedFurnitureUid = uid
  }

  setDirty(isDirty: boolean): void {
    this.isDirty = isDirty
  }

  startStroke(): void {
    this.isDragging = true
  }

  endStroke(): void {
    this.isDragging = false
    this.wallDragAdding = null
  }

  setDragMoving(isMoving: boolean): void {
    this.isDragMoving = isMoving
  }

  pushUndo(layout: OfficeLayout): void {
    this.undoStack.push(layout)
    // Limit undo stack size
    if (this.undoStack.length > UNDO_STACK_MAX_SIZE) {
      this.undoStack.shift()
    }
  }

  popUndo(): OfficeLayout | null {
    return this.undoStack.pop() || null
  }

  pushRedo(layout: OfficeLayout): void {
    this.redoStack.push(layout)
    if (this.redoStack.length > UNDO_STACK_MAX_SIZE) {
      this.redoStack.shift()
    }
  }

  popRedo(): OfficeLayout | null {
    return this.redoStack.pop() || null
  }

  clearRedo(): void {
    this.redoStack = []
  }

  clearSelection(): void {
    this.selectedFurnitureUid = null
  }

  clearGhost(): void {
    this.ghostCol = -1
    this.ghostRow = -1
    this.ghostValid = false
  }

  startDrag(uid: string, startCol: number, startRow: number, offsetCol: number, offsetRow: number): void {
    this.dragUid = uid
    this.dragStartCol = startCol
    this.dragStartRow = startRow
    this.dragOffsetCol = offsetCol
    this.dragOffsetRow = offsetRow
    this.isDragMoving = false
  }

  clearDrag(): void {
    this.dragUid = null
    this.isDragMoving = false
  }

  reset(): void {
    this.activeTool = EditTool.SELECT
    this.selectedFurnitureUid = null
    this.ghostCol = -1
    this.ghostRow = -1
    this.ghostValid = false
    this.isDragging = false
    this.wallDragAdding = null
    this.undoStack = []
    this.redoStack = []
    this.isDirty = false
    this.dragUid = null
    this.isDragMoving = false
  }
}
