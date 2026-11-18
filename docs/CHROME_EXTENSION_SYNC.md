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
  "preview": false,
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

## 4. 预览零写入契约（2026-11-16 复测修复）

Popup/Options 的 `PREVIEW_RAINBOW_SYNC` 调用 `/api/chrome-sync` 并显式发送 `preview: true`。
服务端复用同步计算逻辑，在内存副本上生成差异；不写书签、集合、同步索引、设备、任务记录或认证使用时间。
预览不注册 deviceId、不保存本地状态、不创建/移动/删除浏览器书签。

另一条 `/api/plugins/raindropSync/preview` 是服务端 provider 配置预览，不能代替 Chrome 快照预览。
Node 该入口已取消预览运行日志落盘；Worker 返回配置能力摘要，不宣称完成了远端 provider 差异计算。
首次使用前须初始化数据库，预览不会隐式执行 schema migration。

删除保护：`deleteSync: false` 不允许根据本地缺失删除云端书签；缺失文件夹不授权删除云端集合。
时间戳缺失的旧书签不会复活云端墓碑。正式同步仍写入；预览结果中的临时 ID 不得用于正式写入。

验证：`npm test` 在真实 SQLite 的 D1 adapter 上断言 SQL 写次数不增加，在 Node 上逐字比较数据库文件，
并在 Chrome/Safari service worker VM 上断言本地 storage/bookmark 写次数为零。VM 不替代 Safari 原生签名安装测试。

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
- `preview: true` 严格断言 `previewMutatedServer === false`

浏览器安全策略可能阻止自动检查 `chrome://extensions`。发布扩展后仍需人工确认：

1. 已加载目录为当前仓库的 `chrome-extension/`。
2. 扩展版本与 `manifest.json` 一致。
3. 点击“重新加载”后 service worker 无错误。
4. Options 的服务地址和 Token 指向当前生产环境。
