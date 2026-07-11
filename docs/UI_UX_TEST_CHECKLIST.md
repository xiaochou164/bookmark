# Rainbow UI/UX 专项测试清单

版本：2026-07-04  
关联修改清单：`docs/UI_UX_AUDIT_TODO.md`  
功能回归基线：`docs/FRONTEND_REGRESSION_CHECKLIST.md`

本轮执行记录（2026-07-05）：

- `npm run cf:check` 通过。
- `npm run cf:smoke` 通过，覆盖 Worker 主路径、AI 治理、公开集合 AI 导览、任务与协作流程。
- `npm run ui:check` 通过，覆盖 CSS 分层、静态 UI 门禁、性能预算、对比度、触控目标和 DOM 预算。
- `npm run ui:browser` 通过，生成 32 张截图到 `docs/screenshots/ui-visual-baseline/`，覆盖登录、主工作台、详情、设置、插件、公开页的四档视口，并补充搜索建议、列表行 hover、排序菜单和详情编辑态；检查无页面级横向溢出、键盘烟测、控制台/网络错误、200% 缩放、reduced-motion，以及大样本集合/标签/加载更多门禁。
- Raindrop 登录态参照截图与 DOM 度量已归档到 `docs/screenshots/raindrop-reference/`，用于核对 300px 侧栏、80px 列表行和设置页应用壳结构。
- `npm test` 通过，覆盖队列、对象存储、指标、日志脱敏和 HTTP 安全中间件。

## 1. 使用规则

- 状态：`PASS / FAIL / BLOCKED / N/A`；执行时勾选通过项，失败项必须记录截图、视口、浏览器、复现步骤和关联 `UI-AUD-*`。
- P0 UI 修改：本清单 P0 项全部通过才允许部署。
- P1/P2 修改：至少通过受影响页面、全局冒烟、四档视口和无障碍冒烟。
- 截图命名：`YYYYMMDD_<page>_<viewport>_<state>_<before|after>.png`。
- 不得以 `overflow-x:hidden`、裁切文本或隐藏操作按钮作为修复溢出的唯一手段。

## 2. 测试环境与数据

### 2.1 必测环境

| 编号 | 环境 | 视口 | 用途 |
|---|---|---:|---|
| `VP-01` | Chromium 桌面 | `1440×900` | 标准桌面与三栏布局 |
| `VP-02` | Chromium 笔记本 | `1280×800` | 工具栏密度和详情栏挤压 |
| `VP-03` | Chromium 平板 | `768×1024` | Drawer、触控和表单重排 |
| `VP-04` | Chromium 手机 | `390×844` | 单列、Dialog、菜单和触控 |
| `VP-05` | Chrome 扩展 Popup | `380×580` | Popup 固定窗口与内部滚动 |
| `VP-06` | Chrome 扩展 Options | `900px`、`480px` 宽 | Options 响应式 |

### 2.2 测试数据

- [x] `UI-TST-DATA-01` 新账号：0 条书签，用于空态。
- [x] `UI-TST-DATA-02` 普通账号：30 条书签、5 个集合、20 个标签，含封面/无封面、长标题、长 URL、中文/英文标签。
- [x] `UI-TST-DATA-03` 压力账号：2,000 条书签、200 个集合、500 个标签，用于虚拟列表与性能。
- [x] `UI-TST-DATA-04` 异常数据：失效图片、坏链、抓取失败、超长备注、无标题书签。
- [x] `UI-TST-DATA-05` 重复数据：至少 20 组重复 URL，每组 2～10 条，包含不同标签、备注、收藏状态和集合。
- [x] `UI-TST-DATA-06` 任务数据：queued/running/succeeded/failed 各状态的同步、导入导出、AI、坏链与备份任务。

## 3. 发布前全局门禁（P0）

