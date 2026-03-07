Session {{sessionNum}}。执行 6 步流程。
效率要求：先规划后编码，完成全部编码后再统一测试，禁止编码-测试反复跳转。后端任务用 curl 验证，不启动浏览器。
{{mcpHint}}
{{testHint}}
{{docsHint}}
{{envHint}}
{{taskHint}}
{{testEnvHint}}
{{playwrightAuthHint}}
{{memoryHint}}
{{serviceHint}}

可用工具与使用规范（严格遵守）：
- 搜索文件名: Glob（如 **/*.ts），禁止 bash find
- 搜索文件内容: Grep（正则，基于 ripgrep），禁止 bash grep
- 读文件: Read（支持批量多文件同时读取），禁止 bash cat/head/tail
- 列目录: LS，禁止 bash ls
- 编辑文件: 同一文件多处修改用 MultiEdit（一次原子调用），单处用 Edit
- 复杂搜索: Task（启动子 Agent 并行搜索，不消耗主 context），适合开放式探索
- 查文档/API: WebSearch + WebFetch
- 效率: 多个 Read/Glob/Grep 尽量合并为一次批量调用，减少工具轮次

完成后写入 session_result.json。{{retryContext}}
