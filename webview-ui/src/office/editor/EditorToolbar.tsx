/**
 * [INPUT]: 依赖编辑状态 props、家具目录、地板与 sprite 缓存工具
 * [OUTPUT]: 对外提供 EditorToolbar 组件，渲染编辑工具、颜色面板与家具选择器
 * [POS]: office/editor 的 UI 层，连接用户操作与 useEditorActions
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { EditTool } from '../types.js'
import type { TileType as TileTypeVal, FloorColor } from '../types.js'
import { getCatalogByCategory, buildDynamicCatalog, getActiveCategories } from '../layout/furnitureCatalog.js'
import type { FurnitureCategory, LoadedAssetData } from '../layout/furnitureCatalog.js'
import { getCachedSprite } from '../sprites/spriteCache.js'
import { getColorizedFloorSprite, getFloorPatternCount, hasFloorSprites } from '../floorTiles.js'

const btnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '22px',
  background: 'var(--pixel-btn-bg)',
  color: 'var(--pixel-text-dim)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--pixel-active-bg)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-accent)',
}

const tabStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '20px',
  background: 'transparent',
  color: 'var(--pixel-text-muted)',
  border: '2px solid transparent',
  borderRadius: 0,
  cursor: 'pointer',
}

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'var(--pixel-surface-soft)',
  color: 'var(--pixel-text)',
  border: '2px solid var(--pixel-accent)',
}

const compactBtnStyle: React.CSSProperties = {
  ...btnStyle,
  fontSize: '20px',
  padding: '2px 6px',
}

const colorPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '4px 6px',
  background: 'var(--pixel-surface-soft)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
}

interface EditorToolbarProps {
  activeTool: EditTool
  selectedTileType: TileTypeVal
  selectedFurnitureType: string
  selectedFurnitureUid: string | null
  selectedFurnitureColor: FloorColor | null
  floorColor: FloorColor
  wallColor: FloorColor
  onToolChange: (tool: EditTool) => void
  onTileTypeChange: (type: TileTypeVal) => void
  onFloorColorChange: (color: FloorColor) => void
  onWallColorChange: (color: FloorColor) => void
  onSelectedFurnitureColorChange: (color: FloorColor | null) => void
  onFurnitureTypeChange: (type: string) => void
  onDuplicateSelected: () => void
  onNudgeSelected: (dx: number, dy: number) => void
  loadedAssets?: LoadedAssetData
}

/** Render a floor pattern preview at 2x (32x32 canvas showing the 16x16 tile) */
function FloorPatternPreview({ patternIndex, color, selected, onClick }: {
  patternIndex: number
  color: FloorColor
  selected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const displaySize = 32
  const tileZoom = 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = displaySize
    canvas.height = displaySize
    ctx.imageSmoothingEnabled = false

    if (!hasFloorSprites()) {
      ctx.fillStyle = '#AEBBC3'
      ctx.fillRect(0, 0, displaySize, displaySize)
      return
    }

    const sprite = getColorizedFloorSprite(patternIndex, color)
    const cached = getCachedSprite(sprite, tileZoom)
    ctx.drawImage(cached, 0, 0)
  }, [patternIndex, color])

  return (
    <button
      onClick={onClick}
      title={`Floor ${patternIndex}`}
      style={{
        width: displaySize,
        height: displaySize,
        padding: 0,
        border: selected ? '2px solid var(--pixel-accent)' : '2px solid var(--pixel-border)',
        borderRadius: 0,
        cursor: 'pointer',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--pixel-surface)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: displaySize, height: displaySize, display: 'block' }}
      />
    </button>
  )
}