- [x] `UI-TST-GATE-01` `npm run cf:check` 通过。
- [x] `UI-TST-GATE-02` `npm run cf:smoke` 通过。
- [x] `UI-TST-GATE-03` 远端 `cf:smoke:remote` 通过。
- [x] `UI-TST-GATE-04` `npm run ui:browser` 通过，且 `VP-01~04` 下所有页面满足 `scrollWidth <= clientWidth`，无页面级横向滚动。
- [x] `UI-TST-GATE-05` 浏览器控制台无未处理异常、资源 404、重复 ID 或明显 CSP 错误。
- [x] `UI-TST-GATE-06` 登录、主工作台、设置、插件、公开页四档截图均已更新到 `docs/screenshots/ui-visual-baseline/` 并人工对比。
- [x] `UI-TST-GATE-07` `npm run ui:browser` 键盘烟测通过；Tab 键可到达页面主要操作，焦点环可见且顺序合理。
- [x] `UI-TST-GATE-08` 页面缩放至 200% 后核心内容和操作仍可访问。
- [x] `UI-TST-GATE-09` `prefers-reduced-motion: reduce` 下无非必要位移、闪烁或无限动画。
- [x] `UI-TST-GATE-10` 错误、警告、成功状态均有文字或图标，不仅依靠颜色。

## 4. 设计系统与 CSS 架构

- [x] `UI-TST-CSS-01` 样式入口可成功加载，拆分后的 CSS 无循环导入和加载顺序错误。关联：`UI-AUD-001`。
- [x] `UI-TST-CSS-02` 核心组件最终计算样式来源唯一或有明确 layer，完全重复选择器下降至少 80%。关联：`UI-AUD-002`。
- [x] `UI-TST-CSS-03` 控件高度只使用约定的 `28/32/36/40px` 档位，图标在按钮内垂直居中。关联：`UI-AUD-003`。
- [x] `UI-TST-CSS-04` 在 `639/640/641`、`919/920/921`、`1179/1180/1181`、`1279/1280/1281px` 检查布局，无断点抖动。关联：`UI-AUD-004`。
- [x] `UI-TST-CSS-05` Sticky header、菜单、Drawer、Dialog、Toast 同时出现时层级正确，菜单不被裁切。关联：`UI-AUD-006`。
- [x] `UI-TST-CSS-06` 删除 `overflow-x:hidden` 后四档视口仍无横向溢出。关联：`UI-AUD-007`。
- [x] `UI-TST-CSS-07` 浅色背景、边框、圆角、阴影和间距在 Web 各页面保持同一 token 语义。关联：`UI-AUD-003/603`。

## 5. 登录与认证

- [x] `UI-TST-AUTH-01` 未登录访问 `/`、`/settings`、`/plugin` 均服务端跳转 `/login?next=...`，刷新时不闪现工作台。
- [x] `UI-TST-AUTH-02` 登录成功返回 `next` 原路径；非法外部 `next` 不发生开放重定向。
- [x] `UI-TST-AUTH-03` 登录/注册 Tab 具有正确 role、`aria-selected`、键盘左右切换和焦点移动。关联：`UI-AUD-301`。
- [x] `UI-TST-AUTH-04` 邮箱为空、格式错误、密码过短、账号已存在、密码错误均在对应字段附近展示。关联：`UI-AUD-301`。
- [x] `UI-TST-AUTH-05` `VP-03/04` 下表单优先显示，Hero 不挤压首屏主操作。关联：`UI-AUD-302`。
- [x] `UI-TST-AUTH-06` 未登录页不存在“返回主界面 → 再跳登录”的循环式无效操作。关联：`UI-AUD-302`。
- [x] `UI-TST-AUTH-07` 会话过期时显示明确提示并跳转登录。

## 6. 主工作台外壳与导航（P0）

