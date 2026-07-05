# Rainbow 工程文档索引

这里是工程文档入口。根目录 `README.md` 保持项目概览、启动和常用命令；本索引用来说明每份文档该在什么时候读、怎么维护，避免计划、验收、日志和截图资料混在一起。

## 快速阅读路径

- 新人接手：先读 `README.md`，再读 `docs/IMPLEMENTATION_PLAN.md` 和 `docs/TODO.md`。
- 本地开发：读 `README.md` 的启动、脚本和环境变量章节，然后跑 `npm test`、`npm run cf:check`、`npm run ui:check`。
- Cloudflare 发布：读 `docs/CLOUDFLARE_ACCEPTANCE_CHECKLIST.md`，再按需看 `docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md`。
- 前端 Raindrop 对齐：先读 `docs/UI_UX_AUDIT_TODO.md`，再读 `docs/RA_DOM_MY0_ACCEPTANCE_CHECKLIST.md`、`docs/RA_DOM_MY0_SCREENSHOT_COMPARE.md`、`docs/RA_DOM_MY0_INTERACTION_REGRESSION_CHECKLIST.md`。
- 前端回归：读 `docs/UI_UX_TEST_CHECKLIST.md` 和 `docs/FRONTEND_REGRESSION_CHECKLIST.md`。
- 浏览器扩展同步：读 `chrome-extension/README.md` 和 `safari-extension/README.md`，并关注后端 `/api/chrome-sync*` 与 `/api/plugins/raindropSync/*`。

## 文档分组

### 项目入口

- `README.md`：项目定位、当前运行模型、启动命令、主要 API 和核心说明。
- `docs/README.md`：当前文档索引与维护规则。
- `docs/openapi.json`：OpenAPI 基线，用于接口消费方或接口审计。

### 计划与收口

- `docs/IMPLEMENTATION_PLAN.md`：Rainbow Cloud 产品化阶段规划。
- `docs/TODO.md`：跨阶段收口清单、当前迭代和后续能力池。
- `docs/DEV_LOG.md`：按时间记录已实施事项，适合查变更历史，不作为唯一事实来源。

### Cloudflare 与运维

- `docs/CLOUDFLARE_ACCEPTANCE_CHECKLIST.md`：部署、D1/R2/Queues/Cron、远端 smoke、DLQ 和恢复演练验收。
- `docs/CLOUDFLARE_WORKERS_MIGRATION_TODO.md`：Cloudflare Workers 迁移收口项，偏迁移历史与剩余事项。

### 前端与 Raindrop 对齐

- `docs/UI_UX_AUDIT_TODO.md`：全项目 UI/UX 审计结论、问题池和建议实施顺序。
- `docs/RA_DOM_MY0_ACCEPTANCE_CHECKLIST.md`：Raindrop `/my/0` DOM/布局对齐验收。
- `docs/RA_DOM_MY0_SCREENSHOT_COMPARE.md`：`/my/0` 截图对比流程和偏差标注模板。
- `docs/RA_DOM_MY0_INTERACTION_REGRESSION_CHECKLIST.md`：`/my/0` 交互回归清单。
- `docs/RA_UI_ACCEPTANCE_CHECKLIST.md`：较早的 Raindrop 前端对齐验收清单。
- `docs/RA_UI_SCREENSHOT_COMPARE.md`：较早的 Raindrop 截图对比流程。

### 测试与回归

- `docs/UI_UX_TEST_CHECKLIST.md`：UI/UX 专项测试门禁、环境、数据和结果模板。
- `docs/FRONTEND_REGRESSION_CHECKLIST.md`：发布前前端回归清单，覆盖登录、首页、详情、预览、设置、公开页和无障碍。

### 浏览器扩展

- `chrome-extension/README.md`：Chrome 安装、Safari 构建入口、配置、测试建议和同步注意事项。
- `safari-extension/README.md`：Safari Web Extension 生成产物说明和 Xcode 转换步骤。
- 扩展默认连接主域名应为 `https://bookmark.sundays.ink`；旧 `workers.dev` 默认值会迁移到主域名。

### 截图资料

- `docs/screenshots/raindrop-reference/`：Raindrop 参考截图与 DOM 导出。
- `docs/screenshots/ui-visual-baseline/`：本项目 UI 浏览器审计生成的基线截图与 `audit-report.json`。

## 维护规则

- 根 README 只放项目概览和最常用命令；详细验收、对齐和排期放到 `docs/`。
- 新增大块计划先写入 `docs/TODO.md` 或对应清单，完成后在 `docs/DEV_LOG.md` 追加记录。
- Cloudflare 发布或远端验证结果追加到 `docs/CLOUDFLARE_ACCEPTANCE_CHECKLIST.md`。
- UI 对齐变更同时更新对应 Raindrop/前端清单，并保留截图基线路径。
- 文档链接优先使用相对路径，避免写死本机绝对路径。
- 只保留一个事实入口：当前状态以 `README.md` 和本索引为准，历史细节放 `DEV_LOG.md`。
