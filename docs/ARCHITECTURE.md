# Rainbow 架构总览

本文描述当前仓库的实际运行架构、主要数据流、目录职责和验证边界。历史规划与迁移过程分别保留在 `IMPLEMENTATION_PLAN.md`、`TODO.md` 和 `DEV_LOG.md`，不作为当前实现的唯一依据。

## 1. 运行时组成

| 层级 | 当前实现 | 主要职责 |
|---|---|---|
| Web 前端 | `public/` 原生 HTML/CSS/ES modules | 工作台、详情、设置、登录、插件管理、公开分享 |
| 生产 API | `src/worker.mjs` | Cloudflare Workers 路由、鉴权、业务逻辑和静态资源入口 |
| 生产数据库 | Cloudflare D1 | 用户、书签、集合、任务、设备、插件状态和产品配置 |
| 对象存储 | Cloudflare R2 | 封面、附件、导出和备份对象 |
| 异步执行 | Cloudflare Queues + DLQ | metadata、导入导出、插件、AI 和备份任务 |
| 定时调度 | Cloudflare Cron Triggers | 提醒扫描、任务补偿和定时同步 |
| 本地兼容服务 | `src/server.js` + Express | 本地开发、旧数据迁移和部分基础设施回归 |
| 浏览器扩展 | `chrome-extension/` | Chrome 书签树与 Rainbow 云书签双向同步 |
| Safari 产物 | `safari-extension/` | 由 Chrome 扩展源文件生成的 Safari Web Extension 源目录 |

生产地址为 `https://bookmark.sundays.ink`，Worker 备用地址由 Wrangler 部署结果给出。

## 2. 关键数据流

### Web 工作台

1. 浏览器通过 session cookie 或 Bearer Token 请求 Worker API。
2. Worker 按 `userId` 执行租户隔离并访问 D1。
3. 长任务写入任务记录并投递 Cloudflare Queue。
4. Consumer 更新任务状态；前端通过事件快照、SSE 兼容入口或轮询刷新状态。
5. 封面、附件、导出和备份内容通过 R2 保存，D1 只保存对象 key 与元数据。

### 浏览器扩展同步

浏览器扩展同步的是“Chrome 书签 ↔ Rainbow 云书签”，主入口为 `POST /api/chrome-sync`：

1. 扩展读取 Chrome 书签树，生成按文件夹路径分组的完整快照。
2. 扩展携带 API Token、`deviceId` 和 `mirrorIndex` 提交快照。
3. Worker 把 Chrome 新增、标题修改、移动和删除合并到 D1。
4. Worker返回 `toAddInChrome`、`toDeleteInChrome` 和新的 `mirrorIndex`。
5. 正式同步时扩展把返回差异应用到 Chrome，并保存新的镜像索引。

设备注册和状态上报使用 `/api/plugins/raindropSync/devices/*`。完整契约、限制与验证方式见 `CHROME_EXTENSION_SYNC.md`。

### 服务端 Raindrop 插件

仓库中的 `raindropSync` 服务端插件是另一条同步面：用于 Rainbow 服务端任务、映射、调度、审计和 Raindrop provider 能力。它与浏览器扩展的 `/api/chrome-sync` 快照协议不能混为同一个入口。

## 3. 前端结构

- `public/app.mjs`：工作台编排与跨模块状态协调。
- `public/js/app/`：认证、侧栏、搜索、书签、详情、预览、Dialog、任务和无障碍 helper。
- `public/js/stateStore.mjs`：核心 UI 状态写入口。
- `public/css/`：按 tokens、base、layout、workbench、components、dialogs、settings、public、responsive 分层。
- `public/settings.mjs`、`plugin.mjs`、`login.mjs`、`public-share.mjs`：外围页面入口。

Raindrop UI 对齐证据位于：

- `docs/screenshots/raindrop-reference/`
- `docs/screenshots/ui-visual-baseline/`
- `docs/UI_UX_AUDIT_TODO.md`

## 4. 后端结构

- `src/worker.mjs`：Cloudflare 生产主入口。
- `src/routes/`：Express 兼容路由与业务拆分版本。
- `src/services/`：同步、AI、鉴权、任务、对象存储和内容提取服务。
- `src/repositories/`：数据访问抽象。
- `src/infra/`：队列、日志和指标。
- `migrations/`：D1 schema migration。
- `db/sqlite/`：旧 SQLite 兼容 schema。

Worker 与 Express 路径需要保持接口契约一致；新增接口时至少同步检查 `src/worker.mjs`、对应 `src/routes/*` 和 `docs/openapi.json`。

## 5. 验证矩阵

| 命令 | 覆盖范围 |
|---|---|
| `npm test` | Node 基础设施、存储、日志、指标和 HTTP 安全 |
| `npm run docs:check` | 关键文档、Markdown 相对链接和 OpenAPI 同步入口 |
| `npm run cf:check` | Worker 入口语法 |
| `npm run cf:smoke` | Worker 本地业务主路径 |
| `npm run cf:smoke:remote -- <url>` | 生产健康、认证、CRUD、公开分享和 IO 任务 |
| `npm run ui:check` | CSS 分层、静态 UI 规则、对比度和性能预算 |
| `npm run ui:browser` | 多页面多视口截图、键盘、溢出、大样本和交互状态 |
| `npm run extension:check` | Chrome 扩展语法与 Safari 生成 |
| `npm run extension:smoke:remote -- <url>` | Token、设备注册、Chrome 快照同步和设备状态契约 |
| `npm run ops:drill` | 备份恢复演练 |

## 6. 当前已知限制

- 浏览器扩展的“预览变更”当前不会修改 Chrome，但仍会调用具有写入行为的 `/api/chrome-sync`，因此 Chrome 新书签可能在预览阶段写入 Rainbow。修复前不得把它描述为完全无写入的 dry-run。
- `docs/openapi.json` 是人工维护的基线，不会自动从 Worker 生成；接口变更后必须同步更新。
- `safari-extension/` 是生成产物。修改 `chrome-extension/` 后需重新运行 `npm run extension:safari:build`。
- 生产部署依赖本机已登录 Wrangler，并要求现有 D1、R2、Queues、DLQ 和 Cron 绑定名称保持一致。

## 7. 发布流程

推荐顺序：

```bash
npm test
npm run docs:check
npm run cf:check
npm run cf:smoke
npm run ui:check
npm run ui:browser
npm run extension:check
npm run cf:deploy
npm run cf:smoke:remote -- https://bookmark.sundays.ink
npm run extension:smoke:remote -- https://bookmark.sundays.ink
```

扩展 smoke 当前会输出 `previewMutatedServer`，该字段用于显式暴露上述预览限制。
