# Bookmark 代码与前端体验复核整改清单（2026-11-16）

> 状态：静态审计已完成首轮；未在本次连接环境中运行依赖安装、动态浏览器交互、CI 或线上部署。以下「已证实」表示源码/历史测试报告中存在相应证据，并不等于已在 2026-11-16 的运行环境复现。所有未完成条目均须由 Codex 实测、修复并验收。历史 `[x]` 只表示既往收口，不作为本次验收证据。
>
> 范围：master 分支的 Web 工作台、登录/设置/插件/公开分享页、Chrome/Safari 扩展、Node/Worker API、CI、部署与测试。原则：先保证数据安全与正确性，再调整视觉；尊重现有 Raindrop 风格与功能，不做无依据的整体重设计。

## P0：正确性与高风险
- [ ] **BK-AUD-001 / P0 / 部署入口一致性（已证实存在配置分歧）**：`Dockerfile` 以 `npm start` 启动，但 `package.json` 的 start 为 `wrangler dev --local`，同时镜像按 production only 安装依赖而 Wrangler 位于 devDependencies；Docker 健康检查使用端口 3789。核实 Docker 实际目标应为 Node 服务还是 Worker，统一启动命令、依赖、端口、健康检查和 README；使用 `docker build`、容器启动、`/api/health` 验证，不可仅改文案。
- [ ] **BK-AUD-002 / P0 / 扩展同步预览的零写入契约（需复测）**：`docs/CHROME_EXTENSION_SYNC.md` 声称 PREVIEW 会写入服务端，而当前 `chrome-extension/background.js` 的云端预览入口实际改用 `/api/plugins/raindropSync/preview`，并仍有独立 `SYNC_WITH_RAINBOW` 代码路径。逐一验证 Chrome/Safari Popup、Options、消息分发和两个后端预览路径是否写云端/本地数据；预览必须不写、不删、不更新索引，修正文档及测试。若仅发现文档过期，更新文档并附测试证据，不要无故修改稳定逻辑。
- [ ] **BK-AUD-003 / P0 / 认证、数据隔离与输入安全专项（待验证）**：审阅 `src/routes/*`、`src/worker.mjs`、`src/http/middleware.js`、`src/services/*`，覆盖权限越权/跨租户、session/token、CSRF、SSRF（元数据抓取）、URL scheme、HTML 插值、同步删除、公开分享令牌、日志泄密；对每个发现提供具体路径/行号/攻击条件和回归测试；没有证据的风险不得称为漏洞。

## P1：前端布局与操作体验
- [ ] **BK-AUD-101 / P1 / 列表操作区局部溢出（历史报告已证实）**：`docs/screenshots/ui-visual-baseline/audit-report.json` 的 1280px 报告记录 `.bookmark-row-side` 108px scrollWidth 对 104px clientWidth。定位当前生效 CSS（包括 legacy 层）与 DOM，修复而非隐藏溢出；覆盖 hover、focus、选中、详情打开和 360/640/920/1280px；以新的运行截图和尺寸断言收口。
- [ ] **BK-AUD-102 / P1 / 详情栏与编辑态局部溢出（历史报告已证实）**：历史报告记录 `.detail-panel-mode-switch` 在 360/640px 为 101/96px、`#detailForm` 在桌面为 366/354px。检查容器 min-width、网格/flex、按钮文案、输入框与 Resize Handle，处理最小宽度、换行和滚动，不依赖全局 overflow-x:hidden；补浏览器断言。
- [ ] **BK-AUD-103 / P1 / 信息架构、主次操作与响应式（待动态验证）**：按主列表/卡片/标题/看板、搜索建议、批量模式、侧栏树、详情只读/编辑、AI 抽屉逐状态走查。减少冗余入口和非必要工具占位，保证搜索及「添加」在窄屏可用、触屏不依赖 hover、抽屉/弹层不遮挡主要操作。对 360/640/920/1280px 各保留前后截图和行为描述；不破坏已有 Raindrop 对齐尺寸。
- [ ] **BK-AUD-104 / P1 / 设置、插件与公开分享页（待动态验证）**：审查设置导航真实性、状态/错误/保存反馈、危险操作确认、插件连接/同步状态、公开长列表的搜索/空态/图片失败降级；避免无数据伪成功、过长表单、横向溢出。登录注册覆盖错误字段关联、键盘 Tab 切换与移动端首屏表单。
- [ ] **BK-AUD-105 / P1 / 无障碍与键盘闭环（待动态验证）**：审计所有 menu/dialog/drawer/combobox、列表多选及扩展 Popup。验证 accessible name、aria-expanded/selected/invalid、焦点陷阱和关闭后的焦点恢复、Escape/方向键、触控目标、200% 缩放和 prefers-reduced-motion。使用 axe 或等价检查 + 实际键盘脚本；零严重/关键问题。
- [ ] **BK-AUD-106 / P1 / 样式覆盖治理（结构性风险已证实）**：`public/styles.css` 同时加载 `legacy.css`、`legacy-workbench-overrides.css`、`legacy-safety.css` 及新 CSS；历史审计宣称新规则不应回流 legacy。逐组件建立最终样式归属，减少重复选择器和 !important；先写视觉回归再迁移，不允许批量删除造成 UI 回退。

