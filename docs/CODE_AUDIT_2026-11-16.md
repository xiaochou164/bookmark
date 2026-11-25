# Bookmark 代码与前端体验复核整改清单（2026-11-16）

> 状态：P0/P1 和 P2-202/203/204 已完成本地及托管验收；P2-201 的大入口逐域拆分尚未完成。本轮最新代码提交 `c15a9de` 已完成相关推荐 controller 拆分并等待托管验收。历史 `[x]` 只表示既往收口，不作为本次验收证据。截图与机器报告位于 `docs/screenshots/audit-2026-11-16/{before,after}`。
>
> 范围：master 分支的 Web 工作台、登录/设置/插件/公开分享页、Chrome/Safari 扩展、Node/Worker API、CI、部署与测试。原则：先保证数据安全与正确性，再调整视觉；尊重现有 Raindrop 风格与功能，不做无依据的整体重设计。

## 当前状态覆盖

以下当前状态覆盖下方按时间记录的历史快照：`BK-AUD-205` 已完成并通过 CI `44327200479` / Docker `44327200197`；Worker 当前入口为 5,749 行，`src/routes/productRoutes.js` 为 3,088 行，`public/app.mjs` 已降至 8,266 行（325.4KiB）。相关推荐 controller 已从入口抽至 `public/js/app/relatedBookmarks.mjs`，本地 `npm test` 87/87、`ui:check` 和浏览器 101/8/16 通过；`BK-AUD-201` 仍未完成，因为 Worker 余下路由/任务域、Node/Worker 契约覆盖以及前端设置/详情按钮/列表等大型入口仍需继续拆分。

本轮最新增量：Worker 当前入口降至 6,259 行，插件任务与元数据任务处理器已迁至 `src/worker/taskProcessors.mjs`；目标测试 2/2、全套 `npm test` 67/67、docs/UI/CF/smoke/extension 门禁通过，BK-AUD-201 继续开放，待本次提交后进行 Docker/hosted 验收。

该增量托管验收已完成：GitHub CI `45386350505` 16/16 成功，Docker PR build `45386350540` 成功；BK-AUD-201 仍未完成。

当前工作树增量：broken-link scan processor 已并入 `src/worker/taskProcessors.mjs`，Worker 入口降至 6,216 行；目标测试 3/3、全套 `npm test` 68/68、docs/UI/CF/smoke/extension 门禁通过；GitHub CI `45388109218` 16/16、Docker PR build `45388109307` 均成功。

当前工作树增量：AI rules processor 已迁至 `src/worker/aiTaskProcessors.mjs`，Worker 入口降至 6,119 行；目标测试 2/2、全套 `npm test` 70/70、docs/UI/CF/smoke/extension 门禁通过；GitHub CI `45389699468` 16/16、Docker PR build `45389699369` 均成功。

本轮最新增量：AI batch/backfill processors 已迁至 `src/worker/aiTaskProcessors.mjs`，Worker 入口降至 5,956 行；新增 2 项租户边界、部分失败进度与 summary 候选筛选回归，目标测试 2/2、全套 `npm test` 72/72、docs/UI/CF/smoke/extension 门禁通过；`npm run ui:browser` 通过（101 张页面状态、8 项 E2E、16 张扩展截图），生成截图已恢复到已审阅基线。BK-AUD-201 继续开放，待本次提交后进行 Docker/hosted 验收。

本轮最新增量：Worker semantic dedupe task 已迁至 `src/worker/aiTaskProcessors.mjs`，入口降至 5,826 行；新增 1 项租户边界与 exact-URL 聚类回归，目标测试 1/1、全套 `npm test` 73/73、docs/UI/CF/smoke/extension 门禁通过；Docker 本地 build/start/healthy 及 hosted CI `45393042687`（16/16）/Docker `45393043028` 均通过。BK-AUD-201 继续开放。

本轮最新增量：Worker IO task 已迁至 `src/worker/taskProcessors.mjs`，入口降至 5,749 行；新增 2 项导出成功、租户参数和跨租户备份对象拒绝回归，目标测试 2/2、全套 `npm test` 75/75、docs/UI/CF/smoke/extension 门禁通过；Docker 本地 build/start/healthy、hosted CI `45549199061`（16/16）和 Docker `45549199052` 均通过。BK-AUD-201 继续开放。

本轮最新增量：导入/导出任务面板已从 `public/app.mjs` 抽至 `public/js/app/ioTasks.mjs`，入口降至 9,355 行；新增 UI controller 单测 1 项，覆盖导出范围和活动任务状态，保留任务详情、下载、日志、重试、轮询、错误反馈和焦点回收行为，并对任务 ID 做 URL 编码与 DOM attribute escaping。目标测试 1/1、全套 `npm test` 76/76、`ui:check`、`docs:check`、`cf:check`、`cf:smoke`、`extension:check`、`ui:browser` 101/8/16 及 Docker build/start/healthy 均通过；截图已恢复到审阅基线；hosted CI `45550791268` 16/16、Docker `45550791281` 通过，BK-AUD-201 继续开放。

本轮额外稳定性修复：托管并行测试偶发将 digest provider failure 用例判为“时间窗为空”，根因是路由与测试直接共享墙上时钟。`registerProductDigestRoutes` 现支持可选 `now` 注入，回归测试使用固定时间，生产默认仍为 `Date.now()`；单测重复运行不再依赖 runner 时序。

本轮最新增量：实时通知中心的 SSE/轮询连接、任务快照汇总、通知去重/已读、Toast 和刷新调度已从 `public/app.mjs` 抽至 `public/js/app/realtimeNotifications.mjs`，入口降至 9,209 行（371.4KiB）；新增 `tests/realtime-notifications-ui.test.js`，覆盖任务活跃/失败摘要、初始快照去重和轮询通知。`ui-static-audit` 已改为检查新模块边界，`npm test` 77/77、docs/UI/CF/smoke/extension 门禁、浏览器 101/8/16 和 Docker build/start/healthy 通过；hosted CI `45552355409` 16/16、Docker `45552355425` 通过，BK-AUD-201 继续开放。

本轮最新增量：插件同步面板的任务轮询、配置、计划、历史、审计、设备和健康状态加载已从 `public/app.mjs` 抽至 `public/js/app/pluginSync.mjs`，入口降至 9,103 行（358.2KiB）；新增 `tests/plugin-sync-ui.test.js`，覆盖计划字段归一化、配置加载、任务列表和终态轮询刷新。静态 UI 审计新增 plugin controller 边界检查，`npm test` 78/78、docs/UI/CF/smoke/extension 门禁、浏览器 101/8/16 和 Docker build/start/healthy 通过；hosted CI `45553778576` 16/16、Docker `45553778536` 通过，BK-AUD-201 继续开放。

本轮最新增量：详情页高亮/注释列表、编辑/删除、注释 CRUD、内容 escaping、书签切换和请求序列已从 `public/app.mjs` 抽至 `public/js/app/highlights.mjs`，入口降至 8,850 行（347.1KiB）；新增 `tests/highlights-ui.test.js`，覆盖用户内容 escaping 和旧书签结果抑制。静态 UI 审计新增 RA-FE-010，`npm test` 80/80、`ui:check` 和浏览器 101/8/16 通过；最终代码头 hosted CI `45557395256`（16/16）与 Docker `45557395165` 通过，BK-AUD-201 继续开放。

