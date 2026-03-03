/**
 * [INPUT]: 依赖 EditorState、布局类型与 editorActions/editorHelpers 纯函数
 * [OUTPUT]: 对外提供 runEditorToolAction，按当前工具执行一次点击/拖拽编辑动作
 * [POS]: office/editor 的工具分发层，被 useEditorActions 调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { EditTool, TileType } from '../types.js'
import type { FloorColor, OfficeLayout } from '../types.js'
import type { EditorState } from './editorState.js'
import {
  paintTile,
  placeFurniture,
  canPlaceFurniture,
  getWallPlacementRow,
} from './editorActions.js'
import { createPlacedFurniture, findFurnitureAtTile } from './editorHelpers.js'

export interface EditorToolDispatchContext {
  editorState: EditorState
  layout: OfficeLayout
  col: number
  row: number
  applyEdit: (newLayout: OfficeLayout) => boolean
  applyStrokeAwareEdit: (oldLayout: OfficeLayout, newLayout: OfficeLayout) => boolean
  selectFurnitureAtTile: (layout: OfficeLayout, col: number, row: number) => void
  bumpEditorTick: () => void
}

function cloneColor(color: FloorColor): FloorColor {
  return { ...color }
}

export function runEditorToolAction({
  editorState,
  layout,
  col,
  row,
  applyEdit,
  applyStrokeAwareEdit,
  selectFurnitureAtTile,
  bumpEditorTick,
}: EditorToolDispatchContext): void {
  switch (editorState.activeTool) {
    case EditTool.TILE_PAINT: {
      const next = paintTile(layout, col, row, editorState.selectedTileType, editorState.floorColor)
      applyStrokeAwareEdit(layout, next)
      return
    }

    case EditTool.WALL_PAINT: {
      const idx = row * layout.cols + col
      const isWall = layout.tiles[idx] === TileType.WALL

      if (editorState.wallDragAdding === null) {
        editorState.setWallDragAdding(!isWall)
      }

      if (editorState.wallDragAdding) {
        const next = paintTile(layout, col, row, TileType.WALL, editorState.wallColor)
        applyStrokeAwareEdit(layout, next)
        return
      }

      if (isWall) {
        const next = paintTile(layout, col, row, editorState.selectedTileType, editorState.floorColor)
        applyStrokeAwareEdit(layout, next)
      }
      return
    }

    case EditTool.ERASE: {
      if (col < 0 || col >= layout.cols || row < 0 || row >= layout.rows) return
      const idx = row * layout.cols + col
      if (layout.tiles[idx] === TileType.VOID) return

      const next = paintTile(layout, col, row, TileType.VOID)
      applyStrokeAwareEdit(layout, next)
      return
    }

    case EditTool.FURNITURE_PLACE: {
      const type = editorState.selectedFurnitureType
      if (type === '') {
        selectFurnitureAtTile(layout, col, row)
        return
      }

      const placementRow = getWallPlacementRow(type, row)
      if (!canPlaceFurniture(layout, type, col, placementRow)) return

      const placed = createPlacedFurniture(type, col, placementRow, editorState.pickedFurnitureColor)
      const next = placeFurniture(layout, placed)
      if (next !== layout) {
        applyEdit(next)
      }
      return
    }

    case EditTool.FURNITURE_PICK: {
      const hit = findFurnitureAtTile(layout, col, row)
      if (hit) {
        editorState.setSelectedFurnitureType(hit.type)
        editorState.setPickedFurnitureColor(hit.color ? cloneColor(hit.color) : null)
        editorState.setActiveTool(EditTool.FURNITURE_PLACE)
      }
      bumpEditorTick()
      return
    }

    case EditTool.EYEDROPPER: {
      const idx = row * layout.cols + col
      const tile = layout.tiles[idx]

      if (tile !== undefined && tile !== TileType.WALL && tile !== TileType.VOID) {
        editorState.setSelectedTileType(tile)
        const color = layout.tileColors?.[idx]
        if (color) editorState.setFloorColor(cloneColor(color))
        editorState.setActiveTool(EditTool.TILE_PAINT)
        bumpEditorTick()
        return
      }

      if (tile === TileType.WALL) {
        const color = layout.tileColors?.[idx]
        if (color) editorState.setWallColor(cloneColor(color))
        editorState.setActiveTool(EditTool.WALL_PAINT)
        bumpEditorTick()
      }
      return
    }

    case EditTool.SELECT:
      selectFurnitureAtTile(layout, col, row)
      return

    default:
      return
  }
}
