# Cloudflare 验收清单

> 目标：快速确认当前仓库是否已经满足“可以主要依赖 Cloudflare 免费层部署与运行”的标准。

状态说明：`DONE` / `PARTIAL`

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

## 6. 仍属增强项

- [ ] `PARTIAL` 外部 AI provider 的更多深度能力仍有启发式回退逻辑。
- [ ] `PARTIAL` article/preview 的云端内容处理仍可继续深化对象化与抓取策略。
- [ ] `PARTIAL` 长任务的观察性、指标、DLQ 消费与更细粒度失败分类仍可继续增强。
- [ ] `PARTIAL` 更高强度的集成测试和真实 Cloudflare 远端验收仍值得继续补。

## 7. 最低验收命令

```bash
npm run cf:check
npm run cf:smoke
npm run cf:smoke:remote -- https://rainboard.<subdomain>.workers.dev
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
npm run cf:smoke:remote -- https://rainboard.<subdomain>.workers.dev
```

确认项：

- `wrangler.toml` 中已有 `DB` 绑定块
- Cloudflare 控制台中能看到：
  - Worker `rainboard`
  - D1 数据库
  - R2 bucket `rainboard-objects`
  - Queue `rainboard-tasks`
  - Queue `rainboard-tasks-dlq`
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
npx wrangler d1 execute rainboard --remote --file data/cf-import.sql
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
- `dead_letter_queue = "rainboard-tasks-dlq"`

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
- 消息最终进入 `rainboard-tasks-dlq`
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
