# editor/
> L2 | 父级: /AGENTS.md

成员清单
- `EditorToolbar.tsx`: 编辑工具栏 UI，承载工具切换与颜色/复制/微移操作入口。
- `editorState.ts`: 编辑状态容器，管理选择、撤销栈、拖拽态与脏标记。
- `editorActions.ts`: 纯布局操作函数，负责 tile/furniture 的不可变变换与合法性校验。
- `editorHelpers.ts`: 编辑复用辅助函数，统一命中检测、越界扩展、放置体构造与工具语义判断。
- `editorToolDispatch.ts`: 工具分发器，按当前编辑工具执行单次 tile/furniture 行为。
- `furnitureUid.ts`: 家具 UID 生成器，保证放置与复制逻辑使用同一 ID 规则。
- `index.ts`: editor 模块导出聚合入口。

法则: 成员完整·一行一文件·父级链接·技术词前置

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