- [x] `UI-TST-WB-01` `VP-01/02` 顶部工具栏无按钮挤压、非预期换行或搜索框宽度突变。关联：`UI-AUD-101`。
- [x] `UI-TST-WB-02` 打开/关闭详情栏时侧栏、列表和详情宽度稳定，列表标题仍可读。关联：`UI-AUD-102`。
- [x] `UI-TST-WB-03` `VP-03/04` 侧栏通过明确入口打开为 Drawer，遮罩、返回、Esc、焦点回收正常。关联：`UI-AUD-103`。
- [x] `UI-TST-WB-04` `VP-03/04` 详情以 Drawer 打开，关闭后焦点回到原书签。关联：`UI-AUD-103`。
- [x] `UI-TST-WB-05` 集合树 200 项、标签 500 项时滚动顺畅，展开状态和当前项清晰。
- [x] `UI-TST-WB-06` 侧栏账号、集合、标签菜单靠近视口边缘时自动吸附，不超出窗口。
- [x] `UI-TST-WB-07` 主区、侧栏、详情内部滚动职责清晰，不出现多层滚动争抢。
- [x] `UI-TST-WB-08` 大样本门禁通过：153 个集合触发集合树虚拟化，104 个标签折叠后只显示 12 项、展开后触发虚拟化，99 条书签可从 24 条加载到 48 条且无横向溢出。

## 7. 搜索、工具栏与批量操作

- [x] `UI-TST-SEARCH-01` 搜索输入、建议、最近搜索、token 建议在四档视口下完整显示。
- [x] `UI-TST-SEARCH-02` 键盘 `↑/↓/Enter/Esc` 操作建议列表，焦点和高亮同步。
- [x] `UI-TST-SEARCH-03` 高级筛选展开/收起不导致标题栏跳动；应用、重置、保存查询有反馈。
- [x] `UI-TST-SEARCH-04` 排序、视图、导出、更多菜单职责不重复，关闭后焦点返回。关联：`UI-AUD-101`。
- [x] `UI-TST-BULK-01` 0/1/多项选择时批量条显隐、计数、全选状态正确。
- [x] `UI-TST-BULK-02` 批量移动、收藏、归档、删除在 `VP-04` 下完整可见。
- [x] `UI-TST-BULK-03` 批量危险操作显示对象数量和影响范围，执行中防重复提交。

## 8. 书签四种视图

- [x] `UI-TST-VIEW-01` 列表视图仅常驻最多 3 个高频操作，更多操作可由鼠标、键盘和触控访问。关联：`UI-AUD-104`。
- [x] `UI-TST-VIEW-02` 长标题、长 URL、长标签不挤压复选框、时间和操作区。
- [x] `UI-TST-VIEW-03` 卡片有封面、无封面、封面失败三种状态尺寸一致，无布局位移。
- [x] `UI-TST-VIEW-04` 标题视图 hover/focus 时操作出现但行高不变化。
- [x] `UI-TST-VIEW-05` 看板视图列宽稳定，长短内容混排无重叠或异常空洞。
- [x] `UI-TST-VIEW-06` 四种视图中的标题、域名、集合、标签和时间语义一致。关联：`UI-AUD-105`。
- [x] `UI-TST-VIEW-07` 2,000 条数据滚动无白屏、重复项、错位或丢失当前项。
- [x] `UI-TST-VIEW-08` loading、empty、error、retry 状态使用统一组件。关联：`UI-AUD-110`。

## 9. 详情栏与预览

- [x] `UI-TST-DETAIL-01` 详情头部在长标题和最窄宽度下，导航、模式、预览、更多和关闭均可见。关联：`UI-AUD-106`。
- [x] `UI-TST-DETAIL-02` 查看/编辑切换不改变面板宽度；保存失败保留输入并定位错误。
- [x] `UI-TST-DETAIL-03` 默认展开区块符合设计，折叠状态按预期保持。关联：`UI-AUD-107`。
- [x] `UI-TST-DETAIL-04` 元数据、正文、预览、高亮、相关推荐各状态完整。
- [x] `UI-TST-DETAIL-05` `Esc` 关闭详情，条目切换后焦点不落到隐藏面板。
- [x] `UI-TST-PREVIEW-01` Web/PDF/图片/视频/文件/阅读模式均有正确容器和失败降级。
- [x] `UI-TST-PREVIEW-02` 预览 Dialog 在四档视口可滚动，头部和操作栏不遮挡内容。
- [x] `UI-TST-PREVIEW-03` 媒体切换后旧内容不残留，关闭后停止播放。

