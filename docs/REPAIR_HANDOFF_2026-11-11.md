# 2026-11-11 repair handoff — TomTrader 1.0.1-rc.2

本轮修复已完成生产构建、真实数据及独立安装验收。适用本机 Apple Silicon arm64 / macOS 15.1。没有发布、推送、购买服务或改动原有用户资料。

## 可用文件与来源

- [新 DMG](../release/night-2026-11-11/TomTrader-1.0.1-rc.2-mac-arm64.dmg)：137531572 bytes，SHA-256 `92bb624f546a2e0a63b5f8a5c4ac60fdaa893b8387fbaa74ff8eb10223f8914e`。
- [新 ZIP](../release/night-2026-11-11/TomTrader-1.0.1-rc.2-mac-arm64.zip)：134481409 bytes，SHA-256 `2e6e92fd0f716b810c287d0045eb8d1b8564bf52f40429a3d8a1f3e94c1131a6`。
- [校验/构建清单](../release/night-2026-11-11/manifest-darwin-arm64.json)。源码提交 `b61da6ec0ca424bc2cb6e5ea4cffc9d183a7d706`，打包时 clean / dirty:false，分支 `codex/night-fixes-20261111`。后续文档提交不改变二进制来源。
- 之前 RC1 的 DMG/ZIP 及其哈希保留。新包单独放在 `release/night-2026-11-11/`。
- 本机 Web 生产服务也已更新并启动在 http://127.0.0.1:3100 。App 安装版自行管理其本地服务，不依赖这个 Web 进程。

签名仍是本地 ad-hoc 预览，资源完整性通过 `codesign --verify --deep --strict`；没有 Developer ID 或公证。首次配置选择 Personal / Public feeds，无需 Key，不请求钥匙串权限。

## 已修复的实际问题

- 行情订阅清理误删其他组件的订阅、复制标签页共用连接身份、旧 HTTP 覆盖新 SSE、关闭刷新/挂起后迟到结果仍更新、慢速连接错误状态不实。
- 休市缓存跨入开盘后继续有效，轮询晚于开盘/午休结束；新窗口/恢复窗口收不到已有报价；冷启动重复请求；成功后仍残留超时提示。
- 图表切换周期时旧序列被贴上新周期，空/乱序/重复 OHLC 导致错误图形。
- 东方财富历史连接中断会误禁用可用报价；历史现可正常回退腾讯日/周/月源，美股解析真实上市后缀，科创板成交量不再误乘 100。
- 持仓最新价与市值/盈亏取不同快照、节流丢失最后更新；导入默认币种错误、空 JSON 异常、重复提交、失败部分写入；更新币种不一致、删除/导出失败无提示。
- 自选分组/置顶、提醒加载/开关/删除失败不显示原因；失败输入和原数据现在保留。
- 原生备份可能覆盖运行中数据库/配置、失败破坏已有备份、备份失败误触发服务恢复；Mac 关闭窗口后重复启动无响应。

## 验收分类

- TypeScript、ESLint、生产构建通过。Vitest **219 通过 / 12 个 opt-in 外部网络检查跳过**，28 文件；没有将跳过计为通过。
- 最新生产 Web 浏览器 **50/50 通过**，独立 Demo 数据库；这些验证交互和错误恢复，不是价格证据。
- 原生备份/窗口故障注入 **5/5**，隔离开发 Electron profile；不宣称这项是物理断电或整机测试。
- 最终 DMG 独立安装、弹出镜像、只读资源、精简 PATH 后 **13 项 smoke 通过**，实际后端与 Next 来自安装资源内，退出/重启及数据偏好恢复正常。
- 最终 DMG 另一次独立安装的真实流程通过：首次个人源配置、CN/HK/US 身份/币种/报价、三张腾讯历史图、自选添加和重启恢复。60 秒内始终单 SSE，AAPL 收到 **5 个不同接收时间**的真实自动刷新，零页面异常。

## 今晚实际数据能力与剩余限制

全新内存数据库真实网络：A 股 **20/20**、港股 **13/13**、美股/ETF **38/38**、全球指数 **22/26**、商品 **5/5** 报价。Russell 2000、VIX、TOPIX、Nifty 50 缺失。精选池不代表全市场覆盖。

最初东方财富 **33/33 历史请求失败**（上游 socket closed），失败原始记录已保留。接入腾讯正常备用源后，服务链路 **13/33 组历史成功**：CN/HK/US 1M/1Y 六组，以及七个 CN/HK 指数 1M。代表股票的 1M/1Y 分别为 CN 23/243、HK 22/247、US 23/252 根。安装版三张历史图实际来源均为腾讯。

其余 **20 组历史仍不可用**，含分钟线与未覆盖的海外指数历史；没有用价格采样合成 OHLC，也没有以 Demo 补齐。HK/US 腾讯成交量单位尚未验证，保留 null。所有公开源延迟仍为 unverified；连接成功与接收时间不能证明交易所实时授权。Yahoo 429/冷却如实处理。

Developer ID/公证、真实 Finnhub 账户、最终身份的钥匙串持久化、物理休眠/重启、整机断网、跨日长期稳定性及 Windows/Intel 执行，沿用明确未验证边界。没有为测试关闭系统保护。此次真实连续采样为 60 秒，不当作过夜稳定性认证。

## 证据与接续

完整本机证据在 `test-results/night-2026-11-11/`：`vitest.json`、`free-feeds-before-fallback.json`、`free-feeds.json`、`tencent-history-fallback.json`、`installed/install.json`、`installed/installed/smoke.json`、`real-installed/acceptance.json` 及真实截图。开发原生故障注入在 `test-results/desktop-backup/acceptance.json`。最新浏览器机器结果在 `docs/evidence/playwright.json`。

原始验收 profile 已清理，未访问真实用户 profile 或写入 QA 持仓。真实截图均来自新 DMG 独立安装；Demo 截图仍明确标注。持久状态见 [NIGHT_CHECKPOINT.md](NIGHT_CHECKPOINT.md)。会话停止时不会承诺自动继续或后台修复；本地 App/Web 进程运行取决于本机实际状态。
