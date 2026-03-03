# .openclaw/
> L2 | 父级: /Users/oogie/.openclaw/workspace/pixel-agents-openclaw/AGENTS.md

成员清单
- project.toml: 项目薄配置，声明 base_branch/worktree_base/驱动默认值。
- swarm.db: 项目任务真相源（SQLite）；所有状态机事件与 gate 写入此库。
- active-tasks.json: 兼容投影，只读兼容用途，禁止作为主存写入。
- logs/: swarm 与 agent 运行日志目录。
- setup.sh: 兼容 setup 入口，转发到 `swarm seed`。
- spawn-agent.sh: 兼容旧入口，转发到 `swarm task spawn`。
- redirect-agent.sh: 兼容旧入口，转发到 `swarm task redirect`。
- kill-agent.sh: 兼容旧入口，转发到 `swarm task kill`。
- check-agents.sh: 兼容旧入口，转发到 `swarm monitor tick`。
- cleanup.sh: 兼容旧入口，转发到 `swarm cleanup tick`。
- status.sh: 兼容旧入口，转发到 `swarm status`。
- run-agent.sh: 废弃占位，提示改走 swarm 编排。

法则
- 这里不实现业务逻辑，只做参数适配与兼容。
- 真正执行路径统一归于 `/Users/oogie/.openclaw/swarm-core/swarm`。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
