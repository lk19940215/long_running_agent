# TODO API

一个使用 Node.js + Express 实现的简单 TODO 待办事项 API。

## 技术栈

- **Runtime**: Node.js
- **Framework**: Express.js
- **数据存储**: 内存数组（无需数据库）

## 目录结构

```
.
├── server.js          # 主入口文件，包含所有 API 路由
├── package.json       # 项目配置和依赖
├── requirements.md    # 需求文档
└── README.md         # 本文件
```

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /api/todos | 获取所有待办事项 |
| POST | /api/todos | 创建待办事项 |
| PUT | /api/todos/:id | 更新待办事项状态 |
| DELETE | /api/todos/:id | 删除待办事项 |

## TODO 数据结构

```json
{
  "id": 1,
  "title": "示例任务",
  "completed": false,
  "createdAt": "2026-03-07T12:00:00.000Z"
}
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

服务将在 `http://localhost:3000` 启动。

## 使用示例

### 健康检查

```bash
curl http://localhost:3000/health
```

### 获取所有待办事项

```bash
curl http://localhost:3000/api/todos
```

### 创建待办事项

```bash
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "学习 Node.js"}'
```

### 更新待办事项状态

```bash
curl -X PUT http://localhost:3000/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

### 删除待办事项

```bash
curl -X DELETE http://localhost:3000/api/todos/1
```
