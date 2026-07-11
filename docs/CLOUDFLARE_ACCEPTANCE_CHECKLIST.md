# Cloudflare 验收清单

> 目标：快速确认当前仓库是否已经满足“可以主要依赖 Cloudflare 免费层部署与运行”的标准。

状态说明：所有验收项均已收口为 `DONE`。

## 1. 部署与运行时

- [x] `DONE` 生产入口是 Cloudflare Worker。
- [x] `DONE` Worker 入口文件为 `src/worker.mjs`。
- [x] `DONE` 静态资源通过 Workers assets 提供。
- [x] `DONE` `wrangler.toml` 已配置 `D1 / R2 / Queues / DLQ / Cron`。
- [x] `DONE` 本地调试主命令为 `npm run cf:dev` / `npm start`（Wrangler）。

## 2. 数据与存储

- [x] `DONE` 主数据存储使用 D1。
- [x] `DONE` 对象存储主路径使用 R2。
- [x] `DONE` 已提供 D1 schema migration：`migrations/0001_cloudflare_core.sql`
- [x] `DONE` 已提供旧数据迁移脚本：`scripts/cf-migrate-data.mjs`
- [x] `DONE` 已提供 D1 本地/远端迁移脚本。

## 3. 主 API 能力

- [x] `DONE` `auth/session/api token`
- [x] `DONE` `folders/bookmarks/tags` CRUD 与筛选
- [x] `DONE` `metadata tasks`
- [x] `DONE` `article/preview/highlights`
- [x] `DONE` `io tasks`
- [x] `DONE` `reminders`
- [x] `DONE` `plugins/raindropSync`
- [x] `DONE` `collab shares/public links`
- [x] `DONE` `public /public/c/:token` 与 `/public/c/:token.json`
- [x] `DONE` `product/backups`
- [x] `DONE` `product/ai/*` 主工作流接口

## 4. 异步任务与恢复

- [x] `DONE` Queue producer/consumer 已接入 Worker。
- [x] `DONE` metadata/io/plugin/ai/batch/backfill/rule/broken-link/dedupe 已进入任务模型。
- [x] `DONE` 任务记录已持久化到 D1。
- [x] `DONE` 已提供 retry 接口。
- [x] `DONE` 已提供 Cron 补偿。
- [x] `DONE` 已配置 DLQ 与 `max_retries`。

## 5. 回归测试

- [x] `DONE` `npm run cf:check`
- [x] `DONE` `npm run cf:smoke`
- [x] `DONE` smoke 已覆盖：
  - auth/profile/session/token
  - folders/bookmarks/tags
  - reminders
  - metadata/article/highlights
  - io tasks
  - plugin schedule/tasks
  - ai jobs/batch/backfill/retry
  - broken-links/dedupe/search rebuild
  - collab/public links/public pages
  - backups

## 6. 增强项收口

- [x] `DONE` 外部 AI provider 深度能力已在 Worker 主路径覆盖 provider 优先调用、启发式降级、Prompt/Eval、反馈、隐私策略、健康探测和功能开关门禁。
- [x] article/preview 的云端内容处理已具备 Worker 侧 metadata 抓取、轻量 article 提取/降级、preview 汇总与结构化失败。
- [x] 长任务观察性已具备 `/api/product/task-health` 聚合、DLQ 候选、重试候选与外部资源失败分类。
- [x] `DONE` 集成测试已加强：`cf:smoke` 覆盖 AI 治理接口、功能开关拦截、Provider 健康探测、公开集合 AI 导览和 mock D1 `app_meta` 配置读写；远端验收保留 `cf:smoke:remote` 标准命令。

## 7. 最低验收命令

```bash
npm run cf:check
npm run cf:smoke
npm run cf:smoke:remote -- https://rainbow.<subdomain>.workers.dev
```

如果这两条通过，说明当前仓库的 Cloudflare 主路径至少在本地 Worker 模拟层是闭环的。

## 8. 远端 Cloudflare 验收步骤

按下面顺序执行一次，基本就能确认远端主路径是否可用。

### 8.1 初始化

```bash
npx wrangler login
npm install
npm run cf:d1:create
npm run cf:d1:migrate:remote
npm run cf:deploy
npm run cf:smoke:remote -- https://rainbow.<subdomain>.workers.dev
```

确认项：

- `wrangler.toml` 中已有 `DB` 绑定块
- Cloudflare 控制台中能看到：
  - Worker `rainbow`
  - D1 数据库
  - R2 bucket `rainbow-objects`
  - Queue `rainbow-tasks`
  - Queue `rainbow-tasks-dlq`
- Worker 可成功发布
- Worker 域名能访问 `/api/health`
- `/api/health` 返回 `runtime = cloudflare-workers`

### 8.3 核心手工验收

至少手工走一遍：

- 注册 / 登录
- 新建文件夹
- 新建书签
- 编辑书签
- 打开书签详情和预览
- 新建 metadata task
- 新建 io task
- 新建 plugin task
- 创建 public link
- 打开 `/public/c/:token`
- 创建 backup

### 8.4 旧数据导入

如果需要导入旧本地数据：

```bash
npm run cf:migrate:data
npx wrangler d1 execute rainbow --remote --file data/cf-import.sql
```

确认项：

- folders / bookmarks / tags 数量与旧库大体一致
- 登录后能看到旧书签
- public link / backup / task 表没有明显结构错误

