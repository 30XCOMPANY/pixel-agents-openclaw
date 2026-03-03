/**
 * [INPUT]: 依赖 office/types 与 layoutBuilder 原语，依赖 FurnitureType 定义家具类型
 * [OUTPUT]: 对外提供布局模板系统: getLayoutPresetOptions/createLayoutFromPreset/createDefaultLayoutPreset
 * [POS]: office/layout 的主题模板层，统一管理 severance 与 stardew 风格生成
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { FurnitureType, TileType } from '../types.js'
import type { FloorColor, OfficeLayout, PlacedFurniture } from '../types.js'
import { buildLayout, createLayoutBuilder, fillRect, placeFurniture } from './layoutBuilder.js'

interface LayoutPresetDefinition {
  id: string
  label: string
  description: string
  create: () => OfficeLayout
}

export interface LayoutPresetOption {
  id: LayoutPresetId
  label: string
  description: string
}

const SEVERANCE_COLORS = {
  corridor: { h: 202, s: 18, b: 34, c: 10 } as FloorColor,
  workPod: { h: 196, s: 16, b: 28, c: 8 } as FloorColor,
  lounge: { h: 186, s: 22, b: 18, c: 12 } as FloorColor,
  meeting: { h: 42, s: 12, b: 24, c: 0 } as FloorColor,
}

const STARDEW_COLORS = {
  road: { h: 34, s: 34, b: 12, c: 4 } as FloorColor,
  workshop: { h: 24, s: 26, b: 18, c: 4 } as FloorColor,
  greenhouse: { h: 110, s: 32, b: 0, c: 8 } as FloorColor,
  tavern: { h: 12, s: 28, b: 10, c: 6 } as FloorColor,
  lab: { h: 188, s: 12, b: 8, c: 8 } as FloorColor,
  field: { h: 30, s: 40, b: 2, c: 12 } as FloorColor,
}

function placeFurnitureBatch(
  draft: ReturnType<typeof createLayoutBuilder>,
  items: PlacedFurniture[],
): void {
  for (const item of items) {
    placeFurniture(draft, item)
  }
}

function createSeveranceLayout(): OfficeLayout {
  const draft = createLayoutBuilder(24, 14, TileType.WALL)

  // Main circulation
  fillRect(draft, { c0: 1, r0: 6, c1: 22, r1: 7 }, TileType.FLOOR_1, SEVERANCE_COLORS.corridor)
  fillRect(draft, { c0: 11, r0: 1, c1: 12, r1: 12 }, TileType.FLOOR_1, SEVERANCE_COLORS.corridor)
  fillRect(draft, { c0: 9, r0: 1, c1: 14, r1: 2 }, TileType.FLOOR_1, SEVERANCE_COLORS.corridor)
  fillRect(draft, { c0: 9, r0: 11, c1: 14, r1: 12 }, TileType.FLOOR_1, SEVERANCE_COLORS.corridor)

  // Department pods
  fillRect(draft, { c0: 2, r0: 2, c1: 9, r1: 5 }, TileType.FLOOR_2, SEVERANCE_COLORS.workPod)
  fillRect(draft, { c0: 14, r0: 2, c1: 21, r1: 5 }, TileType.FLOOR_2, SEVERANCE_COLORS.workPod)
  fillRect(draft, { c0: 2, r0: 8, c1: 9, r1: 11 }, TileType.FLOOR_3, SEVERANCE_COLORS.lounge)
  fillRect(draft, { c0: 14, r0: 8, c1: 21, r1: 11 }, TileType.FLOOR_4, SEVERANCE_COLORS.meeting)

  // Connectors
  fillRect(draft, { c0: 10, r0: 4, c1: 10, r1: 5 }, TileType.FLOOR_1, SEVERANCE_COLORS.corridor)
  fillRect(draft, { c0: 13, r0: 4, c1: 13, r1: 5 }, TileType.FLOOR_1, SEVERANCE_COLORS.corridor)
  fillRect(draft, { c0: 10, r0: 9, c1: 10, r1: 10 }, TileType.FLOOR_1, SEVERANCE_COLORS.corridor)
  fillRect(draft, { c0: 13, r0: 9, c1: 13, r1: 10 }, TileType.FLOOR_1, SEVERANCE_COLORS.corridor)

  placeFurnitureBatch(draft, [
    { uid: 'whiteboard-main', type: FurnitureType.WHITEBOARD, col: 9, row: 0 },
    { uid: 'bookshelf-left', type: FurnitureType.BOOKSHELF, col: 1, row: 2 },
    { uid: 'bookshelf-right', type: FurnitureType.BOOKSHELF, col: 18, row: 2 },
    { uid: 'desk-l1', type: FurnitureType.DESK, col: 3, row: 2 },
    { uid: 'desk-l2', type: FurnitureType.DESK, col: 6, row: 2 },
    { uid: 'desk-l3', type: FurnitureType.DESK, col: 3, row: 6 },
    { uid: 'desk-l4', type: FurnitureType.DESK, col: 6, row: 6 },
    { uid: 'desk-r1', type: FurnitureType.DESK, col: 12, row: 2 },
    { uid: 'desk-r2', type: FurnitureType.DESK, col: 15, row: 2 },
    { uid: 'desk-r3', type: FurnitureType.DESK, col: 12, row: 6 },
    { uid: 'desk-r4', type: FurnitureType.DESK, col: 15, row: 6 },
    { uid: 'chair-l1', type: FurnitureType.CHAIR, col: 3, row: 1 },
    { uid: 'chair-l2', type: FurnitureType.CHAIR, col: 7, row: 1 },
    { uid: 'chair-l3', type: FurnitureType.CHAIR, col: 4, row: 8 },
    { uid: 'chair-l4', type: FurnitureType.CHAIR, col: 7, row: 8 },
    { uid: 'chair-r1', type: FurnitureType.CHAIR, col: 12, row: 1 },
    { uid: 'chair-r2', type: FurnitureType.CHAIR, col: 16, row: 1 },
    { uid: 'chair-r3', type: FurnitureType.CHAIR, col: 13, row: 8 },
    { uid: 'chair-r4', type: FurnitureType.CHAIR, col: 16, row: 8 },
    { uid: 'cooler-main', type: FurnitureType.COOLER, col: 10, row: 9 },
    { uid: 'pc-left', type: FurnitureType.PC, col: 4, row: 3 },
    { uid: 'pc-right', type: FurnitureType.PC, col: 13, row: 3 },
    { uid: 'lamp-left', type: FurnitureType.LAMP, col: 6, row: 7 },
    { uid: 'lamp-right', type: FurnitureType.LAMP, col: 15, row: 7 },
    { uid: 'plant-nw', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'plant-ne', type: FurnitureType.PLANT, col: 18, row: 1 },
    { uid: 'plant-sw', type: FurnitureType.PLANT, col: 1, row: 9 },
    { uid: 'plant-se', type: FurnitureType.PLANT, col: 18, row: 9 },
  ])

  return buildLayout(draft)
}

function createStardewLayout(): OfficeLayout {
  const draft = createLayoutBuilder(28, 18, TileType.WALL)

  // Village roads
  fillRect(draft, { c0: 1, r0: 8, c1: 26, r1: 9 }, TileType.FLOOR_4, STARDEW_COLORS.road)
  fillRect(draft, { c0: 13, r0: 1, c1: 14, r1: 16 }, TileType.FLOOR_4, STARDEW_COLORS.road)
  fillRect(draft, { c0: 11, r0: 7, c1: 16, r1: 10 }, TileType.FLOOR_1, STARDEW_COLORS.road)

  // Blocks
  fillRect(draft, { c0: 2, r0: 2, c1: 10, r1: 6 }, TileType.FLOOR_2, STARDEW_COLORS.workshop) // workshop
  fillRect(draft, { c0: 17, r0: 2, c1: 25, r1: 6 }, TileType.FLOOR_5, STARDEW_COLORS.greenhouse) // greenhouse
  fillRect(draft, { c0: 2, r0: 11, c1: 10, r1: 15 }, TileType.FLOOR_3, STARDEW_COLORS.tavern) // tavern
  fillRect(draft, { c0: 17, r0: 11, c1: 25, r1: 15 }, TileType.FLOOR_6, STARDEW_COLORS.lab) // lab
  fillRect(draft, { c0: 2, r0: 7, c1: 8, r1: 9 }, TileType.FLOOR_7, STARDEW_COLORS.field) // west crop patch
  fillRect(draft, { c0: 20, r0: 7, c1: 25, r1: 9 }, TileType.FLOOR_7, STARDEW_COLORS.field) // east crop patch

  placeFurnitureBatch(draft, [
    // Workshop
    { uid: 'sd-desk-a', type: FurnitureType.DESK, col: 3, row: 3 },
    { uid: 'sd-desk-b', type: FurnitureType.DESK, col: 6, row: 3 },
    { uid: 'sd-desk-c', type: FurnitureType.DESK, col: 3, row: 5 },
    { uid: 'sd-desk-d', type: FurnitureType.DESK, col: 6, row: 5 },
    { uid: 'sd-chair-a', type: FurnitureType.CHAIR, col: 3, row: 2 },
    { uid: 'sd-chair-b', type: FurnitureType.CHAIR, col: 7, row: 2 },
    { uid: 'sd-chair-c', type: FurnitureType.CHAIR, col: 3, row: 7 },
    { uid: 'sd-chair-d', type: FurnitureType.CHAIR, col: 7, row: 7 },
    { uid: 'sd-bookshelf-a', type: FurnitureType.BOOKSHELF, col: 2, row: 2 },
    { uid: 'sd-pc-a', type: FurnitureType.PC, col: 9, row: 3 },
    { uid: 'sd-pc-b', type: FurnitureType.PC, col: 9, row: 5 },

    // Greenhouse + lab side
    { uid: 'sd-desk-e', type: FurnitureType.DESK, col: 17, row: 3 },
    { uid: 'sd-desk-f', type: FurnitureType.DESK, col: 20, row: 3 },
    { uid: 'sd-desk-g', type: FurnitureType.DESK, col: 17, row: 5 },
    { uid: 'sd-desk-h', type: FurnitureType.DESK, col: 20, row: 5 },
    { uid: 'sd-chair-e', type: FurnitureType.CHAIR, col: 17, row: 2 },
    { uid: 'sd-chair-f', type: FurnitureType.CHAIR, col: 21, row: 2 },
    { uid: 'sd-chair-g', type: FurnitureType.CHAIR, col: 17, row: 8 },
    { uid: 'sd-chair-h', type: FurnitureType.CHAIR, col: 21, row: 7 },
    { uid: 'sd-bookshelf-b', type: FurnitureType.BOOKSHELF, col: 24, row: 2 },
    { uid: 'sd-whiteboard', type: FurnitureType.WHITEBOARD, col: 22, row: 12 },

    // Tavern / commons
    { uid: 'sd-table-a', type: FurnitureType.DESK, col: 3, row: 12 },
    { uid: 'sd-table-b', type: FurnitureType.DESK, col: 6, row: 12 },
    { uid: 'sd-table-c', type: FurnitureType.DESK, col: 3, row: 14 },
    { uid: 'sd-table-d', type: FurnitureType.DESK, col: 6, row: 14 },
    { uid: 'sd-chair-i', type: FurnitureType.CHAIR, col: 2, row: 12 },
    { uid: 'sd-chair-j', type: FurnitureType.CHAIR, col: 8, row: 12 },
    { uid: 'sd-chair-k', type: FurnitureType.CHAIR, col: 2, row: 15 },
    { uid: 'sd-chair-l', type: FurnitureType.CHAIR, col: 8, row: 15 },

    // Details
    { uid: 'sd-cooler', type: FurnitureType.COOLER, col: 14, row: 12 },
    { uid: 'sd-lamp-a', type: FurnitureType.LAMP, col: 13, row: 6 },
    { uid: 'sd-lamp-b', type: FurnitureType.LAMP, col: 15, row: 10 },
    { uid: 'sd-plant-a', type: FurnitureType.PLANT, col: 2, row: 7 },
    { uid: 'sd-plant-b', type: FurnitureType.PLANT, col: 8, row: 7 },
    { uid: 'sd-plant-c', type: FurnitureType.PLANT, col: 20, row: 7 },
    { uid: 'sd-plant-d', type: FurnitureType.PLANT, col: 25, row: 7 },
    { uid: 'sd-plant-e', type: FurnitureType.PLANT, col: 24, row: 14 },
    { uid: 'sd-plant-f', type: FurnitureType.PLANT, col: 18, row: 14 },
  ])

  return buildLayout(draft)
}

const LAYOUT_PRESETS = {
  severance: {
    id: 'severance',
    label: 'Severance',
    description: '冷白秩序风格，中央十字走廊 + 四分区办公室。',
    create: createSeveranceLayout,
  },
  stardew: {
    id: 'stardew',
    label: 'Stardew',
    description: '星露谷灵感：村路十字 + 四功能街区 + 农田地块。',
    create: createStardewLayout,
  },
} as const satisfies Record<string, LayoutPresetDefinition>

export type LayoutPresetId = keyof typeof LAYOUT_PRESETS

export function getLayoutPresetOptions(): LayoutPresetOption[] {
  return Object.values(LAYOUT_PRESETS).map((preset) => ({
    id: preset.id as LayoutPresetId,
    label: preset.label,
    description: preset.description,
  }))
}

export function createLayoutFromPreset(presetId: LayoutPresetId): OfficeLayout {
  return LAYOUT_PRESETS[presetId].create()
}

export function createDefaultLayoutPreset(): OfficeLayout {
  return createLayoutFromPreset('severance')
}
