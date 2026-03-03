/**
 * [INPUT]: 依赖 ../types 的 OfficeLayout/PlacedFurniture/FloorColor，依赖 ../layout/furnitureCatalog 的 getCatalogEntry，依赖 ./editorActions 的 expandLayout
 * [OUTPUT]: 对外提供编辑辅助函数: findFurnitureAtTile、expandLayoutToIncludeTile、createPlacedFurniture、shouldPushUndoForStroke、isBrushTool
 * [POS]: office/editor 的纯函数工具层，被 useEditorActions 与 OfficeCanvas 复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { OfficeLayout, PlacedFurniture, FloorColor } from '../types.js'
import { EditTool } from '../types.js'
import { getCatalogEntry } from '../layout/furnitureCatalog.js'
import { expandLayout } from './editorActions.js'
import type { ExpandDirection } from './editorActions.js'
import { createFurnitureUid } from './furnitureUid.js'

export interface ExpandedLayoutResult {
  layout: OfficeLayout
  col: number
  row: number
  shift: { col: number; row: number }
}

/** Find top-most furniture at tile. Surface items are preferred over desks. */
export function findFurnitureAtTile(layout: OfficeLayout, col: number, row: number): PlacedFurniture | null {
  let hit: PlacedFurniture | null = null
  for (const f of layout.furniture) {
    const entry = getCatalogEntry(f.type)
    if (!entry) continue
    const inside = col >= f.col && col < f.col + entry.footprintW && row >= f.row && row < f.row + entry.footprintH
    if (!inside) continue
    if (!hit || entry.canPlaceOnSurfaces) hit = f
  }
  return hit
}

/** Expand layout to include an out-of-bounds tile (ghost border editing). */
export function expandLayoutToIncludeTile(layout: OfficeLayout, col: number, row: number): ExpandedLayoutResult | null {
  if (col >= 0 && col < layout.cols && row >= 0 && row < layout.rows) return null

  const directions: ExpandDirection[] = []
  if (col < 0) directions.push('left')
  if (col >= layout.cols) directions.push('right')
  if (row < 0) directions.push('up')
  if (row >= layout.rows) directions.push('down')

  let current = layout
  let totalShiftCol = 0
  let totalShiftRow = 0
  for (const dir of directions) {
    const result = expandLayout(current, dir)
    if (!result) return null
    current = result.layout
    totalShiftCol += result.shift.col
    totalShiftRow += result.shift.row
  }

  return {
    layout: current,
    col: col + totalShiftCol,
    row: row + totalShiftRow,
    shift: { col: totalShiftCol, row: totalShiftRow },
  }
}

/** Build placed furniture payload for insert actions. */
export function createPlacedFurniture(
  type: string,
  col: number,
  row: number,
  color: FloorColor | null,
): PlacedFurniture {
  const base: PlacedFurniture = { uid: createFurnitureUid(), type, col, row }
  if (!color) return base
  return { ...base, color: { ...color } }
}

/** Stroke-aware undo policy: one drag stroke should create one undo step. */
export function shouldPushUndoForStroke(
  strokeActive: boolean,
  isDragging: boolean,
  undoAlreadyPushed: boolean,
): boolean {
  const inStroke = strokeActive || isDragging
  if (!inStroke) return true
  return !undoAlreadyPushed
}

/** Brush tools share drag-paint semantics and ghost-border expansion behavior. */
export function isBrushTool(tool: EditTool): boolean {
  return tool === EditTool.TILE_PAINT || tool === EditTool.WALL_PAINT || tool === EditTool.ERASE
}