/** Slider control for a single color parameter */
function ColorSlider({ label, value, min, max, onChange }: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: '20px', color: 'var(--pixel-text-muted)', width: 28, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, height: 12, accentColor: 'var(--pixel-accent)' }}
      />
      <span style={{ fontSize: '20px', color: 'var(--pixel-text-muted)', width: 48, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

const DEFAULT_FURNITURE_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 }

export function EditorToolbar({
  activeTool,
  selectedTileType,
  selectedFurnitureType,
  selectedFurnitureUid,
  selectedFurnitureColor,
  floorColor,
  wallColor,
  onToolChange,
  onTileTypeChange,
  onFloorColorChange,
  onWallColorChange,
  onSelectedFurnitureColorChange,
  onFurnitureTypeChange,
  onDuplicateSelected,
  onNudgeSelected,
  loadedAssets,
}: EditorToolbarProps) {
  const [activeCategory, setActiveCategory] = useState<FurnitureCategory>('desks')
  const [showColor, setShowColor] = useState(false)
  const [showWallColor, setShowWallColor] = useState(false)
  const [showFurnitureColor, setShowFurnitureColor] = useState(false)

  const activeCategories = useMemo(() => {
    if (loadedAssets) {
      try {
        buildDynamicCatalog(loadedAssets)
      } catch (err) {
        console.error(`[EditorToolbar] Error building dynamic catalog:`, err)
      }
    }
    return getActiveCategories()
  }, [loadedAssets])

  const handleColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onFloorColorChange({ ...floorColor, [key]: value })
  }, [floorColor, onFloorColorChange])

  const handleWallColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onWallColorChange({ ...wallColor, [key]: value })
  }, [wallColor, onWallColorChange])

  // For selected furniture: use existing color or default
  const effectiveColor = selectedFurnitureColor ?? DEFAULT_FURNITURE_COLOR
  const handleSelFurnColorChange = useCallback((key: keyof FloorColor, value: number) => {
    onSelectedFurnitureColorChange({ ...effectiveColor, [key]: value })
  }, [effectiveColor, onSelectedFurnitureColorChange])

  const effectiveCategory = activeCategories.some((cat) => cat.id === activeCategory)
    ? activeCategory
    : (activeCategories[0]?.id ?? 'desks')
  const categoryItems = getCatalogByCategory(effectiveCategory)

  const patternCount = getFloorPatternCount()
  // Wall is TileType 0, floor patterns are 1..patternCount
  const floorPatterns = Array.from({ length: patternCount }, (_, i) => i + 1)

  const thumbSize = 36 // 2x for items

  const isFloorActive = activeTool === EditTool.TILE_PAINT || activeTool === EditTool.EYEDROPPER
  const isWallActive = activeTool === EditTool.WALL_PAINT
  const isEraseActive = activeTool === EditTool.ERASE
  const isFurnitureActive = activeTool === EditTool.FURNITURE_PLACE || activeTool === EditTool.FURNITURE_PICK

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 68,
        left: 10,
        zIndex: 50,
        background: 'var(--pixel-surface)',
        border: '2px solid var(--pixel-border)',
        borderRadius: 0,
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 6,
        boxShadow: 'var(--pixel-shadow)',
        maxWidth: 'calc(100vw - 20px)',
      }}
    >
      {/* Tool row — at the bottom */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button
          style={isFloorActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.TILE_PAINT)}
          title="Paint floor tiles"
        >
          Floor
        </button>
        <button
          style={isWallActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.WALL_PAINT)}
          title="Paint walls (click to toggle)"
        >
          Wall
        </button>
        <button
          style={isEraseActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.ERASE)}
          title="Erase tiles to void"
        >
          Erase
        </button>
        <button
          style={isFurnitureActive ? activeBtnStyle : btnStyle}
          onClick={() => onToolChange(EditTool.FURNITURE_PLACE)}
          title="Place furniture"
        >
          Furniture
        </button>
      </div>

      {/* Sub-panel: Floor tiles — stacked bottom-to-top via column-reverse */}
      {isFloorActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Color toggle + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowColor((v) => !v)}
              title="Adjust floor color"
            >
              Color
            </button>
            <button
              style={activeTool === EditTool.EYEDROPPER ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.EYEDROPPER)}
              title="Pick floor pattern + color from existing tile"
            >
              Pick
            </button>
          </div>

          {/* Color controls (collapsible) — above Wall/Color/Pick */}
          {showColor && (
            <div style={colorPanelStyle}>
              <ColorSlider label="H" value={floorColor.h} min={0} max={360} onChange={(v) => handleColorChange('h', v)} />
              <ColorSlider label="S" value={floorColor.s} min={0} max={100} onChange={(v) => handleColorChange('s', v)} />
              <ColorSlider label="B" value={floorColor.b} min={-100} max={100} onChange={(v) => handleColorChange('b', v)} />
              <ColorSlider label="C" value={floorColor.c} min={-100} max={100} onChange={(v) => handleColorChange('c', v)} />
            </div>
          )}

          {/* Floor pattern horizontal carousel — at the top */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {floorPatterns.map((patIdx) => (
              <FloorPatternPreview
                key={patIdx}
                patternIndex={patIdx}
                color={floorColor}
                selected={selectedTileType === patIdx}
                onClick={() => onTileTypeChange(patIdx as TileTypeVal)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-panel: Wall — stacked bottom-to-top via column-reverse */}
      {isWallActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 6 }}>
          {/* Color toggle — just above tool row */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showWallColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowWallColor((v) => !v)}
              title="Adjust wall color"
            >
              Color
            </button>
          </div>

          {/* Color controls (collapsible) */}
          {showWallColor && (
            <div style={colorPanelStyle}>
              <ColorSlider label="H" value={wallColor.h} min={0} max={360} onChange={(v) => handleWallColorChange('h', v)} />
              <ColorSlider label="S" value={wallColor.s} min={0} max={100} onChange={(v) => handleWallColorChange('s', v)} />
              <ColorSlider label="B" value={wallColor.b} min={-100} max={100} onChange={(v) => handleWallColorChange('b', v)} />
              <ColorSlider label="C" value={wallColor.c} min={-100} max={100} onChange={(v) => handleWallColorChange('c', v)} />
            </div>
          )}

        </div>
      )}

      {/* Sub-panel: Furniture — stacked bottom-to-top via column-reverse */}
      {isFurnitureActive && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 4 }}>
          {/* Category tabs + Pick — just above tool row */}
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                style={effectiveCategory === cat.id ? activeTabStyle : tabStyle}
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
            <div style={{ width: 1, height: 14, background: 'var(--pixel-divider)', margin: '0 2px', flexShrink: 0 }} />
            <button
              style={activeTool === EditTool.FURNITURE_PICK ? activeBtnStyle : btnStyle}
              onClick={() => onToolChange(EditTool.FURNITURE_PICK)}
              title="Pick furniture type from placed item"
            >
              Pick
            </button>
          </div>
          {/* Furniture items — single-row horizontal carousel at 2x */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
            {categoryItems.map((entry) => {
              const cached = getCachedSprite(entry.sprite, 2)
              const isSelected = selectedFurnitureType === entry.type
              return (
                <button
                  key={entry.type}
                  onClick={() => onFurnitureTypeChange(entry.type)}
                  title={entry.label}
                  style={{
                    width: thumbSize,
                    height: thumbSize,
                    background: 'var(--pixel-surface)',
                    border: isSelected ? '2px solid var(--pixel-accent)' : '2px solid var(--pixel-border)',
                    borderRadius: 0,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <canvas
                    ref={(el) => {
                      if (!el) return
                      const ctx = el.getContext('2d')
                      if (!ctx) return
                      const scale = Math.min(thumbSize / cached.width, thumbSize / cached.height) * 0.85
                      el.width = thumbSize
                      el.height = thumbSize
                      ctx.imageSmoothingEnabled = false
                      ctx.clearRect(0, 0, thumbSize, thumbSize)
                      const dw = cached.width * scale
                      const dh = cached.height * scale
                      ctx.drawImage(cached, (thumbSize - dw) / 2, (thumbSize - dh) / 2, dw, dh)
                    }}
                    style={{ width: thumbSize, height: thumbSize }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected furniture color panel — shows when any placed furniture item is selected */}
      {selectedFurnitureUid && (
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              style={showFurnitureColor ? activeBtnStyle : btnStyle}
              onClick={() => setShowFurnitureColor((v) => !v)}
              title="Adjust selected furniture color"
            >
              Color
            </button>
            {selectedFurnitureColor && (
              <button
                style={compactBtnStyle}
                onClick={() => onSelectedFurnitureColorChange(null)}
                title="Remove color (restore original)"
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              style={compactBtnStyle}
              onClick={onDuplicateSelected}
              title="Duplicate selected furniture (Cmd/Ctrl+D)"
            >
              Duplicate
            </button>
            <button style={compactBtnStyle} onClick={() => onNudgeSelected(-1, 0)} title="Move left (Arrow)">←</button>
            <button style={compactBtnStyle} onClick={() => onNudgeSelected(0, -1)} title="Move up (Arrow)">↑</button>
            <button style={compactBtnStyle} onClick={() => onNudgeSelected(0, 1)} title="Move down (Arrow)">↓</button>
            <button style={compactBtnStyle} onClick={() => onNudgeSelected(1, 0)} title="Move right (Arrow)">→</button>
          </div>
          {showFurnitureColor && (
            <div style={colorPanelStyle}>
              {effectiveColor.colorize ? (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={0} max={360} onChange={(v) => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={0} max={100} onChange={(v) => handleSelFurnColorChange('s', v)} />
                </>
              ) : (
                <>
                  <ColorSlider label="H" value={effectiveColor.h} min={-180} max={180} onChange={(v) => handleSelFurnColorChange('h', v)} />
                  <ColorSlider label="S" value={effectiveColor.s} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('s', v)} />
                </>
              )}
              <ColorSlider label="B" value={effectiveColor.b} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('b', v)} />
              <ColorSlider label="C" value={effectiveColor.c} min={-100} max={100} onChange={(v) => handleSelFurnColorChange('c', v)} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '20px', color: 'var(--pixel-text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!effectiveColor.colorize}
                  onChange={(e) => onSelectedFurnitureColorChange({ ...effectiveColor, colorize: e.target.checked || undefined })}
                  style={{ accentColor: 'var(--pixel-accent)' }}
                />
                Colorize
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
