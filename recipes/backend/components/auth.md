# 认证鉴权

## 任务分解指导
认证鉴权拆为独立 backend 任务，不与 CRUD 混合。

## 实现要点
- 注册：用户名/邮箱 + 密码，密码 hash 存储
- 登录：验证凭证，返回 JWT token 或设置 session
- Token 验证中间件：拦截受保护路由
- 角色权限：admin / editor / viewer 等，按路由或按操作控制
- Token 刷新/续期机制

## 验证策略
- curl 注册 → 201
- curl 登录 → 200 + token
- curl 无 token 访问受保护路由 → 401
- curl 带 token 访问 → 200
- curl 权限不足 → 403
