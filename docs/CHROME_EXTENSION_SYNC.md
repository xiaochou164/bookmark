# Chrome 扩展与 Rainbow 服务端同步

本文记录 `chrome-extension/` 与生产服务的当前真实契约。扩展版本见 `chrome-extension/manifest.json`。

## 1. 同步边界

- 同步对象：Chrome 书签树与 Rainbow 当前用户的云书签。
- 默认服务地址：`https://bookmark.sundays.ink`。
- 认证方式：Bearer API Token。
- Token 获取：手动填写，或通过已登录网站的 `rb_session` cookie 调用 `POST /api/auth/tokens` 自动创建。
- 扩展不再直连 `api.raindrop.io`。

## 2. 请求流程

### 连接检查

`PING_CLOUD` 调用：

```http
GET /api/health
Authorization: Bearer <token>
```

### 设备注册

安装、Chrome 启动或设置变化时调用：

```http
POST /api/plugins/raindropSync/devices/register
Authorization: Bearer <token>
Content-Type: application/json
```

关键字段包括 `deviceId`、`extensionVersion`、`cloudApiBaseUrl`、capabilities 和自动同步摘要。

同步结束后通过以下入口上报状态：

```http
POST /api/plugins/raindropSync/devices/{deviceId}/status
```

### Chrome 快照同步

手动同步、自动同步和当前预览入口均调用：

```http
POST /api/chrome-sync
Authorization: Bearer <token>
Content-Type: application/json
```

请求主体：

```json
{
  "folders": [
    {
      "name": "Bookmarks Bar",
      "path": ["Bookmarks Bar"],
      "bookmarks": [
        {
          "url": "https://example.com",
          "title": "Example",
          "chromeId": "123",
          "folderPath": ["Bookmarks Bar"],
          "createdAt": 1783764000000
        }
      ]
    }
  ],
  "deviceId": "dev_xxx",
  "mirrorIndex": {},
  "deleteSync": true
}
```

响应中的关键字段：

- `stats`：服务端创建、更新、移动、删除、去重计数。
- `toAddInChrome`：云端存在但 Chrome 快照中缺失的条目。
- `toDeleteInChrome`：云端删除记录要求 Chrome 删除的条目。
- `mirrorIndex`：下一轮用于识别移动、改名和删除的镜像索引。

## 3. 正式同步行为

正式同步会：

1. 把 Chrome 新增书签和文件夹路径写入 Rainbow。
2. 把 Chrome 标题、URL 和移动变化合并到 Rainbow。
3. 根据镜像索引识别 Chrome 本地删除。
4. 把 `toAddInChrome` 创建到对应 Chrome 文件夹路径。
5. 根据 `toDeleteInChrome` 删除 Chrome 条目。
6. 保存新的 `rainbowMirrorIndex` 和最近同步状态。

## 4. 预览限制

当前 `PREVIEW_RAINBOW_SYNC` 会调用与正式同步相同的 `/api/chrome-sync`。`preview=true` 只阻止扩展执行第 4、5、6 步，不会阻止服务端执行第 1、2、3 步。

因此当前行为是：

- 不会新增或删除 Chrome 本地书签。
- 可能把 Chrome 新书签、改名、移动或删除状态写入 Rainbow。
- Popup/Options 中“未写入”的文案不准确。

正确修复方向是为 `/api/chrome-sync` 增加服务端 dry-run 语义，或提供独立 preview endpoint，并让预览请求显式携带 `preview: true`。

## 5. 自动同步

- 配置键：`rbAutoSyncEnabled`、`rbAutoSyncMinutes`。
- Alarm 名称：`autoSyncRainbow`。
- 最小间隔：5 分钟。
- 自动同步执行正式写入流程。
- Service worker 失败会写入 `lastSyncStatus`，并尽力上报设备错误状态。

## 6. 验证

静态与构建验证：

```bash
npm run extension:check
```

线上契约验证：

```bash
npm run extension:smoke:remote -- https://bookmark.sundays.ink
```

远端 smoke 使用独立测试账号，覆盖：

- session cookie 创建 API Token
- Bearer Token 调用
- 设备注册
- Chrome → Rainbow 首次同步
- 重复同步去重
- Rainbow → Chrome 差异返回
- 设备状态上报
- `previewMutatedServer` 已知限制探测

浏览器安全策略可能阻止自动检查 `chrome://extensions`。发布扩展后仍需人工确认：

1. 已加载目录为当前仓库的 `chrome-extension/`。
2. 扩展版本与 `manifest.json` 一致。
3. 点击“重新加载”后 service worker 无错误。
4. Options 的服务地址和 Token 指向当前生产环境。
