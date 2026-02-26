# Cloudflare Workers 迁移改造清单（方案B）

## 目标

将当前项目迁移为 Cloudflare 全家桶部署形态：

- Frontend: Cloudflare Pages
- API: Cloudflare Workers
- DB: D1
- Object Storage: R2
- Async Jobs: Queues
- Schedules: Cron Triggers
- （可选）KV / Durable Objects

说明：本清单针对当前项目（Node/Express + SQLite/本地文件 + 常驻定时器）进行分阶段改造，不是直接部署脚本。

## 当前阻塞点（现状）

- `src/server.js`: Express + `app.listen(...)`
- `src/store.js`: 本地 `node:sqlite` + `fs`
- `src/services/objectStorage.js`: 本地文件对象存储
- `src/infra/jobQueue.js`: BullMQ/Redis 或内存队列
- `src/pluginManager.js`: `setInterval` 调度
- `src/services/metadataTaskManager.js`: `setInterval`
- `src/services/ioTaskManager.js`: `setInterval`
- `src/services/reminderManager.js`: `setInterval`

## A. 基础迁移骨架（优先）

- [ ] `CF-001` 新增 `wrangler.toml`（Workers / Pages / D1 / R2 / Queues / Cron bindings）
- [ ] `CF-002` 新增 Cloudflare 运行时配置层（替代 `process.env` 直接读取）
- [ ] `CF-003` 增加 `runtime=node|cloudflare` 兼容开关（双运行时过渡）
- [ ] `CF-004` 梳理 Node-only 依赖与替代方案（`fs/node:sqlite/jsdom/bullmq/ioredis`）
- [ ] `CF-005` 建立本地开发脚本（`wrangler dev` + 前端联调）

## B. HTTP 层迁移（Express -> Workers）

- [ ] `CF-101` 选型并落地 Workers 路由框架（建议 Hono）
- [ ] `CF-102` 抽离 `src/server.js` 的 Express 初始化与中间件注册
- [ ] `CF-103` 迁移认证中间件（cookie/session/requestId/401）
- [ ] `CF-104` 迁移 API 路由注册方式（`routes/*` 适配 Workers）
- [ ] `CF-105` 迁移页面重定向逻辑（未登录跳 `/login.html`）
- [ ] `CF-106` 迁移公开分享页 HTML 输出（`/public/c/*`）

## C. 数据层迁移（本地 SQLite -> D1）

- [ ] `CF-201` 抽象 `DbRepository` 到 D1 适配器
- [ ] `CF-202` 定义 D1 schema（用户/书签/集合/标签/任务/AI 配置/插件状态等）
- [ ] `CF-203` 编写 SQLite -> D1 迁移脚本（从 `data/db.sqlite` 导入）
- [ ] `CF-204` 保留 JSON/SQLite 过渡兼容层（降低切换风险）
- [ ] `CF-205` 明确事务/并发写策略（版本号或乐观锁）
- [ ] `CF-206` 多租户隔离回归测试（用户数据不可串）

## D. 对象存储迁移（本地文件 -> R2）

- [ ] `CF-301` 新增 R2 object storage adapter（替代本地 `objectStorage`）
- [ ] `CF-302` 统一对象 key 规范（articles / exports / reports / assets）
- [ ] `CF-303` `/api/assets/*` 改为 R2 读取/签名 URL/代理策略
- [ ] `CF-304` 导出文件、报告、阅读模式产物落 R2
- [ ] `CF-305` 本地对象文件迁移脚本（支持断点续传）

## E. 队列与任务迁移（BullMQ/内存 -> Cloudflare Queues）

- [ ] `CF-401` 抽象统一任务接口（enqueue/consume/retry/idempotency）
- [ ] `CF-402` 替换 `src/infra/jobQueue.js` 为 Queues adapter
- [ ] `CF-403` 迁移插件任务队列（`pluginTasks`）
- [ ] `CF-404` 迁移 AI 批量任务与 AI 回填任务（`AI-101` / `AI-402`）
- [ ] `CF-405` 迁移 metadata 抓取任务
- [ ] `CF-406` 迁移导入导出 `ioTasks`
- [ ] `CF-407` 任务幂等与重试策略（jobId/op_id）
- [ ] `CF-408` 失败任务/死信处理（D1 审计或 DLQ）

