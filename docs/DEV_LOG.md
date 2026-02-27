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

### 2026-02-22 20:56 CST
- 待办：`PH5-002`
- 内容：实现多租户数据隔离（`userId` 维度）并补旧数据迁移/初始化：新增 `tenantScope` 工具模块（`ensureTenantData`、`scopeDbForUser`、插件 `userId+pluginId` 复合 key、首次登录租户初始化中间件）。`folders/bookmarks` 相关路由全部按 `req.auth.user.id` 过滤和写入 `userId`；`system/tags/reminders/io/metadata tasks` 路由与 managers 增加 `userId` 过滤，导入导出/metadata task/提醒事件记录写入 `userId`；`PluginManager` 改为支持用户作用域配置/状态/调度/设备/任务/运行日志，并在插件执行时使用“用户作用域 DB 视图 + 合并回写”避免 `raindropSync` 读取/修改其他账号的书签与文件夹。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/tenantScope.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/systemRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/tagRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/folderRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/reminderRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/ioRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/pluginRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/services/reminderManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/services/metadataTaskManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/services/ioTaskManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/services/bookmarkTransfer.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check` 通过（上述后端路由/manager/pluginManager/tenantScope/server 文件）；双账号冒烟脚本验证通过：用户1创建文件夹/书签/插件配置/IO 任务后，用户2读取 `/api/folders`、`/api/bookmarks`、`/api/plugins/raindropSync/config`、`/api/io/tasks`、`/api/reminders` 均不包含用户1数据（用户2仅看到自己的 root 文件夹），同时用户1仍能看到自己的书签、插件配置和 IO 任务。
- 后续：继续 `PH5-003`（权限模型）。

### 2026-02-22 20:59 CST
- 待办：`PH5-003`
- 内容：新增权限模型基线与后端鉴权上下文：实现 `permissionService`（`owner/editor/viewer` 角色动作矩阵、资源角色计算、`can/assert` 接口）和 `createAuthorizationMiddleware()`，在认证与租户初始化后为所有 `/api` 请求注入 `req.authz`。当前阶段资源权限仍以 owner-only 为主，但接口层已统一通过 `req.authz` 输出权限能力，后续共享集合（`PH5-005`）可直接复用。高亮/注释接口返回的 `permissions` 字段已切换到 `req.authz.bookmarkPermissions()` 计算。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/permissionService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/permissionService.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`；Node 脚本验证 `permissionService` 的 owner/non-owner 动作判断（owner 可读写，非 owner 不可删）；接口冒烟验证新用户创建书签后 `GET /api/bookmarks/:id/highlights` 返回布尔型 `permissions.canView/canEdit/canDelete`。
- 后续：继续 `PH5-004`（用户设置页：账号信息、token、设备会话管理）。

