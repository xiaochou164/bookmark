# Chrome 扩展版：书签接管同步

这是一个可直接加载到 Chrome 的扩展，用于把 Chrome 书签和 Raindrop collection 做双向同步。

## 已实现能力

- 默认顶级自动映射：Raindrop 顶级 collection 自动同步到同名 Chrome 顶级文件夹（可关闭）
- 多映射同步：支持手动配置多条 `Raindrop Collection ID -> Chrome 顶层文件夹` 映射
- Collection 下拉选择：可一键刷新并从 Raindrop collections 列表中选择（支持“自定义 ID”兜底）
- Chrome 顶层文件夹下拉：可一键刷新并从书签栏顶层文件夹选择（支持“自定义文件夹名”兜底）
- 预览变更（Dry Run）：不写入，仅展示将变更数量和样例
- 应用同步（Apply）：执行双向新增 + 标题更新
- 删除同步（可选）：按映射单独开关
  - Raindrop 删除 -> Chrome：书签移动到 `Raindrop Sync Trash`
  - Chrome 删除 -> Raindrop：调用删除接口
- 自动定时同步（默认 15 分钟）
- 防混乱机制：`deviceId`、租约锁（lease）、`cursor`、`tombstone`、幂等 `op_id`（失败可重放）

## 安装

1. 打开 `chrome://extensions/`
2. 右上角开启“开发者模式”
3. 点“加载已解压的扩展程序”
4. 选择目录：`/Users/xiaochou164/Desktop/bookmarktorain/chrome-extension`

## 配置

1. 打开扩展选项页
2. 填入 `Raindrop API Token`
3. 选择是否开启“默认顶级同步到同名顶级文件夹”
4. 配置一条或多条手动映射：
   - `Raindrop Collection ID`
   - `Chrome 顶层文件夹名`
   - `删除同步（谨慎）`
5. 保存

## 测试建议

1. 先点 `预览变更（Dry Run）`，确认输出
2. 再点 `立即同步（Apply）`
3. 验证每条映射对应的 Chrome 文件夹与 Raindrop collection 内容
4. 删除同步测试：先在单条映射开启删除同步，再做小范围测试

## 注意

- 为防误删，删除同步默认关闭
- Chrome 侧删除为“移入回收站文件夹”而非直接硬删
- 仅按 URL 去重，不同步 tags/highlights
