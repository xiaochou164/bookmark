# Rainboard（Cloud Bookmarks）

一个参考 Raindrop 工作流实现的云书签管理软件（本地可运行），包含 Web 工作台、插件系统、Raindrop 双向同步插件、抓取/预览/阅读模式、导入导出、协作与产品化接口等能力。

当前代码库已经从早期脚本/MVP 演进为完整前后端项目，并持续在做 Raindrop 风格前端对齐。

## 当前状态（截至本仓库当前版本）

- 后端：Cloudflare Worker API（生产主路径）
- 前端：原生 Web 工作台（Raindrop 风格布局与交互）
- 数据存储：`Cloudflare D1`
- 对象存储：`Cloudflare R2`
- 队列：`Cloudflare Queues`
- 调度：`Cloudflare Cron Triggers`
- 插件系统：内置 `raindropSync`（预演、任务化执行、调度器、设备注册、健康面板）
- 内容能力：metadata 抓取、文章提取（Readability）、预览 API、阅读模式
- 高级能力：高亮/注释、提醒、导入导出任务、协作/公开页、产品化接口（套餐/配额/备份/AI 占位等）

## 功能概览

### 1. Web 工作台（前端）

- 左侧导航：系统集合、集合树、快速过滤、标签区
- 视图切换：列表 / 卡片 / 标题 / 看板
- 列表视图增强：行动作区、增量加载、虚拟滚动
- 右侧详情抽屉（Item Panel）：查看/编辑模式、更多菜单、键盘导航
- 搜索与高级筛选：suggestions、token 建议、防抖
- 快捷键：`/`、`Cmd/Ctrl+K`、`j/k`、`o/p`、`e`、`f`、`a/Shift+A`、`r`、`?`
- 未登录自动跳转独立登录页（非弹窗）

### 2. 书签与内容能力

- 书签 / 集合 / 标签 CRUD
- 批量操作（收藏、归档、删除、移动）
- Metadata 抓取任务（标题、描述、封面、favicon）
- 正文提取（`@mozilla/readability`）
- 预览 API（web/pdf/image/video/file）
- 高亮 / 注释
- 提醒（扫描、snooze、dismiss、clear）

### 3. 插件与同步（Raindrop）

- 插件配置 / 预演 / 执行 / 运行日志 / 任务队列
- `raindropSync` 双向同步（Chrome/本地书签 <-> Raindrop）
- 顶级自动映射 + 手动映射
- 删除同步（可选）
- 防混乱机制：`deviceId`、lease、cursor、tombstone、幂等 `op_id`
- 调度器（暂停/恢复/窗口/并发限制）
- 设备注册与云端配置下发
- 健康面板与审计视图

### 4. 导入导出与协作

- 导入：浏览器书签 HTML（Netscape）、JSON、CSV
- 导出：HTML / JSON / CSV（任务化）
- 公开分享页（`/public/c/:token`）
- 协作与共享接口（邀请、角色、公开链接）

### 5. 产品化接口（后端）

- 套餐 / 配额（Free/Pro gating）
- 全文搜索接口（基础框架）
- 去重 / 坏链扫描（任务接口）
- 备份创建 / 恢复（任务接口）
- AI 建议接口（占位实现）

## 快速启动（Cloudflare-first）

```bash
cd /Users/xiaochou164/Desktop/bookmarktorain
npm install
npm run cf:d1:create
npm run cf:d1:migrate:local
npm start
```

访问：

- 主界面：`http://127.0.0.1:8787`
- 登录页：`http://127.0.0.1:8787/login.html`
- 设置页：`http://127.0.0.1:8787/settings.html`

## Cloudflare Workers 运行（生产主路径）

当前仓库默认以 Cloudflare 免费层为目标部署：

- Worker 入口：`src/worker.mjs`
- 静态资源：`public/`（通过 Workers assets 托管）
- 主数据库：`D1`
- 对象存储：`R2`
- 异步任务：`Queues`
- 死信队列：`Queues DLQ`
- 定时任务：`Cron Triggers`

```bash
npm run cf:check
npm run cf:smoke
npm run cf:smoke:remote -- https://rainboard.<subdomain>.workers.dev
npm run cf:d1:create
npm run cf:d1:migrate:local
npm run cf:dev
```