## 10. Dialog、菜单与反馈

- [x] `UI-TST-DLG-01` 10 个 Dialog 具有一致标题、滚动主体、错误区和操作栏。关联：`UI-AUD-108`。
- [x] `UI-TST-DLG-02` Dialog 不超过视口，焦点限制在当前 Dialog，关闭后回到触发按钮。
- [x] `UI-TST-DLG-03` Dialog 内确认层层级正确，取消不执行，确认支持进行中状态。
- [x] `UI-TST-DLG-04` 菜单支持点击外部和 Esc 关闭，不误触下层内容。
- [x] `UI-TST-FEEDBACK-01` 启动失败不使用原生 `alert`，恢复操作可用。关联：`UI-AUD-109`。
- [x] `UI-TST-FEEDBACK-02` Toast 不遮挡主操作，连续消息策略明确，读屏可感知。

## 11. 设置页与任务工具

- [x] `UI-TST-SET-01` 设置导航在桌面和移动端均不挤压主内容，刷新后保持分区。关联：`UI-AUD-201`。
- [x] `UI-TST-SET-02` 套餐、配额、AI、规则、回填默认展示可读摘要，JSON 仅主动展开显示。关联：`UI-AUD-202`。
- [x] `UI-TST-SET-03` Token、会话、设备、共享、审计列表在桌面表格和手机卡片模式下完整。关联：`UI-AUD-203`。
- [x] `UI-TST-SET-04` 危险操作使用统一确认层，展示对象和影响范围。关联：`UI-AUD-204`。
- [x] `UI-TST-SET-05` 搜索、去重、坏链拥有独立结果区，互不覆盖。关联：`UI-AUD-206`。
- [x] `UI-TST-SET-06` 异步任务展示状态、进度、时间、错误和重试入口。关联：`UI-AUD-207`。
- [x] `UI-TST-SET-07` 保存策略一致；有未保存改动时离开页面按设计提示。关联：`UI-AUD-208`。

## 12. 重复书签专项

- [x] `UI-TST-DEDUPE-01` 无重复时显示明确空态，不显示空白容器或 JSON。
- [x] `UI-TST-DEDUPE-02` 20 组重复数据完整显示 URL、候选项、质量、建议、保留项和方案。
- [x] `UI-TST-DEDUPE-03` `VP-01~04` 下保留项、处理方式和执行按钮均可见。
- [x] `UI-TST-DEDUPE-04` 修改保留项后，待删除 ID 自动排除保留项。
- [x] `UI-TST-DEDUPE-05` “合并后移除”正确合并信息，副本进入废纸篓。
- [x] `UI-TST-DEDUPE-06` “仅移除”不修改保留项；“暂不处理”不写入。
- [x] `UI-TST-DEDUPE-07` 数据变化时返回 stale 提示，不发生部分误删。
- [x] `UI-TST-DEDUPE-08` 批量建议显示组数、副本数、进度、部分失败和重试。关联：`UI-AUD-205`。
- [x] `UI-TST-DEDUPE-09` 执行后提供撤销或废纸篓恢复说明。关联：`UI-AUD-205`。
- [x] `UI-TST-DEDUPE-10` 500 组结果分页/虚拟化，滚动和选择稳定。关联：`UI-AUD-205`。

## 13. 插件管理与公开页

