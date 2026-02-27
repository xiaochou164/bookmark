# Cloudflare Workers 迁移 TODO

> 目标：先提供可部署到 Cloudflare Workers 的“最小可用版本（MVP）”，再逐步迁移现有 Express + 本地文件能力。

状态说明：`TODO` / `DOING` / `DONE` / `BLOCKED`

## Phase 1：运行时与部署骨架

- [x] `CFW-001` 新增 `wrangler.toml`，配置 Worker 入口、静态资源目录与兼容日期。
- [x] `CFW-002` 新增 `src/worker.js`，实现 Fetch 入口与统一 JSON 响应工具。
- [x] `CFW-003` 将 `public/` 作为静态资源输出目录（通过 Workers assets 直出）。
- [x] `CFW-004` 提供 `/api/health` 与 `/api/state` 的 Worker 版本健康检查接口。

## Phase 2：与现有 Node 服务并行

- [x] `CFW-101` 保留现有 `npm start`（Node/Express）不受影响。
- [x] `CFW-102` 在 `package.json` 增加 `cf:*` 命令，支持本地预览和部署。
- [x] `CFW-103` 在 `README.md` 增加 Workers 启动/部署说明。
- [x] `CFW-104` 增加 Cloudflare D1 迁移脚本与 SQL 文件（可本地/远端执行）。
- [x] `CFW-105` 增加 D1 绑定自动写回与一键发布脚本（create/reuse D1 -> migrate -> deploy）。

## Phase 3：数据层迁移（下一步）

- [ ] `CFW-201` 将 `JSON/SQLite` 本地持久化迁移到 Cloudflare D1（结构与迁移脚本适配）。
  - [x] `CFW-201a` Worker 侧接入 D1 binding 雏形（自动建表 + `folders` 基础查询/写入）。
  - [x] `CFW-201b` 新增 D1 SQL migration 文件与执行脚本（便于直接部署前初始化）。
- [ ] `CFW-202` 将对象存储从本地目录迁移到 Cloudflare R2。
- [ ] `CFW-203` 将任务队列从进程内/Redis 迁移到 Queues + Consumers。
- [ ] `CFW-204` 认证会话从本地存储迁移到 D1/KV（含 token 轮转策略）。

## Phase 4：路由能力迁移（下一步）

- [ ] `CFW-301` 逐步迁移 `folders/bookmarks/tags` 基础 CRUD API。
  - [x] `CFW-301a` 已迁移 `GET /api/folders` 与 `POST /api/folders`（D1 版）。
- [ ] `CFW-302` 迁移 `auth` 与权限中间件逻辑。
- [ ] `CFW-303` 迁移 metadata/article/preview 等内容能力（评估 CPU/超时限制）。
- [ ] `CFW-304` 迁移插件与同步任务能力（拆分为异步消费者）。

## 本次实施范围

本次只完成 Phase 1 + Phase 2，确保：

1. Worker 可本地运行并返回健康检查接口；
2. 静态前端可由 Workers assets 托管；
3. 原 Node 启动方式保留，便于并行迁移与回归。
