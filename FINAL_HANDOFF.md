# TomTrader 1.0.1-rc.1 — 本机 Mac 交付

## 结论与文件

已交付适配本机 **Apple Silicon arm64 / macOS 15.1（24B2083）** 的真实行情桌面预览版。最终 DMG 已实际复制到独立安装目录、弹出镜像，并在无开发服务器、精简 PATH、隔离用户数据及只读安装资源条件下通过复验。不是仅验证开发页面或解包目录。

- **安装包：** [TomTrader-1.0.1-rc.1-mac-arm64.dmg](release/TomTrader-1.0.1-rc.1-mac-arm64.dmg)
  - 大小：**137,514,280 bytes**（约 131.14 MiB）
  - SHA-256：`25580425aa32414651abdcc2bd3b6980b3b57293b39e976ef24ae8def713a76f`
- **应用压缩包：** [TomTrader-1.0.1-rc.1-mac-arm64.zip](release/TomTrader-1.0.1-rc.1-mac-arm64.zip)
  - 大小：**134,469,595 bytes**（约 128.24 MiB）
  - SHA-256：`f3821a83968a368e8b554d6b9f7729119732c41eee426cd3652c4649ec7ec862`
- **本机应用：** `release/mac-arm64/TomTrader.app`
- **校验清单：** [SHA256SUMS-darwin-arm64.txt](release/SHA256SUMS-darwin-arm64.txt)
- **构建与安装验收清单：** [manifest-darwin-arm64.json](release/manifest-darwin-arm64.json)

打开 DMG，将应用拖入 Applications。首次启动选择并应用 **Personal / Public feeds** 即可使用真实公共行情，不需要安装 Node/npm，也不需要开发者 API Key。Demo 是单独、醒目标注的离线选项，不是真实模式的备用数据源。

**签名状态：Ad-hoc 临时签名，完整资源封印通过 `codesign --verify --deep --strict`；没有 Developer ID，也未公证。** 这是本地预览版，不是受信任发行商签名的正式发行版。未关闭 Gatekeeper、Electron 沙箱或系统防护；未购买证书。

## 最终构建来源

- 分支：`release/desktop-rc-1`
- 产物源码提交：`140479572a0bc7b2fbaf221f057666638e03111c`
- 打包时工作树：**clean / dirty:false**。后续交付文档提交不改变上述二进制来源。
- Electron **45.3.0**；内置 Node **24.22.2**、SQLite **3.53.4**；Next **16.4.5**；构建宿主 Node **22.23.3**。
- 生产 Next 模块与静态资源随应用携带；验收确认实际服务 cwd、Next 模块解析均位于安装资源目录，SQLite 实际读写隔离数据库。
- 本轮只做本机交付：**没有推送、打 tag、发布 Release、合并默认分支或运行跨平台 CI**。Windows x64 与 Intel Mac 未验收，不影响本机使用，但不作可用性承诺。

## 实际通过的用户流程

1. **真实行情闭环：** 首次原生配置确认 → 搜索 → 贵州茅台 / 腾讯 / AAPL 详情及历史图 → 自选添加 NVDA → 单 SSE 连接 → 完全退出重启后恢复真实模式与自选。
   - 身份及币种分别为 CN/CNY、HK/HKD、US/USD；三者实际来源均为 Eastmoney，未使用 Demo。
   - 1M 历史分别返回 **23 / 22 / 22** 根真实数据；页面实际显示历史图，并检查前收与涨跌幅一致性。
   - 配置应用至概览约 **430 ms**；三张详情页面约 **1.41 / 1.38 / 1.39 秒**。不是整机冷启动基准。
2. **真实覆盖升级：** 实际 1.0.0 应用在同一隔离安装位置覆盖为最终 RC；自选分组、合成测试持仓、停用提醒、深色主题及中文设置均保留。未接触或删除真实用户数据。
3. **macOS 行为：** 系统 LaunchServices 入口启动；关闭窗口后保留 App；激活重新打开；重复启动；明确退出后自己的服务 PID 消失；实际调整窗口、2× Retina、进入/退出原生全屏。
4. **故障恢复：** 终止已核实归属的本地子服务并占用原端口，原生恢复对话框选择新端口后，数据、主题、中文均保留。缺失服务文件在 15 秒内给出可操作错误，不清空数据。
5. **断网缓存：** 对该测试进程注入不可达上游代理，真实模式冷启动仍可打开本地界面并显示真实缓存，约 **482 ms**；连接检查明确失败，没有 Demo 回退。恢复上游环境并重新启动后真实连接检查通过。不是物理关闭整机网络的测试。
6. **最终字节连续运行：** **601 秒、21 次采样、零页面异常**；连接建立后保持单行情连接，未出现重复 SSE。各进程工作集之和约 **457–613 MiB**，末次约 **494 MiB**；此和包含共享内存，不能当作独占 RSS。记录到 CN/HK 各三个不同接收时间的自动来源刷新；休市价格不强制变化。十分钟不等于过夜或多日稳定性认证。
7. **数据与安全：** 一致性 SQLite 备份及 quick_check；拒绝未授权本地 HTTP、静态资源与跨源请求；原生 IPC 限定发送者；密钥不进入普通行情渲染器、localStorage 或日志；会话 Key 不落盘且重启不保留。