## P2：工程质量、性能与交付
- [ ] **BK-AUD-201 / P2 / 大模块解耦（已证实结构集中）**：`public/app.mjs` 约 9700 行，`src/worker.mjs` 约 7400 行，`src/routes/productRoutes.js` 约 4700 行；按书签列表/搜索/详情/侧栏/任务及 API 领域切分明确职责。先建立单元/集成测试与边界契约，再逐块迁移，避免一次性重写。
- [ ] **BK-AUD-202 / P2 / 测试门禁和性能（已证实覆盖缺口）**：CI 有 `npm test`、smoke、`ui:check`，但未直接运行已有 `npm run ui:browser`；`scripts/ui-performance-budget.mjs` 只做静态字节大小/节点数预算，不等于真实加载性能。加入可重复的 Playwright/Chrome headless CI、关键交互回归、真实 LCP/INP/CLS 或相应实验室性能采样；大集合、大书签、慢网速和 200% zoom 必测。
- [ ] **BK-AUD-203 / P2 / 文档与实现漂移（已证实）**：更新 `docs/CHROME_EXTENSION_SYNC.md`、`docs/TODO.md`、`docs/UI_UX_AUDIT_TODO.md` 中的过期「全部完成」描述和真实实现不一致处；补充 Node/Worker/扩展三条运行链的架构边界、操作说明以及部署/回退步骤。
- [ ] **BK-AUD-204 / P2 / 设计系统视觉收口（待动态验证）**：统一控件高度、字体层级、间距、状态色、Toast、空态、骨架屏、菜单宽度、图标语义以及深浅主题；以可发现性、可读性、一致性为目标，不追求额外装饰。

## 验收与执行约束
1. 每项填写：问题证据（路径+行号/截图）、根因、变更文件、验证命令与结果、风险、回退方式；无法复现的标为「复核无异常」，不编造缺陷。
2. 优先级顺序：P0 → P1 → P2；每个阶段单独 commit/PR，不改真实线上数据，不直接生产部署、不自动合并 PR。
3. 必跑：`npm ci`、`npm test`、`npm run docs:check`、`npm run ui:check`、`npm run cf:check`、`npm run cf:smoke`、`npm run extension:check`、`npm run ui:browser`（若环境不具备，记录原因及替代证据）；补充 Docker 构建和两种运行模式的健康检查。
4. 浏览器矩阵：主工作台列表/卡片/详情查看与编辑/搜索建议/批量操作/菜单/通知/AI、登录、设置、插件、公开分享、Chrome/Safari Popup/Options；宽度 360/640/920/1280，至少桌面/移动分别验证键盘和触控操作。
5. 本文是 2026-11-16 首轮静态审计清单。动态验证、依赖漏洞扫描、完整逐行安全评估及修复尚未完成；不得报告「全项目已通过」。