本轮最新增量：搜索建议、token 插入、键盘 roving、最近搜索持久化与 blur 延迟关闭已从 `public/app.mjs` 抽至 `public/js/app/searchSuggest.mjs`，入口降至 8,618 行（338.8KiB）；新增 `tests/search-suggest-ui.test.js` 2 项回归，覆盖 HTML escaping、ARIA active descendant、token 应用、搜索结果刷新和最近搜索恢复。静态 UI 审计新增 RA-FE-011，`npm test` 82/82、`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 和 `ui:browser` 101/8/16 均通过；截图已恢复审阅基线，Docker workflow `45559542765` 与 CI `45559542759` 均成功（16/16）。BK-AUD-201 继续开放。

本轮最新增量：预览/阅读模式、媒体安全降级、选区高亮锚点、正文提取刷新与预览状态反馈已从 `public/app.mjs` 抽至 `public/js/app/previewController.mjs`，入口降至 8,398 行（330.4KiB）；新增 `tests/preview-controller-ui.test.js` 3 项回归，覆盖媒体 URL 安全处理、同书签请求序列抑制、加载/降级状态和选区锚点。静态 UI 审计新增 RA-FE-012，`npm test` 85/85、`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 和 `ui:browser` 101/8/16 均通过；Docker 本地 build/start/healthy、hosted CI `45561713899`（16/16）与 Docker `45561713835` 均通过。BK-AUD-201 继续开放。

本轮最新增量：详情页元数据抓取状态、历史、请求序列、轮询和重置逻辑已从 `public/app.mjs` 抽至 `public/js/app/metadataTasks.mjs`，入口降至 9,015 行（354.5KiB）；新增 `tests/metadata-tasks-ui.test.js`，覆盖当前书签隔离、失败重试显示、历史摘要和任务 ID 状态。静态 UI 审计新增 RA-FE-009 controller 边界检查，`npm test` 79/79、`ui:check` 通过；本轮最终代码头 CI `45554317598` 与 Docker `45554317550` 均通过，BK-AUD-201 继续开放。

## P0：正确性与高风险
- [x] **BK-AUD-001 / P0 / 部署入口一致性（已修复并以镜像验证）**：根因是 `Dockerfile` 以 `npm start` 启动，但 `package.json` 的 start 为 `wrangler dev --local`，且镜像仅安装生产依赖、Wrangler 又属于 devDependencies；健康检查端口为 3789。本轮切换到 `start:node`，统一 `PORT` 和健康检查，并同步 Compose、dockerignore 与 README。`docker build`、隔离容器启动及 `/api/health` 返回 ok 已验证；托管 CI 同样构建并健康检查通过。
- [x] **BK-AUD-002 / P0 / 扩展同步预览的零写入契约（已修复并做真实本地回归）**：原文档称 PREVIEW 会写入，且实际 Popup/Options 消息分发调用 `/api/chrome-sync` 时可触发写入。Chrome/Safari 现明确发送 preview；Node/Worker 使用只读内存 repo，认证时间、租户初始化、索引、deviceId、状态和日志均不落盘。VM 消息分发与隔离 SQLite/JSON HTTP 回归均比较持久化快照，Chrome/Safari preview 零写断言通过；扩展同步文档与 OpenAPI 已同步。
- [x] **BK-AUD-003 / P0 / 认证、数据隔离与输入安全专项（本轮发现项已修复并回归）**：以 `src/routes/*`、`src/worker.mjs`、`src/http/middleware.js`、`src/services/*` 为审计范围，覆盖越权/跨租户、session/token、CSRF、SSRF、URL scheme、HTML sandbox、同步删除保护、备份恢复、队列重投、原子 JSON 写入及敏感日志。回归包括真实 SQLite Worker 和隔离 Node 服务；当前 `npm test` 32/32、`npm audit --audit-level=low` 0 漏洞。该结果不替代完整人工渗透测试；云平台 outbound 网络策略和 Safari 原生权限列为外部限制。

## P1：前端布局与操作体验
- [x] **BK-AUD-101 / P1 / 列表操作区局部溢出（已复现并修复）**：行内动作容器受 legacy `translateX(4px)` 推出 104px 布局；稳定层明确 reset transform，并使用最大内容宽度的图标动作组。看板选择 label 曾只有 44px 宽却包含 72px 内容，根因是全局输入框 padding/宽度套用到复选框，现复选框为 18px、标签点击高度 44px。101 张前后矩阵截图；终态全局与局部溢出均为 0。
- [x] **BK-AUD-102 / P1 / 详情栏与编辑态局部溢出（已复现并修复）**：详情底部 sticky 动作栏负边距超出表单，详情模式按钮最小宽度撑出 360/640px。修复负边距、采用两列可收缩模式按钮与 `minmax(0,1fr)` 表单网格。浏览器四档检查与 axe 均通过。方向键切换后重绘会替换原 tab DOM，现按新节点 ID 恢复焦点。
- [x] **BK-AUD-103 / P1 / 信息架构、主次操作与响应式（已动态验证）**：批量动作条原来将 360/640/1280px 页面撑到 1070/1070/1488px；现改为可换行第二行，保留完整操作。四布局、搜索建议/空结果、批量、菜单、通知、侧栏抽屉、详情编辑和 AI 抽屉在 360/640/920/1280px 验证，101 张前后截图；99 书签、153 集合、104 标签虚拟化回归通过。
- [x] **BK-AUD-104 / P1 / 设置、插件与公开分享页（已动态验证）**：修复登录表单行内 `onsubmit` 违反 CSP、登录基线因复用会话误跳工作台、扩展 Popup 假报“已连接”以及其 360px 横向溢出。扩展缺少同步记录时显示“尚未验证”；预览/成功/失败状态使用真实消息反馈。设置/插件/公开/登录与注册四档截图及 Chrome/Safari Popup/Options 16 张截图通过。Safari 原生扩展宿主未可用真实浏览器载入，代码由生成一致性+VM 测试+浏览器 fixture 验证。
- [x] **BK-AUD-105 / P1 / 无障碍与键盘闭环（已动态验证）**：补列表选择 accessible name、对话框名称、详情 tab 语义和方向键 roving、菜单 role、抽屉 inert/焦点限制及关闭恢复；axe-core 对 101 个页面状态和 16 个扩展状态检查，无 serious/critical 违规。键盘覆盖添加菜单、搜索、Enter 打开书签、方向键切换详情 tab、Dialog 与 AI 抽屉关闭/焦点恢复。640px CSS 视口作为 200% 桌面缩放的等效重排宽度验证；未控制操作系统浏览器缩放比例。Reduced motion 已验证。
- [x] **BK-AUD-106 / P1 / 样式覆盖治理（已迁移并回归）**：以四档浏览器截图和计算样式为护栏，从三个 legacy 子表中删除已被稳定层同选择器/属性覆盖的声明（workbench 54、legacy 294、safety 约 60 处声明），保留实际生效兼容规则；重复选择器计数降至 14，CSS 总量从 192KiB 参考值降到 176.2KiB。对比图保留在本轮 before/after 目录，四档溢出与 axe 门禁全过。
- [x] **BK-AUD-107 / P1 / 导入导出字段完整性与 HTML escaping（本地及托管验收通过）**：复现证据为 `src/worker.mjs` 旧 `parseImportCsv` 使用 `line.split(',')`，但 `exportCsvPayload` 已按 CSV 规则包引号，因此字段含逗号/引号/换行时导入拆列；旧 HTML 导出只替换标题 `<` 和 URL 双引号，标签、`&`、`>` 未完整转义。已抽取 `src/worker/bookmarkTransfer.mjs`，实现 RFC 风格引号/双引号/CRLF/多行字段读取、异常引号与缺 URL 列报错、HTML 文本/属性统一 escaping，并保留 HTML entity round-trip。`tests/bookmark-transfer.test.js` 新增 3 项检查覆盖 CSV round-trip、损坏 CSV、HTML 转义/解析。验收：目标测试通过；目标 codec 单测 3/3、全套 `npm test` 39/39、`cf:check`、`cf:smoke`、Docker 构建/健康检查及完整 `ui:browser` 通过；最终代码 head `1b948f9` 的 GitHub Actions run `44300423004` 全部 16 步通过，Docker PR build run `44300423001` 通过，零 warning annotations。无 DB/schema/API 变化。
- [x] **BK-AUD-108 / P1 / 搜索标签条件解析（本地与 hosted 验收通过）**：`src/worker.mjs` 原解析器的 `/标签|tag.../` 分支会让“标签 AI”先命中没有捕获组的“标签”，从而不生成 `filters.tags`。纯解析逻辑已迁至 `src/worker/bookmarkIntelligence.mjs` 并改为分组匹配；`tests/bookmark-intelligence.test.js` 覆盖中文“标签 AI”、英文 `tag:JavaScript`、普通文本无误触发及 `site:` 条件。目标测试 3/3、全套 `npm test` 42/42、`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check`、浏览器 101/8/16 和 Docker 健康检查通过；GitHub Actions run `44302676562` 的 16 步全通过，Docker PR build run `44302676439` 通过且无 warning annotations。无 API/schema/数据格式变化。

