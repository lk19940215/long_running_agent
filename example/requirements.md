# TODO API

使用 Node.js + Express 实现一个简单的 TODO 待办事项 API。

## 功能需求

1. **CRUD 接口**
   - `GET /api/todos` — 获取所有待办事项
   - `POST /api/todos` — 创建待办事项（body: `{ "title": "..." }`）
   - `PUT /api/todos/:id` — 更新待办事项状态（body: `{ "completed": true }`）
   - `DELETE /api/todos/:id` — 删除待办事项

2. **数据存储**
   - 使用内存数组存储（不需要数据库）
   - 每个 TODO 包含 `id`、`title`、`completed`、`createdAt` 字段

3. **健康检查**
   - `GET /health` 返回 `{ "status": "ok" }`

## 技术约束

- Node.js + Express
- 端口 3000
- 不使用 TypeScript
- 不使用数据库