部署：

```bash
npm run cf:deploy
# 或
npm run cf:release
```

如果要把旧的本地 `SQLite/JSON` 数据导入到 D1：

```bash
npm run cf:migrate:data
npx wrangler d1 execute rainboard --remote --file data/cf-import.sql
```

如果希望一键发布时连同本地数据一起导入：

```bash
npm run cf:release -- --import-local-data
```

说明：

- 发布前请先登录 Cloudflare：`npx wrangler login`
- `wrangler.toml` 已预留 `D1/R2/Queues/Cron` 绑定
- 主任务队列默认是 `rainboard-tasks`，死信队列默认是 `rainboard-tasks-dlq`
- Worker 侧任务默认记录 `attemptCount/maxAttempts`，Cron 会对卡住的任务做补偿重投
- 导入脚本会把现有 `JSON/SQLite app_state` 转换成 D1 可执行 SQL
- `/api/assets/*` 现在优先从 R2 读取对象

## 验收与现状

当前 Cloudflare-first 迁移已经达到“主路径可部署、主界面核心 API 可运行、长任务可入队和恢复”的阶段。

- 验收清单：`docs/CLOUDFLARE_ACCEPTANCE_CHECKLIST.md`
- 迁移 TODO：`docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md`
- 远端验收与失败恢复演练：`docs/CLOUDFLARE_ACCEPTANCE_CHECKLIST.md`

最低本地验收命令：

```bash
npm run cf:check
npm run cf:smoke
```

远端 Worker 基础验收：

```bash
npm run cf:smoke:remote -- https://rainboard.<subdomain>.workers.dev
```

这两条通过时，当前仓库至少已经覆盖：

- Worker 入口与静态资源托管
- D1 / R2 / Queues / DLQ / Cron 主路径
- auth / bookmarks / folders / tags / reminders
- metadata / article / preview / highlights
- plugin tasks / io tasks / ai tasks / backup tasks
- collab shares / public links / `/public/c/:token(.json)`

## 本地旧数据迁移

旧的本地状态仍可用于迁移：

- 数据库文件：`/Users/xiaochou164/Desktop/bookmarktorain/data/db.sqlite`
- 对象存储目录（本地）：`/Users/xiaochou164/Desktop/bookmarktorain/data/objects`

常用命令：

```bash
npm run db:sqlite:migrate        # 维护旧 SQLite
npm run db:sqlite:import-json    # JSON -> SQLite
npm run cf:migrate:data          # SQLite/JSON -> D1 SQL
```

## 常用环境变量

- `CF_D1_DB_NAME`：D1 数据库名称（默认 `rainboard`）
- `CF_D1_MIGRATION_FILE`：D1 迁移文件（默认 `migrations/0001_cloudflare_core.sql`）
- `DATA_FILE`：旧 JSON 状态文件路径
- `SQLITE_FILE`：旧 SQLite 状态文件路径
- `CF_MIGRATION_SQL_FILE`：生成的 D1 导入 SQL 文件路径

## 主要脚本命令

```bash
npm start
npm run cf:check
npm run cf:smoke
npm run cf:d1:create
npm run cf:d1:migrate:local
npm run cf:d1:migrate:remote
npm run cf:migrate:data
npm run cf:deploy
npm run cf:release
```

## 主要 API（示例）

基础系统：

- `GET /api/health`
- `GET /api/state`
- `GET /openapi.json`

认证与用户：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

书签与集合：

- `GET /api/bookmarks`
- `POST /api/bookmarks`
- `PUT /api/bookmarks/:id`
- `DELETE /api/bookmarks/:id`
- `GET /api/folders`
- `POST /api/folders`
- `POST /api/folders/reorder`
- `POST /api/bookmarks/bulk`

内容能力：

- `POST /api/bookmarks/:id/metadata/fetch`
- `POST /api/bookmarks/:id/article/extract`
- `GET /api/bookmarks/:id/preview`
- `GET/POST/PUT/DELETE /api/bookmarks/:id/highlights*`

插件与同步：