## P2：工程质量、性能与交付
- [ ] **BK-AUD-201 / P2 / 大模块解耦（分阶段进行，仍未完成）**：`public/app.mjs`、`src/worker.mjs`、`src/routes/productRoutes.js` 仍是大型集中入口。本轮将约 300 行 AI 权益、策略、评估和反馈状态逻辑抽至 `src/services/aiGovernance.js`，共享词元处理抽至 `src/services/textTokens.js`，AI governance API handlers 抽至 `src/routes/productAiGovernanceRoutes.js`；将 Chrome sync folder/index transformations 抽至 `src/worker/chromeSync.mjs`；将完整 AI side drawer 状态、DOM 渲染、问答、历史和绑定抽至 `public/js/app/aiDrawer.mjs`。`public/app.mjs` 从 9,748 行减至 9,552 行，静态入口从 383.6KiB 降至 374.9KiB。新增单测覆盖用户隔离、能力门禁、策略上限、评估样本归属、API 路由挂载/租户策略以及 Worker sync URL、目录索引、镜像状态和幂等目录创建；AI 抽屉拆分后本机 `npm run ui:browser` 的 101 状态矩阵、8 项 E2E 和 16 个扩展状态通过，托管 CI run `44294235227` 的全部 16 步也通过。`productRoutes.js` 从 4,709 行减至 4,246 行，追加检索拆分后减至 4,052 行，再抽出 entitlement/subscription/quota handlers 至 `src/routes/productSubscriptionRoutes.js` 后降至 3,993 行；本次将 saved-search、backup、broken-link scan/task、duplicate scan 与 semantic dedupe handlers 分别抽至 `src/routes/productSavedSearchRoutes.js`、`src/routes/productBackupRoutes.js`、`src/routes/productBrokenLinkRoutes.js`、`src/routes/productDuplicateScanRoutes.js`、`src/routes/productSemanticDedupeRoutes.js`、`src/routes/productDigestRoutes.js`、`src/routes/productAiSettingsRoutes.js` 和 `src/routes/productAiActionRoutes.js`，入口现为 3,088 行；新增 Alice/Bob 的 CRUD、备份恢复、任务历史、重复扫描、语义索引、摘要和 AI settings 隔离回归，确认恢复不会覆盖 Bob 数据，扫描/索引/摘要/设置仅作用于调用方。`worker.mjs` 从 7,432 行减至 6,710 行，并将 Worker 导入导出 codecs 抽至 `src/worker/bookmarkTransfer.mjs`，再将书签智能/文本规则抽至 `src/worker/bookmarkIntelligence.mjs`、HTML 元数据解析与公开预览安全 helper 抽至 `src/worker/bookmarkPresentation.mjs`，公开集合 HTML 渲染抽至 `src/worker/publicShareHtml.mjs`、`src/worker/aiGovernance.mjs`；Worker 入口当前 6,514 行。当前 `npm test` 61/61，docs/UI/CF/extension 本机门禁、浏览器 101/8/16 及 Docker build/start 健康检查通过；saved-search 代码 head `6f18c51` 的 GitHub CI run `44310585890`（16 步）与 Docker PR build run `44310585793` 均通过。备份路由代码 head `b0353ef` 的 GitHub CI run `44312644489`（16 步）和 Docker PR build run `44312644522` 均成功。broken-link 路由代码 head `f80672d` 的 GitHub CI run `44314512969`（16 步）和 Docker PR build run `44314512956` 均成功。duplicate scan 代码 head `e2af39e` 的 GitHub CI run `44316388306`（16 步）和 Docker PR build run `44316388326` 均通过。semantic dedupe hosted CI run `44318376574`（16 步）与 Docker run `44318376449` 通过；AI digest hosted CI run `44320680576`（16 步）及 Docker run `44320680529` 通过，文档 head `17523ba` 的 CI `44321377536` 与 Docker `44321377625` 通过；AI settings hosted CI run `44322630733`（16 步）与 Docker `44322630665` 通过；AI action hosted CI `44324485032`（16 步）与 Docker `44324485034` 通过。Worker AI governance 本地 61/61、门禁及 Docker 检查通过，hosted 验收待本次提交后复验。Worker 剩余路由、app 其他渲染域和其他大型业务域仍待迁移与 Node/Worker 契约覆盖，本项保持未完成。
- [x] **BK-AUD-202 / P2 / 测试门禁和性能（托管验收通过）**：CI 加入 Chrome headless UI/E2E/扩展回归、Cloudflare 语法门禁、Docker 构建启动和截图 artifact；浏览器脚本采集 FCP/LCP/CLS、INP observer、heap、长任务、布局/脚本耗时，并运行低速网、CPU 限速和大样本检查。首次托管运行显示 runner 的 user namespace/AppArmor 限制导致 Chrome `No usable sandbox`；`scripts/ui-browser-audit.mjs` 现仅在 `CI` 环境传入 `--no-sandbox`，本机保持默认沙箱。最终代码 CI run `44300423004` 的全部 16 步通过，Docker PR build run `44300423001` 通过且未推送镜像；Docker action 已升级到 Node 24，`ubuntu-latest` 改固定 `ubuntu-24.04`，两项 checks 无 warning annotations。INP 若未捕获用户交互则不作为性能结论。
- [x] **BK-AUD-203 / P2 / 文档与实现漂移**：修正 OpenAPI 对 `/api/chrome-sync` preview 的写入描述与 schema，说明 `preview: true` 零持久化写入；更新架构、扩展同步、UI 审计和 UI 测试清单，区分本轮证据与历史状态，并补充隔离测试、部署边界和外部限制。
- [x] **BK-AUD-204 / P2 / 设计系统视觉收口（浏览器矩阵验证）**：修正深色卡片/分页 surface、设置状态色、扩展状态反馈及窄窗宽度；核验控件、焦点、触屏目标和响应式动作区。具体截图、视口和 axe 结果列在 P1 执行记录。
- [x] **BK-AUD-205 / P2 / Node/Worker AI 评估样本漂移（已修复并完成 hosted 验收）**：证据为 `src/services/aiGovernance.js` 的默认评估输入包含 URL/note，而 `src/worker.mjs` 原 Worker fixture 省略了三条样本中的 URL/note，导致两后端评估输入不等价。根因是 defaults 在 CJS/Worker 两处独立维护。已将 Worker 样本补齐为 Node 同值，并在 `tests/worker-ai-governance.test.js` 增加 `DEFAULT_AI_EVAL_SAMPLES` 深比较（同时检查 privacy/feature policy defaults）。本机目标测试 4/4、全套 `npm test` 61/61 通过；GitHub CI `44327200479` 与 Docker `44327200197` 均通过。

## BK-AUD-201 / P2 — Worker AI batch/backfill processors 解耦（2026-11-24）

