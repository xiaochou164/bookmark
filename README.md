# Rainboard（Cloud Bookmarks）

一个参考 Raindrop 工作流实现的云书签管理软件（本地可运行），包含 Web 工作台、插件系统、Raindrop 双向同步插件、抓取/预览/阅读模式、导入导出、协作与产品化接口等能力。

当前代码库已经从早期脚本/MVP 演进为完整前后端项目，并持续在做 Raindrop 风格前端对齐。

## 当前状态（截至本仓库当前版本）

- 后端：Express API（模块化 routes/services）
- 前端：原生 Web 工作台（Raindrop 风格布局与交互）
- 数据存储：默认 `SQLite`（可回退 `JSON`）
- 队列：默认内存队列（可切换 `BullMQ/Redis`）
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

## 快速启动

```bash
cd /Users/xiaochou164/Desktop/bookmarktorain
npm install
npm run db:sqlite:migrate
npm start
```

访问：

- 主界面：`http://localhost:3789`
- 登录页：`http://localhost:3789/login.html`
- 设置页：`http://localhost:3789/settings.html`

## 数据存储与运行模式

默认使用 `SQLite`：

- 数据库文件：`/Users/xiaochou164/Desktop/bookmarktorain/data/db.sqlite`
- 对象存储目录（本地）：`/Users/xiaochou164/Desktop/bookmarktorain/data/objects`

支持切换回 JSON（调试/兼容）：

```bash
DB_BACKEND=json npm start
```

SQLite 迁移与导入脚本：

```bash
npm run db:sqlite:migrate
npm run db:sqlite:import-json
```

## 常用环境变量

- `PORT`（默认 `3789`）
- `HOST`（默认 `0.0.0.0`）
- `DB_BACKEND`：`sqlite` / `json`（默认 `sqlite`）
- `SQLITE_FILE`：SQLite 文件路径
- `DATA_FILE`：JSON 文件路径（JSON 模式）
- `QUEUE_BACKEND`：`memory` / `bullmq`（默认 `memory`）
- `REDIS_URL`：BullMQ 模式下 Redis 连接串
- `QUEUE_PREFIX`：队列前缀（默认 `rainboard`）
- `OBJECT_STORAGE_BACKEND`：当前默认 `local`
- `OBJECT_STORAGE_DIR`：本地对象存储目录

## 主要脚本命令

```bash
npm start                # 启动服务
npm run dev              # watch 模式启动
npm run db:sqlite:migrate
npm run db:sqlite:import-json
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
- `BullMQ`/`Redis` 为可选增强；默认内存队列可直接运行。
