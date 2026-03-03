# Pixel Agents OpenClaw

将 Claude Code 的 Pixel Agents 改造成 OpenClaw 的 Mission Board。

## 功能

- 像素风办公室可视化
- 每个 OpenClaw agent 对应一个像素小人
- 实时状态显示 (active / idle / waiting)
- 点击小人查看任务详情

## 运行

```bash
cd ~/.openclaw/workspace/pixel-agents-openclaw

# 启动服务（推荐，避免 tsx CLI 在部分环境的 IPC 问题）
npm run openclaw:start
```

服务运行在 http://localhost:3456

默认会自动扫描当前用户目录下所有 OpenClaw agent 的会话文件：
`~/.openclaw/agents/*/sessions/sessions.json`

并按 `agentName` 聚合：每个 OpenClaw agent 只对应一个像素小人（不再按 session 一条一人）。

可通过环境变量覆盖：

```bash
SESSIONS_FILE=/path/to/sessions.json npm run openclaw:start
```

布局模板也可切换（默认 `severance`）：

```bash
LAYOUT_TEMPLATE=severance npm run openclaw:start
LAYOUT_TEMPLATE=classic-openplan npm run openclaw:start
```

模板文件位置：
- `webview-ui/public/assets/layouts/severance.json`
- `webview-ui/public/assets/layouts/classic-openplan.json`

## 皮肤资产说明

- 不需要购买付费皮肤才能运行。
- 如果找不到 `furniture-catalog.json`，服务会自动回退到内置家具布局（免费可用）。
- 如果找到 `assets/characters/char_0.png` 到 `char_5.png`，会自动下发为人物皮肤；缺失时自动回退内置人物模板。
- 地板纹理优先读取 `floors.png`；缺失时自动生成 7 套灰度地板纹理。墙体会自动读取 `walls.png`（缺失时回退纯色墙体）。
- 若你后续有自定义家具包，放到以下任一位置即可自动加载：
  - `assets/furniture/furniture-catalog.json`
  - `dist/assets/furniture/furniture-catalog.json`
  - `webview-ui/public/assets/furniture/furniture-catalog.json`

## 架构

- **server.ts** - HTTP + SSE 服务器
  - 轮询 `~/.openclaw/agents/*/sessions/sessions.json`（可用 `SESSIONS_FILE` 覆盖）
  - 通过 Server-Sent Events 推送状态给前端
- **webview-ui/** - React + Canvas 前端
  - 保留原版像素风渲染
  - 用浏览器 SSE 替代 VS Code postMessage

## 待完成

1. ✅ 核心骨架
2. ⏳ 消息协议适配（webview 期望的格式）
3. ⏳ pingping 远程访问（需要暴露端口或用 tunnel）
4. ⏳ 点击小人查看任务详情

## 给 pingping 用的远程接口

当前 server 读取的是本地 sessions.json。pingping 远程访问需要：

1. **方案 A**: 把 server 部署到有公网 IP 的机器
2. **方案 B**: 用 `ssh -R` 端口转发
3. **方案 C**: 通过 OpenClaw Gateway API 暴露

推荐方案 B，简单：
```bash
# 在有公网 IP 的机器上运行
ssh -R 3456:localhost:3456 pingping@<远程机器>
```