- 证据/根因：AI 批量标签与历史回填任务原先与 Worker 队列分发、语义去重和 HTTP 入口共存，provider fallback、进度写回和候选过滤无法单独回归，增加改动时误触租户边界的风险。
- 修改：将 `processAiBatchTask`、`processAiBackfillTask` 迁至 `src/worker/aiTaskProcessors.mjs`，通过注入 `createRepo`、`buildStateForUser`、标签归一化和合并策略保持现有行为与 userId 约束；`src/worker.mjs` 仅保留队列分发。新增 `tests/worker-ai-batch-processors.test.js`，覆盖批量任务缺失书签的 partial 结果/进度、租户参数，以及回填 summary 模式仅处理未删除且无备注书签。
- 验证：目标测试 2/2；`npm test` 72/72；`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 通过；`npm run ui:browser` 通过（101/8/16），生成截图已恢复基线。`docker build -t rainbow-audit-local .` 成功，临时容器 `/api/health` 返回 `ok:true` 且 Docker health 状态为 `healthy`；hosted CI/Docker 将在本次提交后复验。
- 风险：无 API、schema 或持久化格式变化；AI IO、semantic dedupe、`public/app.mjs` 和其他 Worker/Node 大型入口仍未完全拆分，BK-AUD-201 保持未完成。

## BK-AUD-201 / P2 — Worker semantic dedupe task 解耦（2026-11-24）

- 证据/根因：语义去重队列任务原先内联在 `src/worker.mjs`，混合状态读取、向量哈希、并查集聚类、结果裁剪和 AI job 状态写回，缺少任务级租户回归。
- 修改：将 `processSemanticDedupeTask` 迁至 `src/worker/aiTaskProcessors.mjs`，通过注入 `createRepo`、`buildStateForUser` 与哈希函数保留阈值（0.7–0.995）、聚类上限、软删除过滤、exact URL/semantic edges 及结果格式；`src/worker.mjs` 仅保留队列分发。新增 `tests/worker-semantic-dedupe-task.test.js`，验证 state/job 读写均使用认证用户且聚类结果稳定。
- 验证：目标测试 1/1；`npm test` 73/73；`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 通过；Docker build 成功，临时容器 `/api/health` 返回 `ok:true` 且 health 为 `healthy`；GitHub CI `45393042687`（16/16）和 Docker `45393043028` 均通过。
- 风险：无 API、schema 或持久化格式变化；IO task、`public/app.mjs` 和其他大型 Worker/Node 入口仍需拆分，BK-AUD-201 保持未完成。

## BK-AUD-201 / P2 — Worker IO task 解耦（2026-11-25）

- 证据/根因：导入、导出和备份恢复任务原先内联在 `src/worker.mjs`，同时负责任务领取、格式编解码、R2 文件写入、跨租户备份校验和状态更新，缺少直接任务级回归。
- 修改：将 `processIoTask` 迁至 `src/worker/taskProcessors.mjs`，注入 `createRepo`、`buildStateForUser`、R2 写入、条件领取、JSON 解析和标签归一化；保留 JSON/CSV/HTML 导入导出、restore backup 的 owner key 校验、report 文件和 queued→running→succeeded/failed 状态格式。新增 `tests/worker-io-task-processors.test.js`，覆盖 JSON 导出与跨租户备份对象拒绝。
- 验证：目标测试 2/2；`npm test` 75/75；`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 通过；Docker build 成功，临时容器 `/api/health` 返回 `ok:true` 且 health 为 `healthy`；GitHub CI `45549199061`（16/16）和 Docker `45549199052` 均通过。
- 风险：无 API、schema 或持久化格式变化；`public.app.mjs` 和其他大型 Worker/Node 入口仍需拆分，BK-AUD-201 保持未完成。

## BK-AUD-201 / P2 — 前端 IO task controller 解耦（2026-11-25）

- 证据/根因：`public/app.mjs` 原先同时承担导入/导出任务列表渲染、详情/下载/日志/重试事件绑定、轮询、表单组装和任务提交，入口持续膨胀且这些异步状态缺少模块级回归。
- 修改：新增 `public/js/app/ioTasks.mjs`，通过 `createIoTaskController` 注入 API、状态、渲染 helper 和刷新回调；`public/app.mjs` 仅保留装配与调用。任务 ID 在请求路径中统一 `encodeURIComponent`，列表 `data-*` 属性统一 escaping；新增 `tests/io-task-ui.test.js` 覆盖选中范围导出和活动任务跟踪；静态 UI 审计同步检查新模块边界。
- 验证：目标测试 1/1；`npm test` 76/76；`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 通过；`npm run ui:browser` 通过（101 张页面状态、8 项 E2E、16 张扩展状态），截图恢复基线；Docker build 成功，临时容器 `/api/health` 返回 `ok:true` 且 health 为 `healthy`。
- 遗留风险：浏览器真实回归仍覆盖现有行为但尚未增加更多 controller 级交互用例；`public/app.mjs` 其余渲染域、Worker/Node 大型入口仍待拆分，hosted CI `45550791268`（16/16）与 Docker `45550791281` 已通过，BK-AUD-201 保持未完成。

## BK-AUD-201 / P2 — 前端 realtime notification controller 解耦（2026-11-25）

- 证据/根因：`public/app.mjs` 原先内联实时通知 DOM、SSE 连接、轮询回退、快照签名去重、任务/提醒摘要、Toast 和刷新调度；连接生命周期与菜单状态耦合，缺少模块级回归。
- 修改：新增 `public/js/app/realtimeNotifications.mjs`，在 `public/app.mjs` 中通过 `createRealtimeNotificationsController` 注入 API、认证状态、当前书签和既有刷新 helper；更新 `scripts/ui-static-audit.mjs` 检查模块边界；新增 `tests/realtime-notifications-ui.test.js`。
- 核心内容：保留 SSE→5 秒轮询回退、首次快照不提示、签名去重、最多 20 条通知、打开即已读、菜单关闭、任务/提醒刷新和错误静默策略；controller 暴露独立摘要与快照行为供回归。
- 验证：目标测试 1/1；`npm test` 77/77；`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 通过；`npm run ui:browser` 通过（101/8/16），截图恢复基线；Docker build/start/healthy 通过。
- 遗留风险：hosted CI `45552355409`（16/16）与 Docker `45552355425` 已通过；`public/app.mjs` 仍有详情、搜索、插件和设置等大型渲染/事件域，BK-AUD-201 未关闭。无 API/schema/持久化格式变化。

## BK-AUD-201 / P2 — 前端 plugin sync controller 解耦（2026-11-25）

- 证据/根因：`public/app.mjs` 原先内联 Raindrop sync 的任务轮询、配置/计划表单、历史、审计、设备和健康读取，插件页面异步状态与工作台入口耦合，缺少 controller 级回归。
- 修改：新增 `public/js/app/pluginSync.mjs`，通过 `createPluginSyncController` 注入 API、DOM 访问、store 配置写入和全局刷新；`public/app.mjs` 保留事件装配；静态审计增加 RA-FE-008；新增 `tests/plugin-sync-ui.test.js`。
- 核心内容：保留任务 ID URL 编码、queued/running 定时轮询、终态清理并刷新审计/设备/健康/历史、成功任务刷新书签、计划字段默认值及错误输出。
- 验证：目标测试 1/1；`npm test` 78/78；`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 通过；`npm run ui:browser` 通过（101/8/16），截图恢复基线；Docker build/start/healthy 通过。
- 遗留风险：hosted CI `45553778576`（16/16）与 Docker `45553778536` 已通过；插件页面事件装配仍位于 `bindActions`，详情/搜索/设置等其他大型域继续拆分，BK-AUD-201 未关闭。无 API/schema/持久化格式变化。

## BK-AUD-201 / P2 — 前端 highlights controller 解耦（2026-11-25）

