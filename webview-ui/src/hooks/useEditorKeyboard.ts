/**
 * [INPUT]: 依赖 EditorState 与编辑动作回调
 * [OUTPUT]: 对外提供 useEditorKeyboard，统一绑定编辑器键盘快捷键
 * [POS]: 编辑输入层，负责键盘事件到 editor actions 的映射
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect } from 'react'
import type { EditorState } from '../office/editor/editorState.js'
import { EditTool } from '../office/types.js'

export function useEditorKeyboard(
  isEditMode: boolean,
  editorState: EditorState,
  onDeleteSelected: () => void,
  onDuplicateSelected: () => void,
  onNudgeSelected: (dx: number, dy: number) => void,
  onRotateSelected: () => void,
  onToggleState: () => void,
  onUndo: () => void,
  onRedo: () => void,
  onSave: () => void,
  onEditorTick: () => void,
  onCloseEditMode: () => void,
): void {
  useEffect(() => {
    if (!isEditMode) return

    const isTypingTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName.toLowerCase()
      return el.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'
    }

    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      if (e.key === 'Escape') {
        // Multi-stage Esc: deselect item → close tool → deselect placed → close editor
        if (editorState.activeTool === EditTool.FURNITURE_PICK) {
          editorState.setActiveTool(EditTool.FURNITURE_PLACE)
          editorState.clearGhost()
        } else if (editorState.activeTool === EditTool.FURNITURE_PLACE && editorState.selectedFurnitureType !== '') {
          editorState.clearSelectedFurnitureType()
          editorState.clearGhost()
        } else if (editorState.activeTool !== EditTool.SELECT) {
          editorState.setActiveTool(EditTool.SELECT)
          editorState.clearGhost()
        } else if (editorState.selectedFurnitureUid) {
          editorState.clearSelection()
        } else {
          onCloseEditMode()
          return
        }
        editorState.clearDrag()
        onEditorTick()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editorState.selectedFurnitureUid) {
          onDeleteSelected()
        }
      } else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        onDuplicateSelected()
      } else if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        onSave()
      } else if (e.key === 'r' || e.key === 'R') {
        onRotateSelected()
      } else if (e.key === 't' || e.key === 'T') {
        onToggleState()
      } else if (e.key === 'q' || e.key === 'Q') {
        editorState.setActiveTool(EditTool.SELECT)
        editorState.clearGhost()
        editorState.clearDrag()
        onEditorTick()
      } else if (e.key === 'w' || e.key === 'W') {
        editorState.setActiveTool(EditTool.TILE_PAINT)
        onEditorTick()
      } else if (e.key === 'e' || e.key === 'E') {
        editorState.setActiveTool(EditTool.WALL_PAINT)
        onEditorTick()
      } else if (e.key === 'f' || e.key === 'F') {
        editorState.setActiveTool(EditTool.FURNITURE_PLACE)
        onEditorTick()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!editorState.selectedFurnitureUid) return
        e.preventDefault()
        const step = e.shiftKey ? 3 : 1
        if (e.key === 'ArrowLeft') onNudgeSelected(-step, 0)
        if (e.key === 'ArrowRight') onNudgeSelected(step, 0)
        if (e.key === 'ArrowUp') onNudgeSelected(0, -step)
        if (e.key === 'ArrowDown') onNudgeSelected(0, step)
      } else if (editorState.activeTool === EditTool.TILE_PAINT && /^[1-7]$/.test(e.key)) {
        editorState.setSelectedTileType(Number(e.key) as 1 | 2 | 3 | 4 | 5 | 6 | 7)
        onEditorTick()
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        onUndo()
      } else if (
        (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault()
        onRedo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditMode, editorState, onDeleteSelected, onDuplicateSelected, onNudgeSelected, onRotateSelected, onToggleState, onUndo, onRedo, onSave, onEditorTick, onCloseEditMode])
}