## F. 调度迁移（setInterval -> Cron / Queue 驱动）

- [ ] `CF-501` 替换插件调度器（`pluginManager`）为 Cron Trigger + D1 状态推进
- [ ] `CF-502` 替换提醒扫描（`reminderManager`）为 Cron Trigger
- [ ] `CF-503` 将 `metadataTaskManager` 从内部 tick 改为 Queue 驱动
- [ ] `CF-504` 将 `ioTaskManager` 从内部 tick 改为 Queue 驱动
- [ ] `CF-505` 统一调度状态持久化（lastTick/nextRun/lastError）

## G. 抓取与阅读模式（高风险项）

- [ ] `CF-601` 评估 `jsdom + readability` 在 Workers 运行时可行性
- [ ] `CF-602` 为正文提取建立替代方案（建议独立抓取 worker/service）
- [ ] `CF-603` metadata 抓取拆分轻量版（Worker 直接做 title/meta/og）
- [ ] `CF-604` 阅读模式产物生成改为异步队列任务（避免请求超时/CPU 超限）
- [ ] `CF-605` 抓取失败降级策略（先保存 metadata，再补正文）

## H. AI 能力迁移（运行时与任务适配）

- [ ] `CF-701` AI Provider 配置存储改造（D1 + Workers Secrets）
- [ ] `CF-702` OpenAI 兼容 provider（硅基流动等）在 Workers 下联调
- [ ] `CF-703` Cloudflare AI provider 在 Workers 下联调
- [ ] `CF-704` AI 长任务统一走 Queue（避免请求超时）
- [ ] `CF-705` AI 成本/限流护栏（与 `AI-404` 对齐）

## I. 前端与扩展接入（Pages + Workers 域名）

- [ ] `CF-801` 前端部署到 Cloudflare Pages（`/public`）
- [ ] `CF-802` 前端 API Base URL 适配 Workers 域名
- [ ] `CF-803` Chrome 扩展云端模式默认指向 Cloudflare API
- [ ] `CF-804` CORS / CSRF / Cookie SameSite 在 Pages+Workers 下调优
- [ ] `CF-805` 登录态与重定向回归（Pages -> Workers）

## J. 运维与可观测性

- [ ] `CF-901` Worker 日志与错误追踪（Wrangler tail / Sentry 等）
- [ ] `CF-902` D1/R2/Queues 运行监控（失败率/积压/延迟）
- [ ] `CF-903` 数据备份方案（D1 导出、R2 生命周期）
- [ ] `CF-904` 灰度发布与回滚方案（Pages/Worker 版本）
- [ ] `CF-905` 回切 Node 方案（迁移失败时快速回退）

## K. 验收与切换

- [ ] `CF-A01` 核心 API 冒烟（登录/书签 CRUD/集合/标签/搜索）
- [ ] `CF-A02` 插件系统与同步任务冒烟（`raindropSync`）
- [ ] `CF-A03` AI 功能冒烟（自动打标签/问答/语义搜索/回填）
- [ ] `CF-A04` 导入导出 / 公开分享页回归
- [ ] `CF-A05` Chrome 扩展云端模式回归
- [ ] `CF-A06` 免费额度压力验证（以 Cloudflare 当期额度为准）
- [ ] `CF-A07` 正式域名切换与 24~72h 观测窗口

## 建议实施顺序（务实版）

1. `CF-001 ~ CF-105`：先让 API 能在 Worker 运行
2. `CF-201 ~ CF-305`：D1 + R2 替代本地持久化
3. `CF-401 ~ CF-505`：Queues + Cron，去掉常驻定时器
4. `CF-801 ~ CF-805`：Pages + 扩展接入 Cloudflare API
5. `CF-601 ~ CF-605`：抓取/阅读模式重构（最大风险项）
6. `CF-901 ~ CF-A07`：运维、灰度、压测、切换

## 风险与现实约束（必须提前确认）

- 最大迁移难点不是 AI，而是：
  - 本地文件系统依赖
  - 常驻定时器/调度器
  - `jsdom/readability` 正文提取
- 如果要求“全部都跑在 Workers 免费版内”，抓取/阅读模式会成为主要风险点。
- 更稳妥的过渡路径：
  - 主 API 迁到 Workers
  - 抓取/正文提取暂时独立为 Node 服务（后续再评估迁移）