- [x] `UI-TST-PLUGIN-01` 书签总览、设备、健康状态使用可读组件，JSON 可选查看。关联：`UI-AUD-303`。
- [x] `UI-TST-PLUGIN-02` 只有一个明确返回入口，刷新动作显示最后时间。关联：`UI-AUD-304`。
- [x] `UI-TST-PLUGIN-03` 未登录正确跳转，登录后返回原区块。
- [x] `UI-TST-PUBLIC-01` 0/1/100 条公开书签布局稳定，搜索、排序、返回顶部可用。关联：`UI-AUD-305`。
- [x] `UI-TST-PUBLIC-02` 无封面和加载失败均有占位，不导致高度突变。
- [x] `UI-TST-PUBLIC-03` 标题为语义链接，封面 alt 使用标题，外链名称清楚。关联：`UI-AUD-306`。
- [x] `UI-TST-PUBLIC-04` `VP-04` 下单列无横向溢出，长标签和描述合理换行。

## 14. Chrome 扩展

- [x] `UI-TST-EXT-01` Popup/Options 无行内 style，视觉来自共享 token。关联：`UI-AUD-401`。
- [x] `UI-TST-EXT-02` Popup 主操作在首屏，状态详情只有一个滚动容器。关联：`UI-AUD-402`。
- [x] `UI-TST-EXT-03` Options 在 900px 和 480px 下输入与按钮不挤压。关联：`UI-AUD-403`。
- [x] `UI-TST-EXT-04` Token 支持显示/隐藏和清除，不在状态文本泄露。关联：`UI-AUD-403`。
- [x] `UI-TST-EXT-05` 连接、预览、同步、自动同步显示统一状态和变更数量。关联：`UI-AUD-404`。
- [x] `UI-TST-EXT-06` Popup、Options、Web 插件页图标和术语一致。关联：`UI-AUD-405`。
- [x] `UI-TST-EXT-07` 离线、Token 失效、5xx、部分失败均提供恢复建议。

## 15. 无障碍、主题与性能

- [x] `UI-TST-A11Y-01` 仅用键盘完成登录、搜索、新建、详情、编辑、预览、删除与恢复。关联：`UI-AUD-501`。
- [x] `UI-TST-A11Y-02` 移动端主要触控目标至少 44×44px。关联：`UI-AUD-502`。
- [x] `UI-TST-A11Y-03` muted、禁用、标签、状态颜色对比达到 WCAG AA。关联：`UI-AUD-503`。
- [x] `UI-TST-A11Y-04` Toast、进度、扫描、登录错误和保存反馈使用合适 `aria-live`。关联：`UI-AUD-504`。
- [x] `UI-TST-A11Y-05` reduced-motion 覆盖抽屉、菜单、Toast、骨架屏和滚动。关联：`UI-AUD-505`。
- [x] `UI-TST-THEME-01` 主题和密度切换全页面生效并持久化。关联：`UI-AUD-604`。
- [x] `UI-TST-PERF-01` 记录 JS/CSS 大小、DOM 节点、LCP、交互延迟和滚动 FPS。关联：`UI-AUD-605`。
- [x] `UI-TST-PERF-02` 性能预算退化超过 10% 时阻止发布或记录批准原因。

## 16. 任务追踪矩阵

| 修改任务 | 必测章节 |
|---|---|
| `UI-AUD-001~007` | 3、4、15 |
| `UI-AUD-101~110` | 3、6～10 |
| `UI-AUD-201~208` | 3、11、12 |
| `UI-AUD-301~306` | 5、13 |
| `UI-AUD-401~405` | 14 |
| `UI-AUD-501~505` | 3、15 |
| `UI-AUD-601~605` | 3、4、15，并执行全部功能回归 |

## 17. 测试结果记录模板

```text
执行日期：
部署版本 / Commit：
执行人：
修改任务：UI-AUD-
测试环境：VP-
通过：
失败：
阻塞：
截图 / 录屏路径：
控制台与网络异常：
遗留风险：
发布结论：PASS / FAIL
```
