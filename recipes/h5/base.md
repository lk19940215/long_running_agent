# H5 活动页 — 基础食谱

## 任务分解模式

H5 活动页按以下标准拆分：

1. **infra**: 项目脚手架（如未有移动端模板，需要初始化）
   - steps：脚手架搭建、移动端适配（viewport + rem/vw）、基础样式
   - 验证：页面在移动端视口正常显示

2. **frontend**: 页面主体（布局 + 核心交互组件）
   - steps：页面结构、组件集成、数据对接
   - 验证：Playwright 移动端 viewport snapshot

3. **frontend**: 分享/营销功能（如需要）
   - steps：分享配置、海报生成、统计埋点
   - 验证：分享链接正确、海报生成成功

4. **test**: 多端兼容测试
   - steps：iOS Safari、Android Chrome、微信内置浏览器

## 通用规则

- H5 页面通常较轻量，2-3 个任务即可
- 优先保证移动端适配（viewport meta + 响应式）
- 注意性能：图片懒加载、动画性能、首屏加载速度
