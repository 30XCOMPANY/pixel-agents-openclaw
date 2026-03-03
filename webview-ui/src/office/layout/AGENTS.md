# layout/
> L2 | 父级: /AGENTS.md

成员清单
- `layoutBuilder.ts`: 布局构建原语，提供矩形绘制/落子/家具放置的可复用 DSL。
- `layoutPresets.ts`: 主题模板系统，集中定义 severance 与 stardew 布局生成逻辑。
- `layoutSerializer.ts`: 运行时布局派生与编解码，负责 tileMap/seats/blocked 计算。
- `furnitureCatalog.ts`: 家具目录与动态资源索引，定义 footprint/分类/旋转状态。
- `tileMap.ts`: 寻路网格与 walkable/pathfinding 逻辑。
- `index.ts`: layout 模块导出聚合入口。

法则: 成员完整·一行一文件·父级链接·技术词前置

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
