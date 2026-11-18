# Bookmark 代码与前端体验复核整改清单（2026-11-16）

> 状态：P0/P1 和 P2-202/203/204 已完成本地及托管验收；P2-201 的大入口逐域拆分尚未完成。最终代码提交 `605320c` 的 GitHub Actions run `44298730651`（16 步）全部通过，Docker build run `44298730581` 通过；Actions 运行时告警已清零，workflow 固定 Ubuntu 24.04。首次运行的 Chrome user namespace/AppArmor 沙箱故障由 CI 专用启动参数修复。历史 `[x]` 只表示既往收口，不作为本次验收证据。截图与机器报告位于 `docs/screenshots/audit-2026-11-16/{before,after}`。
>
> 范围：master 分支的 Web 工作台、登录/设置/插件/公开分享页、Chrome/Safari 扩展、Node/Worker API、CI、部署与测试。原则：先保证数据安全与正确性，再调整视觉；尊重现有 Raindrop 风格与功能，不做无依据的整体重设计。

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

## P2：工程质量、性能与交付
- [ ] **BK-AUD-201 / P2 / 大模块解耦（分阶段进行，仍未完成）**：`public/app.mjs`、`src/worker.mjs`、`src/routes/productRoutes.js` 仍是大型集中入口。本轮将约 300 行 AI 权益、策略、评估和反馈状态逻辑抽至 `src/services/aiGovernance.js`，共享词元处理抽至 `src/services/textTokens.js`，AI governance API handlers 抽至 `src/routes/productAiGovernanceRoutes.js`；将 Chrome sync folder/index transformations 抽至 `src/worker/chromeSync.mjs`；将完整 AI side drawer 状态、DOM 渲染、问答、历史和绑定抽至 `public/js/app/aiDrawer.mjs`。`public/app.mjs` 从 9,748 行减至 9,552 行，静态入口从 383.6KiB 降至 374.9KiB。新增单测覆盖用户隔离、能力门禁、策略上限、评估样本归属、API 路由挂载/租户策略以及 Worker sync URL、目录索引、镜像状态和幂等目录创建；AI 抽屉拆分后本机 `npm run ui:browser` 的 101 状态矩阵、8 项 E2E 和 16 个扩展状态通过，托管 CI run `44294235227` 的全部 16 步也通过。`productRoutes.js` 从 4,709 行减至 4,246 行，追加检索拆分后减至 4,052 行；`worker.mjs` 从 7,432 行减至 7,316 行。语义索引拆分后 `npm test` 36/36、UI browser 101/8/16 和 Docker build/start 健康检查通过。Worker 剩余路由、app 其他渲染域和其他大型业务域仍待迁移与 Node/Worker 契约覆盖，本项保持未完成。
- [x] **BK-AUD-202 / P2 / 测试门禁和性能（托管验收通过）**：CI 加入 Chrome headless UI/E2E/扩展回归、Cloudflare 语法门禁、Docker 构建启动和截图 artifact；浏览器脚本采集 FCP/LCP/CLS、INP observer、heap、长任务、布局/脚本耗时，并运行低速网、CPU 限速和大样本检查。首次托管运行显示 runner 的 user namespace/AppArmor 限制导致 Chrome `No usable sandbox`；`scripts/ui-browser-audit.mjs` 现仅在 `CI` 环境传入 `--no-sandbox`，本机保持默认沙箱。最终代码 CI run `44298730651` 的全部 16 步通过，Docker PR build run `44298730581` 通过且未推送镜像；Docker action 已升级到 Node 24，`ubuntu-latest` 改固定 `ubuntu-24.04`，两项 checks 无 warning annotations。INP 若未捕获用户交互则不作为性能结论。
- [x] **BK-AUD-203 / P2 / 文档与实现漂移**：修正 OpenAPI 对 `/api/chrome-sync` preview 的写入描述与 schema，说明 `preview: true` 零持久化写入；更新架构、扩展同步、UI 审计和 UI 测试清单，区分本轮证据与历史状态，并补充隔离测试、部署边界和外部限制。
- [x] **BK-AUD-204 / P2 / 设计系统视觉收口（浏览器矩阵验证）**：修正深色卡片/分页 surface、设置状态色、扩展状态反馈及窄窗宽度；核验控件、焦点、触屏目标和响应式动作区。具体截图、视口和 axe 结果列在 P1 执行记录。

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
- **完整本地验证**：`npm ci`（0 vulnerabilities）；`npm audit --audit-level=low`（0 vulnerabilities）；`npm test`（本轮最终 36/36）；`npm run docs:check`、`npm run ui:check`、`npm run cf:check`、`npm run cf:smoke`、`npm run extension:check` 和最终 `npm run ui:browser` 均通过；Docker 镜像构建、容器启动及 `/api/health` 通过。
- **风险**：本轮性能样本未捕获 FCP/LCP/INP，只能报告导航、CLS、heap 和主线程耗时；200% 以 640 CSS px 重排宽度近似验证；Safari 原生安装/签名与 GitHub runner 未在本地验证。无生产部署、远程真实数据访问或合并。

- **CI 升级验收（2026-11-18）**：`checkout@v5`、`setup-node@v5`、`setup-chrome@v2`、`upload-artifact@v6` 和 Docker actions `setup-qemu@v4`、`setup-buildx@v4`、`metadata@v6`、`build-push@v7` 均通过 hosted workflow；workflow 固定 `ubuntu-24.04`。最终代码 head `605320c` 的 CI run `44298730651` 全部 16 步通过，Docker run `44298730581` 构建通过，PR 条件下 registry login/push 跳过；两个 check 均无 annotation/warning。没有部署或推送镜像。

补充安全复核：Worker 上传备份的 `ON CONFLICT(id)` 原来可以覆盖其他用户记录，已加全量归属预检（在 replace 删除前）、SQL 所属用户条件、R2 源对象权限。真实 SQLite 队列回归证明失败快照不改变任一租户。IO 使用条件 UPDATE 原子领取以防重投；JSON 存储改为权限 0600 的临时文件原子 rename，并做并发读写回归。AI endpoint 禁止私网字面量与重定向，Node 通过 socket DNS 验证；正文限 2MiB。Worker 统一 CSP/安全头，预览 frame 过滤 scheme。22 项测试通过；本轮发现均有修复，云平台网络边界与 Safari 原生宿主列为外部验证限制。

- **BK-AUD-201 追加拆分（2026-11-18）**：将产品路由 URL/检索文本规范化、向量工具、语义索引批处理及文件夹路径 helpers 移至 `src/services/bookmarkSearch.js`，`src/routes/productRoutes.js` 由本轮前 4,273 行降至 4,052 行。新服务可注入 embedding 函数并将非正数批大小规整为正值，避免内部调用传入 0 时无限循环；`tests/bookmark-search.test.js` 4 项检查覆盖 helper、embedding batch/租户隔离/fresh row 无写、provider 异常无持久化和无效批大小。验证：目标单测 4/4，`npm test` 36/36，docs/ui static/Worker smoke/扩展检查以及 `npm run ui:browser`（101/8/16）通过；Docker 镜像构建并在临时端口 25173 启动，`/api/health` 返回 ok。首选端口 13790 被先前审计容器占用，未移除其他容器，换用临时端口验证通过。PNG 截图由平台渲染造成字节变化，已还原既有基线截图。无 API/schema/data 格式变化；其他大型入口仍未拆分。
