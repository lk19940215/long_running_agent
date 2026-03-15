# 动画效果

## 实现要点
- 入场动画：元素进入视口时触发（Intersection Observer）
- 滚动动画：视差滚动、进度条等
- 交互动效：点击反馈、状态切换过渡
- 性能：使用 transform/opacity 动画，避免触发 layout

## 验证策略
- snapshot 验证动画元素存在
- 滚动页面 → 验证动画触发
