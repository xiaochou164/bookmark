# 开发日志

记录规则：
- 每完成一个待办项，新增一条日志
- 记录：时间、待办编号、变更内容、影响文件、验证结果、后续事项

---

## 模板

### YYYY-MM-DD HH:mm
- 待办：`XXX-000`
- 内容：
- 变更文件：
- 验证：
- 后续：

### 2026-02-22 12:31 CST
- 待办：`PH0-001`, `ITR-001`
- 内容：完成实施计划、待办清单、开发日志机制文档落地，建立后续迭代的记录规范。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/docs/IMPLEMENTATION_PLAN.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/DEV_LOG.md`
- 验证：人工检查文档内容与待办结构，确认文件存在且可读。
- 后续：继续完成 `PH0-002`（配置模块）与 `PH0-003`（统一错误响应）。

### 2026-02-22 12:34 CST
- 待办：`PH0-002`, `ITR-002`
- 内容：新增配置模块 `src/config.js`，统一解析 `PORT/HOST/DATA_FILE/LOG_LEVEL/NODE_ENV`，并在服务启动时输出启动配置摘要。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/config.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`
- 验证：`node --check src/config.js && node --check src/server.js`；启动服务并检查日志中存在 `[startup]` 配置输出。
- 后续：继续统一 API 错误响应结构并接入 requestId。

### 2026-02-22 12:35 CST
- 待办：`PH0-003`, `ITR-003`
- 内容：新增 HTTP 错误与中间件模块（`AppError`、`requestId`、统一错误响应、API 404 路由），并替换 `src/server.js` 中主要手工错误返回。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/http/errors.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/http/middleware.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.js`
- 验证：`GET /api/nope` 返回统一 JSON 错误结构；`POST /api/bookmarks {}` 返回 `BAD_REQUEST` 且包含 `requestId`。
- 后续：补充 OpenAPI 基线文档并提供访问入口。

### 2026-02-22 12:36 CST
- 待办：`PH0-004`, `ITR-004`
- 内容：新增 `docs/openapi.json`（OpenAPI 3.1 基线规范，覆盖现有主要 API 路径）并在服务端暴露 `/openapi.json` 访问入口。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/docs/openapi.json`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`
- 验证：`python3 -m json.tool docs/openapi.json` 校验 JSON；运行服务并成功访问 `GET /openapi.json`。
- 后续：进入 `PH0-005`，拆分 `src/server.js` 中的通用中间件/错误处理与路由注册逻辑。

### 2026-02-22 12:38 CST
- 待办：`PH0-005`
- 内容：新增 `src/http/setup.js`，提取 HTTP 基础初始化、静态资源与 OpenAPI 路由注册、错误栈注册；`src/server.js` 改为调用注册函数，降低主文件耦合度。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/http/setup.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check src/http/setup.js && node --check src/server.js`；运行服务验证 `/api/health`、`/api/nope`、`/openapi.json` 正常。
- 后续：继续 `PH0-006`，拆分 folders/bookmarks/plugins 路由模块。

### 2026-02-22 12:41 CST
- 待办：`PH0-006`
- 内容：新增 `system/folders/bookmarks/plugins` 路由模块并从 `src/server.js` 移除对应大段路由注册逻辑，改为模块化注册调用（业务辅助函数暂保留在 `src/server.js`）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/systemRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/folderRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：语法检查通过；运行服务验证 `GET /api/state`、`GET /api/bookmarks`、`GET /api/plugins` 正常返回。
- 后续：进行 `PH0-007` 数据层访问抽象（repository 层雏形）。

### 2026-02-22 12:43 CST
- 待办：`PH0-007`
- 内容：新增 `DbRepository` 封装 `store.read/update + DB 规范化`，并将 `system/folders/bookmarks` 路由改为通过 repository 访问数据层，形成 repository 层雏形。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/repositories/dbRepository.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/systemRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/folderRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：语法检查通过；运行服务完成 `GET /api/state`、`POST /api/bookmarks`、`GET /api/bookmarks` 冒烟测试。
- 后续：进入 Phase 1（优先 `PH1-001` 前端状态管理抽象）。