- 证据/根因：`public/app.mjs` 原先内联高亮/注释 HTML 渲染与全部 CRUD 事件，每次详情切换重建节点并重新绑定监听器；用户内容 escaping、异步刷新和旧书签结果隔离缺少模块级回归。
- 修改：新增 `public/js/app/highlights.mjs`，通过 `createHighlightsController` 注入 API、DOM、状态、escaping、Prompt/Confirm、Toast 和刷新；`public/app.mjs` 仅保留事件装配与 controller reset/getter。静态审计新增 RA-FE-010；新增 `tests/highlights-ui.test.js`。
- 核心内容：保留高亮编辑/删除、注释新增/编辑/删除和完整列表渲染；所有用户文本及 data 属性经过 escaping，异步响应按 active bookmark 和序列号丢弃旧结果；无 API/schema/持久化格式变化。
- 验证：目标测试 1/1；`npm test` 80/80；`npm run ui:check` 通过（入口 347.1KiB / 420KiB，CSS 176.2KiB）；`npm run ui:browser` 101/8/16 通过，截图已恢复基线；最终代码头 hosted CI `45557395256`（16/16）与 Docker `45557395165` 通过，BK-AUD-201 继续开放。
- 遗留风险：详情按钮事件、预览/搜索/设置等大型域仍在 `public/app.mjs`；回退可单独 revert 本次 controller/test/静态审计提交。

## BK-AUD-201 / P2 — 前端 search suggestion controller 解耦（2026-11-25）

- 证据/根因：`public/app.mjs` 原先同时维护搜索建议条目构造、token/recent HTML、键盘 roving、ARIA active descendant、localStorage 最近搜索、blur 延迟关闭和查询应用；这些短生命周期状态与工作台入口耦合，缺少 controller 级 XSS/键盘/搜索刷新回归。
- 修改：新增 `public/js/app/searchSuggest.mjs`，通过 `createSearchSuggestController` 注入 DOM、store、搜索刷新和渲染依赖；`public/app.mjs` 仅保留事件装配。保留 token 插入时的光标恢复、recent 立即提交、输入 debounce 配合、advanced saved search 清理和 blur 延迟关闭；建议项和最近搜索标题统一 HTML escaping，并维持 `role=option`、`aria-expanded`、`aria-activedescendant`。
- 测试：新增 `tests/search-suggest-ui.test.js` 2 项，覆盖恶意描述 escaping、token 应用后的 `q/page` 状态与刷新、ARIA active descendant、最近搜索恢复。静态审计增加 RA-FE-011 controller 边界检查。
- 验证：`node --test tests/search-suggest-ui.test.js` 2/2；`npm test` 82/82；`npm run docs:check`、`npm run ui:check`、`npm run cf:check`、`npm run cf:smoke`、`npm run extension:check` 通过；`npm run ui:browser` 101 张状态截图、8 项 E2E、16 张扩展截图通过，截图已恢复基线；Docker 本地 build/start/healthy、hosted Docker workflow `45559542765` 和 CI `45559542759`（16/16）均通过。
- 遗留风险：预览、设置、搜索结果列表和详情按钮绑定仍有大型入口逻辑，BK-AUD-201 保持未完成；无 API/schema/持久化格式变化，可单独 revert 本次 controller/test/静态审计提交。

## BK-AUD-201 / P2 — 前端 preview controller 解耦（2026-11-25）

- 证据/根因：`public/app.mjs` 原先同时维护预览 dialog 状态、iframe/image/video surface 重置、媒体 URL 选择、阅读模式切换、正文提取刷新、选区锚点读取和错误/降级反馈；异步响应没有独立请求序列，重复打开同一书签时旧响应可能覆盖新状态。
- 修改：新增 `public/js/app/previewController.mjs`，通过 `createPreviewController` 注入 API、DOM、状态、URL 安全函数、详情刷新和 Toast；`public/app.mjs` 仅保留卡片/详情事件装配。controller 统一维护 active bookmark、payload、mode、UI state 和 load sequence，保留媒体类型渲染、frame-restricted 降级、reader 切换、正文提取、高亮锚点和关闭清理。
- 安全/正确性：预览媒体 URL 继续经 `safeUrl` 过滤；API 路径中的 bookmark ID 使用 `encodeURIComponent`；同一书签重复请求和切换书签时，旧响应按序列号丢弃；选区读取只构造内存 payload，不直接写入 DOM。
- 测试：新增 `tests/preview-controller-ui.test.js` 3 项，覆盖安全媒体渲染、请求竞态抑制、loading/ready 状态与 reader selection anchors。静态审计增加 RA-FE-012 controller 边界检查。
- 验证：目标测试 3/3；`npm test` 85/85；`npm run docs:check`、`npm run ui:check`、`npm run cf:check`、`npm run cf:smoke`、`npm run extension:check` 通过；`npm run ui:browser` 101 张状态截图、8 项 E2E、16 张扩展截图通过，截图已恢复基线；Docker `rainbow-preview-audit:20261125` 构建成功，临时容器 `/api/health` 返回 `ok:true` 且 health 为 `healthy`；hosted CI `45561713899`（16/16）与 Docker `45561713835` 均通过。
- 遗留风险：搜索结果列表、设置、详情按钮装配和 Worker/Node 大入口仍需继续拆分；Safari 原生宿主和真实第三方 iframe 策略仍属外部验证边界；BK-AUD-201 保持未完成，无 API/schema/持久化格式变化，可单独 revert 本次 controller/test/静态审计提交。

## BK-AUD-201 / P2 — 前端 metadata task controller 解耦（2026-11-25）

- 证据/根因：`public/app.mjs` 原先内联详情页元数据任务状态、抓取历史、请求序列、1.5 秒轮询和详情切换清理；这些异步状态与详情渲染入口耦合，缺少 controller 级当前书签隔离回归。
- 修改：新增 `public/js/app/metadataTasks.mjs`，通过 `createMetadataTaskController` 注入 API、DOM、store 状态、任务格式化、终态判断、详情状态摘要和全局刷新；`public/app.mjs` 保留按钮事件装配，并通过 getter/reset API 读取任务状态。静态审计新增 RA-FE-009；新增 `tests/metadata-tasks-ui.test.js`。
- 核心内容：保留失败重试可见性、最近任务与最多五条历史、请求序列防竞态、切换书签时停止轮询/失效旧请求、终态后刷新，以及错误时停止轮询；无 API/schema/持久化格式变化。
- 验证：目标测试 1/1；`npm test` 79/79；`npm run ui:check` 通过（入口 354.5KiB / 420KiB，CSS 176.2KiB）；本轮最终代码头 CI `45555814624` 与 Docker `45555814669` 均通过，BK-AUD-201 继续开放。
- 遗留风险：详情按钮事件、预览/高亮/搜索/设置等其他大型域仍在 `public/app.mjs`；本次未关闭 BK-AUD-201。回退可单独 revert 本次 controller/test/静态审计提交，无数据迁移。

## BK-AUD-201 Worker external resources 拆分（2026-11-24）

`src/worker.mjs` 原先内联外部 URL 元数据/文章抓取、SSRF 结果错误分类、R2 备份对象读取和备份 payload 归一化。迁移至 `src/worker/externalResources.mjs`，复用同一 `publicFetch` 安全边界（协议、重定向、大小和超时），入口从 6,433 行降至 6,311 行。新增 `tests/worker-external-resources.test.js` 两项回归，覆盖不允许的 URL 协议、DNS/HTTP 错误重试分类、缺失对象和数组边界。目标测试 2/2、全套 `npm test` 65/65、`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check` 已通过；Docker 与最新 hosted CI 待提交后验收。无 API/schema/data-format 改动，BK-AUD-201 继续开放。

## BK-AUD-201 Worker external resources 托管验收（2026-11-24）

最新代码 head `be15417` 的 GitHub CI run `45383523713` 16/16 全部成功，包含浏览器/无障碍/键盘/E2E、扩展 parity、Docker smoke 和 operations drill；Docker PR build `45383514232` 成功。当前 macOS/Colima 本地 Docker 重建曾在 Dockerfile `apt-get update` 阶段因 `deb.debian.org` DNS 无法解析而失败，未进入应用层；托管 Docker 是本次可用的独立镜像验收证据。BK-AUD-201 仍未完成，其他大型入口继续分阶段拆分。