## 9. DLQ 与失败恢复演练

下面这组演练用于确认 Queue、重试和恢复路径是活的。

### 9.1 队列与 DLQ 配置

确认 `wrangler.toml` 中存在：

- `TASK_QUEUE`
- `TASK_DLQ`
- `max_retries = 3`
- `dead_letter_queue = "rainbow-tasks-dlq"`

### 9.2 基础重试演练

任选一种长任务执行：

- `POST /api/product/ai/rules/run`
- `POST /api/product/ai/batch/autotag/tasks`
- `POST /api/product/ai/backfill/tasks`
- `POST /api/product/broken-links/scan`

确认项：

- D1 中有对应 job/task 记录
- 状态会从 `queued` 进入 `running/succeeded/failed`
- `POST .../retry` 可再次入队

### 9.3 Cron 补偿演练

人为制造一个长时间停留在 `queued` 或 `running` 的任务记录，然后等待下一次 Cron 或手动触发调度逻辑。

确认项：

- 任务会被重新投递
- `attemptCount` 增加
- 达到 `maxAttempts` 后不再无限补偿

### 9.4 DLQ 演练

在可控环境下制造一个持续失败的 consumer 场景，确保消息超过重试次数后进入 DLQ。

确认项：

- 主队列重试次数符合 `max_retries`
- 消息最终进入 `rainbow-tasks-dlq`
- D1 中对应 job/task 保留失败状态和错误信息

## 10. 远端验收结论模板

建议每次远端验收后记录：

- 日期
- 部署版本或提交号
- 是否通过 `cf:check`
- 是否通过 `cf:smoke`
- 远端 `/api/health` 是否正常
- D1 / R2 / Queue / DLQ / Cron 是否齐全
- 是否完成手工主流程验收
- 是否完成失败恢复演练
- 仍存在的问题

## 11. 远端验收记录

### 2026-07-11

- 分支/提交基线：`master` / `6207e8b`
- Cloudflare Worker 版本：`34abcaf6-b3f9-498e-a355-6c82b0349776`
- 生产地址：`https://bookmark.sundays.ink`
- `npm run ui:check`：通过；CSS、脚本和 DOM 性能预算通过。
- `npm run ui:browser`：通过，33 张截图；覆盖四档页面、搜索建议、列表 hover、排序、通知菜单和详情编辑态。
- `npm test`：通过，6/6。
- `npm run cf:check`：通过。
- `npm run extension:check`：通过，Chrome 语法与 Safari 生成成功。
- `npm run cf:smoke:remote -- https://bookmark.sundays.ink`：7/7 通过。
- `npm run extension:smoke:remote -- https://bookmark.sundays.ink`：Token、设备注册、Chrome → Rainbow、Rainbow → Chrome、重复去重和设备状态通过。
- 扩展验收限制：`previewMutatedServer=true`，预览当前仍可能写入 Rainbow，不能视为完全无副作用的 dry-run。
- 部署说明：主版本 `d0ba8be8-0204-4ac7-b92f-b4fa5167306e` 上传 10 个前端资源；随后 `34abcaf6-b3f9-498e-a355-6c82b0349776` 修复添加 split-button 圆角并完成线上计算样式核验。

### 2026-07-05

- 分支/提交基线：当前工作区（包含 Raindrop 对齐与 UI 大样本门禁）
- Cloudflare Worker 版本：`aa7216d6-45c3-4a17-867c-58c67c926e0d`
- 生产地址：`https://bookmark.sundays.ink`
- `npm run cf:check`：通过
- `npm run cf:smoke`：通过
- `npm run ui:check`：通过
- `npm test`：通过，6/6
- `npm run ops:drill`：通过
- `npm run ui:browser`：通过，28 张截图；大样本门禁覆盖 153 个集合、104 个标签、99 条书签、加载更多与 300px 侧栏。
- 远端 D1 migration：通过（32 queries，28 tables，Rows written: 2）
- 远端 `/api/health`：通过，`runtime = cloudflare-workers`，`schemaVersion = 2`
- `npm run cf:smoke:remote -- https://bookmark.sundays.ink`：7/7 通过
- 远端绑定：D1、R2、Queues、DLQ、Cron、静态 Assets 均已部署；本次上传 33 个新增或修改静态资源。
- 部署结论：Raindrop 对齐后的前端与 Worker 主路径已完成生产部署和远端闭环验收。

### 2026-07-04

- 分支/提交基线：`master` / `b1aae7d`（部署包含随后提交的工作区改动）
- Cloudflare Worker 版本：`ec96833a-6760-46a0-adb0-aca39d63b8fe`
- 生产地址：`https://bookmark.sundays.ink`
- `npm run cf:check`：通过
- `npm run cf:smoke`：通过
- 远端 D1 migration：通过（32 queries，28 tables）
- 远端 `/api/health`：通过，`runtime = cloudflare-workers`，`schemaVersion = 2`
- `npm run cf:smoke:remote -- https://bookmark.sundays.ink`：7/7 通过
- 远端绑定：D1、R2、Queues、DLQ、Cron、静态 Assets 均已部署
- 部署结论：Cloudflare-first 主路径已完成远端闭环验收，可在 Cloudflare 免费额度内运行；超出免费用量后相关服务会受各自配额限制。
