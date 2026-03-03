/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: 对外提供 createFurnitureUid，用于生成放置家具的唯一 ID
 * [POS]: office/editor 的基础工具函数，被 editorActions 与 editorHelpers 复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

/** Build a compact unique furniture ID for client-side layout editing. */
export function createFurnitureUid(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}