## 验收与执行约束
1. 每项填写：问题证据（路径+行号/截图）、根因、变更文件、验证命令与结果、风险、回退方式；无法复现的标为「复核无异常」，不编造缺陷。
2. 优先级顺序：P0 → P1 → P2；每个阶段单独 commit/PR，不改真实线上数据，不直接生产部署、不自动合并 PR。
3. 必跑：`npm ci`、`npm test`、`npm run docs:check`、`npm run ui:check`、`npm run cf:check`、`npm run cf:smoke`、`npm run extension:check`、`npm run ui:browser`（若环境不具备，记录原因及替代证据）；补充 Docker 构建和两种运行模式的健康检查。
4. 浏览器矩阵：主工作台列表/卡片/详情查看与编辑/搜索建议/批量操作/菜单/通知/AI、登录、设置、插件、公开分享、Chrome/Safari Popup/Options；宽度 360/640/920/1280，至少桌面/移动分别验证键盘和触控操作。
5. 本文起于 2026-11-16 首轮静态审计；本轮已执行记录中的动态回归和依赖扫描。它不代表完整的第三方渗透测试或对每一行代码的形式化证明；报告时需同时列出未解决的 BK-AUD-201 和外部宿主限制，不得概括成「全项目已通过」。

## 本轮执行记录（持续更新）

基线：`origin/master a571df4`；分支：`codex/bookmark-audit-2026-11-16`。仅临时本地数据，未访问生产。

### P0 修复与证据

- **BK-AUD-001**：根因是生产依赖镜像调用 devDependency Wrangler；`Dockerfile` 改为 `start:node`，Compose 使用真实 `PORT`，构建上下文排除数据/凭据/Worker 状态。`README.md` 区分两种运行链。已实际 `docker build -t rainbow-audit:20261116 .`，容器映射本机 13789，`curl /api/health` 返回 ok，Docker health 为 healthy。后续安全改动完成后重建最终镜像。
- **BK-AUD-002**：实际 Popup/Options 消息仍走 `/api/chrome-sync`，并非旧文档推测的 provider preview。两后端新增内存 dry-run；认证时间更新、Worker 读集合建根目录、Node tenant bootstrap 和 provider 预览日志均绕过写入；扩展预览不创建 deviceId。涉及 `chrome-extension/background.js`、生成的 Safari、`src/routes/chromeSyncRoutes.js`、`src/services/syncPreviewRepo.mjs`、`src/pluginManager.js`、auth/tenantScope、Worker。`npm test` 覆盖 Chrome/Safari VM 消息分发及两后端 SQL/文件零写断言，均通过。
- **BK-AUD-003**：已复现并修复 IPv6 方括号/尾点 localhost 校验绕过、重定向未重新校验、抓取正文无大小/超时上限、Worker 缺失 CSRF guard 和内部错误回显、Node 鉴权前静态暴露对象、同步忽略 deleteSync 删除本地缺失项及误删空集合、Worker 复活未知时间墓碑、同步接收非 HTTP scheme。URL policy 与限量 fetch 共用；Node socket DNS lookup 再校验阻止重绑定；对象按书签/任务/备份真实归属校验，HTML sandbox；Worker JSON 正文限 10MiB。测试 `tests/security-audit.test.js` 使用真实 SQLite adapter 和隔离 Node JSON 服务测试身份、越权读写删、CSRF、对象隔离、预览与同步幂等。依赖 `npm audit fix` 更新兼容版本，当前 audit 0 项。仍在继续复核其他业务边界，不把这些测试等同完整渗透测试。

回退：按阶段 revert 提交；无 schema 变更。预览客户端必须与服务器一起升级，旧服务端不识别 dry-run。
风险：Cloudflare 的 outbound DNS/网络策略无法由本地 SQLite adapter 模拟；Safari 原生权限、签名与上架仍需 macOS Safari 扩展宿主验收。

### P1 修复与验收（2026-11-18）

- **工作台/样式**：`.bookmark-row-actions` 的 legacy transform、看板 checkbox 全局输入样式、批量工具栏宽度、详情 footer 负边距/网格最小尺寸均已按真实 DOM 根因修复。修改 `public/css/components.css`、`responsive.css`、`settings.css`、`tokens.css`、三个 legacy 子文件与 `public/index.html`。
- **语义/焦点**：登录 inline handler 改为模块 submit 监听；详情 tabs 使用 `aria-selected` 和 roving tabindex；模式重绘后聚焦替换节点；菜单 role、选择框名称、dialog 名称、移动抽屉 inert/焦点陷阱与返回焦点补齐。修改 `public/app.mjs`、`public/index.html`。
- **扩展反馈**：Chrome/Safari Popup 在无同步记录时显示未验证状态；状态详情可聚焦、窄窗口自适配且主色文本达到对比要求。修改源 Chrome 并运行 Safari 生成器同步。
- **浏览器证据**：`npm run ui:browser` 通过：工作台 101 状态截图，严重/关键 axe 违规 0、局部/页面溢出 0、浏览器异常 0、HTTP 错误 0；keyboard menu/search/tabs/dialog/drawer 通过。E2E 8 项通过。扩展 Chrome/Safari Popup/Options 16 张状态截图，溢出与严重/关键 axe 违规 0。报告：`docs/screenshots/audit-2026-11-16/after/audit-report.json`、`ui-e2e-report.json`、`extensions/audit-report.json`。
- **大数据/低性能**：真实浏览器 fixture 包含 99 本书签、153 集合、104 标签；集合和标签虚拟化、分页加载通过。640 CSS px（200% 桌面缩放等效布局宽度）无溢出且 89 个焦点目标可达；CPU 4×与 150ms/1.6Mbps 下导航计时 1393ms、CLS 0、JS heap 37.1MB、总任务 193ms、layout 12ms、script 4ms。该 headless 样本未捕获 FCP/LCP/INP（报告为 `null`），不是生产 SLA。
- **可视比较**：`before/` 包含原 P0 基线截图；`after/` 包含修复后的四档 101 个主站状态和扩展 fixture。初始矩阵有 22 个布局溢出状态和 serious/critical axe 报告，终态为 0/0。对比样例：列表动作区稳定可达、窄屏批量工具栏换行、暗色卡片文字可读、扩展 Popup 360px 不横向滚动。
- **静态门禁**：`npm run ui:check` 与 `npm run docs:check` 通过；app 383.5KiB/420KiB、CSS176.2KiB/192KiB、index DOM730/750、settings DOM556/560、legacy 重复选择器14。P1 阶段提交待最终全套 npm/Docker/CI 回归后创建。
- **风险/边界**：200% 使用 640 CSS px 重排视口等效验证，未读取宿主操作系统 zoom；Safari 原生签名/权限未在 Safari 浏览器运行；性能数值受本机、缓存与 headless 实现影响，仅供同机复测比较。按 P2 补充 CI 截图 artifact 与宿主验证说明。

### P2 增量与最终验证（2026-11-18）

