# Codex Watch — 开发中

目标：Windows 本地读取 Codex 额度 → GitHub usage.json → AstroBox V2 插件 → Redmi Watch 6。

## 当前已验证

- Node.js 24 + 本机 Codex app-server 真实额度读取成功。
- 等初始化回复后再请求额度；25 秒超时，错误不会伪装成成功。
- 只输出 5 小时、周窗口的已用/剩余百分比、重置时间和采集时间。
- 无账户 ID、聊天记录、Codex 凭据。
- 默认每 60 秒读取，有变化上传；无变化每 5 分钟上传心跳，保证数据年龄准确。
- 请求串行，写入失败不更新本地上传状态；下一轮重试。
- 自动测试覆盖字段白名单、缺失窗口、过期心跳、GitHub 写入冲突。

## 运行

需要 Node.js 22+ 和已通过 ChatGPT 登录的 Codex CLI。

```powershell
Copy-Item config.example.json config.json
node --test
node collector.mjs --once --local
```

最后一条只写本地 usage.json，不上传。持续采集本地数据：

```powershell
node collector.mjs --local
```

上传需在当前进程环境提供 CODEX_WATCH_GITHUB_TOKEN（仅目标仓库 Contents 读写权限），然后运行：

```powershell
node collector.mjs --once
node collector.mjs
```

不要把真实 Token 写进仓库或聊天。config.json、usage.json、state.json 默认不纳入源码版本控制。
usage.json 由 GitHub Contents API 单独写入。公开仓库会公开额度历史；启用上传前应确认仓库可见性。
主机休眠/关机后停止采集；消费端必须使用 collectedAt 显示数据年龄，不能把接收时间当采集时间。

## 尚未完成，不能当作已交付

- 本地无人值守 GitHub 写入授权与定时启动。
- AstroBox V2 .abp 插件及 Vela .rpk 应用构建、真机安装测试。
- iPhone 锁屏后的持续蓝牙同步验证。

当前不能直接导入 AstroBox。原 DSBoard 不认识此格式，也不能通过填一个 URL 就直接使用。

## 接口格式

```json
{"schemaVersion":1,"provider":"codex","collectedAt":0,"fiveHour":null,"weekly":null}
```

窗口存在时包含 usedPercent、remainingPercent、resetsAt（Unix 秒）。null 表示不可用，不是剩余 100%。
重置时间到达但没有新数据时显示“待更新”，不可自行恢复为 100%。

## 参考

- https://github.com/MCXCC303/dsboard （AstroBox 定时同步架构参考）
- https://github.com/MCXCC303/dsband-vela （Vela 通信路径参考）

当前采集器为独立实现，没有复制上述项目的实现代码。
