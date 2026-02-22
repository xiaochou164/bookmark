# Cloud Bookmarks Manager

一个参考 Raindrop 思路实现的云书签管理软件（本地可运行），支持插件扩展。

## 包含内容

- 云书签核心：书签/文件夹 CRUD API
- 本地存储：`data/db.json`
- 插件系统：可注册、配置、预览运行、执行运行
- 内置插件：`raindropSync`
  - 双向同步（本地书签 <-> Raindrop）
  - 默认顶级自动映射 + 手工映射
  - 删除同步（可选）
  - 防混乱机制：`deviceId`、lease 锁、cursor、tombstone、幂等 op_id

## 快速启动

```bash
cd /Users/xiaochou164/Desktop/bookmarktorain
npm install
npm start
```

访问：`http://localhost:3789`

## 主要 API

- `GET /api/health`
- `GET /api/folders`
- `POST /api/folders`
- `GET /api/bookmarks`
- `POST /api/bookmarks`
- `PUT /api/bookmarks/:id`
- `DELETE /api/bookmarks/:id`
- `GET /api/plugins`
- `GET /api/plugins/:id/config`
- `PUT /api/plugins/:id/config`
- `GET /api/plugins/:id/state`
- `POST /api/plugins/:id/preview`
- `POST /api/plugins/:id/run`

## Raindrop 插件配置示例

```json
{
  "raindropToken": "YOUR_TOKEN",
  "topLevelAutoSync": true,
  "mappings": [
    {
      "id": "default",
      "collectionId": -1,
      "folderName": "Raindrop Synced",
      "deleteSync": false
    }
  ]
}
```
