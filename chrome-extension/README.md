# 浏览器扩展：Rainbow 书签同步

这是浏览器书签和 Rainbow 云书签之间的同步扩展。Chrome 直接加载本目录；Safari 通过构建脚本生成 `safari-extension/`，再用 Xcode 转换成 Safari Web Extension。

## 已实现能力

- Chrome/Safari 书签与 Rainbow 云书签双向同步
- 预览变更：当前不修改 Chrome 本地书签，但仍可能写入 Rainbow 服务端，详见下方“已知限制”
- 应用同步：把浏览器书签写入 Rainbow，并把云端缺失项推回浏览器
- 自动同步：支持配置同步开关与同步间隔
- 云端连接：默认连接 `https://bookmark.sundays.ink`
- Token 自动识别：从已登录的 Rainbow 网站会话中生成扩展 API Token
- 防混乱机制：`deviceId`、租约锁、镜像索引和同步状态记录

## Chrome 安装

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点“加载已解压的扩展程序”
4. 选择当前仓库下的 `chrome-extension/` 目录

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

## 验证命令

扩展语法和 Safari 生成：

```bash
npm run extension:check
```

线上服务端契约：

```bash
npm run extension:smoke:remote -- https://bookmark.sundays.ink
```

远端 smoke 使用独立测试账号，验证 Token 创建、设备注册、Chrome → Rainbow、Rainbow → Chrome、重复去重和设备状态上报。

## 手工测试建议

1. 先点“测试连接”，确认云端可访问
2. 在测试账号上点“预览变更”，确认新增/删除数量符合预期；注意当前预览可能写入服务端
3. 确认测试结果后执行“立即同步”
4. Safari 版本需要额外确认网站访问权限、书签权限和 Token 自动识别是否已授权

## 当前请求路径

- 健康检查：`GET /api/health`
- 自动创建 Token：`POST /api/auth/tokens`
- Chrome 快照同步：`POST /api/chrome-sync`
- 拉取云端书签：`GET /api/chrome-sync/bookmarks`
- 设备注册：`POST /api/plugins/raindropSync/devices/register`
- 设备状态：`POST /api/plugins/raindropSync/devices/:deviceId/status`

完整请求与响应说明见 `../docs/CHROME_EXTENSION_SYNC.md`。

## 已知限制

- `PREVIEW_RAINBOW_SYNC` 当前与正式同步共用 `/api/chrome-sync`。它只跳过 Chrome 侧写入，服务端仍会处理 Chrome 快照，因此不是真正的 dry-run。
- 在该问题修复前，不要在包含未同步 Chrome 新书签的真实账号上把“预览”视为无副作用操作。

## 注意

- 扩展不再直连 `api.raindrop.io`；Chrome 书签同步通过 Rainbow 的 `/api/chrome-sync` 完成，设备状态复用 `/api/plugins/raindropSync/devices/*`
- Safari 版本由 `chrome-extension/` 生成，修改核心同步逻辑后请重新运行 `npm run extension:safari:build`
- Safari 的签名、Bundle ID、App Store 分发由 Xcode 容器项目处理
