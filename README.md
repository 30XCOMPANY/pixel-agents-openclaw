<!-- Agent Swarm Test -->

# Pixel Agents OpenClaw

像素风办公室，可视化你的 OpenClaw agents。每个活跃的 session 对应一个像素小人。

## Demo

运行以下命令启动：

```bash
cd pixel-agents-openclaw
npx tsx server.ts
```

然后打开浏览器访问 http://localhost:3456

## 功能

- 像素风办公室渲染
- 每个 OpenClaw session 对应一个像素小人
- 实时状态显示 (active / idle)
- 点击小人查看任务信息
- 座位自动分配

## 架构

- **server.ts** - HTTP + SSE 服务器
  - 轮询 OpenClaw sessions.json
  - 通过 Server-Sent Events 推送状态
- **webview-ui/** - React + Canvas 前端
  - 保留原版像素风渲染
  - 用浏览器 SSE 替代 VS Code postMessage

## 待完成

- [ ] 修复 loading 问题
- [ ] 远程访问支持 (pingping)
- [ ] 点击查看任务详情

## Credits

基于 [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents)