### 2026-02-22 12:47 CST
- 待办：`PH1-001`
- 内容：将前端入口从单文件脚本迁移为模块化结构（`app.mjs` + `js/constants/api/utils/stateStore`），引入 `createAppStore()` 管理核心页面状态，并将关键状态写操作改为通过 store 方法执行。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/js/utils.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/js/api.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/js/stateStore.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check public/app.mjs public/js/*.mjs`（分别执行）通过；运行服务并确认首页脚本入口为 `/app.mjs`；`GET /api/state` 正常。
- 后续：继续 `PH1-002`（服务端分页 + 前端分页控件与状态）。

### 2026-02-22 13:02 CST
- 待办：`PH1-002`
- 内容：为书签列表新增服务端分页（`page/pageSize` 查询参数与分页元数据响应），前端增加分页控件（页码、上一页/下一页、每页数量）并将筛选/搜索/排序切换时页码重置为第 1 页。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/js/stateStore.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/js/stateStore.mjs /Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`；`GET /api/bookmarks?page=1&pageSize=12` 与 `page=2` 返回正确分页元数据；首页 HTML 含分页控件与 `/app.mjs` 模块入口。
- 后续：进入 `PH1-003`（集合树拖拽排序与持久化，前后端同时实现）。

### 2026-02-22 13:10 CST
- 待办：`PH1-003`
- 内容：新增集合重排接口 `POST /api/folders/reorder`（支持同级排序、跨层移动、`position` 重排、循环引用防护）；前端集合树接入原生拖拽交互，支持拖到行后排序、拖到分组容器成为子集合并持久化刷新。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/folderRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/folderRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；调用 `POST /api/folders/reorder` 验证同级重排成功；调用跨层移动成功并验证 `GET /api/folders` 持久化结果；调用循环移动返回 `BAD_REQUEST`。
- 后续：进入 `PH1-004`（标签管理页：重命名/合并标签，前后端联动）。

### 2026-02-22 13:18 CST
- 待办：`PH1-004`
- 内容：新增标签管理 API（`GET /api/tags`、`POST /api/tags/rename`、`POST /api/tags/merge`），支持批量替换标签并自动去重；前端新增 Tag Manager 对话框，提供标签列表、单标签重命名/合并、多标签合并表单与结果输出。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/tagRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/tagRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；创建临时标签书签后调用 `POST /api/tags/rename` 与 `POST /api/tags/merge`，确认标签统计与书签标签字段正确更新；首页 HTML 包含标签管理对话框元素。
- 后续：继续 `PH1-005`（批量操作 UX：确认/反馈/撤销）。

### 2026-02-22 13:23 CST
- 待办：`PH1-005`
- 内容：为批量操作增加 UX 保护与反馈机制：批量删除增加确认对话框；新增全局 toast（反馈/关闭/Undo）；批量收藏/归档/删除/移动完成后显示反馈并提供可撤销操作（按操作类型回滚）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；首页 HTML 包含 `toast` / `toastUndoBtn` / `toastCloseBtn`；检查前端脚本已接入 `window.confirm`、`showToast` 与各批量操作 Undo 路径。
- 后续：进入 Phase 2（先做 `PH2-001` 同步执行日志与任务记录表）。

### 2026-02-22 13:31 CST
- 待办：`PH2-001`
- 内容：为插件执行新增 JSON 落库历史记录（`pluginRuns`），记录 `preview/run` 的任务 ID、状态、耗时、输入键列表、结果摘要或错误信息；新增 `GET /api/plugins/:id/runs` 查询接口；前端插件面板增加 History 按钮和执行历史显示区域。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/store.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`GET /api/plugins/raindropSync/runs` 返回列表；使用空 token 调用 `POST /api/plugins/raindropSync/preview` 触发失败后，执行历史中新增 `failed` 记录（含错误摘要）。
- 后续：继续 `PH2-002`（插件任务化执行器，先做进程内队列入口）。

### 2026-02-22 13:47 CST
- 待办：`PH2-002`
- 内容：新增插件任务队列（`pluginTasks`，进程内队列 + JSON 落库状态），提供 `POST /api/plugins/:id/tasks` 入队与任务状态查询接口；前端插件面板 `Run Sync` 改为入队执行并轮询任务状态。额外修复 `JsonStore` 写锁失败后被毒化的问题（失败写不再阻塞后续写操作）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/store.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`POST /api/plugins/raindropSync/tasks` 返回 `queued` 任务；轮询 `GET /api/plugins/raindropSync/tasks/:taskId` 状态从 `queued/running` 变为 `failed`（空 token 测试）并回填 `runLogId`；`GET /api/plugins/raindropSync/runs` 出现对应失败执行日志。
- 后续：进入 `PH2-003`（同步冲突审计视图，聚合 lease/cursor/tombstone/task/run 调试信息）。

### 2026-02-22 13:52 CST
- 待办：`PH2-003`
- 内容：新增 `GET /api/plugins/:id/audit` 审计接口，聚合插件状态中的 `lease/deviceId/cursor/tombstone/mirror/appliedOps` 统计，并汇总近期任务/执行日志状态计数；前端插件面板增加 `Audit` 按钮和审计输出面板。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`GET /api/plugins/raindropSync/audit` 返回计数与近期状态摘要；首页 HTML 包含 `pluginAuditBtn` / `pluginAudit` 元素。
- 后续：继续 `PH2-004`（Chrome 扩展改为对接云端 API）。

### 2026-02-22 14:06 CST
- 待办：`PH2-004`
- 内容：将 Chrome 扩展新增“云端 API 模式”（默认），`SYNC_NOW/PREVIEW_SYNC` 改为可通过 Rainboard Cloud 的插件 API 执行（preview 直调、apply 入队并轮询任务）；设置页增加 `syncBackend` 与 `cloudApiBaseUrl` 配置、云端连通性测试；背景页 `SETTINGS_CHANGED` 在云端模式下会把扩展配置推送到云端 `raindropSync` 插件配置。新增服务端 `POST /api/plugins/:id/collections` 供扩展通过云端代理拉取 Raindrop Collections 下拉列表。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/plugins/raindropSyncPlugin.js`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/manifest.json`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/background.js`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/options.html`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/options.js`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/popup.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/plugins/raindropSyncPlugin.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/background.js /Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/options.js /Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/popup.js`；`GET /api/health` 正常；`POST /api/plugins/raindropSync/collections {}` 返回 `BAD_REQUEST token is required`（新路由生效）；`GET /api/plugins/raindropSync/tasks` 与 `/audit` 正常；`manifest.json` 已包含本地云端 host permissions 且版本升级为 `0.2.6`。
- 后续：继续 `PH2-005`（失败任务重试/重放与幂等校验路径）。

### 2026-02-22 14:14 CST
- 待办：`PH2-005`
- 内容：为插件任务队列新增重试/重放与幂等入队保护：`pluginTasks` 增加 `inputSnapshot/idempotencyKey/sourceTaskId/replayReason` 字段，`POST /api/plugins/:id/tasks` 支持 `idempotencyKey` 去重（针对 queued/running 任务），新增 `POST /api/plugins/:id/tasks/:taskId/retry` 与 `/replay`；前端插件面板新增 `Retry Latest Failed` / `Replay Latest Task` 按钮。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/background.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/background.js`；创建空 token 失败任务后调用 `/retry` 与 `/replay`，新任务成功入队并终态为 `failed`（预期），且任务记录中回填 `sourceTaskId/replayReason/runLogId`；任务列表包含 `idempotencyKey` 字段。
- 后续：继续 `PH2-006`（同步调度器：定时窗口、并发限制、暂停/恢复）。

### 2026-02-22 14:24 CST
- 待办：`PH2-006`
- 内容：新增服务端插件调度器（`PluginManager.startScheduler()` + 周期 tick），支持调度配置 `enabled/paused/intervalMinutes/maxConcurrent/windowEnabled/windowStartHour/windowEndHour`，并记录调度状态（`lastTickAt/lastEnqueuedAt/nextRunAt/lastSkipReason/lastError`）；新增调度 API（`GET/PUT /schedule`、`/pause`、`/resume`、`/tick`），审计接口返回 `schedule`；前端插件面板新增调度器表单与控制按钮（保存/暂停/恢复/手动 tick）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/src/store.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`GET /api/plugins/raindropSync/schedule` 返回默认调度配置；`PUT /api/plugins/raindropSync/schedule` 保存配置成功；`POST /schedule/tick` 在窗口外返回 `outside_window` 跳过；`POST /schedule/pause` 后 `tick` 返回 `paused`；恢复并关闭窗口限制后 `tick` 命中 `max_concurrent` 跳过（并发限制生效）；`GET /api/plugins/raindropSync/audit` 返回 `schedule` 字段；首页 HTML 存在调度器表单/按钮元素。
- 后续：继续 `PH2-007`（扩展设备注册与云端配置下发）。

### 2026-02-22 14:36 CST
- 待办：`PH2-007`
- 内容：新增设备注册/状态上报/配置下发能力。服务端增加 `pluginDevices` 与 `pluginConfigMeta` 存储及设备 API（注册、状态上报、设备列表、按设备拉取配置 bundle）；`setConfig` 维护配置 revision。Chrome 扩展新增云端设备注册与状态上报（安装/启动/设置变更/同步状态写入后 best-effort 上报），新增“从云端拉取配置”按钮与 `PULL_CLOUD_CONFIG` 消息，将云端插件配置/调度配置下发并映射回扩展本地配置。插件面板新增 `Devices` 视图。扩展版本升至 `0.2.7`。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/background.js`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/options.html`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/options.js`, `/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/manifest.json`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/store.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/background.js /Users/xiaochou164/Desktop/bookmarktorain/chrome-extension/options.js`；使用 `curl` 模拟扩展设备 `register -> status -> config` 链路成功，设备记录中更新 `lastConfigPullAt/configRevisionSeen`；`GET /api/plugins/raindropSync/devices` 返回设备列表；前端页面存在 `pluginDevicesBtn/pluginDevices/pullCloudConfigBtn` 元素。
- 后续：继续 `PH2-008`（同步健康面板）。

### 2026-02-22 14:41 CST
- 待办：`PH2-008`
- 内容：新增 `GET /api/plugins/:id/health` 健康聚合接口，输出调度器状态、队列统计、任务/执行状态计数、24h 失败趋势（小时桶）、最近错误摘要、设备在线情况与健康标志（队列积压/僵尸运行/离线设备/近期失败）；前端插件面板新增 `Health` 按钮和健康输出视图，并在任务轮询/相关操作后自动刷新。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`GET /api/plugins/raindropSync/health` 返回调度器、队列、失败趋势、设备与健康标志字段；通过 `curl` 模拟设备注册后健康接口 `devices` 统计与 `statusCounts.devices` 正常；前端页面存在 `pluginHealthBtn/pluginHealth` 元素。
- 后续：进入 `PH3-001`（Metadata 抓取 worker）或先补“僵尸任务恢复/清理”维护项（建议）。

### 2026-02-22 14:49 CST
- 待办：`PH3-001`
- 内容：新增 metadata 抓取服务（`fetch + 超时 + HTML meta 解析`），提取标题、描述、OG 图、favicon、站点名与响应信息；书签模型增加 `metadata` 字段默认值；新增 `POST /api/bookmarks/:id/metadata/fetch` API，将抓取结果写回 `bookmark.metadata`（并在存在 `image` 时更新 `cover`，标题为空时回填标题）；前端详情面板新增 `Fetch Metadata` 按钮和 metadata 状态显示行。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/metadataFetcher.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/metadataFetcher.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；创建 `https://example.com/` 测试书签后调用 `POST /api/bookmarks/:id/metadata/fetch` 返回 `status=success` 且抓取到 `title=Example Domain`、`favicon=https://example.com/favicon.ico`，书签 `metadata.status` 回写成功；首页 HTML 存在 `fetchMetaBtn/detailMetaInfo` 元素。
- 后续：继续 `PH3-002`（抓取任务队列与重试策略）。

### 2026-02-22 15:06 CST
- 待办：`PH3-002`
- 内容：新增 metadata 抓取任务队列与重试策略（`metadataTasks`）：引入 `MetadataTaskManager`（进程内 worker + JSON 落库任务状态），支持任务状态 `queued/running/retry_scheduled/succeeded/failed`、指数退避重试（`baseBackoffMs`）、`timeoutMs/maxAttempts` 配置、重启后 `running` 任务恢复；新增 API：`POST /api/bookmarks/:id/metadata/tasks`、`GET /api/bookmarks/:id/metadata/tasks`、`GET /api/metadata/tasks`、`GET /api/metadata/tasks/:taskId`、`POST /api/metadata/tasks/:taskId/retry`。前端详情面板改为任务入队模式，新增 `metadata task` 状态显示行和 `Retry Metadata Task` 按钮，并对运行中任务进行轮询更新；同时提前补了卡片级 metadata 状态徽标（success/fetching/retry/failed），提升前端可见度。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/services/metadataTaskManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/metadataTaskManager.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；创建 `http://127.0.0.1:9/` 测试书签后调用 `POST /api/bookmarks/:id/metadata/tasks` 成功入队，随后 `GET /api/bookmarks/:id/metadata/tasks` 观察到 `retry_scheduled`（含 `nextRunAt`）；继续轮询 `GET /api/metadata/tasks/:taskId` 终态为 `failed`（`attempt=2/maxAttempts=2`）；调用 `POST /api/metadata/tasks/:taskId/retry` 成功生成新任务并进入重试链路。
- 后续：继续 `PH3-003`（对象存储抽象）或先补 `PH3-008`（抓取状态可视化）增强前端感知。

### 2026-02-22 16:02 CST
- 待办：`PH3-003`
- 内容：新增对象存储抽象 `ObjectStorage`（当前实现 `local` backend），支持 `putBuffer/putText/putJson/fetchAndStore` 与通用 bucket（`covers/snapshots/attachments`）；新增环境配置 `OBJECT_STORAGE_BACKEND/OBJECT_STORAGE_DIR`；服务启动时初始化本地对象目录并通过 `app.use('/api/assets', express.static(...))` 暴露对象访问 URL（后续用于文章快照与预览阅读模式资源）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/objectStorage.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/config.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：重启服务后启动日志包含 `objectStorageBackend/objectStorageDir`；`curl -sI http://localhost:3789/api/assets/...` 可访问后续落地的快照文件（见 `PH3-004` 验证）。
- 后续：继续 `PH3-004`（Readability 文章提取并落对象存储）。

### 2026-02-22 16:08 CST
- 待办：`PH3-004`
- 内容：新增文章提取服务（`JSDOM + @mozilla/readability`），实现 `extractArticleFromUrl/extractAndPersistArticle`：抓取 HTML、解析正文/标题/摘要/作者/发布时间等信息，生成阅读模式 HTML，并将 `source.html`、`reader.html`、`article.json` 写入对象存储；新增书签字段标准化 `article/preview`，并新增文章提取 API：`POST /api/bookmarks/:id/article/extract`、`GET /api/bookmarks/:id/article`。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/articleExtractor.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/package.json`, `/Users/xiaochou164/Desktop/bookmarktorain/package-lock.json`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`npm install jsdom @mozilla/readability` 完成；创建 `https://example.com/` 测试书签后调用 `POST /api/bookmarks/:id/article/extract` 返回 `article.status=success` 与 `readerHtmlUrl/sourceHtmlUrl/articleJsonUrl`；本地对象目录出现 `data/objects/snapshots/...-source.html/-reader.html/-article.json` 文件；`GET /api/bookmarks/:id/article` 返回已提取结果。
- 后续：继续 `PH3-005`（预览 API）。

### 2026-02-22 16:13 CST
- 待办：`PH3-005`
- 内容：新增预览 API `GET /api/bookmarks/:id/preview`，统一输出书签预览类型（`web/pdf/image/video/file`）、可渲染地址（iframe/image/video）、摘要信息（metadata/article 汇总）、reader 可用性与阅读模式资源 URL；增加 YouTube embed 识别（`watch?v=` / `youtu.be` -> `youtube.com/embed/...`）用于视频预览。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`GET /api/bookmarks/:id/preview`（example.com）返回 `kind=web` 且 `reader.available=true`；创建 `*.png` 测试书签后预览接口返回 `kind=image, render.mode=image`；创建 `*.pdf` 测试书签返回 `kind=pdf, render.mode=iframe`；YouTube 测试书签返回 `kind=video` 且 `render.url` 为 `https://www.youtube.com/embed/...`。
- 后续：继续 `PH3-006`（前端预览页）。

### 2026-02-22 16:22 CST
- 待办：`PH3-006`
- 内容：新增前端预览对话框（`previewDialog`）：支持 `iframe/image/video` 预览渲染、`Reader Mode` 按钮、`Extract Article` 按钮、`Open Original`、`Refresh` 与错误降级提示；新增详情区 `Preview` 按钮；卡片标题/封面/Preview 按钮可直接打开预览（卡片点击预览入口）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；首页 HTML 包含 `previewDialog/previewReaderBtn/openPreviewBtn` 元素；预览 API 成功返回时 `public/app.mjs` 通过 `openPreviewDialog()` 渲染 `iframe/image/video` 模式（手工 UI 回归待浏览器点击验证）。
- 后续：继续 `PH3-007`（卡片 metadata 展示升级）。

### 2026-02-22 16:28 CST
- 待办：`PH3-007`
- 内容：升级书签卡片展示：新增封面图区域（`cover`/`metadata.image`）、摘要文本优先级（`article.excerpt > metadata.description > note`）、类型徽标（Web/PDF/Image/Video/File），并保留 metadata 抓取状态徽标；卡片标题改为可点击预览入口。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；生成 image/pdf/video 测试书签后预览接口类型识别与卡片类型徽标逻辑一致（前端渲染依赖同一推断规则）。
- 后续：继续 `PH3-008`（抓取状态可视化增强）。

### 2026-02-22 16:34 CST
- 待办：`PH3-008`
- 内容：增强抓取状态可视化：详情区新增 `detailArticleInfo`（文章提取状态）、`detailFetchHistory`（最近 metadata 抓取任务历史）、`Extract Article` 按钮、`Refresh Fetch Status` 按钮；metadata 任务入队/重试后即时刷新历史，终态轮询结束后自动刷新列表与详情状态。与 `PH3-002` 的 metadata task 状态行 + Retry 按钮形成完整抓取状态 UI 闭环（抓取中/成功/失败/重试）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`GET /api/bookmarks/:id/metadata/tasks?limit=5` 为详情区任务历史提供数据；`POST /api/bookmarks/:id/metadata/tasks` 失败场景可观察 `retry_scheduled -> failed`；前端 HTML 包含 `detailArticleInfo/detailFetchHistory/extractArticleBtn/refreshFetchStatusBtn` 元素；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 通过。
- 后续：`Phase 3` 完成，进入 `Phase 4`（高亮/注释/提醒/导入导出）。

### 2026-02-22 17:08 CST
- 待办：`PH4-001`
- 内容：扩展书签数据模型以支持高亮与注释：在 `ensureDbShape()` 中新增高亮标准化（`highlights[]`）与嵌套注释标准化（`annotations[]`），统一字段结构 `id/text/quote/color/note/anchors/createdAt/updatedAt`，并在书签创建/更新路径中保证 `highlights`、`reminderState` 等字段存在。高亮定位信息采用锚点结构 `exact/prefix/suffix/startOffset/endOffset/selector`，为后续 reader 选区持久化预留。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`；`GET /api/bookmarks` 返回书签项时 `highlights` 为标准数组结构。
- 后续：继续 `PH4-002`（高亮/注释 API）。

### 2026-02-22 17:15 CST
- 待办：`PH4-002`
- 内容：新增高亮与注释 CRUD API（含权限校验预留字段）：`GET/POST /api/bookmarks/:id/highlights`、`PUT/DELETE /api/bookmarks/:id/highlights/:highlightId`、`POST/PUT/DELETE /api/bookmarks/:id/highlights/:highlightId/annotations/:annotationId?`。接口返回 `permissions: {canView, canEdit, canDelete}` 作为后续多用户权限模型占位；高亮支持锚点（定位信息）保存。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：使用 Node 脚本完成一轮 CRUD 冒烟（创建高亮 -> 更新 -> 创建注释 -> 更新注释 -> 删除注释 -> 删除高亮），成功返回 `hlColor=green`、`annText=ann2`；`GET /api/bookmarks/:id/highlights` 返回 `permissions` 字段和高亮列表。
- 后续：继续 `PH4-003`（前端高亮/注释 UI）。

### 2026-02-22 17:26 CST
- 待办：`PH4-003`
- 内容：新增前端高亮/注释 UI：详情面板新增 `Highlights` 区块（列表、数量摘要、刷新按钮、手动新增高亮）；支持高亮编辑/删除、注释新增/编辑/删除；预览对话框新增 `Highlight Selection` 按钮，在 Reader Mode 下从 iframe 选区提取文本并创建高亮（含 `exact/prefix/suffix/startOffset/endOffset` 基础锚点信息）。这实现了“阅读模式内选区 + 高亮列表 + 编辑删除”的最小闭环。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；首页 HTML 包含 `addHighlightBtn/detailHighlightsList/previewAddHighlightBtn` 元素；高亮接口回归 (`GET /api/bookmarks/:id/highlights`) 与前端渲染所需字段一致。浏览器内 Reader Mode 选区创建高亮为手工 UI 回归项（代码已接入）。
- 后续：继续 `PH4-004`（提醒模型与调度器）。

### 2026-02-22 17:38 CST
- 待办：`PH4-004`
- 内容：新增提醒模型与调度器：引入 `ReminderManager`（进程内定时扫描），维护书签 `reminderState`（`status/firedFor/lastTriggeredAt/lastDismissedAt/snoozedUntil/updatedAt`），在到期时写入 `reminderEvents`（`due`/`snoozed`/`dismissed`），并维护 `reminderSchedulerState.lastTickAt/lastScanResult`。服务启动时自动启动提醒扫描循环；新增提醒路由基线：`GET /api/reminders`、`POST /api/reminders/scan`、`POST /api/bookmarks/:id/reminder/{snooze,dismiss,clear}`。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/reminderManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/reminderRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：设置书签 `reminderAt` 为过去时间后调用 `POST /api/reminders/scan`，返回 `dueTriggered=1`；`GET /api/reminders` 返回 `summary.due` 与事件列表；随后调用 `snooze` 后 `summary.upcoming` 增加；调用 `dismiss` 后书签 `reminderState.status='dismissed'` 且 `reminderAt=null`。
- 后续：继续 `PH4-005`（前端提醒交互）。

### 2026-02-22 17:45 CST
- 待办：`PH4-005`
- 内容：增强前端提醒交互与状态展示：详情面板新增 `detailReminderInfo` 状态行，显示当前提醒状态（scheduled/due/snoozed/dismissed）及时间信息；新增快捷操作按钮 `Snooze 1h`、`Dismiss Reminder`、`Clear Reminder`、`Scan Reminders`，与现有 `Reminder` 输入 + `Save` 形成设置/修改/清除/状态展示闭环。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；首页 HTML 包含 `detailReminderInfo/snoozeReminderBtn/dismissReminderBtn/clearReminderBtn/scanRemindersBtn` 元素；提醒 API 冒烟脚本验证 `scan -> snooze -> dismiss` 流程成功，并能在前端刷新后显示新的 `reminderState`。
- 后续：继续 `PH4-006`（浏览器书签 HTML 导入器）。

### 2026-02-22 18:12 CST
- 待办：`PH4-006`
- 内容：新增浏览器书签 HTML 导入能力（Netscape Bookmark File）：实现 `parseBookmarksHtml()`（JSDOM 解析、文件夹路径恢复），支持导入到目标集合、冲突策略（`skip/update/duplicate`），并通过统一 `ioTasks` 队列任务化执行（避免前端阻塞）。修复 JSDOM 解析下 `DL` 挂在 `DT` 内部时无法识别的问题。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/bookmarkTransfer.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/services/ioTaskManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/ioRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：Node 脚本调用 `parseBookmarksHtml()` 可正确解析示例 Netscape HTML（返回 2 条带 `folderPath=['Imported']` 的记录）；通过 `POST /api/io/tasks` 提交 `import_html` 任务后轮询 `GET /api/io/tasks`，任务成功并返回 `result.total=2/created=2/foldersCreated=1`。
- 后续：继续 `PH4-007`（JSON/CSV 导入器）。

### 2026-02-22 18:20 CST
- 待办：`PH4-007`
- 内容：新增 JSON/CSV 导入器（统一走 `ioTasks`）：JSON 支持导入 `[{...}]` 数组或 `{folders, bookmarks}` 导出结构；CSV 实现基础解析器（含引号/转义）和表头推断映射（`inferCsvMapping`），并支持前端自定义 CSV 字段映射 JSON；导入路径支持目标集合、冲突策略和文件夹路径自动创建。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/bookmarkTransfer.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/services/ioTaskManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/ioRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：通过 `io` 任务队列提交 `import_csv` 与 `import_json` 任务，成功返回 `format=csv/json` 与 `created/updated/skipped/foldersCreated` 汇总；在 `conflictStrategy=update` 场景下重复导入返回 `updated=1`（无重复新建）。
- 后续：继续 `PH4-008`（导出 HTML/JSON/CSV）。

### 2026-02-22 18:28 CST
- 待办：`PH4-008`
- 内容：新增导出器（统一走 `ioTasks` + 对象存储文件输出）：`export_json`（含 `folders/bookmarks`）、`export_csv`（含 `folderPath/tags/note/reminderAt` 等字段）、`export_html`（Netscape Bookmark File）；导出文件保存到对象存储 `exports` bucket，同时生成任务报告 JSON 到 `reports` bucket。修复 `export_html` 构建时将 `root` 当成自身子节点导致的递归栈溢出问题。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/bookmarkTransfer.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/services/ioTaskManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/ioRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：通过 `io` 任务队列提交 `export_json/export_csv/export_html` 任务，均成功返回 `outputFile.url` 与 `reportFile.url`；`GET /api/io/tasks/:taskId` 返回 `status=succeeded`、`result` 汇总和对象存储文件元数据。
- 后续：继续 `PH4-009`（前端导入导出任务进度 UI）。

### 2026-02-22 18:40 CST
- 待办：`PH4-009`
- 内容：新增前端 `Import / Export` 对话框与任务进度面板：支持文件读取（本地文件 -> 文本 payload）、导入格式选择（HTML/JSON/CSV）、CSV 映射 JSON、冲突策略、导出格式与范围（全部/当前文件夹/已选书签）、任务列表、任务详情输出、打开导出文件/报告、重试失败任务、轮询运行中任务状态。为导入大文本 payload 将全局 JSON body 限制从 `1mb` 提升到 `10mb`（`src/http/setup.js`）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/src/http/setup.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/src/http/setup.js`；首页 HTML 包含 `importExportBtn/ioDialog/ioQueueImportBtn/ioTaskList` 元素；`io` 任务综合冒烟（`import_html/import_csv/import_json/export_json/export_csv/export_html`）全部成功，并在 `GET /api/io/tasks` 中返回终态、结果汇总、导出文件 URL 和报告 URL。
- 后续：`Phase 4` 完成，进入 `Phase 5`（用户系统与协作）。

### 2026-02-22 20:40 CST
- 待办：`PH5-001`
- 内容：实现用户系统与认证基线：新增注册/登录/登出、会话 Cookie 与 Personal Access Token（PAT）双认证方式；后端引入 `AuthService`、认证路由（`/api/auth/*`）与 API 鉴权中间件（保护 `/api/*`，放行 `/api/health` 和认证路由）；新增 `users/authSessions/apiTokens` 存储结构。前端新增认证对话框（登录/注册/账户信息/PAT 管理），应用启动时先检查 `/api/auth/me`，未登录则进入认证流程；补 `401` 事件处理，自动弹出登录框。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/authService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/authRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/http/errors.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/js/api.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check`（`src/services/authService.js`, `src/routes/authRoutes.js`, `src/server.js`, `src/store.js`, `public/app.mjs`, `public/js/api.mjs`）通过；未登录访问 `GET /api/state` 返回 `401 AUTH_REQUIRED`；`GET /api/auth/me` 未登录返回 `{authenticated:false}`；注册/登录后会话访问 `/api/auth/me` 返回 `method=session`；创建 PAT 后使用 `Authorization: Bearer <PAT>` 可访问 `/api/state`；撤销 PAT 后再次访问返回 `AUTH_REQUIRED`；登出后会话失效。
- 后续：继续 `PH5-002`（多租户数据隔离）。
