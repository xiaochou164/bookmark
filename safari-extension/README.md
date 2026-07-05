# Safari Web Extension：Rainbow Sync

本目录由 `npm run extension:safari:build` 从 `chrome-extension/` 生成。

## 生成

```bash
npm run extension:safari:build
```

## 转换为 Xcode 项目

安装完整 Xcode 后执行：

```bash
xcrun safari-web-extension-converter safari-extension --project-location output/safari --app-name "Rainbow Sync"
```

打开生成的 Xcode 项目，设置 Team 和 Bundle Identifier，运行 macOS 容器 App，然后到 Safari 设置中启用扩展。

## 说明

- Safari 源码复用 Chrome 扩展同步逻辑，只调整 Safari 可见文案和 WebExtension API 兼容层。
- Host permissions 限制为本地开发地址和 `https://bookmark.sundays.ink/*`。
- Token 自动识别依赖 Safari 对 Rainbow 域名的网站访问授权。