### 2026-02-22 21:30 CST
- 待办：`PH5-001`（认证 UX 跟进，非新增 TODO）
- 内容：将未登录态从主界面弹窗认证改为独立登录页：新增 `/login.html` + `/login.mjs`（登录/注册 tab、登录成功后按 `next` 参数返回原页面）；主应用在初始化检测未登录、运行时收到 `401`、手动登出时统一跳转 `/login.html`，不再弹出登录对话框。保留主界面中的账号弹窗用于已登录用户查看账号信息和管理 API Token。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/login.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/login.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/login.mjs`；`GET /login.html` 返回登录页面（包含 `loginForm/registerForm` 和 `/login.mjs` 引用）；`GET /login.mjs` 包含 `redirectToNext()` 与 `/api/auth/login` 调用逻辑。
- 后续：继续 `PH5-004`（用户设置页，前端页面化账号管理）。

### 2026-02-22 21:36 CST
- 待办：`PH5-004`
- 内容：新增独立用户设置页（`/settings.html` + `/settings.mjs`），覆盖账号信息、API Token、登录会话、Raindrop 同步设备列表；主界面工具栏新增 `Settings` 入口。后端补齐 `GET/PUT /api/auth/profile`、`GET /api/auth/sessions`、`DELETE /api/auth/sessions/:sessionId`，支持资料更新和会话管理（当前会话被吊销时清理 Cookie 并重新登录）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/authService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/authRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/authService.js /Users/xiaochou164/Desktop/bookmarktorain/src/routes/authRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`GET /settings.html` 返回设置页（包含 `profileForm/settingsSessionsList/settingsDevicesList` 和 `/settings.mjs` 引用）；注册新用户后 `GET /api/auth/profile`、`PUT /api/auth/profile`、`GET /api/auth/sessions` 冒烟通过（能更新昵称并返回当前会话列表）。
- 后续：继续 `PH5-005`（共享集合）。

### 2026-02-22 22:10 CST
- 待办：`PH5-005`, `PH5-006`, `PH5-007`
- 内容：完成协作与分享能力首版并接入设置页管理面板。新增协作路由 `/api/collab/*`：共享集合（邀请、收件箱、接受邀请、角色变更、删除）、公开页面链接（创建/启停/删除）、协作审计日志查询；新增公开只读访问端点 `/public/c/:token` 与 `/public/c/:token.json`。设置页新增 `Shared Collections`、`Public Links`、`Collaboration Audit` 面板，支持创建邀请、接受共享、角色调整、创建公开链接、启停公开链接、查看审计记录。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/collabRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/collabRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/src/store.js /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；双账号冒烟通过：owner 创建集合与邀请，member 在 `/api/collab/shares` 收到邀请并 `accept`，owner 可修改角色为 `viewer`；公开链接 `/public/c/:token.json` 可返回 `bookmarks`；`GET /api/collab/audit` 返回 `share.*` 与 `public_link.*` 事件；设置页 HTML/JS 的协作面板 ID 对齐检查通过（`byId(...)` 全量匹配）。
- 后续：进入 `Phase 6`（产品化能力）。

### 2026-02-22 22:22 CST
- 待办：`PH6-001`, `PH6-002`, `PH6-003`, `PH6-004`, `PH6-006`, `PH6-007`, `PH6-008`, `PH6-009`
- 内容：完成产品化能力后端与设置页控制面板（除主界面高级搜索 UI 另记）。新增 `/api/product/*` 路由：entitlements（Free/Pro 能力开关与 gating）、subscription（手动订阅状态占位/切换）、quota（配额统计）、full-text index rebuild/search query 基线、去重扫描、坏链扫描任务与任务列表、备份创建/列表/恢复、AI 建议任务与历史。设置页新增 `Plan & Entitlement`、`Quota`、`Search/Dedupe/Broken Links`、`Backups`、`AI Suggestions` 面板与交互按钮。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：统一 API 冒烟脚本通过：`/api/product/entitlements` 初始 `free`；`POST /api/product/search/index/rebuild` 在 Free 下返回 `FEATURE_GATED`；`PUT /api/product/subscription` 切换 `pro` 后 entitlement 生效；`GET /api/product/quota` 返回配额与使用量；`POST /api/product/search/index/rebuild` 成功并返回 `indexed`；`GET /api/product/dedupe/scan` 检测到重复 URL；`POST /api/product/broken-links/scan` 与 `GET /api/product/broken-links/tasks` 返回任务记录；`POST /api/product/backups` + `GET /api/product/backups` + `POST /api/product/backups/:id/restore` 通过；`POST /api/product/ai/suggest/:bookmarkId` + `GET /api/product/ai/jobs` 通过并回写 `bookmark.aiSuggestions`。同时 `GET /settings.html` 已包含产品化面板关键元素（`productPlanSelect/quotaRefreshBtn/dedupeScanBtn/brokenLinkScanBtn/backupCreateBtn/aiSuggestBtn`）。
- 后续：补齐 `PH6-005`（主界面高级搜索 UI）。

### 2026-02-22 22:31 CST
- 待办：`PH6-005`
- 内容：完成主界面高级搜索 UI（非设置页）：在首页工具栏新增 `Advanced` 入口和可折叠筛选面板，支持组合筛选（`tags/domain/type/favorite/archived`）、启用/禁用高级搜索、保存查询、加载已保存查询、删除已保存查询，并将高级搜索与现有 `q/view/folder/sort/page/pageSize` 联动。为此扩展产品化搜索 API：`GET /api/product/search/query` 新增分页（`page/pageSize`）、`view/folderId/sort` 支持；新增 `PUT/DELETE /api/product/search/saved/:id`。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；首页 HTML 包含 `advancedSearchPanel/advancedSearchEnabled/advancedSearchSavedSelect` 元素；API 冒烟验证 `GET /api/product/search/query?q=example&domain=example.com&page=1&pageSize=2&sort=title` 返回分页元数据；`POST/GET/PUT/DELETE /api/product/search/saved*` 全链路通过；`Trash` 视图下高级搜索自动回退普通列表查询（避免误空结果）。
- 后续：`Phase 5` 与 `Phase 6` 完成，进入 `Phase 7`（基础设施与发布质量）。

### 2026-02-22 23:05 CST
- 待办：页面汉化（前端 UI 文案清理，非独立 TODO）
- 内容：完成主界面、登录页、设置页以及公开分享页面的中文化；覆盖静态 HTML 文案与前端运行时提示（toast、空态、弹窗提示、预览/高亮/导入导出/同步任务状态等）。保留品牌名与技术缩写（如 `Rainboard`、`PDF/JSON/CSV`、`API Token`）不翻译。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/login.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/login.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/collabRoutes.js`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/login.mjs /Users/xiaochou164/Desktop/bookmarktorain/src/routes/collabRoutes.js`；`GET /` 页面包含 `快捷入口/高级搜索/导入 / 导出/新建书签/标签管理`；`GET /settings.html` 页面包含 `用户设置/共享集合/公开页面/套餐与订阅/备份与恢复`。
- 后续：按你的要求切换 `PH7-001` 为 SQLite 基线实现。

### 2026-02-22 23:14 CST
- 待办：`PH7-001`（调整为 SQLite 基线）
- 内容：将 `PH7-001` 从 PostgreSQL 方案调整为 SQLite 基线并完成实现。新增 `SQLiteStore`（接口兼容 `JsonStore`，读写单一 `app_state` JSON 文档，带写锁与事务），支持首次从现有 `db.json` 导入；新增配置项 `DB_BACKEND`（默认 `sqlite`）与 `SQLITE_FILE`；服务启动按后端配置自动选择 `JsonStore/SQLiteStore`。新增 SQLite schema 与工具脚本：`db/sqlite/schema.sql`、`scripts/sqlite-migrate.js`、`scripts/import-json-to-sqlite.js`；补充 npm scripts `db:sqlite:migrate`、`db:sqlite:import-json`。更新实施计划与 TODO 为“先 SQLite，后续可扩 PostgreSQL”。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/config.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/db/sqlite/schema.sql`, `/Users/xiaochou164/Desktop/bookmarktorain/scripts/sqlite-migrate.js`, `/Users/xiaochou164/Desktop/bookmarktorain/scripts/import-json-to-sqlite.js`, `/Users/xiaochou164/Desktop/bookmarktorain/package.json`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/IMPLEMENTATION_PLAN.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/store.js /Users/xiaochou164/Desktop/bookmarktorain/src/config.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/scripts/sqlite-migrate.js /Users/xiaochou164/Desktop/bookmarktorain/scripts/import-json-to-sqlite.js`；`npm run db:sqlite:migrate -- /tmp/bookmarktorain_test.sqlite` 成功创建 `schema_migrations/app_state`；`node scripts/import-json-to-sqlite.js data/db.json /tmp/bookmarktorain_test.sqlite` 成功导入并输出汇总；重启服务后启动日志显示 `dbBackend: 'sqlite'`，并验证 `data/db.sqlite` 中 `app_state('main')` 包含 `folders=35/bookmarks=185/users=14`。
- 后续：继续 `PH7-002`（Redis/BullMQ 队列基础设施，替换进程内队列）。

### 2026-02-22 22:19 CST
- 待办：前端 UI 对齐（Raindrop 风格账号入口，非独立 TODO）
- 内容：按 Raindrop 网页端交互风格调整左上角账号入口：在侧边栏顶部增加用户名/邮箱展示区与下拉菜单（账号与 Token、设置、退出登录）；桌面端隐藏顶部工具栏重复的“设置/账号”按钮（移动端保留）；未登录态显示“登录”入口并跳转独立登录页。补齐侧边菜单状态管理、点击外部关闭、`Esc` 关闭、菜单项跳转与复用现有登出流程，避免账号入口与顶栏行为不一致。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`GET /` 页面包含 `sidebarAccountArea/sidebarAccountBtn/sidebarAccountMenuLogout`；代码路径已覆盖登录、设置、退出登录、401 自动跳转与菜单收起逻辑。
- 后续：继续按你提出的“对照 Raindrop 前端做对齐”方向，补下一批差异项（导航密度、卡片信息层级、详情面板布局、图标与间距）。

### 2026-02-22 22:26 CST
- 待办：前端 UI 对齐（书签布局模式，非独立 TODO）
- 内容：新增书签展示布局切换（默认“行”列表），支持 `行 / 卡片 / 标题 / 看板` 四种模式；将布局模式与左侧业务视图（全部/收藏/归档）解耦，并使用 `localStorage` 持久化布局偏好。看板模式优先展示封面/metadata 图片；对无封面项新增“拉取首页预览”按钮（调用 metadata 抓取接口）以补齐看板视觉素材。补充对应的列表行样式、标题行样式、看板样式及移动端响应式规则。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；首页 HTML 包含 `bookmarkLayoutSwitch` 与四个 `data-layout-mode` 按钮；代码中已接入 `data-fetch-home-preview` 元数据抓取入口与布局切换事件绑定。
- 后续：继续对齐 Raindrop 前端差异（导航图标体系、列表列信息密度、详情面板分组与按钮位置）。

### 2026-02-22 22:28 CST
- 待办：认证 UX 对齐（未登录直接跳转登录页，非独立 TODO）
- 内容：新增服务端页面导航重定向中间件，拦截未登录用户访问 `"/"` 与 `*.html` 页面请求时直接 `302` 到 `/login.html?next=...`，避免先加载主页面再由前端检查会话后跳转的闪屏行为。放行 `"/login.html"`、`"/api/*"`、`"/openapi.json"` 与公开分享路径 `"/public/c/*"`。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/server.js`；`curl -I /` 返回 `302 Location: /login.html?next=%2F`；`curl -I /login.html` 返回 `200`。
- 后续：继续前端对齐项（列表细节密度、详情面板布局、导航图标与交互）。

### 2026-02-22 22:40 CST
- 待办：前端 UI 对齐（侧栏/列表/详情面板，非独立 TODO）
- 内容：继续对齐 Raindrop 风格前端。侧栏快捷入口增加图标化导航项（图标/标题/计数结构）；“行”布局升级为更紧凑的列式列表（主信息列 + 右侧信息列 + 桌面端悬停显示操作按钮，移动端保持按钮常显）；右侧详情面板重构为摘要卡片 + 分组编辑区（基本信息、状态与提醒、抓取与阅读、高亮），并将底部操作条改为 sticky 样式。`renderDetail()` 同步填充新的摘要卡片（类型/标题/域名/时间/状态 chips）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`；`public/app.mjs` 中 `byId(...)` 与 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的 DOM id 对齐检查通过（无缺失项）。
- 后续：继续对齐 Raindrop 细节（左栏图标体系统一、列表操作图标化、顶部过滤器层级、详情面板信息密度与图标）。

### 2026-02-22 22:44 CST
- 待办：前端 UX 修复与对齐清单整理（非独立 TODO）
- 内容：修复“新建集合取消按钮触发必填校验无法关闭”的问题：为所有 `method="dialog"` 表单的取消/关闭按钮补充 `type="submit" + formnovalidate`，避免浏览器在取消时执行必填校验。同时在 `docs/TODO.md` 新增“Raindrop 前端对齐 TODOLIST（Web）”，按导航/工具栏/列表/详情/预览/对话框/登录设置页/视觉系统/验收回归分组整理已完成与待完成项，作为后续对齐工作的统一执行清单。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`rg \"formnovalidate\" /Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 命中 4 个对话框按钮；`docs/TODO.md` 已包含 `Raindrop 前端对齐 TODOLIST（Web）` 与 `RA-UI-001 ~ RA-UI-803` 条目。
- 后续：按 `RA-UI` 清单继续逐项对齐（优先图标系统、顶部工具栏、列表操作图标化）。

### 2026-02-22 22:51 CST
- 待办：`RA-UI-004`, `RA-UI-103`, `RA-UI-204`
- 内容：完成一轮图标系统对齐。新增前端内置 SVG 图标函数并将左侧快捷入口切换为统一图标名渲染（替换临时字符图标）；布局切换按钮改为图标按钮并自动注入 `tooltip + aria-label`；行列表操作按钮改为图标化按钮（桌面端悬停显示、移动端仍保留可点区域），统一 `打开/预览/收藏/删除/恢复` 图标与无障碍标签。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`；`public/app.mjs` 对 `public/index.html` 的 `byId(...)` 引用对齐检查通过（无缺失）；`TODO` 中 `RA-UI-004/103/204` 已标记完成。
- 后续：继续 `RA-UI-101/104/106`（顶部工具栏与筛选/批量操作层级重构）以及 `RA-UI-203`（行列表可配置列信息）。

### 2026-02-22 23:01 CST
- 待办：`RA-UI-101`, `RA-UI-104`, `RA-UI-106`
- 内容：完成一轮工具栏/筛选/批量操作条对齐。首页顶部工具栏改为左右分区结构（搜索主区 + 操作区）并增加面板式背景；高级筛选面板重构视觉层级（更清晰的表单标签、分隔线、边框与背景层次）；视图头部操作区拆分为“通用操作”和“批量操作条”，批量操作条仅在存在选中项时显示，并实时展示选中数量（`已选 N 项`）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`；`public/app.mjs` 对 `public/index.html` 的 `byId(...)` 引用对齐检查通过（无缺失）；首页可见 `bulkActionsBar` 容器并由 `renderHeader()` 控制显隐与计数文案。
- 后续：继续 `RA-UI-203/205/206/208`（列表/卡片/标题/看板视图细化）与 `RA-UI-304/305`（详情面板交互细节）。

### 2026-02-22 23:06 CST
- 待办：`RA-UI-101` 回归修复（工具栏布局）
- 内容：修复顶部工具栏布局异常（右侧排序下拉被 `.toolbar select { width:100% }` 覆盖导致撑满整行并触发多行换行）。通过提高选择器优先级将右侧排序下拉宽度固定为 `170px`，并让桌面端工具栏右侧控件默认不换行；移动端断点下再恢复换行与自适应宽度。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`
- 验证：样式规则检查确认存在 `.toolbar .toolbar-right > select { width: 170px; ... }` 覆盖规则；移动端断点下存在对应 `width:100%` 回退规则。
- 后续：继续视图细化项（`RA-UI-205/206/208`）。

### 2026-02-22 23:12 CST
- 待办：`RA-UI-205`, `RA-UI-206`, `RA-UI-208`
- 内容：完成书签视图细化一轮。卡片视图收敛信息层级（封面比例、边框/阴影、顶部信息与操作区更紧凑，操作改为图标化）；标题视图强化极简列表体验（悬停显示图标操作、集合信息补充、行内状态更清晰）；看板视图改为 CSS 多列瀑布流布局，并引入基于封面与摘要长度的尺寸分级（`board-cover/medium/tall` 等）提升列平衡效果。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`；`public/app.mjs` 对 `public/index.html` 的 `byId(...)` 引用对齐检查通过（无缺失）；`TODO` 中 `RA-UI-205/206/208` 已标记完成。
- 后续：继续 `RA-UI-203`（行列表可配置列信息）与 `RA-UI-304/305`（详情面板头部操作图标化、查看/编辑态分离）。

### 2026-02-22 23:22 CST
- 待办：`RA-UI-203`, `RA-UI-304`, `RA-UI-305`（参考 `/tmp/raindropio-app`）
- 内容：参照 `raindropio/app` 的 `co/bookmarks/item/view.js`（Info/Actions 分层）与 `routes/my/item/toolbar/index.js`（详情头部工具栏）继续对齐。首页“行列表”新增列表列配置菜单（集合/类型/摘要/标签/时间，可持久化到 `localStorage`，仅在行布局显示）；详情摘要卡片新增头部图标操作栏（打开/预览/编辑/取消编辑/删除/恢复）；详情字段新增查看/编辑态分离，默认只读，点击“编辑”后进入可编辑模式，保存后自动退出编辑态。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/js/constants.mjs`；`public/app.mjs` 对 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的 `byId(...)` 引用对齐检查通过（无缺失）；`TODO` 中 `RA-UI-203/304/305` 已标记完成。
- 后续：继续 `RA-UI-502/503/505`（对话框与表单 UX 收口）以及 `RA-UI-401/403`（预览弹窗视觉与状态统一）。

### 2026-02-22 23:33 CST
- 待办：`RA-UI-401`, `RA-UI-403`, `RA-UI-502`, `RA-UI-503`, `RA-UI-505`（参考 `/tmp/raindropio-app` 的预览/表单交互分层）
- 内容：继续参照 `raindropio/app` 的“信息层级 + 工具条 + 状态反馈”思路，完成一轮预览弹窗与对话框 UX 收口。预览弹窗新增统一状态 badge（未加载/加载中/已加载/降级预览/加载失败）、状态说明文案与加载遮罩层，并统一失败/降级提示文案；重构“新建书签/新建集合”对话框为头部说明 + 主体字段区 + 底部操作区的布局，同时增加内联字段高亮和表单顶部错误提示（替代浏览器原生气泡提示）；新增通用确认/输入弹窗 `actionDialog`，将主页面 `confirm/prompt` 交互（API Token 吊销、高亮/注释增删改、保存查询、删除已保存查询、手动新增高亮、批量删除）替换为统一样式对话框；顺手修复 `metadata fetch history` 的 `attempt` 变量错误和注释删除按钮 `dataset` 键名错误，避免详情侧栏运行时报错。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg \"window\\.(confirm|prompt)\" /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 无命中；`public/app.mjs` 对 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的 `byId(...)` 引用对齐检查通过（无缺失）；`TODO` 中 `RA-UI-401/403/502/503/505` 已标记完成。
- 后续：继续 `RA-UI-402/404`（预览工具条与详情联动）、`RA-UI-603/604`（设置页 IA 与面板视觉收敛）。

### 2026-02-22 23:44 CST
- 待办：`RA-UI-402`, `RA-UI-404`, `RA-UI-603`, `RA-UI-604`（继续参考 `/tmp/raindropio-app` 的工具条/设置侧栏信息架构）
- 内容：完成预览工具条与设置页信息架构对齐一轮。预览弹窗工具条按分组重构（内容操作组、阅读模式组、关闭组），加入图标化按钮、阅读模式按钮 `aria-pressed` 状态、高亮按钮激活态；详情摘要 chips 增加预览状态联动（加载中/已打开/降级/失败/阅读模式），关闭预览后会同步回退。设置页从单纯卡片平铺改为左侧分组导航（账号与安全 / 共享与公开 / 产品能力）+ 右侧分组内容区的 IA，新增侧栏账号摘要、锚点导航与滚动高亮；右侧内容增加分组标题、状态条、分段容器和统一面板视觉层级，整体更接近 Raindrop settings 的侧栏导航 + 分组内容模式。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；`app.mjs/index.html` 与 `settings.mjs/settings.html` 的 `byId(...)` 引用对齐检查均通过（无缺失）；`TODO` 中 `RA-UI-402/404/603/604` 已标记完成。
- 后续：继续 `RA-UI-306/307`（详情面板抓取信息层级与高亮/注释侧栏交互）以及 `RA-UI-602/605/701+`（登录页/公开页与视觉系统细节收敛）。

### 2026-02-23 13:23 CST
- 待办：完成 `RA-UI` 清单剩余项（`005/006/007/105/209/210/306/307/504/602/605/701/702/703/704/705/706/801/802/803`）
- 内容：清空剩余 `RA-UI` 对齐项。侧栏新增“已保存查询”导航入口并可直接应用查询；集合树增加展开/折叠箭头、hover 快捷筛选按钮与折叠全部入口；标签区新增排序切换、更多/收起与状态提示。书签列表增加统一选中态/hover 态反馈、骨架屏、空态/错误态与重试按钮。详情面板“抓取与阅读”区新增摘要状态 chips + 折叠详情，高亮列表改为更接近侧栏注释区的可折叠卡片。对话框尺寸/滚动/移动端按钮布局进一步统一。登录页升级品牌区/功能说明与表单区层级；公开分享页（`/public/c/:token`）重构为头部集合信息 + 卡片列表布局，并补充空态/错误态与基础转义。视觉系统层面统一了一轮 token（颜色/圆角/阴影/focus）、排版层级与 hover/focus/active 动效；主页面新增基础快捷键（`/`, `j/k`, `o`, `e`, `Delete`, `?`）和输入场景保护；补充移动端顺序与对话框适配细节。新增 UI 验收/截图对比/前端回归三份文档用于 `RA-UI-801/802/803`。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/login.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/collabRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_UI_ACCEPTANCE_CHECKLIST.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_UI_SCREENSHOT_COMPARE.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/FRONTEND_REGRESSION_CHECKLIST.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs /Users/xiaochou164/Desktop/bookmarktorain/public/login.mjs /Users/xiaochou164/Desktop/bookmarktorain/src/routes/collabRoutes.js`；`app.mjs/index.html`、`settings.mjs/settings.html`、`login.mjs/login.html` 的 `byId(...)` 引用对齐检查通过（`app.mjs` 动态生成的 `cardsRetryBtn` 需运行时渲染后出现）；`docs/TODO.md` 中 `RA-UI-*` 已无未完成项。
- 后续：建议进入截图对比与回归执行阶段，使用新文档做验收闭环。

### 2026-02-23 13:40 CST
- 待办：`PH7-002`（第一阶段：队列基础设施与插件任务队列接入）
- 内容：新增可切换队列后端基础设施 `src/infra/jobQueue.js`，提供 `memory` 与 `bullmq`（可选）两类 broker，统一 `createProcessorQueue/enqueue/close` 接口；在 `src/config.js` 增加 `QUEUE_BACKEND`、`REDIS_URL`、`QUEUE_PREFIX` 配置并在启动日志输出队列配置；将 `PluginManager` 的插件执行任务从进程内数组队列优先切换到队列 broker（默认 `memory`），保留旧 `taskQueue + kickTaskLoop` 作为无 broker 回退路径；服务启动时创建队列 broker 并注入 `PluginManager`，启动日志新增 `[job-queue]` 状态信息。补充 `package.json/package-lock.json` 的 `bullmq`、`ioredis` 依赖声明（默认不启用，需设置 `QUEUE_BACKEND=bullmq` 且提供 `REDIS_URL`）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/infra/jobQueue.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/config.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/package.json`, `/Users/xiaochou164/Desktop/bookmarktorain/package-lock.json`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/infra/jobQueue.js /Users/xiaochou164/Desktop/bookmarktorain/src/pluginManager.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js /Users/xiaochou164/Desktop/bookmarktorain/src/config.js`；重启服务后启动日志显示 `queueBackend: 'memory'` 与 `[job-queue] { requested: 'memory', active: 'memory' }`；`POST /api/plugins/raindropSync/tasks`（无 token）创建任务后可经新队列链路进入 `failed` 终态并写入 `runLogId/error`；`createJobQueueBroker({ queueBackend:'bullmq' })` 在未设置 `REDIS_URL` 时正确回退到 `memory` 并返回 `fallbackReason: 'missing_redis_url'`。
- 后续：继续 `PH7-002` 第二阶段（`metadataTasks/ioTasks` 接入统一队列 broker，逐步替换轮询/进程内任务驱动）。

### 2026-02-23 13:55 CST
- 待办：集合树上下文菜单（前端对齐增强，非独立 Phase 项）
- 内容：为侧栏集合树增加右键/“…”上下文菜单（更贴近 Raindrop 交互），菜单项包含：`直接在浏览器打开 所有书签`、`创建嵌套的集合`、`选择`、`改名`、`更改图标`、`分享`、`删除`。实现集合树行右键打开菜单与“…”按钮触发；菜单支持点击外部关闭、`Esc` 关闭、滚动关闭与视口内定位。集合菜单动作复用现有 API/弹窗：创建子集合会预填父级并打开新建集合弹窗；改名使用统一 `uiPrompt`；删除使用统一确认弹窗；分享调用 `/api/collab/public-links` 复用或创建公开链接并尝试复制到剪贴板；“选择”会切换到该集合并选中当前页书签；“打开所有书签”按集合子树范围批量在浏览器新标签页打开（超量前确认）。同时新增集合 `icon`（emoji）字段的后端支持（创建/更新/归一化）与前端树节点渲染，从而“更改图标”会真实持久化显示。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/folderRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/src/routes/folderRoutes.js /Users/xiaochou164/Desktop/bookmarktorain/src/server.js`；`curl` 冒烟验证 `POST /api/folders` 创建集合后 `PUT /api/folders/:id {icon:\"📚\"}` 成功，随后 `GET /api/folders` 返回该集合 `icon:\"📚\"`；`public/index.html` 已包含 `collectionContextMenu` 与集合弹窗标题/副标题 id。
- 后续：继续 `PH7-002` 第二阶段（统一队列接入 `metadata/io` 任务管理器）。

### 2026-02-23 14:18 CST
- 待办：前端工作台布局对齐（参考用户提供的 Raindrop 运行时 DOM / 截图）
- 内容：基于用户提供的 `app.raindrop.io/my/0` 运行时 DOM（非 `view-source` 壳页面）进行一轮“布局级”对齐，重点收敛分栏结构、侧栏密度、顶部工具栏和默认行列表样式。工作台改为更接近 split-view 的平铺布局（去卡片化圆角/阴影、分隔线边界），侧栏账号入口与树列表行高度压缩到接近 32px，品牌区隐藏以减少视觉噪声；顶部工具栏与视图头部改为扁平样式，缩小按钮/输入高度并增强信息密度。默认行列表改为接近 Raindrop 的分隔线样式（去卡片边框圆角、56x48 缩略图、hover 操作按钮区、右侧动作收敛），并将“时间”移动到行内元信息串，列表旗标改为仅显示收藏/归档（不再显示未读绿点）以降低视觉干扰。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；人工检查 `public/app.mjs` 行列表渲染中 `subline` 拼接顺序已变为 `集合 / 域名 / 时间 / 类型`（按开关裁剪）。
- 后续：若需要继续向 Raindrop 靠拢，可进一步处理顶部工具栏控件位置（把排序控件移到标题栏右侧）与详情面板模式（切换为两栏+覆盖式 item 面板）。

### 2026-02-23 14:34 CST
- 待办：继续按用户提供的 Raindrop 运行时 DOM 做工作台头部层级对齐
- 内容：完成一轮“头部层级重排”。将 `sortSelect`（排序）与 `refreshBtn`（刷新）从顶部搜索工具栏移入收藏集标题栏右侧工具组，并把 `bookmarkLayoutSwitch` / `listColumnsBtn` / `importExportBtn` / `pluginPanelBtn` 一并收敛到标题栏工具条，使结构更接近 Raindrop 的“顶部仅搜索与新增、标题栏负责排序/视图/导出”的布局。顶部工具栏保留搜索与高级搜索/新增入口；标题栏左侧新增轻量云图标（视觉锚点）；对应新增标题栏工具条样式、排序下拉紧凑样式、移动端换行规则与窄屏隐藏次级按钮（同步插件）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`index.html` 中 `sortSelect/refreshBtn/bookmarkLayoutSwitch/listColumnsBtn/importExportBtn/pluginPanelBtn` 等关键 id 仍存在且仅出现一次，原有 JS 绑定无需改动。
- 后续：继续对齐时建议处理详情面板模式（常驻第三栏 -> 覆盖式 Item 面板）与顶部搜索区过滤入口（将“高级搜索”收敛为搜索框右侧小图标按钮）。

### 2026-02-23 14:51 CST
- 待办：继续工作台对齐（搜索区过滤入口收敛 + 详情面板交互更接近 item panel）
- 内容：将 `advancedSearchToggleBtn` 从顶部工具栏右侧移动到搜索框内部右侧，改为紧凑图标入口（保留同一 `id`，原有事件逻辑不变），并在 `syncAdvancedSearchInputs()` 中同步其 `active/aria-pressed/title` 状态，接近 Raindrop 搜索框内“调参/过滤”入口。详情栏新增头部 `detailCloseBtn`（关闭详情），在 `renderDetail()` 中按 `activeId` 为 `.shell` 切换 `detail-panel-open` class，同时在大屏下将无选中时的第三列收起（`320 + 1fr + 0`），选中书签后再展开详情列，形成更接近 item panel 的打开态体验。补充搜索框内按钮 hover/focus 的绝对定位防抖（避免继承全局按钮上浮动画导致偏移）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`index.html` 中 `advancedSearchToggleBtn` 与 `detailCloseBtn` 均存在且 `advancedSearchToggleBtn` 仅出现一次。
- 后续：下一轮可继续把搜索框右侧入口替换为统一 SVG 图标（而非字符），以及进一步把详情栏做成覆盖式抽屉（当前为“收起/展开第三列”版本）。

### 2026-02-23 15:05 CST
- 待办：继续 Raindrop 风格对齐（搜索框过滤入口图标化 + 详情面板覆盖式抽屉）
- 内容：完成搜索框内“高级搜索”入口图标化与详情面板覆盖式抽屉版。为 `iconSvg()` 新增 `tune` 图标，并在 `syncAdvancedSearchInputs()` 中对 `advancedSearchToggleBtn` 做一次性 SVG hydration（统一图标体系，同时保留 `aria-pressed`/打开态样式）；将用户之前的字符版图标替换为 `iconSvg('tune') + caret` 组合。详情区增加遮罩按钮 `detailPanelBackdrop`，在 `renderDetail()` 中与 `.shell.detail-panel-open` 同步显隐，支持点击遮罩关闭详情；桌面端（`>=1281px`）将详情区改为右侧覆盖式抽屉（fixed overlay + 遮罩），不再占用主内容区布局宽度，整体更接近 Raindrop 的 item panel 打开方式。并将 `detailCloseBtn` 纳入 `hydrateDetailHeaderIcons()` 使用统一 `close` SVG 图标，同时为遮罩按钮覆盖全局按钮 hover 动画/阴影以避免抖动。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；检查 `advancedSearchToggleBtn/detailPanelBackdrop/detailCloseBtn` 均存在且事件绑定路径可达。
- 后续：如继续对齐，可进一步把详情抽屉做成“从列表项进入的导航化面板”（支持前后项切换）并完善搜索建议下拉样式。

### 2026-02-23 15:18 CST
- 待办：整理“剩余可对齐部分”并形成新待办清单（基于用户提供的 Raindrop `my/0` 运行时 DOM）
- 内容：在 `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md` 新增 `Raindrop 运行时 DOM 精细对齐 TODOLIST（第二轮，/my/0）`，作为 `RA-UI-*` 之后的第二轮精细对齐清单。按 SplitView 外壳、搜索与主工具条、收藏集标题栏、左侧树与过滤区、列表视图、Item Panel、Popover/Menu/Dialog 统一层、交互性能、第二轮验收等维度拆分为 `RA-DOM-001 ~ RA-DOM-803`。该清单专注“运行时 DOM 级”细化，不与已完成的 `RA-UI-*` 第一轮清单混淆，后续可按 `RA-DOM-*` 逐项推进并留存日志。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：人工检查 `TODO.md` 结构完整，新增 `RA-DOM-*` 分组在 `RA-UI-*` 清单后，未覆盖现有 Phase/RA-UI 项状态。
- 后续：按优先级建议先做 `RA-DOM-102/103/104`（搜索建议下拉）与 `RA-DOM-201~206`（标题栏菜单化）。

### 2026-02-23 19:02 CST
- 待办：继续 `RA-DOM` 第二轮对齐（搜索栏/主工具条与收藏集标题栏，参考用户提供的 Raindrop `my/0` 运行时 DOM）
- 内容：完成一批头部与搜索区对齐项。为顶部搜索框增加左侧搜索图标、调整内边距与输入区密度（`RA-DOM-101`）；新增 `询问` 按钮并采用统一 SVG 图标 + 窄屏文字隐藏策略（`RA-DOM-105`）；将 `添加` 重构为 split-button（主按钮 + 下拉箭头）并实现添加菜单（新建书签/创建集合/上传文件…/导入导出，复用现有弹窗与 IO 对话框入口，`RA-DOM-106/107`）。同时完善收藏集标题栏左侧结构：加入“当前页全选”复选框、动态视图图标（系统视图图标 / 集合使用文件夹图标）以及 `open in browser` 微按钮（新标签页打开当前视图，`RA-DOM-201/202`）。顺手将前一轮已完成的标题栏菜单化与 sticky 行为（`RA-DOM-203~206`）在清单中标记为完成。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增关键节点/状态与事件绑定存在：`searchLeadingIcon`、`askAiBtn`、`addToolbarMenu`、`viewSelectPageCheckbox`、`viewOpenBrowserBtn`、`addToolbarMenuOpen`。
- 后续：继续实现 `RA-DOM-102/103/104`（搜索建议下拉、键盘导航与 token 建议），以进一步贴近 Raindrop 的搜索组合框体验。

### 2026-02-23 19:08 CST
- 待办：实现 `RA-DOM-102/103/104`（搜索建议下拉、键盘导航、token 建议）
- 内容：为顶部搜索框新增组合框式建议弹层 `searchSuggestPopover/searchSuggestList`，包含“建议的 token（标签/类型/日期/URL/备注/高亮/无标签）”、“最近使用的搜索（本地 `localStorage` 保存）”以及帮助提示区（`RA-DOM-102/104`）。给 `searchInput` 补充 `combobox/listbox` ARIA 属性，并实现 `↑/↓` 移动高亮、`Enter` 激活建议、`Esc` 关闭、鼠标悬停同步高亮、点击外部关闭等交互（`RA-DOM-103`）。激活最近搜索会直接应用查询并刷新列表；激活 token 建议会将 token 插入搜索框并立即刷新列表（保持输入焦点），用于快速构造搜索表达式。样式上统一复用工作台 popover 视觉语言（分组标题、激活态、高亮态、帮助区）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增节点/逻辑存在：`searchSuggestPopover`、`searchSuggestList`、`SEARCH_TOKEN_SUGGESTIONS`、`setSearchSuggestOpen`、`activateSearchSuggestItem`。
- 后续：继续推进 `RA-DOM-106/107` 的“添加菜单”次级入口细节（如上传文件直接入口更接近 Raindrop）或转入 `RA-DOM-301+`（侧栏系统集合/标签区精细对齐）。

### 2026-02-23 19:15 CST
- 待办：继续 `RA-DOM-301+`（侧栏过滤区/标签区精细对齐）
- 内容：完成 `RA-DOM-305/306/307`。在侧栏“集合”下新增 `快速过滤…` section（备注/高亮/网页/PDF/图片/无标签等，基于本地 `state.allBookmarks` 统计），采用 Raindrop 风格行列表（32px 密度、图标/标题/计数/hover `…`），并支持点击应用 token 搜索（会启用高级搜索执行 token 查询）和右键/`…` 打开快速过滤菜单（应用、复制表达式、打开高级搜索、清除搜索）。将标签区从 pill 风格改为行列表风格（标签数显示到 section 标题，行内图标/标题/计数/hover `…`），并新增标签右键/`…` 菜单：筛选、重命名、合并、打开标签管理、移除此标签（所有书签）。为支持“移除此标签”，后端新增 `/api/tags/remove` 接口，按用户隔离作用域批量从书签数组中移除目标标签并返回最新标签统计。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/tagRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/src/routes/tagRoutes.js`；`rg` 检查快速过滤/标签菜单关键节点与逻辑存在：`quickFiltersMenuBtn`、`quickFilterContextMenu`、`tagContextMenu`、`buildSidebarQuickFilters`、`/api/tags/remove`。
- 后续：下一轮继续 `RA-DOM-301/302/303`（系统集合行结构、My Collections section header、集合树 32px 精调）与 `RA-DOM-308`（侧栏底部状态卡占位）。

### 2026-02-23 19:22 CST
- 待办：继续 `RA-DOM` 侧栏对齐（底部状态区与 section 结构收口）
- 内容：完成 `RA-DOM-308`。在侧栏底部新增 `sidebarStatusCard`（自定义状态卡，不复刻 Raindrop Pro 营销文案），显示登录态/就绪状态和书签、集合、标签统计；提供 `同步`（打开同步插件面板）与 `设置`（跳转设置页）快捷按钮。并将集合 section 标题调整为更接近参考布局的 `My Collections` 文案（为后续 `RA-DOM-302` 继续精细化做铺垫）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs /Users/xiaochou164/Desktop/bookmarktorain/src/routes/tagRoutes.js`；`rg` 检查 `sidebarStatusCard/sidebarStatusSyncBtn/collectionsSectionTitle` 已接入 DOM 与事件绑定。
- 后续：继续 `RA-DOM-301/302/303`（系统集合行结构与更多菜单、集合树行精调）。

### 2026-02-23 19:36 CST
- 待办：继续 `RA-DOM-301/302/303`（系统集合行、集合分组头、集合树 32px 对齐）
- 内容：完成 `RA-DOM-301/302/303`。将左侧“快捷入口”重构为更接近 Raindrop 的系统集合行结构（32px row，左侧展开占位、图标/标题/计数、hover `…`），并支持右键或 `…` 打开系统集合菜单（打开此视图、在新标签页打开工作台、选择当前页、刷新此视图）。为集合分组头新增 `collectionsSectionHead` 结构（拖拽感知视觉、分组菜单按钮 `⋯`、右键菜单），实现集合分组菜单（新建集合、展开全部、折叠全部、刷新侧栏）。同时收紧集合树行样式与对齐（`tree-row` 32px、icon/文字/计数/hover action 精调），并在集合拖拽开始/结束时为分组头增加拖拽态高亮提示。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增节点与绑定存在：`systemViewContextMenu`、`collectionsHeaderContextMenu`、`collectionsSectionMenuBtn`、`collectionsSectionHead`；`docs/TODO.md` 中 `RA-DOM-301/302/303` 已标记完成。
- 后续：继续 `RA-DOM-304`（集合树虚拟滚动）或转入 `RA-DOM-401+`（列表视图动作区与状态对齐）。

### 2026-02-23 19:48 CST
- 待办：继续 `RA-DOM-401/402/403`（列表行结构、动作区按钮集、状态层级）
- 内容：完成 `RA-DOM-401/402/403`。扩展列表行桌面动作区按钮集到更接近 Raindrop：当前页打开、新标签页打开、预览模式、Web 预览、复制链接、询问（AI）、收藏、标签、编辑、删除/恢复，并新增对应前端交互绑定（复用现有详情抽屉、预览弹窗、复制、设置页 AI 面板入口）。为 `iconSvg()` 新增 `click/web/copy` 图标。列表行样式方面取消“只显示前 4 个动作按钮”的限制，微调动作按钮尺寸与间距、行侧栏宽度、标题/副信息密度，并细化 `hover / selected / active / focus-within` 的背景与左侧强调线层级，使列表行更接近 Raindrop 的状态反馈。移动端列表底部动作区保持 `compact` 集合，避免按钮过多挤压布局。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增动作数据属性与事件绑定存在：`data-open-current/data-preview-web/data-copy-link/data-ask-item/data-edit-item/data-edit-tags`；`docs/TODO.md` 中 `RA-DOM-401/402/403` 已标记完成。
- 后续：继续 `RA-DOM-404`（复选框点击区域与交互细节）或 `RA-DOM-304`（集合树虚拟滚动）。

### 2026-02-23 19:53 CST
- 待办：继续 `RA-DOM-404`（列表项复选框交互与可点击区域）
- 内容：完成 `RA-DOM-404`。将列表行左侧选择控件点击区域扩展到 `26x26`，增加 hover 背景与选中/激活态容器视觉，并在桌面端改为“仅 hover / focus / active / selected 时显示复选框控件”，移动端保持常显，整体交互更接近 Raindrop 的列表选择行为。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：样式层变更（无 JS 语法影响）；`docs/TODO.md` 中 `RA-DOM-404` 已标记完成。
- 后续：继续 `RA-DOM-405~408`（列表封面/增量加载/虚拟滚动）或回到 `RA-DOM-304`（集合树虚拟滚动）。

### 2026-02-23 20:02 CST
- 待办：继续 `RA-DOM-405/406`（列表封面占位/加载态 + 副信息密度）
- 内容：完成 `RA-DOM-405/406`。列表行缩略图新增 cover 加载占位与失败回退状态：有封面时显示 shimmer 占位（`is-loading`），图片加载成功后切换到 `is-loaded`，失败则进入 `is-error` 并保留占位图标；无封面时使用类型图标 + 站点 favicon 的组合占位。为此在 `renderCards()` 中增加 `img[data-row-thumb-img]` 的 `load/error` 处理，并在 `iconSvg()` 中补充 `image/file` 等图标。副信息行改为更紧凑的 `subline-part` 结构（集合/域名/日期/类型），细化中点分隔、字号与颜色权重；列表日期改为简化日期格式以提升信息密度（例如 `2月23日`）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增逻辑与样式存在：`bookmarkListDateText`、`data-row-thumb-img`、`bookmark-row-thumb-placeholder`、`row-thumb-shimmer`；`docs/TODO.md` 中 `RA-DOM-405/406` 已标记完成。
- 后续：继续 `RA-DOM-407/408`（列表“更多…”增量加载与虚拟滚动），或并行推进 `RA-DOM-304`（集合树虚拟滚动）。

### 2026-02-23 20:11 CST
- 待办：实现 `RA-DOM-407`（列表 footer “更多…” 载入模式，兼容现有分页）
- 内容：完成 `RA-DOM-407`。新增列表视图专用 `listLoadMoreBar`（`更多…` 按钮 + 已加载数量提示），在不修改后端分页 API 的前提下实现“追加下一页到当前列表”的增量加载模式。为避免与现有分页按钮冲突，抽取 `fetchBookmarksPagePayload()` 作为分页数据请求 helper，新增 `listLoadMoreState`（查询 key、起始页、已加载到第几页、总数、hasNext、loading）与 `loadMoreListPage()`；`loadBookmarks()` 在常规分页加载后会同步增量加载基线状态，列表视图点击 `更多…` 时仅追加下一页 `items` 到 `state.bookmarks`，并更新增量加载状态，不破坏原有分页按钮和页码逻辑。布局切换时同步刷新 `listLoadMoreBar` 显隐。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增结构与逻辑存在：`listLoadMoreBar/listLoadMoreBtn`、`fetchBookmarksPagePayload`、`renderListLoadMoreBar`、`loadMoreListPage`；`docs/TODO.md` 中 `RA-DOM-407` 已标记完成。
- 后续：继续 `RA-DOM-408`（列表虚拟滚动）或 `RA-DOM-304`（集合树虚拟滚动）。

### 2026-02-23 20:19 CST
- 待办：实现 `RA-DOM-408`（列表虚拟滚动）
- 内容：完成 `RA-DOM-408` 第一版（桌面端列表视图窗口化渲染）。新增列表虚拟滚动状态与 helper：`canUseListVirtualization()`（阈值/布局/屏宽判断）、`listVirtualWindow()`（基于窗口滚动与固定行高计算可视区）、`renderCardsHtml()`（插入上下 spacer + 仅渲染可见行）以及 `scheduleListVirtualRender()`（`requestAnimationFrame` 节流）。在 `renderCards()` 中改为通过 `renderCardsHtml(root)` 生成内容；在现有 `window resize/scroll` 监听中挂接虚拟列表刷新调度。当前实现仅在桌面端、列表视图、条目数量超过阈值时启用，移动端和其他视图保持原有完整渲染。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增虚拟滚动关键逻辑与样式存在：`canUseListVirtualization`、`listVirtualWindow`、`renderCardsHtml`、`scheduleListVirtualRender`、`.list-virtual-spacer`；`docs/TODO.md` 中 `RA-DOM-408` 已标记完成。
- 后续：下一步优先 `RA-DOM-304`（集合树虚拟滚动）或转入 `RA-DOM-501+`（Item Panel 精细对齐）。

### 2026-02-23 20:34 CST
- 待办：实现 `RA-DOM-304`（集合树虚拟滚动）
- 内容：完成 `RA-DOM-304` 第一版（桌面端集合树窗口化渲染）。将 `renderSidebar()` 中集合树渲染与事件绑定抽出为独立函数 `renderCollectionsTreeSection()` / `bindCollectionsTreeEvents()`，新增集合树虚拟滚动 helper：`buildCollectionsTreeIndices()`（父子索引与书签计数）、`flattenVisibleCollectionTreeRows()`（按折叠态展开可见节点）、`collectionsTreeVirtualWindow()`（以侧栏滚动容器为基准计算窗口）以及 `scheduleCollectionsTreeVirtualRender()`（`requestAnimationFrame` 节流）。在大集合数量、桌面端、非拖拽状态下启用窗口化渲染，插入上下 spacer 并仅渲染可见集合行；其余场景保持原有递归树结构。为避免滚动时重复扫描全部书签导致性能回退，事件绑定阶段复用已构建的 `childrenByParent`，不再二次全量计数。补充 `.tree.is-virtualized` / `.tree-virtual-spacer` 样式，消除 `gap` 对固定行高计算的干扰。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查关键逻辑与样式存在：`renderCollectionsTreeSection`、`scheduleCollectionsTreeVirtualRender`、`COLLECTIONS_TREE_VIRTUAL_*`、`.tree.is-virtualized`、`.tree-virtual-spacer`；`docs/TODO.md` 中 `RA-DOM-304` 已标记完成。
- 后续：进入 `RA-DOM-501+`（Item Panel 精细对齐）或继续做集合树虚拟滚动第二版（虚拟模式下组空白区域投放/drop-parent 完整还原）。

### 2026-02-23 20:52 CST
- 待办：实现 `RA-DOM-501 ~ RA-DOM-506`（Item Panel 顶部工具条/模式/联动/折叠/键盘/动画）
- 内容：完成一批 Item Panel 精细对齐。为右侧详情抽屉顶部新增导航与模式工具条：上一条/下一条、查看/编辑模式切换、网页预览/阅读模式快捷按钮、更多菜单与关闭按钮（`RA-DOM-501/502/503`）。新增详情更多菜单（复制链接、预览、阅读预览、模式切换、删除/恢复），并在 `renderDetail()` 中同步按钮禁用态、当前模式与预览状态（含 `detailPanelModeBadge`）。实现详情分区轻量折叠（基本信息/状态与提醒/抓取与阅读/高亮），使用 `data-detail-section-key` + 本地持久化 `detailSectionsUi` 控制折叠状态（`RA-DOM-504`）。扩展键盘导航：详情抽屉打开时支持 `ArrowUp/ArrowDown/ArrowLeft/ArrowRight` 切换当前条目，并调整 `Esc` 行为为“优先关闭 transient 菜单，再关闭详情抽屉”（`RA-DOM-505`）。样式层对详情抽屉 header、模式切换、顶部工具组、section 折叠与桌面遮罩/抽屉动画做统一收敛，并加入 `prefers-reduced-motion` 兼容（`RA-DOM-506`）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增 DOM/事件/样式存在：`detailPrevBtn/detailNextBtn/detailPanelMoreBtn/detailPanelMoreMenu/detailPanelViewModeBtn/detailPanelReaderBtn`、`data-detail-section-toggle`、`.detail-panel-mode-switch/.detail-section-toggle`；`docs/TODO.md` 中 `RA-DOM-501~506` 已标记完成。
- 后续：继续 `RA-DOM-601+`（统一 popover/menu/dialog 层规范）或 `RA-DOM-701+`（性能与交互细节）以减少多菜单并存时的视觉差异。

### 2026-02-23 20:11 CST
- 待办：实现 `RA-DOM-601 ~ RA-DOM-604`（Popover / Menu / Dialog 统一层）
- 内容：完成 `RA-DOM-601~604`。样式层统一了 `header-menu/context-menu/search-suggest-popover` 的容器视觉语言（半透明浅底、统一边框/阴影、统一 `z-index` 变量）与菜单项规范（图标列 + 文本列、统一高度/hover/focus/danger 态），并在 `:root` 中引入 `--z-*` 层级变量，收口 `view-header / toolbar / advanced-search-panel / detail drawer / detail backdrop / dialog` 的层级栈与 backdrop 风格。交互层新增 `positionFloatingMenuByAnchor(...)`，对集合/系统集合/分组头/快速过滤/标签/详情更多等菜单优先采用锚点定位，并做边界吸附与翻转，减少右键菜单贴边溢出。为菜单统一图标化新增 `menuItemIconName()`、`setMenuItemIconAndLabel()`、`hydrateMenuItemIcons()`，覆盖集合菜单、标签菜单、添加菜单及详情更多菜单。补充桌面端详情抽屉最小 `Tab/Shift+Tab` 焦点圈定（`trapDetailDrawerTabFocus`），使 `RA-DOM-604` 的 `focus trap` 在 drawer 场景也成立。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查 helper 命中：`positionFloatingMenuByAnchor`、`hydrateMenuItemIcons`、`trapDetailDrawerTabFocus`；`rg` 检查样式变量与层级命中：`--z-popover/--z-menu/--z-drawer-backdrop/--z-drawer` 与 `.search-suggest-popover`；`docs/TODO.md` 中 `RA-DOM-601~604` 已标记完成。
- 后续：继续 `RA-DOM-701+`（交互与性能细化）或进入 `RA-DOM-801+`（第二轮 DOM 对齐验收与截图流程）。

### 2026-02-23 20:15 CST
- 待办：继续 `Q` 段，优先完成 `RA-DOM-703`（搜索防抖）与 `RA-DOM-705`（焦点管理/无障碍细化）
- 内容：完成 `RA-DOM-703` 与 `RA-DOM-705`（累计能力收口）。为顶部搜索输入新增防抖应用链路：`SEARCH_INPUT_DEBOUNCE_MS`、`scheduleSearchInputFilterApply()`、`applySearchInputFilterNow()`，将原先每次 `input` 都立即请求改为防抖触发；同时保留 `Enter` 立即执行与 `blur` 时 flush pending 的行为，减少输入期间频繁请求与列表闪烁。无障碍与焦点管理方面新增通用菜单键盘导航 `handleMenuArrowNavigation()`（`ArrowUp/ArrowDown/Home/End` 在 `role=\"menu\"` 中循环聚焦 `menuitem`），并结合本轮前半已完成的详情抽屉 `Tab/Shift+Tab` 焦点圈定（`trapDetailDrawerTabFocus`）、搜索 combobox ARIA 与键盘导航、列表 `j/k` 和方向键切换条目，完成 `RA-DOM-705` 的 menu/dialog/combobox/listitem 覆盖。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增 helper 命中：`SEARCH_INPUT_DEBOUNCE_MS`、`applySearchInputFilterNow`、`scheduleSearchInputFilterApply`、`handleMenuArrowNavigation`、`trapDetailDrawerTabFocus`；`docs/TODO.md` 中 `RA-DOM-703` / `RA-DOM-705` 已标记完成。
- 后续：继续 `RA-DOM-701/702/704`（滚动性能、拖拽交互对齐、快捷键覆盖）或转入 `RA-DOM-801+` 做第二轮验收。

### 2026-02-23 20:17 CST
- 待办：实现 `RA-DOM-704`（快捷键覆盖扩展）
- 内容：完成 `RA-DOM-704`。在现有 `/、j/k、o、e、Delete、Esc` 基础上补充更接近 Raindrop 使用路径的快捷键：`Cmd/Ctrl+K` 聚焦搜索、`p` 直接打开 Web 预览（走详情面板按钮链路）、`f` 切换当前条目收藏状态（复用现有书签 `PUT` 接口并刷新）、`a` 新建书签、`Shift+A` 新建集合、`r` 刷新当前视图。同时更新快捷键帮助提示文案（`?` 打开）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中：`toggleFavoriteForActiveBookmark`、`Cmd/Ctrl+K` 提示文案、`key === 'p'/'f'/'a'/'r'` 分支；`docs/TODO.md` 中 `RA-DOM-704` 已标记完成。
- 后续：继续 `RA-DOM-701/702`（滚动性能进一步优化、拖拽交互对齐）或进入 `RA-DOM-801+` 第二轮验收。

### 2026-02-23 21:50 CST
- 待办：完成 `RA-DOM-701 / RA-DOM-702`（性能与拖拽对齐）并补齐 `RA-DOM-801 ~ RA-DOM-803` 验收文档
- 内容：完成 `RA-DOM-701` 与 `RA-DOM-702`。性能方面：为列表虚拟滚动与集合树虚拟滚动增加“窗口区间未变化则跳过重渲”的短路（基于 `data-virtualCount/data-virtualStart/data-virtualEnd`），减少滚动期间重复 `innerHTML` 重建；将 `refreshAll()` 改为合并刷新（`refreshAllInFlight + refreshAllQueued`），避免连续操作产生重复全量 `loadState + loadBookmarks`；全局滚动监听改为 `passive`（保留 capture）以降低滚动主线程阻塞。拖拽方面：集合树拖拽新增 row-level 投放意图（`before/after/inside`），可视化插入线与 inside 高亮，拖入折叠父集合中央区域时悬停自动展开（定时器触发），并补充循环防护（禁止拖到自身后代）与拖拽状态清理逻辑。同步完成 `RA-DOM-801~803` 第二轮验收文档，新增 `/my/0` DOM 对齐验收清单、截图对比流程与交互回归清单，供后续人工验收使用。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_DOM_MY0_ACCEPTANCE_CHECKLIST.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_DOM_MY0_SCREENSHOT_COMPARE.md`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/RA_DOM_MY0_INTERACTION_REGRESSION_CHECKLIST.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg`/`ls` 检查命中：`refreshAllInFlight`、`folderDropIntentFromRowPointer`、`scheduleFolderAutoExpandOnDrag`、`drop-before/drop-after/drag-over-inside` 以及三份 `RA_DOM_MY0_*` 文档路径；`docs/TODO.md` 中 `RA-DOM-701/702/801/802/803` 已标记完成。
- 后续：`RA-DOM` 第二轮清单已完成，可按新增文档执行人工验收与截图对比，发现偏差后回写修复项。

### 2026-02-23 21:58 CST
- 待办：更新站点 favicon 并同步相关页面文档/模板引用
- 内容：新增统一的 `Rainboard` SVG favicon（渐变圆角方块，和当前品牌色保持一致），并在首页、登录页、设置页以及公开分享页 HTML 模板中补充 `theme-color` 与 `favicon.svg` 引用，统一浏览器标签页图标显示。同步更新 `.gitignore`，忽略本地 SQLite 数据库与对象存储运行时文件（`data/*.sqlite*`, `data/objects/`），避免将本地运行数据误提交到仓库。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/favicon.svg`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/login.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/collabRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/.gitignore`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/collabRoutes.js`；`rg` 检查各页面 `favicon.svg` 与 `theme-color` 引用；确认 `/Users/xiaochou164/Desktop/bookmarktorain/public/favicon.svg` 文件存在。
- 后续：浏览器端强制刷新以清理 favicon 缓存（`Cmd + Shift + R`），必要时重新打开标签页。

### 2026-02-23 22:05 CST
- 待办：更新 `README.md`（同步当前项目真实能力与运行方式）
- 内容：重写仓库根文档 `/Users/xiaochou164/Desktop/bookmarktorain/README.md`，将早期 `db.json + 简单插件` 描述升级为当前项目状态：默认 SQLite、Web 工作台（Raindrop 风格对齐）、内容抓取/预览/阅读模式、高亮/注释/提醒、导入导出任务、协作与公开页、产品化接口、插件与 `raindropSync`、Chrome 扩展目录、环境变量与脚本命令，以及 `docs/` 下实施计划/待办/验收文档入口。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/README.md`
- 验证：文档结构与命令/路径按当前仓库文件核对（`package.json`、`src/routes/*`、`docs/*`、`chrome-extension/`）。
- 后续：提交并推送 README 更新到 GitHub。

<<<<<<< ours
### 2026-02-24 00:20 CST
- 待办：接入 AI 能力（可自定义提供商），首批支持 OpenAI 兼容协议（硅基流动等）与 Cloudflare AI，并先实现“自动给书签打标签”
- 内容：新增后端 AI provider 服务 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，实现 AI 配置归一化、密钥保留与脱敏输出、OpenAI 兼容 `chat/completions` 调用、Cloudflare AI（Workers AI OpenAI 兼容 endpoint）调用、连接测试、提示词构造与模型 JSON 输出解析（支持 code fence / 宽松 JSON 提取），并产出标准化标签建议与摘要。扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`：新增 `GET/PUT /api/product/ai/config`、`POST /api/product/ai/test`、`POST /api/product/ai/autotag/:bookmarkId`，同时将原 `POST /api/product/ai/suggest/:bookmarkId` 从占位逻辑替换为真实 AI provider 调用。`autotag` 支持 `merge/replace` 写回模式并复用 `aiSuggestionJobs` 保存成功/失败任务历史。为便于立即试用，将本地产品能力开关 `aiSuggestions` 调整为免费套餐可用（外部模型费用控制仍由提供商决定）。数据层新增 `aiProviderConfigs`（更新 `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js` 与 `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js` 的 DB shape 保底）。
- 内容（前端）：重构设置页“AI 建议（占位实现）”面板为“AI 自动打标签”配置面板（`/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`、`/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`），支持：启用开关、提供商选择（OpenAI 兼容 / Cloudflare AI）、对应密钥与模型配置、标签策略配置（默认写回模式/最大标签数/是否优先中文/是否包含域名）、刷新/保存配置、测试连接，以及对指定书签执行“仅建议/自动打标签（写回）”。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/server.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/store.js`；静态检索新增设置页 DOM id 与脚本引用一致；`rg` 检查 `/api/product/ai/config|test|autotag` 路由与前端调用已接通。
- 后续：补一个主工作台详情抽屉入口（对当前书签一键 AI 自动打标签），并支持批量自动打标签任务队列。

### 2026-02-24 00:32 CST
- 待办：补 `AI-004`（主工作台详情抽屉一键 AI 自动打标签入口）
- 内容：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的详情抽屉摘要工具栏新增 `detailHeaderAiTagBtn`，并在详情更多菜单新增 `AI 自动打标签` 菜单项；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 中新增 `runAiAutoTagForActiveBookmark()`，调用 `POST /api/product/ai/autotag/:bookmarkId` 执行写回打标签，处理编辑模式冲突确认（未保存改动提示）、运行中按钮禁用/忙碌态、成功/失败 toast 与执行后 `refreshAll()` 刷新。同步在 `menuItemIconName()`、`hydrateDetailHeaderIcons()`、`updateDetailPanelHeadUi()` 中接入 AI 图标与禁用状态控制，并将详情更多菜单 action `ai-autotag` 接到现有 `runDetailPanelMoreAction()` 分发。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查新增 DOM id `detailHeaderAiTagBtn` 和菜单 action `ai-autotag` 存在，并确认事件绑定与 action 分发接通。
- 后续：可继续实现批量 AI 自动打标签（选中多条 -> 任务队列）与详情面板内“仅生成建议/写回模式选择”。

### 2026-02-24 00:40 CST
- 待办：整理“AI 还能赋能哪些功能”的产品级待办清单（写入项目 TODO）
- 内容：在 `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md` 新增 `AI 能力扩展（产品功能赋能待办）` 分组，将后续 AI 能力按模块拆分为可执行编号任务：整理归类（批量打标签、集合推荐、标题清洗、摘要等）、检索发现（自然语言转筛选、语义搜索、书签问答、重排序、语义去重）、阅读沉淀（高亮候选、高亮总结、集合知识摘要、Digest）、自动化工作流（AI 规则引擎、历史回填任务、Provider 路由与成本护栏）、协作公开（共享集合摘要/FAQ）、质量治理（评估样本、反馈、隐私脱敏、健康检查、权限开关）以及建议实施顺序（`AI-901~904`）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`rg -n "AI 能力扩展（产品功能赋能待办）|AI-101|AI-201|AI-601|AI-901" /Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 后续：按建议顺序优先实现 `AI-101` 批量自动打标签（复用已接入的 provider 抽象与 AI jobs 历史）。

### 2026-02-24 01:08 CST
- 待办：实现 `AI-101` 批量自动打标签（选中多条书签 -> 后台任务队列 -> 分批写回）
- 内容（后端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js` 补齐 AI 批量自动打标签任务接口，复用已写好的 `processAiBatchAutoTagTask()` 与 `runAiTagJobForUser()` 执行器，新增 `POST /api/product/ai/batch/autotag/tasks`（创建任务）、`GET /api/product/ai/batch/autotag/tasks`（列表）、`GET /api/product/ai/batch/autotag/tasks/:taskId`（轮询详情）、`POST /api/product/ai/batch/autotag/tasks/:taskId/retry`（失败/部分成功任务重试）。创建任务时会校验功能开关与 AI provider 是否启用，过滤缺失/已删除书签，保存 `aiBatchTasks` 记录并通过统一 `jobQueue` 入队执行（支持 memory/bullmq broker，未命中时回退本进程异步执行）。
- 内容（前端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的批量操作条新增 `AI 打标签` 按钮（`bulkAiTagBtn`）；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 新增批量 AI 执行与轮询逻辑：确认对话框、创建批量任务、轮询至终态（`succeeded/partial/failed`）、任务运行中按钮 busy/禁用态、完成后 `refreshAll()` 并提示成功/部分成功/失败统计。
- 内容（数据层）：为批量 AI 任务记录新增 DB shape 保底字段 `aiBatchTasks`（`/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`），避免旧库缺字段导致运行错误。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/server.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/store.js`；静态检索确认 `bulkAiTagBtn`、`/api/product/ai/batch/autotag/tasks` 路由与轮询调用已接通。
- 后续：继续实现 `AI-104`（标题清洗与重命名建议）与 `AI-105`（自动摘要生成），优先在详情抽屉提供“一键建议/写回”入口，再扩展到批量任务。

### 2026-02-24 01:32 CST
- 待办：实现 `AI-104`（标题清洗与重命名建议）与 `AI-105`（自动摘要生成）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增标题清洗 prompt 与摘要 prompt，分别实现 `generateBookmarkTitleSuggestion()`、`generateBookmarkSummarySuggestion()`；保留 OpenAI 兼容 / Cloudflare AI 调用通道复用，统一走 JSON 输出解析与字段归一化。同步扩展 `buildAiJobRecord()` 支持自定义 `type/request`，用于记录不同 AI 能力任务（不再只限自动打标签）。
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `POST /api/product/ai/title-clean/:bookmarkId` 与 `POST /api/product/ai/summary/:bookmarkId`。标题清洗支持“建议+可选写回标题”；摘要生成支持写回备注模式 `if_empty/replace`，默认优先“仅为空时写入”。两条路由均复用 feature gating、provider 配置、`aiSuggestionJobs` 任务历史记录，并将结果写入书签 `aiSuggestions`（如 `titleSuggestion/summarySuggestion` 等）以便前端展示/后续追踪。
- 内容（前端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的详情抽屉“更多”菜单新增 `AI 标题清洗`、`AI 生成摘要`；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 中新增 `runAiTitleCleanForActiveBookmark()`、`runAiSummaryForActiveBookmark()`，接入对应 API，处理编辑模式冲突确认、已有备注时的替换确认、运行中禁用与 busy 态、成功/失败 toast 与 `refreshAll()` 刷新。同时将三个 AI 动作（打标签/标题清洗/摘要）纳入统一并发互斥状态，避免并发覆盖当前条目。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `/api/product/ai/title-clean`, `/api/product/ai/summary`, `ai-title-clean`, `ai-summary` 路由与前端动作绑定。
- 后续：继续实现 `AI-102`（标签标准化建议）或 `AI-103`（集合推荐）；如果优先增强实用性，可先做 `AI-107` 新书签保存后自动分类规则（复用当前 provider 抽象与批量任务框架）。

### 2026-02-24 01:58 CST
- 待办：实现 `AI-102`（标签标准化建议）与 `AI-103`（集合推荐）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `generateTagNormalizationSuggestions()` 与 `generateBookmarkFolderRecommendation()`，分别用于标签标准化建议和书签集合推荐。新增 prompt 构造逻辑：标签标准化会基于标签名+数量生成 `sources/target/reason/confidence` 建议组；集合推荐会基于书签标题/URL/摘要/标签和候选集合列表（含路径/条目数）返回候选集合 `folderId/folderName/reason/confidence`。两者均复用现有 OpenAI 兼容与 Cloudflare AI 调用通道和宽松 JSON 解析。
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`：新增 `POST /api/product/ai/tags/standardize`（生成标签标准化建议，支持传入 suggestions 直接应用）与 `POST /api/product/ai/folder-recommend/:bookmarkId`（推荐集合，支持 `apply=true` 写回 `folderId`/`collectionId`）。`AI-102` 路由在本地构建标签统计，记录 `tag_standardization_suggest` 类型 AI job，并在应用模式下批量合并标签写回书签；`AI-103` 路由构建候选集合路径和条目数，记录 `bookmark_folder_recommend` 类型 AI job，并在应用模式下移动书签到推荐集合。
- 内容（前端）：在标签管理对话框（`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`）新增 `AI 标签标准化建议` 按钮，点击后调用 `POST /api/product/ai/tags/standardize` 生成建议，展示 JSON 输出，并支持用户确认后直接应用建议（不重复请求模型，复用返回 suggestions）。在详情抽屉“更多”菜单新增 `AI 推荐集合`，前端会先获取推荐结果并展示原因，用户确认后再调用应用模式写回集合并刷新列表/详情。新增动作与现有 AI 动作（打标签/标题清洗/摘要）共用并发互斥 busy 状态，避免同时覆盖当前书签。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查 `/api/product/ai/tags/standardize`、`/api/product/ai/folder-recommend`、`aiTagStandardizeBtn`、`ai-folder-recommend` 路由与前端入口已接通。
- 后续：继续实现 `AI-107`（新书签保存后自动分类规则）或 `AI-201`（自然语言搜索转高级筛选）；若以日常效率为优先，建议先做 `AI-107`。

### 2026-02-24 02:16 CST
- 待办：完成 `AI-107`（新书签保存后自动分类规则）并实现 `AI-106`（标签语言识别与本地化统一）
- 内容（AI-107 配置与创建流程）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js` 的 AI 配置 schema，新增 `autoClassifyOnCreate`（`enabled/requireConfirm/autoTag/recommendFolder/autoMoveRecommendedFolder`）并接入配置归一化、持久化与脱敏输出；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html` 与 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs` 新增“新书签自动分类规则（AI-107）”配置 UI（保存/读取）。在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 新增 `maybeRunAiAutoClassifyForCreatedBookmark()`，在新建书签成功后自动按规则执行 AI 自动打标签与集合推荐（可选确认、可选自动移动到推荐集合），最后统一刷新列表并给出结果 toast。
- 内容（AI-106 标签本地化）：在 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js` 新增标签语言本地化 prompt 与 `generateTagLocalizationSuggestions()`，用于识别中英文混用/翻译重复标签并生成 `sources -> target` 合并建议（附语言与置信度信息）。在 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js` 新增 `POST /api/product/ai/tags/localize`（生成建议 / 传入 suggestions 直接应用），复用现有标签合并写回逻辑并记录 `tag_localization_suggest` 类型 AI job。前端标签管理对话框新增 `AI 标签本地化建议` 按钮（`/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`），在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 中接入生成建议、确认应用、刷新与 toast 提示流程。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查 `maybeRunAiAutoClassifyForCreatedBookmark`、`/api/product/ai/tags/localize`、`aiTagLocalizeBtn` 命中。
- 后续：继续 `AI-201`（自然语言搜索转高级筛选）或 `AI-401`（AI 规则动作引擎），若优先增强日常体验建议先做 `AI-201`。

### 2026-02-24 02:34 CST
- 待办：实现 `AI-201`（自然语言搜索转高级筛选）
- 内容（后端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js` 新增自然语言搜索转筛选提示词与 `generateSearchFilterSuggestion()`，将自然语言查询转换为结构化筛选字段：`q/tags/domain/type/favorite/archived/view/sort/folderId/folderName`，并返回 `reason/unsupported/confidence`。提示词会注入候选集合（含路径）与常见标签，用于提升 `folderId` 与标签解析命中率；同时做字段枚举归一化、domain 清洗和集合名称/路径匹配。扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `POST /api/product/ai/search-to-filters` 路由（feature gating：`aiSuggestions + advancedSearch`），按用户范围收集集合/标签上下文并记录 `search_filter_parse` 类型 AI job 到 `aiSuggestionJobs`。
- 内容（前端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 高级搜索操作条新增 `AI 解析搜索` 按钮；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 新增 `applyAiSearchParseToUi()` 与按钮点击逻辑，使用当前搜索框文本（为空时弹出输入框）调用 `POST /api/product/ai/search-to-filters`，将返回结果写入高级搜索面板与列表筛选状态并立即执行搜索。新增 `advancedSearchState.lastAiParseMeta`，在高级搜索 meta 区显示 AI 解析来源语句、原因与未完全支持条件（如日期范围等）提示。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `generateSearchFilterSuggestion`、`/api/product/ai/search-to-filters`、`advancedSearchAiParseBtn`、`applyAiSearchParseToUi`。
- 后续：继续 `AI-202`（语义搜索）或先做 `AI-203`（书签问答，带出处）；若优先快速见效，可先做 `AI-206`（当前书签相关书签推荐）。

### 2026-02-24 02:52 CST
- 待办：实现 `AI-206`（当前书签相关书签推荐）
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `buildRelatedBookmarksPrompt()` 与 `generateRelatedBookmarksRecommendations()`，将“当前书签 + 候选书签列表”交给 AI 输出 `bookmarkId/reason/score` 推荐结果（限定候选内选择）。在 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js` 新增 `POST /api/product/ai/related/:bookmarkId`，实现 `runAiRelatedBookmarksJob()`：先在用户书签范围内做本地粗排（token 重叠/标签重叠/同域名/同集合）生成候选，再调用 AI 精排并返回前端可渲染条目，同时记录 `related_bookmarks_recommend` 类型 AI job。
- 内容（前端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 详情更多菜单新增 `AI 相关书签推荐`，并在详情抽屉新增“相关书签”分区（`refreshRelatedBookmarksBtn`、`detailRelatedBookmarksInfo`、`detailRelatedBookmarksList`）。在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 新增 `runAiRelatedBookmarksForActiveBookmark()` 与 `renderDetailRelatedBookmarksUi()`，支持详情内手动触发 AI 推荐、显示推荐原因与分数、点击推荐条目切换到该书签详情。相关操作纳入详情 AI busy 互斥状态（与打标签/标题清洗/摘要/集合推荐共享）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `generateRelatedBookmarksRecommendations`、`/api/product/ai/related/:bookmarkId`、`ai-related`、`refreshRelatedBookmarksBtn`、`detailRelatedBookmarksList`。
- 后续：继续 `AI-203`（书签问答，带出处）或 `AI-202`（语义搜索基础设施）。若以用户感知价值优先，建议先做 `AI-203`。

### 2026-02-24 20:47 CST
- 待办：实现 `AI-203`（书签问答，带出处）并完成主工作台入口打通
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `buildBookmarksQaPrompt()` 与 `generateBookmarksQaAnswer()`，在 OpenAI 兼容 / Cloudflare AI provider 上复用统一调用通道，让模型基于候选书签上下文输出结构化问答结果（`answer/citations/confidence/insufficient`），并对引用 bookmarkId 做候选集约束校验。扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `bookmarkTextForRetrieval()` 和 `runAiBookmarksQaJob()`，实现 `POST /api/product/ai/qa`：按用户范围收集书签，结合问题词、当前书签（可选）、标签/域名/集合等启发式本地粗排候选，再调用 AI 合成最终回答和出处列表（含 `title/url/folderPath/excerpt/reason/score`），同时写入 `bookmarks_qa` 类型 AI job 历史（成功/失败都记录）。
- 内容（前端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的详情更多菜单新增 `AI 书签问答`，并新增 `AI 书签问答` 对话框（问题输入、范围选择、出处数量上限、回答区、出处列表）。在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 新增 `aiQaDialogState`、`renderAiQaDialogUi()`、`openAiQaDialog()`、`runAiQaFromDialog()` 等逻辑，支持顶部 `询问` 按钮、列表项 `询问` 按钮、详情更多菜单 `AI 书签问答` 三处入口统一打开问答对话框；支持“全部书签 / 当前书签优先 / 仅当前书签”范围、复制回答、点击出处切换到对应书签详情，并将问答动作纳入详情 AI busy 互斥状态（避免与打标签/摘要/集合推荐/相关推荐并发）。
- 内容（样式）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css` 新增 AI 问答对话框样式（左右布局、回答区、出处卡片、移动端单列适配），并处理与 `.dialog-form.wide` 的宽度覆盖关系（使用 `.dialog-form.ai-qa-shell` 提权）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `/api/product/ai/qa`、`data-detail-panel-more-action="ai-qa"`、`aiQaDialog`、`runAiQaFromDialog`。
- 后续：继续 `AI-202`（语义搜索基础设施）或 `AI-204`（结果重排序）；若优先用户可见价值，建议先做 `AI-301` 阅读模式摘要以复用已完成的正文提取能力。

### 2026-02-24 20:57 CST
- 待办：实现 `AI-202`（语义搜索：向量索引 + 相似召回，与关键词搜索并存）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js` 的 provider 配置与 embeddings 能力，新增 `openaiCompatible.embeddingModel`、`cloudflareAI.embeddingModel` 和 `embeddings` 配置段（`preferProvider/fallbackLocal/dim`），并实现 `generateTextEmbeddings()`。该实现支持 OpenAI 兼容 embeddings、Cloudflare AI embeddings，以及本地哈希词袋向量 fallback（在 provider 不可用时仍可完成语义检索基础能力）。
- 内容（后端索引与查询）：在 `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js` 与 `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js` 增加 `semanticIndex` 数据结构保底；在 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js` 新增语义索引构建与查询逻辑：`ensureSemanticIndexRowsForBookmarks()`、余弦相似度计算、文本指纹更新检测，以及 `POST /api/product/search/semantic/index/rebuild`（重建当前用户语义索引）。扩展既有 `GET /api/product/search/query` 支持 `semantic=true` 与 `semanticMode=hybrid|semantic`，在候选书签内执行向量召回并与关键词/排序规则组合，返回 `usedSemantic/semanticMode/semanticProvider/semanticIndexUpdated/semanticFallbackLocal` 等元数据。
- 内容（前端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 高级搜索面板新增语义搜索控件（启用开关、模式选择、重建索引按钮）；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 扩展 `advancedSearchState`、查询 key、请求参数拼装、结果元数据展示与事件绑定，支持启用语义搜索、切换 `hybrid/semantic` 模式、手动重建语义索引并在成功后刷新当前结果。AI 自然语言解析（`AI-201`）应用筛选结果时会主动重置语义开关，避免隐式叠加筛选造成结果不可解释。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/store.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/server.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/store.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `/api/product/search/semantic/index/rebuild` 路由与 `advancedSearchSemanticEnabled/advancedSearchSemanticMode/advancedSearchSemanticRebuildBtn` 前端 DOM/绑定。
- 后续：继续 `AI-204`（关键词命中结果 AI 重排序）或 `AI-301`（阅读模式摘要）；若优先搜索体验，建议先做 `AI-204`。

### 2026-02-24 21:02 CST
- 待办：实现 `AI-204`（关键词命中结果 AI 重排序，提升前几条相关性）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `buildSearchRerankPrompt()` 与 `generateSearchRerankRecommendations()`。该能力接收用户查询和候选书签列表（含当前排序位次、标题、域名、集合路径、标签、摘要片段、基础分数），调用已接入的 OpenAI 兼容 / Cloudflare AI 对候选进行重排，返回受限于候选集合的 `bookmarkId/score/reason` 列表，并沿用统一 JSON 宽松解析与输出校验。
- 内容（后端搜索路由）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js` 的 `GET /api/product/search/query`，新增查询参数 `rerank=true|false` 与 `rerankTopK`（默认 36，范围 5~80）。在基础过滤、关键词/语义检索与初始排序完成后，对前 `TopK` 条候选执行 AI 重排，并将 AI 排序结果与原排序做“前段替换 + 尾部保留”的稳定合并；响应中新增元数据 `usedAiRerank/rerankProvider/rerankTopK/rerankAppliedCount/rerankSummary`，同时在返回条目里附带 `aiRerankScore/aiRerankReason`（若该条进入 AI 重排段）。本实现刻意不写 `aiSuggestionJobs` 历史，避免把高频搜索路径变成高频审计写入。
- 内容（前端高级搜索）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 高级搜索面板新增 `启用 AI 结果重排` 开关和 `重排前 N 条` 选择器；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 扩展 `advancedSearchState`、查询 payload、保存查询/恢复查询、重置逻辑与事件绑定，使 `AI-204` 能与 `AI-201/AI-202` 并存。高级搜索 meta 区同步显示 AI 重排状态（TopK、实际应用条数、provider/model、summary）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `generateSearchRerankRecommendations`、`usedAiRerank`、`advancedSearchRerankEnabled`、`advancedSearchRerankTopK`。
- 后续：继续 `AI-205`（语义去重聚类）或优先实现 `AI-301`（阅读模式摘要），后者用户感知更强且可复用现有正文提取能力。

### 2026-02-24 21:08 CST
- 待办：实现 `AI-301`（阅读模式摘要：短摘要 / 关键要点 / 适合收藏理由）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `buildReaderSummaryPrompt()` 与 `generateBookmarkReaderSummary()`，基于已提取正文（`article.textContent`）生成结构化输出：`shortSummary`、`keyPoints[]`、`whySave`。沿用现有 OpenAI 兼容 / Cloudflare AI provider 调用通道与宽松 JSON 解析，并对字段长度、数量进行归一化裁剪。
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `runAiReaderSummaryJob()` 与 `POST /api/product/ai/reader-summary/:bookmarkId`。路由要求书签已完成正文提取（`article.status=success` 且存在 `textContent`），否则返回提示“先提取正文”；成功后将结果写入 `bookmark.aiSuggestions.readerSummary` 并记录 `bookmark_reader_summary` 类型 AI job（成功/失败都记录）。
- 内容（前端详情抽屉）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的详情更多菜单新增 `AI 阅读摘要`，在“抓取与阅读”分区新增 `AI 阅读摘要` 按钮、状态行和摘要展示块（短摘要 / 关键要点 / 收藏理由）。在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 中新增 `runAiReaderSummaryForActiveBookmark()` 与 `renderDetailReaderSummaryUi()`，接入详情 AI busy 互斥状态、编辑模式确认、成功/失败 toast、`refreshAll()` 后刷新展示；同时在抓取状态 chips 中加入“阅读摘要已生成”提示。
- 内容（样式）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css` 新增 `detail-ai-reader-summary*` 样式，保持与详情区现有卡片（高亮/相关推荐）一致的视觉层级。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `/api/product/ai/reader-summary/:bookmarkId`、`generateBookmarkReaderSummary`、`ai-reader-summary`、`generateReaderSummaryBtn`、`detailReaderSummaryBox`。
- 后续：继续 `AI-205`（语义去重聚类）或 `AI-302`（高亮候选生成）；若优先阅读体验，建议先做 `AI-302`。

### 2026-02-24 21:16 CST
- 待办：实现 `AI-302`（高亮候选生成：从正文自动推荐可高亮片段）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `buildHighlightCandidatesPrompt()` 与 `generateBookmarkHighlightCandidates()`，基于已提取正文生成结构化高亮候选（引用文本、原因、分数），并对数量/长度做裁剪；同时过滤与现有高亮重复的片段，避免重复推荐。
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `runAiHighlightCandidatesJob()` 与 `POST /api/product/ai/highlight-candidates/:bookmarkId`。路由要求书签已完成正文提取（`article.status=success` 且存在 `textContent`），成功后将候选结果写入 `bookmark.aiSuggestions.highlightCandidates` 并记录 `bookmark_highlight_candidates` 类型 AI job（成功/失败都记录）。
- 内容（前端详情抽屉）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的“高亮”分区新增 `AI 推荐片段` 按钮与候选列表区域；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 新增 `runAiHighlightCandidatesForActiveBookmark()` 与 `renderDetailHighlightCandidatesUi()`，支持生成候选、逐条加入高亮、全部加入高亮、运行中 busy 态与成功/失败 toast；写入高亮后自动刷新列表/详情。
- 内容（样式）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css` 新增 `detail-highlight-candidates*` 样式，统一详情抽屉卡片层级与动作区布局。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `/api/product/ai/highlight-candidates/:bookmarkId`、`generateBookmarkHighlightCandidates`、`aiHighlightSuggestBtn`、`detailHighlightCandidatesList`、`runAiHighlightCandidatesForActiveBookmark`。
- 后续：继续 `AI-303`（高亮聚合总结，生成知识卡片）或 `AI-205`（语义去重聚类）；若优先阅读沉淀闭环，建议先做 `AI-303`。

### 2026-02-24 21:24 CST
- 待办：实现 `AI-303`（高亮聚合总结：按书签汇总高亮与注释，生成知识卡片）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `buildHighlightDigestPrompt()` 与 `generateBookmarkHighlightDigest()`，基于书签高亮与注释生成结构化“知识卡片”结果（`summary/themes/keyInsights/actionItems/openQuestions`），并做字段长度/数量裁剪与空结果回退。
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `runAiHighlightDigestJob()` 与 `POST /api/product/ai/highlight-digest/:bookmarkId`。路由要求至少存在一条高亮；成功后将结果写入 `bookmark.aiSuggestions.highlightDigest` 并记录 `bookmark_highlight_digest` 类型 AI job（成功/失败均记录）。
- 内容（前端详情抽屉）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的详情更多菜单新增 `AI 高亮总结`，在“高亮”分区新增 `AI 高亮总结` 按钮、状态行与知识卡片展示块；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 中新增 `renderDetailHighlightDigestUi()` 与 `runAiHighlightDigestForActiveBookmark()`，接入详情 AI busy 互斥、编辑模式确认、成功/失败 toast、`refreshAll()` 后自动刷新。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `/api/product/ai/highlight-digest/:bookmarkId`、`generateBookmarkHighlightDigest`、`aiHighlightDigestBtn`、`detailHighlightDigestBox`、`runAiHighlightDigestForActiveBookmark`。
- 后续：继续 `AI-304`（集合知识摘要）或 `AI-205`（语义去重聚类）；若优先知识沉淀体验，建议先做 `AI-304`。

### 2026-02-24 21:32 CST
- 待办：实现 `AI-304`（集合知识摘要：对一个集合生成主题总结、常见标签、代表来源）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `buildFolderKnowledgeSummaryPrompt()` 与 `generateFolderKnowledgeSummary()`，输入集合样本书签与本地统计（Top 标签/来源），输出结构化集合知识卡片（`summary/themes/commonTags/representativeSources/notableBookmarks`），并做字段数量/长度裁剪与 bookmarkId 有效性校验。
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `folderDescendantIdSet()` 与 `runAiFolderKnowledgeSummaryJob()`，实现 `POST /api/product/ai/folder-summary/:folderId`。路由基于当前集合及其子集合书签生成知识摘要，写回 `folder.aiSuggestions.collectionSummary`，并记录 `folder_knowledge_summary` 类型 AI job（成功/失败均记录）。
- 内容（前端）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html` 的标题栏“更多”菜单新增 `AI 集合知识摘要`；新增 `AI 集合知识摘要` 对话框（生成、复制、清空显示、关闭）。在 `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs` 新增 `renderAiFolderSummaryDialogUi()`、`openAiFolderSummaryDialog()`、`runAiFolderSummaryForCurrentCollection()` 等逻辑，支持仅在已选择集合时启用菜单项，支持点击代表书签切换详情；结果展示包含主题、常见标签、代表来源、代表书签、统计参考。
- 内容（样式）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css` 新增 `ai-folder-summary-*` 对话框与结果卡片样式，复用现有标签与 chip 组件。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/index.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/public/styles.css`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/app.mjs`；`rg` 检查命中 `/api/product/ai/folder-summary/:folderId`、`generateFolderKnowledgeSummary`、`aiFolderSummaryDialog`、`runAiFolderSummaryForCurrentCollection`、`data-header-more-action="ai-folder-summary"`。
- 后续：继续 `AI-305`（周报/日报 Digest）或回到 `AI-205`（语义去重聚类）；若优先检索整理质量，建议先做 `AI-205`。

### 2026-02-24 21:35 CST
- 待办：实现 `AI-205`（语义去重聚类：近重复页面/同主题多版本页面聚类）
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `POST /api/product/ai/dedupe/semantic-scan`。复用现有语义索引与 embeddings 基础设施（`ensureSemanticIndexRowsForBookmarks()`、`cosineSimilarity()`），对用户书签（限额采样）执行语义相似度聚类，结合 exact URL 去重边生成 cluster；输出每组的成员、相似度、代表书签、常见标签与代表来源，并记录 `semantic_dedupe_cluster_scan` 类型 AI job。
- 内容（前端设置页）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html` 的“搜索 / 去重 / 坏链”面板新增按钮 `AI 语义去重聚类`；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs` 中接入 `/api/product/ai/dedupe/semantic-scan` 调用，结果输出到 `searchToolsOutput`，并显示聚类组数与潜在重复数量状态提示。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；`rg` 检查命中 `/api/product/ai/dedupe/semantic-scan`、`semanticDedupeScanBtn`、`semantic_dedupe_cluster_scan`。
- 后续：继续 `AI-305`（周报/日报 Digest）或 `AI-401`（AI 规则动作引擎）；若优先自动化闭环，建议先做 `AI-401`。

### 2026-02-24 22:05 CST
- 待办：收口 `AI-305`（周报/日报 Digest）并补齐设置页入口
- 内容（后端确认）：核对 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js` 中已存在的 `POST /api/product/ai/digest` 实现，确认其已覆盖窗口类型（日报/周报/自定义天数）、样本上限、本地统计（Top 标签/来源/集合）与 `bookmarks_digest` AI job 落库逻辑；本轮未重复实现路由，而是以“前端入口 + 文档状态”方式收口该待办，避免重复代码。
- 内容（前端设置页）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html` 的 AI 面板新增 `Digest（AI-305）` 子分区，包含窗口类型、自定义天数、样本上限与“生成 AI Digest”按钮；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs` 新增 `syncAiDigestControls()` 与 `aiDigestRunBtn` 事件绑定，调用 `/api/product/ai/digest` 并将结果输出到 `aiOutput`，同时显示汇总状态提示。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；`rg` 检查命中 `/api/product/ai/digest`、`aiDigestRunBtn`、`aiDigestWindowTypeSelect`。
- 后续：继续 `AI-306`（阅读优先级建议）。

### 2026-02-24 22:19 CST
- 待办：实现 `AI-306`（阅读优先级建议：根据主题、时效性、长度、历史行为给排序）
- 内容（AI Provider）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`，新增 `buildReadingPriorityPrompt()` 与 `generateReadingPriorityRecommendations()`。该能力接收候选书签及本地粗排特征（`localScore/recencyScore/interestScore/estimatedLength` 等）与用户偏好画像（收藏/阅读/高亮推断出的偏好标签与域名），调用已接入 AI provider 输出结构化优先级结果（`bookmarkId/score/priority/reason`）。
- 内容（后端）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`，新增 `runAiReadingPriorityJob()` 与 `POST /api/product/ai/reading-priority`。实现流程为：按视图/集合/未读/归档条件筛选候选 -> 基于提醒、时效性、长度、兴趣权重进行本地粗排 -> 截取候选池 -> 调用 AI 生成“先读什么”排序建议 -> 返回条目列表、摘要、画像信息，并记录 `reading_priority_recommend` 类型 AI job（成功/失败均记录）。
- 内容（前端设置页）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html` 的 AI 面板新增“阅读优先级建议（AI-306）”子分区（视图范围、集合 ID、仅未读、包含归档、返回数量、候选池上限）；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs` 中新增 `aiReadingPriorityRunBtn` 事件绑定，调用 `/api/product/ai/reading-priority` 并输出结果到 `aiOutput`。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiProviderService.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；`rg` 检查命中 `generateReadingPriorityRecommendations`、`/api/product/ai/reading-priority`、`aiReadingPriorityRunBtn`。
- 后续：继续 `AI-401`（AI 规则动作引擎）或 `AI-402`（历史库 AI 回填任务）；若优先自动化闭环，建议先做 `AI-401`。

### 2026-02-24 22:46 CST
- 待办：实现 `AI-401`（AI 规则动作引擎：触发器=新增书签/抓取完成，动作=打标签/摘要/推荐集合）
- 内容（规则引擎服务）：新增 `/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiRuleEngine.js`，实现规则配置（启用开关、触发器、条件、动作）、手动执行、事件触发执行与运行日志记录。动作链支持 `autoTag`（合并/替换标签）、`summary`（if_empty/append/replace 写入备注）、`recommendFolder`（可选自动移动到推荐集合）。服务复用既有 AI provider 抽象（OpenAI 兼容 / Cloudflare AI）与 AI 生成能力（打标签/摘要/集合推荐），并在 `db.aiRuleConfigs` / `db.aiRuleRuns` 中持久化配置与审计记录。
- 内容（后端接入）：更新 `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`，初始化 `AiRuleEngine` 并注入到 `bookmarkRoutes` 与 `productRoutes`；同时在 `ensureDbShape()` 中新增 `aiRuleConfigs` 与 `aiRuleRuns` 结构。扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js` 新增规则引擎接口：`GET/PUT /api/product/ai/rules/config`、`POST /api/product/ai/rules/run`、`GET /api/product/ai/rules/runs`。
- 内容（触发器落地）：扩展 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`，在 `POST /api/bookmarks` 成功创建书签后异步触发 `bookmark_created`；在 `POST /api/bookmarks/:id/metadata/fetch` 成功抓取 metadata 后异步触发 `metadata_fetched`。触发采用 best-effort 异步执行，不阻塞用户请求，失败会写服务端日志。
- 内容（前端设置页）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html` 的 AI 面板新增“AI 规则动作引擎（AI-401）”子分区，包含规则配置（触发器/条件/动作）、手动执行（书签 ID + 模拟触发器）与运行日志查询入口；在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs` 新增 `loadAiRuleConfig()`、`renderAiRuleConfig()`、`readAiRuleConfigForm()` 与对应按钮事件绑定，并将规则配置加载纳入 `refreshAll()`。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/services/aiRuleEngine.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/server.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/services/aiRuleEngine.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/bookmarkRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/server.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；`rg` 检查命中 `/api/product/ai/rules/config`、`/api/product/ai/rules/run`、`/api/product/ai/rules/runs`、`aiRules.notifyEvent`、`aiRulesManualRunBtn`。
- 后续：继续 `AI-402`（历史库 AI 回填任务：分批补标签/摘要/集合推荐，支持暂停/恢复）。

### 2026-02-25 18:13 CST
- 待办：实现 `AI-402`（历史库 AI 回填任务：为旧书签分批补标签/摘要/集合推荐，支持暂停/恢复）
- 内容（后端任务队列）：在 `/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js` 完成 `AI-402` 的回填任务执行链路，新增 `aiBackfillTasks` 队列处理函数与路由：`POST /api/product/ai/backfill/tasks`、`GET /api/product/ai/backfill/tasks`、`GET /api/product/ai/backfill/tasks/:taskId`、`POST /api/product/ai/backfill/tasks/:taskId/pause`、`POST /api/product/ai/backfill/tasks/:taskId/resume`。任务创建支持按视图/集合/是否未读/是否无标签/是否无备注/是否包含归档/排序/数量限制筛选候选书签，执行逻辑复用 `AI-401` 规则引擎 `aiRules.runManual(..., trigger='backfill')`，并通过统一 `jobQueue`（有则用 processor queue，无则 async fallback）串行处理。
- 内容（暂停/恢复修复）：修复回填任务处理函数 `processAiBackfillTask()` 的恢复逻辑，任务从 `paused` 恢复时会从已处理偏移量继续执行（基于 `progress.processed/succeeded/failed/skipped` 恢复），不再从头重复处理已跑过的书签；`pause/resume` 路由同时加入状态机校验（仅允许 `queued/running/retry -> paused`、`paused -> queued|retry`）。
- 内容（设置页入口）：在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html` 的 AI 面板新增“历史库 AI 回填任务（AI-402）”子分区，提供筛选参数（视图、集合、子集合、未读、无标签、无备注、归档、排序、任务上限、批大小）和任务操作（创建/列表/详情/暂停/恢复）。在 `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs` 新增 `readAiBackfillCreateForm()`、`writeAiBackfillOutput()` 等逻辑与按钮事件绑定，结果统一输出至 `aiBackfillOutput`。
- 内容（文档状态）：更新 `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`，勾选 `AI-402` 与阶段里程碑 `AI-903`（`AI-401 + AI-402`）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.html`, `/Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/routes/productRoutes.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/public/settings.mjs`；`rg` 检查命中 `/api/product/ai/backfill/tasks` 路由与 `aiBackfill*` 设置页按钮/输出节点。
- 后续：继续 `AI-403`（Provider 路由与降级策略）或 `AI-404`（成本/配额护栏）；若优先可运维性，建议先做 `AI-404`。
=======
### 2026-02-26 20:55 CST
- 待办：按 `docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md` 完成 Cloudflare Workers 迁移第一阶段（MVP）。
- 内容：新增 Workers 迁移 TODO 文档并落地 Phase 1/2：创建 `wrangler.toml`（Worker 入口 + assets 绑定）；新增 `src/worker.js`（`/api/health`、`/api/state`、未迁移 API 返回 `501`）；`package.json` 增加 `cf:check/cf:dev/cf:deploy` 脚本；`README.md` 新增 Workers 运行说明。当前保持 Node/Express 启动链路不变，实现“并行迁移”。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md`, `/Users/xiaochou164/Desktop/bookmarktorain/src/worker.js`, `/Users/xiaochou164/Desktop/bookmarktorain/wrangler.toml`, `/Users/xiaochou164/Desktop/bookmarktorain/package.json`, `/Users/xiaochou164/Desktop/bookmarktorain/README.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/worker.js`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/server.js`；`npm install --no-audit --no-fund`（受网络/策略限制返回 403，未完成 wrangler 安装）。
- 后续：进入 `CFW-201+`，优先迁移 D1/R2 与核心 CRUD 路由，再逐步替换本地存储与进程内任务。

### 2026-02-26 21:20 CST
- 待办：继续 Cloudflare Workers 迁移，补充 D1 路由样例并提高 Worker API 可用性。
- 内容：将 `src/worker.js` 从“仅健康检查”升级为“可用 API 骨架”：新增 requestId 透传、统一错误响应结构、未迁移 API 的标准化 501 返回；引入 D1 schema 初始化逻辑（`folders` 表 + `root` 节点 seed），并迁移首批业务路由 `GET /api/folders`、`POST /api/folders`。同步更新 `docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md`（标记 `CFW-201a/301a` 完成）、`README.md`（补充 D1 binding 配置示例与可用接口）、`wrangler.toml`（增加 D1 配置注释模板）。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/src/worker.js`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md`, `/Users/xiaochou164/Desktop/bookmarktorain/README.md`, `/Users/xiaochou164/Desktop/bookmarktorain/wrangler.toml`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/worker.js`；`npm run cf:check`；`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/server.js`。
- 后续：继续迁移 `bookmarks/tags` 与认证链路；补充基于 `wrangler dev` 的端到端验证（D1 本地库）。

### 2026-02-26 21:45 CST
- 待办：继续推进至“可直接部署 Cloudflare”状态，补齐 D1 初始化与可执行校验链路。
- 内容：新增 `scripts/cf-worker-smoke.mjs` 作为 Worker 冒烟测试（覆盖 `/api/health`、`/api/state`、`/api/folders` 无 DB/有 DB mock 两类路径）；新增 `migrations/0001_folders.sql` 与 `scripts/cf-apply-d1-migration.sh`，并在 `package.json` 增加 `cf:d1:create`、`cf:d1:migrate:local`、`cf:d1:migrate:remote`、`cf:smoke` 脚本。更新 `README.md` 为“可部署”步骤（创建 D1 -> 写入 `wrangler.toml` -> 执行迁移 -> dev/deploy）；同步更新 `docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md` 完成项。
- 变更文件：`/Users/xiaochou164/Desktop/bookmarktorain/scripts/cf-worker-smoke.mjs`, `/Users/xiaochou164/Desktop/bookmarktorain/migrations/0001_folders.sql`, `/Users/xiaochou164/Desktop/bookmarktorain/scripts/cf-apply-d1-migration.sh`, `/Users/xiaochou164/Desktop/bookmarktorain/package.json`, `/Users/xiaochou164/Desktop/bookmarktorain/README.md`, `/Users/xiaochou164/Desktop/bookmarktorain/wrangler.toml`, `/Users/xiaochou164/Desktop/bookmarktorain/docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md`
- 验证：`node --check /Users/xiaochou164/Desktop/bookmarktorain/src/worker.js`；`npm run cf:check`；`npm run cf:smoke`；`bash -n /Users/xiaochou164/Desktop/bookmarktorain/scripts/cf-apply-d1-migration.sh`。
- 后续：在具备 npm registry 访问的环境安装 `wrangler`，执行 `cf:d1:create -> cf:d1:migrate:remote -> cf:deploy` 完成线上发布。
>>>>>>> theirs