- **BK-AUD-201**：新增 `public/js/app/aiDrawerHistory.mjs`、`public/js/app/aiDrawer.mjs`，将 AI 抽屉状态/渲染/问答/事件绑定从 `public/app.mjs` 移出；同时新增 `src/services/aiGovernance.js`、`src/services/textTokens.js` 与 `src/routes/productAiGovernanceRoutes.js` 拆出 Node AI 治理逻辑/handlers，新增 `src/worker/chromeSync.mjs` 拆出 Worker 扩展同步目录与镜像索引处理。`public/app.mjs` 从 9,748 行/383.6KiB 减至 9,552 行/374.9KiB。治理 5 项与 Worker helper 3 项测试通过，`npm test` 32/32；本机 `npm run ui:check` 和 `npm run ui:browser` 全部通过（101/8/16）；最新代码托管 CI run `44294235227` 的 16 步通过。`productRoutes.js` 降至 4,246 行，`worker.mjs` 降至 7,316 行。Worker 其余路由和 app 的其他渲染域未拆分，保持未完成。
- **BK-AUD-202**：`.github/workflows/ci.yml` 加入 Chrome 浏览器矩阵、8 项 E2E、扩展 fixture、Docker 健康检查与报告 artifact；首次 GitHub Actions 在 Chrome 启动阶段受 runner user namespaces/AppArmor 限制失败，后在脚本中加入 CI 专用 `--no-sandbox`。本机 `npm run ui:browser` 全套通过，最新提交的托管 CI run `44294235227` 所有 16 步（含浏览器矩阵、扩展检查、Docker 启动与运维演练）通过；Docker PR workflow run `44294235225` 构建成功，登录和推送按 PR 条件跳过。
- **BK-AUD-203**：同步修正文档和 OpenAPI preview 契约；`npm run docs:check` 通过。未运行远程 Worker/扩展 smoke，避免连接生产服务或真实账号数据。
- **BK-AUD-204**：与 P1 一起用四档截图、暗色/Reduced Motion、局部溢出、axe 和键盘场景回归；详细机器报告见 `docs/screenshots/audit-2026-11-16/after/`。
- **完整本地验证**：`npm ci`（0 vulnerabilities）；`npm audit --audit-level=low`（0 vulnerabilities）；`npm test`（本轮最终 39/39）；`npm run docs:check`、`npm run ui:check`、`npm run cf:check`、`npm run cf:smoke`、`npm run extension:check` 和最终 `npm run ui:browser` 均通过；Docker 镜像构建、容器启动及 `/api/health` 通过。
- **风险**：本轮性能样本未捕获 FCP/LCP/INP，只能报告导航、CLS、heap 和主线程耗时；200% 以 640 CSS px 重排宽度近似验证；Safari 原生安装/签名与 GitHub runner 未在本地验证。无生产部署、远程真实数据访问或合并。

- **CI 升级验收（2026-11-18）**：`checkout@v5`、`setup-node@v5`、`setup-chrome@v2`、`upload-artifact@v6` 和 Docker actions `setup-qemu@v4`、`setup-buildx@v4`、`metadata@v6`、`build-push@v7` 均通过 hosted workflow；workflow 固定 `ubuntu-24.04`。最终代码 head `1b948f9` 的 CI run `44300423004` 全部 16 步通过，Docker run `44300423001` 构建通过，PR 条件下 registry login/push 跳过；两个 check 均无 annotation/warning。没有部署或推送镜像。

补充安全复核：Worker 上传备份的 `ON CONFLICT(id)` 原来可以覆盖其他用户记录，已加全量归属预检（在 replace 删除前）、SQL 所属用户条件、R2 源对象权限。真实 SQLite 队列回归证明失败快照不改变任一租户。IO 使用条件 UPDATE 原子领取以防重投；JSON 存储改为权限 0600 的临时文件原子 rename，并做并发读写回归。AI endpoint 禁止私网字面量与重定向，Node 通过 socket DNS 验证；正文限 2MiB。Worker 统一 CSP/安全头，预览 frame 过滤 scheme。22 项测试通过；本轮发现均有修复，云平台网络边界与 Safari 原生宿主列为外部验证限制。

- **BK-AUD-201 追加拆分（2026-11-18）**：将产品路由 URL/检索文本规范化、向量工具、语义索引批处理及文件夹路径 helpers 移至 `src/services/bookmarkSearch.js`，`src/routes/productRoutes.js` 由本轮前 4,273 行降至 4,052 行。新服务可注入 embedding 函数并将非正数批大小规整为正值，避免内部调用传入 0 时无限循环；`tests/bookmark-search.test.js` 4 项检查覆盖 helper、embedding batch/租户隔离/fresh row 无写、provider 异常无持久化和无效批大小。验证：目标单测 4/4，`npm test` 39/39，docs/ui static/Worker smoke/扩展检查以及 `npm run ui:browser`（101/8/16）通过；Docker 镜像构建并在临时端口 25173 启动，`/api/health` 返回 ok。首选端口 13790 被先前审计容器占用，未移除其他容器，换用临时端口验证通过。PNG 截图由平台渲染造成字节变化，已还原既有基线截图。无 API/schema/data 格式变化；其他大型入口仍未拆分。

- **BK-AUD-201 / BK-AUD-108 追加复核（2026-11-18）**：Worker 书签智能文本、标签建议、相关书签、目录推荐、摘要/问答、重复项评分和搜索条件解析等纯函数移入 `src/worker/bookmarkIntelligence.mjs`；Worker 主入口从 7,224 行降至 6,925 行（净减 299 行，含新增 import）。复现“标签 AI”原正则首选命中无捕获组的“标签”，导致过滤值丢失，修正后支持中文与英文 tag 条件。`tests/bookmark-intelligence.test.js` 新增 3 项测试覆盖过滤解析、书签推荐边界与重复项保留策略。目标测试 3/3、全套 `npm test` 42/42、`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check`、浏览器 101/8/16 和 Docker 健康检查通过；hosted CI 待提交后复验。`npm audit --audit-level=low` 请求 npm audit endpoint 返回 HTTP 400（Invalid package tree）；同一轮 `npm ci` 返回 0 vulnerabilities。无 API/schema/data format 变化；BK-AUD-201 仍保持未完成。

- **BK-AUD-201 Worker HTML/预览辅助逻辑继续解耦（2026-11-18）**：将 Worker HTML entity/title/meta/link/article 提取、预览类型、YouTube embed URL、公开 URL scheme 校验与 HTML escaping 移入 `src/worker/bookmarkPresentation.mjs`，入口由 6,925 行降至 6,809 行。`tests/bookmark-presentation.test.js` 两项覆盖 HTML metadata/article 解析、media 分类、YouTube host allowlist、scheme 限制与 escaping；按当前行为验证 inline tag 周边空格，不改变提取语义。验证：目标测试 2/2，全套 `npm test` 44/44、docs/UI 静态检查、Worker syntax/smoke、扩展检查、浏览器 101/8/16、Docker build/start/health 通过；hosted CI 待提交后运行。无 API/schema/persistence 变化，BK-AUD-201 保持未完成。

- **BK-AUD-201 Worker public share markup 拆分（2026-11-18）**：将公开集合 HTML template 移至 `src/worker/publicShareHtml.mjs`，Worker 主入口由 6,809 行降至 6,710 行；`tests/public-share-html.test.js` 验证用户标题/说明/书签/AI 文本 escaping，`javascript:` 链接与封面被拒绝为可执行 href/src。模块移动后 `ui:check` 原先按 Worker 内联模板位置的静态断言失败，已将 `scripts/ui-static-audit.mjs` 调整为验证新模块含 CSP-safe 外部 `public-share.mjs`，复跑通过。目标 XSS 测试 1/1；全套 `npm test` 45/45、docs/UI checks、Worker syntax/smoke、扩展检查、UI browser 101/8/16、Docker build/start/health 通过；GitHub Actions run `44306759467` 全部 16 步通过，Docker PR build run `44306758987` 通过且无 warning annotations。无接口/schema/persistence 变化，BK-AUD-201 仍未完成。

- **BK-AUD-201 Node entitlement/subscription routes 拆分（2026-11-18）**：将 `src/routes/productRoutes.js` 的 entitlement、subscription read/write 和 quota handlers 移入 `src/routes/productSubscriptionRoutes.js`，通过注入 dbRepo、用户身份、quota summary 与 entitlement mutations 保持路由模块独立。`tests/product-subscription-routes.test.js` 验证 handler 注册、Alice 订阅写入及 Bob entitlement/subscription/quota 隔离。产品路由入口从 4,052 行降至 3,993 行。目标路由测试 1/1、全套 `npm test` 46/46、docs/UI/CF/扩展门禁、Worker smoke、浏览器 101/8/16 和 Docker healthy 通过；GitHub Actions run `44308568325` 全部 16 步通过，Docker PR build run `44308568271` 通过且无 warning annotations。无 API/schema 变化；BK-AUD-201 保持未完成。


