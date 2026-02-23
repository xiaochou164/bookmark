# Raindrop `/my/0` 截图对比流程（第二轮 DOM 对齐）

## 目标

- 用固定数据与固定视口对比 `/my/0` 页面关键区域，追踪 DOM/布局对齐进度。
- 重点关注：侧栏、搜索建议、列表视图、详情抽屉、菜单/弹层层级。

## 1. 截图场景矩阵

### A. 桌面宽屏（`1440x900`）

- `my0-sidebar-main-list-idle`
  - 侧栏展开、列表视图、无详情抽屉
- `my0-search-suggest-open`
  - 搜索框 focus，suggestions popover 打开（含 token 建议 / 最近搜索）
- `my0-list-row-hover-actions`
  - 列表行 hover，右侧动作按钮完整显示
- `my0-list-row-selected-active`
  - 同时覆盖 selected / active 状态（可选两张）
- `my0-item-panel-view`
  - 打开详情抽屉查看态
- `my0-item-panel-edit`
  - 打开详情抽屉编辑态
- `my0-context-menu-folder`
  - 集合树右键菜单打开
- `my0-header-menus`
  - 标题栏排序/视图/更多任一菜单打开（建议至少 1 张）

### B. 桌面窄屏（`1280x800`）

- `my0-toolbar-wrap-1280`
  - 搜索 + 顶栏按钮布局验证
- `my0-item-panel-overlay-1280`
  - 详情抽屉打开，检查覆盖式抽屉与遮罩层

### C. 手机（`390x844`）

- `my0-mobile-topbar`
  - 顶部工具条换行与按钮收缩
- `my0-mobile-list`
  - 列表视图滚动与操作可达性
- `my0-mobile-detail`
  - 详情区域（非桌面 overlay 形态）无溢出

## 2. 固定前置条件

- 使用同一组测试数据（建议至少包含）：
  - 有封面 / 无封面
  - 元数据抓取成功 / 失败
  - 有高亮 / 无高亮
  - 多层集合树（至少 2 层）
  - 标签较多条目
- 浏览器缩放 `100%`
- 关闭浏览器扩展对页面注入影响（如复制助手、暗色模式注入）
- 强制刷新（`Cmd + Shift + R`）

## 3. 对比维度（每张图）

- 布局结构：区域位置和层级是否与目标一致
- 密度与节奏：行高、间距、留白、信息密度
- 状态呈现：hover / active / selected / loading / error
- 弹层定位：是否贴近锚点、是否越界、层级是否正确
- 文本裁切：标题、域名、标签在极端长度下是否自然

## 4. 偏差标注模板

- 截图：`my0-list-row-hover-actions-1440x900.png`
- 结果：`需优化`
- 偏差位置：`列表行动作区`
- 现象：hover 后按钮出现时行高抖动 2px
- 参考：Raindrop `/my/0` 列表行动作区 hover 态
- 建议归类：`RA-DOM-401/403`（若回归）或新建 `RA-DOM-fix-*`

## 5. 判定规则

- `通过`
  - 结构、层级、状态完整，且无明显错位/遮挡/溢出
- `需优化`
  - 功能正确，但密度/位置/状态细节与参考差距较大
- `失败`
  - 功能阻断、菜单定位错误、抽屉/弹层遮挡、严重溢出

## 6. 输出建议

- 每轮改动后至少输出：
  - 通过截图列表
  - 需优化列表（附偏差标注）
  - 新回归问题列表
- 如需归档到项目，可放在：
  - `/Users/xiaochou164/Desktop/bookmarktorain/docs/screenshots/ra-dom-my0/`

