/**
 * [INPUT]: 依赖 office/types 的布局与颜色类型
 * [OUTPUT]: 对外提供布局构建原语: createLayoutBuilder/fillRect/setTile/placeFurniture/buildLayout
 * [POS]: office/layout 的底层构建器层，被 layoutPresets 复用生成主题布局
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { FloorColor, OfficeLayout, PlacedFurniture, TileType as TileTypeVal } from '../types.js'

export interface LayoutBuilderState {
  cols: number
  rows: number
  tiles: TileTypeVal[]
  tileColors: Array<FloorColor | null>
  furniture: PlacedFurniture[]
}

export interface Rect {
  c0: number
  r0: number
  c1: number
  r1: number
}

function cloneColor(color: FloorColor | null): FloorColor | null {
  if (!color) return null
  return { ...color }
}

function indexOf(cols: number, col: number, row: number): number {
  return row * cols + col
}

/** Initialize a mutable layout builder with a single fill tile. */
export function createLayoutBuilder(
  cols: number,
  rows: number,
  fillTile: TileTypeVal,
): LayoutBuilderState {
  return {
    cols,
    rows,
    tiles: new Array(cols * rows).fill(fillTile),
    tileColors: new Array(cols * rows).fill(null),
    furniture: [],
  }
}

/** Set one tile when coordinates are in-bounds. */
export function setTile(
  draft: LayoutBuilderState,
  col: number,
  row: number,
  tile: TileTypeVal,
  color: FloorColor | null,
): void {
  if (col < 0 || col >= draft.cols || row < 0 || row >= draft.rows) return
  const i = indexOf(draft.cols, col, row)
  draft.tiles[i] = tile
  draft.tileColors[i] = cloneColor(color)
}

/** Fill a rectangle (inclusive bounds). */
export function fillRect(
  draft: LayoutBuilderState,
  rect: Rect,
  tile: TileTypeVal,
  color: FloorColor | null,
): void {
  for (let row = rect.r0; row <= rect.r1; row++) {
    for (let col = rect.c0; col <= rect.c1; col++) {
      setTile(draft, col, row, tile, color)
    }
  }
}

/** Add one placed furniture item. */
export function placeFurniture(
  draft: LayoutBuilderState,
  item: PlacedFurniture,
): void {
  draft.furniture.push({
    uid: item.uid,
    type: item.type,
    col: item.col,
    row: item.row,
    ...(item.color ? { color: { ...item.color } } : {}),
  })
}

/** Build immutable OfficeLayout snapshot. */
export function buildLayout(draft: LayoutBuilderState): OfficeLayout {
  return {
    version: 1,
    cols: draft.cols,
    rows: draft.rows,
    tiles: [...draft.tiles],
    tileColors: draft.tileColors.map((color) => cloneColor(color)),
    furniture: draft.furniture.map((item) => ({
      uid: item.uid,
      type: item.type,
      col: item.col,
      row: item.row,
      ...(item.color ? { color: { ...item.color } } : {}),
    })),
  }
}