- **BK-AUD-201 Node AI digest 路由拆分（2026-11-18）**：将 `/api/product/ai/digest` handler 迁至 `src/routes/productDigestRoutes.js`，路由依赖通过注入传入，`src/routes/productRoutes.js` 从 3,577 行降至 3,444 行。新增 `tests/product-digest-routes.test.js` 两项回归，覆盖有效/软删除书签过滤、摘要和任务按用户写入、Bob 数据保留，以及 AI provider 失败时 Alice 失败任务记录和错误转交。目标测试 2/2、全套 `npm test` 53/53、`npm ci`（0 漏洞）、`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check`、`ui:browser`（101 张页面状态/8 项 E2E/16 张扩展截图）、Docker 镜像构建与容器 healthy `/api/health` 均通过；hosted CI run `44320680576`（16 步）和 Docker PR build run `44320680529` 均成功；最终文档 head `17523ba` 的 CI `44321377536` 与 Docker `44321377625` 通过。无 API/schema/持久化格式变化，BK-AUD-201 仍未完成。

- **BK-AUD-201 Node AI settings 路由拆分（2026-11-18）**：抽取 `/api/product/ai/config`、`test`、`prompts` 和 `rules` handlers 至 `src/routes/productAiSettingsRoutes.js`，入口 `src/routes/productRoutes.js` 从 3,444 行降至 3,292 行。新增 `tests/product-ai-settings-routes.test.js` 两项测试，覆盖 provider config 与 prompt overrides 租户隔离、API key 返回掩码、AI provider test 的嵌套 merge 不落库，以及 rules config/run/history 用户身份传递。迁移后 `ui:check` 首次因旧断言仍从 `productRoutes.js` 查找 prompt handlers 而失败；已调整 `scripts/ui-static-audit.mjs` 改查新模块，复跑通过。目标测试 2/2、全套 `npm test` 55/55、docs/UI/Worker/扩展门禁和 Docker build/start/healthy 检查通过；hosted CI run `44322630733` 的 16 步（含浏览器矩阵和扩展 parity）及 Docker PR build run `44322630665` 均通过。无 API/schema/持久化变化，BK-AUD-201 仍未完成。

- **BK-AUD-201 Node AI action routes 拆分（2026-11-18）**：将单书签 AI 建议/修改、标签标准化/本地化、搜索过滤解析、阅读摘要/高亮、文件夹摘要、问答、相关书签、阅读优先级和文件夹推荐共 15 个 handlers 移入 `src/routes/productAiActionRoutes.js`，回调通过注入绑定到现有业务 job helper；`productRoutes.js` 从 3,292 行降至 3,088 行。新增 `tests/product-ai-action-routes.test.js` 两项回归，覆盖全部 15 个路由的输入/default normalization 与书签/文件夹不存在时的 404 映射。目标测试 2/2、全套 `npm test` 57/57、`docs:check`、`ui:check`、`cf:check`、`cf:smoke`、`extension:check`、Docker build/start/healthy 通过；本地浏览器截图矩阵未在此增量重复运行（无 UI 源改动），hosted CI run `44324485032` 已覆盖浏览器矩阵并通过，Docker PR build `44324485034` 通过。无 API/schema/persistence 变化，BK-AUD-201 保持未完成。

- **BK-AUD-201 Worker AI governance helpers 解耦（2026-11-18）**：将 provider readiness 判断、AI job record 构造、feature policy 默认值/归一化、评估样本/评分、反馈和 provider health 汇总、AI path capability map、治理路径识别及公开集合指南生成迁至 `src/worker/aiGovernance.mjs`；Worker 入口从 6,710 行降至 6,514 行。新增 `tests/worker-ai-governance.test.js` 四项测试，检查 Worker/Node feature policy 一致、provider required settings、AI capability/gov 路径、evaluation/health/job 输出和公开指南 tag 汇总。目标测试 4/4、全套 `npm test` 61/61、docs/UI/CF syntax/smoke/extension 门禁、Docker build/start/healthy `/api/health` 均通过；本地 `ui:browser` 未重复运行（无前端源修改），hosted browser matrix 待提交后验证。无 API/schema/data-format 变化，BK-AUD-201 仍未完成。

- **BK-AUD-205 / P2 证据补充（2026-11-18）**：Worker/Node AI evaluation defaults parity 回归和 Worker AI governance module 一并加入本轮提交；本地 `node --test tests/worker-ai-governance.test.js` 4/4、`npm test` 61/61、docs/UI/CF/extension、Docker healthy 均通过。hosted CI 尚在运行，故该附加发现保留 `[ ]`，不提前结项。

- **BK-AUD-201 Worker task summaries 拆分（2026-11-18）**：`src/worker.mjs` 中任务失败/DLQ 汇总、实时任务状态与提醒快照是独立汇总逻辑，但与 API 分发和 Worker 流程同处入口。迁移至 `src/worker/taskSummaries.mjs`，repo 仍通过调用参数注入，保持原 userId 查询边界；显式提供 `now` 以便稳定测试。新增 `tests/worker-task-summaries.test.js` 两项测试，覆盖重试与 DLQ 分类、租户参数传递、活动任务、已删除/已完成提醒过滤和签名。Worker 主文件从 6,514 行降至 6,433 行。目标测试 2/2、全套 `npm test` 63/63、`cf:check`、`cf:smoke`、docs/UI/extension 门禁通过；Docker build/start/healthy `/api/health` 返回 200；GitHub CI run `44327200479`（16 步）与 Docker PR build run `44327200197` 均成功。无 API/schema/data-format 改动，BK-AUD-201 继续开放。

## BK-AUD-201 / P2 — 前端 related bookmarks controller 拆分（2026-11-25）

- **问题/根因**：详情页相关推荐的状态、AI 请求、结果渲染和书签切换点击事件原先内联在 `public/app.mjs`，与详情页其他 AI 操作共享入口状态；旧书签请求完成后可能覆盖当前详情，推荐标题/原因也需要统一 HTML escaping。
- **修改文件**：新增 `public/js/app/relatedBookmarks.mjs`；`public/app.mjs` 装配 `createRelatedBookmarksController`；`scripts/ui-static-audit.mjs` 增加 RA-FE-013 边界检查；新增 `tests/related-bookmarks-ui.test.js`；`scripts/ui-browser-audit.mjs` 将登录截图提前到本地账号创建前，并把临时测试服务 `RATE_LIMIT_MAX` 提高到 500000，避免四档长矩阵被本地限流。
- **核心修改**：controller 集中管理 `bookmarkId/loading/running/items/summary/confidence/error`；使用 `requestSequence` 丢弃切换书签后的过期响应；请求路径统一 `encodeURIComponent`；推荐标题、来源、原因和 data attribute 统一 escaping；删除/编辑态、忙碌态、失败态和空结果均保留现有反馈；清理详情时使旧请求失效。
- **验收**：相关推荐专项测试 2/2；全套 `npm test` 87/87；`npm run docs:check`、`npm run ui:check`（入口 325.4KiB / 420KiB、CSS 176.2KiB）、`npm run cf:check`、`npm run cf:smoke`、`npm run extension:check` 通过；`npm run ui:browser` 通过（101 张页面截图、8 项 E2E、16 张扩展截图），截图已恢复审阅基线；Docker `rainbow-related-audit:20261125` build 成功，临时容器 `/api/health` 返回 `ok:true` 且 health 为 `healthy`。代码提交 `c15a9de`，hosted CI/Docker 待提交后验收。
- **遗留风险**：相关推荐 controller 仍依赖现有详情渲染 helper；设置、详情按钮绑定、搜索结果列表及 Worker/Node 其他大入口仍需继续拆分；无 API/schema/持久化格式变化，可独立 revert 本次 controller、测试、静态审计和浏览器 harness 提交。
