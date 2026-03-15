# RESTful CRUD API

## 任务分解指导
一个资源的完整 CRUD 合为一个 backend 任务。

## 实现要点
- RESTful 风格：GET /资源（列表）、GET /资源/:id（详情）、POST（创建）、PUT（更新）、DELETE（删除）
- 列表分页：`?page=1&pageSize=10`，返回 `{ data: [], total: N }`
- 搜索过滤：`?keyword=xxx&status=active`
- 排序：`?sortBy=createdAt&order=desc`
- 参数校验：必填项、类型、长度、格式
- 错误响应统一格式：`{ code: 400, message: "xxx" }`

## 验证策略
- curl POST 创建 → 201 + 返回创建的数据
- curl GET 列表 → 200 + 分页结构正确
- curl PUT 更新 → 200 + 数据变更
- curl DELETE → 200 + 再 GET 确认已删除
