# 测试报告输出规范

测试任务完成后，必须输出两个报告文件。

## 1. 结构化数据：.claude-coder/test-report.json

```json
{
  "project": "项目名",
  "timestamp": "ISO-8601 时间戳",
  "summary": {
    "total": 10,
    "passed": 8,
    "failed": 2,
    "skipped": 0
  },
  "duration_ms": 45000,
  "cases": [
    {
      "id": "TC-001",
      "name": "列表加载",
      "priority": "P0",
      "status": "passed",
      "duration_ms": 2300,
      "steps": [
        { "description": "导航到列表页", "status": "passed" },
        { "description": "验证表格存在", "status": "passed" }
      ],
      "error": null
    },
    {
      "id": "TC-002",
      "name": "新建功能",
      "priority": "P0",
      "status": "failed",
      "duration_ms": 5200,
      "steps": [
        { "description": "点击新建按钮", "status": "passed" },
        { "description": "填写表单", "status": "passed" },
        { "description": "提交", "status": "failed" }
      ],
      "error": "表单校验未触发，直接提交成功"
    }
  ],
  "environment": {
    "browser": "chromium",
    "baseUrl": "http://localhost:xxxx"
  }
}
```

## 2. 可读报告：.claude-coder/test-report.md

格式模板：

```markdown
# 测试报告 — {项目名}

> 时间: {timestamp} | 通过率: {passed}/{total} | 耗时: {duration}s

## 摘要

| 指标 | 数值 |
|------|------|
| 总用例 | {total} |
| 通过 | {passed} |
| 失败 | {failed} |
| 跳过 | {skipped} |

## 详细结果

### ✅ [P0] 列表加载 — PASSED (2.3s)
1. 导航到列表页 ✓
2. 验证表格存在 ✓

### ❌ [P0] 新建功能 — FAILED (5.2s)
1. 点击新建按钮 ✓
2. 填写表单 ✓
3. 提交 ✗ — 表单校验未触发

## 失败用例汇总

| 用例 | 优先级 | 失败原因 |
|------|--------|----------|
| 新建功能 | P0 | 表单校验未触发 |
```