- `GET /api/plugins`
- `GET/PUT /api/plugins/raindropSync/config`
- `POST /api/plugins/raindropSync/preview`
- `POST /api/plugins/raindropSync/tasks`
- `GET /api/plugins/raindropSync/tasks`
- `GET/PUT /api/plugins/raindropSync/schedule`
- `GET /api/plugins/raindropSync/audit`
- `GET /api/plugins/raindropSync/health`

导入导出：

- `POST /api/io/tasks`
- `GET /api/io/tasks`
- `POST /api/io/tasks/:taskId/retry`
- `POST /api/product/backups`
- `GET /api/product/backups`
- `POST /api/product/backups/:backupId/restore`

AI 与任务治理：

- `GET /api/product/ai/config`
- `PUT /api/product/ai/config`
- `POST /api/product/ai/test`
- `GET /api/product/ai/jobs`
- `GET /api/product/ai/jobs/:jobId`
- `POST /api/product/ai/jobs/:jobId/retry`
- `POST /api/product/ai/batch/autotag/tasks`
- `GET /api/product/ai/batch/autotag/tasks/:taskId`
- `POST /api/product/ai/batch/autotag/tasks/:taskId/retry`
- `POST /api/product/ai/backfill/tasks`
- `GET /api/product/ai/backfill/tasks`
- `GET /api/product/ai/backfill/tasks/:taskId`
- `POST /api/product/ai/backfill/tasks/:taskId/pause`
- `POST /api/product/ai/backfill/tasks/:taskId/resume`
- `POST /api/product/ai/backfill/tasks/:taskId/retry`
- `POST /api/product/ai/rules/run`
- `GET /api/product/ai/rules/runs`

搜索与扫描：

- `POST /api/product/search/index/rebuild`
- `POST /api/product/search/semantic/index/rebuild`
- `GET /api/product/dedupe/scan`
- `POST /api/product/ai/dedupe/semantic-scan`
- `POST /api/product/broken-links/scan`
- `GET /api/product/broken-links/tasks`
- `POST /api/product/broken-links/tasks/:taskId/retry`

协作与公开页：

- `GET /public/c/:token`
- `GET /public/c/:token.json`

## Chrome 扩展（本地目录）

仓库包含 Chrome 扩展（用于与云端/同步插件配合）：

- 目录：`/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension`

加载方式（开发者模式）：

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. “加载已解压的扩展程序”
4. 选择 `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension`

## 项目文档

- 实施计划：`/Users/xiaochou164/Desktop/bookmarktorain/docs/IMPLEMENTATION_PLAN.md`
- 待办清单：`/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 开发日志：`/Users/xiaochou164/Desktop/bookmarktorain/docs/DEV_LOG.md`
- OpenAPI 基线：`/Users/xiaochou164/Desktop/bookmarktorain/docs/openapi.json`

前端对齐与验收：

- `RA_UI` 验收：`/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_UI_ACCEPTANCE_CHECKLIST.md`
- `RA_UI` 截图：`/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_UI_SCREENSHOT_COMPARE.md`
- `/my/0` DOM 对齐验收：`/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_DOM_MY0_ACCEPTANCE_CHECKLIST.md`
- `/my/0` 截图对比：`/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_DOM_MY0_SCREENSHOT_COMPARE.md`
- `/my/0` 交互回归：`/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_DOM_MY0_INTERACTION_REGRESSION_CHECKLIST.md`
- 通用前端回归：`/Users/xiaochou164/Desktop/bookmarktorain/docs/FRONTEND_REGRESSION_CHECKLIST.md`

## 说明

- 当前项目以“功能/交互/信息架构对标 Raindrop”为目标，不直接复制品牌与商标资源。
- 当前未建立完整自动化测试体系（已有较多命令级/冒烟验证与开发日志记录）。
- 生产主路径已不再依赖 `BullMQ` / `Redis` / 本地磁盘；Cloudflare Worker + D1 + R2 + Queues + Cron 是当前默认部署模型。
- AI / 扫描 / 恢复类长任务默认会记录任务状态、尝试次数与重试入口；Cron 会对卡住的任务做补偿重投。
- 当前仍在持续增强的重点主要是更深的 `article` 云端提取、外部资源探测精度，以及更完整的失败治理与集成测试覆盖。
