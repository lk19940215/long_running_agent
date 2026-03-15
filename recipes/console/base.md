# Console 管理后台 — 基础食谱

## 任务分解模式

管理后台 CRUD 页面按以下标准拆分任务（1 session = 1 task）：

1. **backend**: API 接口层（RESTful CRUD + 分页 + 搜索过滤）
   - steps 包含：路由定义、Controller、Service、数据模型
   - 验证：curl 请求返回正确状态码和分页结构

2. **frontend**: 列表页面（表格 + 搜索栏 + 分页组件）
   - steps 包含：页面组件、数据请求、状态管理
   - 验证：Playwright snapshot 验证页面元素存在

3. **frontend**: 弹窗/表单（新建 + 编辑弹窗 + 表单校验）
   - steps 包含：弹窗组件、表单项、校验规则、提交逻辑
   - 验证：Playwright 点击按钮 → snapshot 验证弹窗打开

4. **fullstack**: 联调（前后端串通 + 错误处理 + loading 状态）
   - steps 包含：接口联调、错误提示、空状态处理
   - 验证：Playwright 完整 CRUD 流程

5. **test**: E2E 测试（可选，参考 test/crud-e2e.md）

## 通用规则

- 搜索框 + 表格 + 分页合并为一个 frontend 任务（不要拆太碎）
- 弹窗 + 表单作为独立 frontend 任务（UI 和逻辑较复杂）
- 后端 API 作为独立 backend 任务
- 前后端联调作为 fullstack 任务
- 每个任务必须有可执行的验证步骤

## 反面案例

- "搜索框"、"表格"、"分页"各拆为独立任务 → 太碎，合并
- "全部前端"合为一个任务 → 太大（弹窗应独立）
- 忽略验证步骤 → 每个 task 的 steps 最后一步必须是验证命令
