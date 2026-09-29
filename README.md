# Codex Watch（实验版）

Windows Codex 额度 → GitHub → AstroBox V2 插件 → Redmi Watch 6 蓝色面板。

## 下载

- [AstroBox 插件 CodexWatch.abp](dist/CodexWatch.abp?raw=true)
- [手表应用 CodexWatch.rpk](dist/CodexWatch.rpk?raw=true)

ABP 已通过 GitHub Actions Rust / WASI 编译。RPK 已通过 AIoT Toolkit 2.0.5 构建。
这代表可以进入安装测试，不代表已在你的手表验证。iPhone 后台持续同步仍待实测。

## 1. 安装手表应用和插件

1. AstroBox 已连接 Watch 6 后，导入 CodexWatch.rpk 并安装到手表。
2. AstroBox 的插件管理中导入 CodexWatch.abp，授权 network、device、interconnect、register_interconnect_recv。
3. 在手表打开 Codex Watch。首次无数据会显示“等待首次同步”。
4. 手机端配置完成后，保持 AstroBox 在前台进行第一次同步测试。

## 2. 电脑配置与上传

本机需 Node.js 22+、Codex CLI，且 Codex 已使用 ChatGPT 登录。
本项目不需要 DeepSeek 凭据，不上传 Codex 的登录凭据。

先将仓库设为私有。默认禁止向公开仓库写入真实额度。
如确实愿意公开额度及其历史，显式将本地 config.json 的 allowPublicData 改为 true。

```powershell
Copy-Item config.example.json config.json
node --test core.test.mjs
node collector.mjs --once --local
```

最后一条只生成本地 usage.json。上传授权采用 Fine-grained GitHub Token：
仅选择 xiaomi 仓库，Contents 设为 Read and write。不要把 Token 发到聊天或提交到 Git。

运行 setup-windows.ps1，在本机隐藏输入 Token：

```powershell
powershell -NoProfile -File .\setup-windows.ps1
```

凭据使用当前 Windows 用户的 DPAPI 加密保存，脚本注册 CodexGitHubWatch 每分钟运行，禁止并发。
脚本是 opt-in，目前没有替你启用该任务。已有 Bark 任务不受影响。
手动测试：`powershell -NoProfile -File .\run-upload.ps1`。
停用：`Disable-ScheduledTask -TaskName CodexGitHubWatch`。

默认每 60 秒读取；额度变化时上传，无变化每 5 分钟上传心跳。
电脑休眠、关机、注销时不会采集。手表依据 collectedAt 显示数据年龄，不冒充实时。

## 3. AstroBox 配置

复制 plugin/config.example.json，填写同一个仓库名和 main 分支。
另建一个仅 xiaomi 仓库 Contents Read-only 的 Token，填入 token 字段。
公开仓库可将 token 设为空字符串，但写入方仍须有权限。
只连接一台设备时 deviceAddr 留空；多设备时填写目标设备地址。

在插件页面点击“导入配置 JSON”选取此文件，再点“同步额度”。
配置保存在 AstroBox 插件自己的文件空间，不打包进 ABP，也不写入手表。
插件每 60 秒尝试获取快照并推送；应用打开时也会请求刷新。
如果界面状态没刷新，关闭插件页面再打开查看。iOS 挂起 AstroBox 后不能保证定时器继续执行。

## 已验证与边界

- 本机真实额度读取成功，正确识别 300 分钟/10080 分钟窗口。
- 六项自动测试通过：字段白名单、无数据、不变心跳、冲突处理、公开仓库保护、上传内容。
- 请求串行，初始化完成后才查询，超时或错误不会伪装成成功。
- 只保存已用/剩余百分比、重置时间、采集时间，不包含账户 ID、会话或聊天记录。
- 未配置 GitHub 写入凭据，尚未验证持续真实数据上传。
- ABP/RPK 已构建；手表安装、蓝牙同步、布局与 iPhone 锁屏行为需要用户真机验证。
- 图标是独立蓝色 C 图标，不冒充 OpenAI 官方应用。
- RPK 使用工具链开发签名，仅用于个人安装测试；发布应用商店另需正式签名。

## 构建

```text
cd plugin
cargo build --release --target wasm32-wasip2
cd ..
python scripts/package-plugin.py
cd watch
npm install
npm run build
```

GitHub Actions 构建 ABP 并运行采集器测试。源码独立实现，通信方案参考
[DSBoard](https://github.com/MCXCC303/dsboard) 和
[dsband-vela](https://github.com/MCXCC303/dsband-vela)。本项目与 OpenAI、AstroBox、小米无官方隶属关系。
