# 浏览器扩展：Rainbow 书签同步

这是浏览器书签和 Rainbow 云书签之间的同步扩展。Chrome 直接加载本目录；Safari 通过构建脚本生成 `safari-extension/`，再用 Xcode 转换成 Safari Web Extension。

## 已实现能力

- Chrome/Safari 书签与 Rainbow 云书签双向同步
- 预览变更：查看将新增、删除或跳过的条目，不写入本地或云端
- 应用同步：把浏览器书签写入 Rainbow，并把云端缺失项推回浏览器
- 自动同步：支持配置同步开关与同步间隔
- 云端连接：默认连接 `https://bookmark.sundays.ink`
- Token 自动识别：从已登录的 Rainbow 网站会话中生成扩展 API Token
- 防混乱机制：`deviceId`、租约锁、镜像索引和同步状态记录

## Chrome 安装

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点“加载已解压的扩展程序”
4. 选择目录：`/Users/xiaochou164/Desktop/mycode/Rainbow/chrome-extension`

## Safari 构建

先生成 Safari Web Extension 源目录：

```bash
npm run extension:safari:build
```

再用 Xcode 转换：

```bash
xcrun safari-web-extension-converter safari-extension --project-location output/safari --app-name "Rainbow Sync"
```

打开生成的 Xcode 项目后，设置 Team 和 Bundle Identifier，运行 macOS 容器 App，然后到 Safari 设置中启用扩展。

## 配置

1. 打开扩展选项页
2. 确认 Rainbow 地址为 `https://bookmark.sundays.ink`
3. 点击“一键自动识别”获取 API Token，或手动填入 Token
4. 按需开启自动同步并设置同步间隔
5. 保存设置

## 测试建议

1. 先点“测试连接”，确认云端可访问
2. 再点“预览变更”，确认新增/删除数量符合预期
3. 最后执行“立即同步”
4. Safari 版本需要额外确认网站访问权限、书签权限和 Token 自动识别是否已授权

## 注意

- 扩展不再直连 `api.raindrop.io`，所有同步都通过 Rainbow 云端插件接口完成
- Safari 版本由 `chrome-extension/` 生成，修改核心同步逻辑后请重新运行 `npm run extension:safari:build`
- Safari 的签名、Bundle ID、App Store 分发由 Xcode 容器项目处理