## 行情真实性与覆盖边界

- 展示的是实际上游返回的数据，**不代表交易所授权实时数据**。公共来源延迟未核实，保持 `unverified`，来源时间、接收时间、币种、休市/缓存状态分别显示。源失败时显示不可用或明确标注的旧缓存，不合成报价。
- 本轮较早的独立真实网络扫描：A 股 **20/20**、港股 **13/13**、美股/ETF **38/38**、指数 **22/26**、商品 **5/5**；历史请求 **33/33**。这是当时的扫描结果，不是全市场覆盖或 SLA。
- 该扫描中 `^RUT`、`^VIX`、`^TPX`、`^NSEI` 未返回；部分来源随后可能恢复，不能承诺持续覆盖。外汇参考汇率与可交易即期报价不是同一能力。
- Yahoo 实际存在 429/冷却拒绝；基本面不全。已修复可选基本面阻塞整张详情页的问题：图表和报价不再等待它，后台任务去重、保留真实旧元数据并退避重试。
- 自有 Finnhub Key 是可选项；未提供真实账户 Key，本轮只有协议/错误码测试，不宣称账户已验证。Finnhub-only 目前提供美股/ETF 报价，不提供历史 K 线。

## 测试结果，分类列示

- ESLint、TypeScript：通过。
- 单元：**151 通过，0 失败**。
- 默认集成：**32 通过，12 个显式 opt-in 网络用例不在默认执行范围**。
- 合计默认测试：**183 通过 / 12 跳过**，21 个测试文件。不能用这项覆盖下述真实网络失败。
- 生产 Web UI E2E：**23 通过**，使用隔离 Demo 环境；不是行情真实性证明。
- 最终 DMG 安装后的应用 smoke：**13 项通过**；安装器另行核实签名完整性、arm64 文件架构、独立复制/弹出及只读资源运行。
- 真实安装应用、生命周期、断网上游及连续运行：分别有独立 JSON 证据，均通过各自已执行核心检查；以下限制不计为通过。

### 原来跳过的 12 个网络用例

全部已显式执行，未把拒绝改成跳过：

- 通过：东财 A 股成交量单位归一；东财前复权日线；东财分钟线；带来源时间的汇率；带时间与链接的新闻；精选标的至少一个提供者可解析。
- 失败：Yahoo 全球指数报价、日线、搜索、基本面、指数分钟线，以及东财与 Yahoo 交叉比价。Yahoo 返回 429/冷却拒绝，基本面未返回，相关能力不宣称通过。
- 完整该文件另含两个纯逻辑用例，显式运行总计 **8 通过 / 6 失败 / 0 跳过**。分钟线原先错误要求完整盘中条数，已修正并重新通过；没有用假数据补齐。
- 生产依赖 `npm audit --omit=dev`：本轮检查 **0 条报告漏洞**，不是永久安全保证。

## 尚未验证 / 需要真实条件的事项

- **最终临时签名身份的原生加密持久化：未完成重验。** macOS 要求钥匙串原生授权，未绕过它。此前未封印版本的加密成功不当作最终版本证据。最终版已验证会话-only及删除；加密 API、禁止明文与重启解密协议有 fixture 覆盖。需要保存自己的 Key 时，在原生配置窗点击 **Check / unlock system storage** 并确认系统请求；公共行情完全不需要此权限。
- 补充的“额外系统沙箱禁止整个 checkout 读取”试验被 macOS 的嵌套 Chromium 沙箱初始化限制阻塞，**不计通过**，未禁用 Electron 沙箱来迁就测试。独立安装、精简环境、实际安装资源解析检查通过。
- 真实物理休眠/唤醒、系统重启、整机断网和多日连续使用未验证；已有网络/电源事件注入不得代替它们。
- Developer ID、公证、Windows/Intel 原生执行及 CI 留待后续。没有为此购买服务或降低安全设置。

## 截图与本地证据

真实行情截图均来自最终 DMG 安装后的应用：

- [A 股详情](test-results/rc/real-installed/real-CN-detail.png)
- [港股详情](test-results/rc/real-installed/real-HK-detail.png)
- [美股详情](test-results/rc/real-installed/real-US-detail.png)
- [真实自选列表](test-results/rc/real-installed/real-watchlist-light.png)

其他截图请勿混淆：`test-results/rc/lifecycle/installed-dark-small-window.png` 为明确标注 Demo 的中文/深色/升级测试，不是行情证据；`test-results/rc/lifecycle/system-entry-installed.png` 是系统启动测试；`test-results/rc/offline/offline-cached-startup.png` 为真实缓存故障注入。

详细本地证据：`test-results/desktop/install.json`、`test-results/rc/{real-installed,lifecycle,offline,soak}/acceptance.json`、`test-results/rc/{unit,integration,live-final,web-e2e,production-audit}.json`。测试 profile 均隔离，原始日志/数据库/密钥没有提交或上传。后续开发说明见 `docs/DESKTOP.md`。
