# 设计初始化模板

> 本文件仅在首次创建设计库时注入。包含 JSON 模板和 Tailwind 映射参考。

---

## Tailwind → .pen 速查映射

| Tailwind | .pen 属性 |
|----------|-----------|
| `gap-4` | `gap: 16` |
| `gap-8` | `gap: 32` |
| `p-4` / `px-4` / `py-4` | `padding: 16` / `padding: [0, 16]` / `padding: [16, 0]` |
| `p-8` / `px-8` / `py-8` | `padding: 32` / `padding: [0, 32]` / `padding: [32, 0]` |
| `pt-32 pb-20` | `padding: [128, 32]` |
| `mb-6` / `mb-8` / `mb-12` | 用父 frame 的 `gap: 24/32/48` 替代 |
| `mt-16` | 嵌套 frame + `padding: [64, 0]` |
| `text-sm` / `text-base` / `text-lg` | `fontSize: 14` / `16` / `18` |
| `text-xl` / `text-2xl` / `text-3xl` | `fontSize: 20` / `24` / `30` |
| `text-4xl` / `text-5xl` / `text-6xl` | `fontSize: 36` / `48` / `60` |
| `font-bold` / `font-semibold` | `fontWeight: "700"` / `"600"` |
| `grid grid-cols-3` | 水平 frame + 3 个 `width: "fill_container"` 子 frame |
| `grid grid-cols-2` | 水平 frame + 2 个 `width: "fill_container"` 子 frame |
| `flex items-center` | `alignItems: "center"` |
| `justify-center` | `justifyContent: "center"` |
| `space-x-3` / `space-x-4` | `gap: 12` / `gap: 16` |
| `space-y-2` | `layout: "vertical", gap: 8` |
| `rounded-lg` | `cornerRadius: 8` |
| `text-center` | `textAlign: "center"` |
| `max-w-7xl` / `max-w-3xl` / `max-w-2xl` | `width: 1280` / `768` / `672` |

> **关键**：margin-* 一律用 gap 或嵌套 frame + padding 替代。

---

## system.lib.pen 模板

```json
{
  "version": "2.9",
  "children": [
    {
      "type": "frame",
      "id": "header",
      "x": 0,
      "y": 0,
      "reusable": true,
      "width": 1440,
      "height": 64,
      "fill": "$color.bg",
      "padding": [0, 32],
      "justifyContent": "space_between",
      "alignItems": "center",
      "children": [
        {
          "type": "text",
          "id": "header-logo",
          "fill": "$color.text",
          "content": "Logo",
          "fontFamily": "Inter, system-ui, sans-serif",
          "fontSize": 20,
          "fontWeight": "700"
        },
        {
          "type": "frame",
          "id": "header-nav",
          "gap": 32,
          "alignItems": "center",
          "children": [
            { "type": "text", "id": "nav-link-1", "fill": "$color.text-muted", "content": "链接1", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14 },
            { "type": "text", "id": "nav-link-2", "fill": "$color.text-muted", "content": "链接2", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14 }
          ]
        }
      ]
    },
    {
      "type": "frame",
      "id": "btn-primary",
      "x": 0,
      "y": 100,
      "reusable": true,
      "width": 160,
      "height": 48,
      "fill": "$color.primary",
      "cornerRadius": 12,
      "justifyContent": "center",
      "alignItems": "center",
      "padding": [0, 32],
      "children": [
        {
          "type": "text",
          "id": "btn-primary-label",
          "fill": "#FFFFFF",
          "content": "按钮",
          "fontFamily": "Inter, system-ui, sans-serif",
          "fontSize": 16,
          "fontWeight": "600"
        }
      ]
    },
    {
      "type": "frame",
      "id": "card",
      "x": 0,
      "y": 200,
      "reusable": true,
      "width": 400,
      "height": 220,
      "fill": "$color.bg-card",
      "stroke": { "align": "inside", "thickness": 1, "fill": { "type": "gradient", "gradientType": "linear", "enabled": true, "colors": [{"color":"#8B5CF6","position":0},{"color":"#EC4899","position":1}], "rotation": 135 } },
      "cornerRadius": 12,
      "layout": "vertical",
      "gap": 16,
      "padding": 24,
      "children": [
        {
          "type": "frame",
          "id": "card-icon",
          "width": 48,
          "height": 48,
          "fill": { "type": "gradient", "gradientType": "linear", "enabled": true, "colors": [{"color":"#8B5CF6","position":0},{"color":"#EC4899","position":1}], "rotation": 135 },
          "cornerRadius": 8,
          "justifyContent": "center",
          "alignItems": "center",
          "children": [
            { "type": "text", "id": "card-icon-symbol", "fill": "#FFFFFF", "content": "⚡", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 24 }
          ]
        },
        {
          "type": "text",
          "id": "card-title",
          "fill": "$color.text",
          "content": "标题占位",
          "fontFamily": "Inter, system-ui, sans-serif",
          "fontSize": 20,
          "fontWeight": "700"
        },
        {
          "type": "text",
          "id": "card-desc",
          "fill": "$color.text-muted",
          "content": "描述文字占位",
          "fontFamily": "Inter, system-ui, sans-serif",
          "fontSize": 14,
          "textGrowth": "fixed-width",
          "width": 352
        }
      ]
    },
    {
      "type": "frame",
      "id": "footer",
      "x": 0,
      "y": 500,
      "reusable": true,
      "width": 1440,
      "height": 280,
      "fill": "$color.bg-card",
      "layout": "vertical",
      "gap": 32,
      "padding": [48, 80],
      "children": [
        {
          "type": "frame",
          "id": "footer-columns",
          "gap": 32,
          "width": "fill_container",
          "children": [
            {
              "type": "frame",
              "id": "footer-brand-col",
              "layout": "vertical",
              "gap": 16,
              "width": "fill_container",
              "children": [
                { "type": "text", "id": "footer-brand", "fill": "$color.text", "content": "品牌名", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 20, "fontWeight": "700" },
                { "type": "text", "id": "footer-desc", "fill": "$color.text-muted", "content": "品牌描述占位", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14, "textGrowth": "fixed-width", "width": 300 }
              ]
            },
            {
              "type": "frame",
              "id": "footer-links-col",
              "layout": "vertical",
              "gap": 8,
              "width": "fill_container",
              "children": [
                { "type": "text", "id": "footer-links-title", "fill": "$color.text", "content": "快速链接", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14, "fontWeight": "600" },
                { "type": "text", "id": "footer-link-1", "fill": "$color.text-muted", "content": "链接1", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14 },
                { "type": "text", "id": "footer-link-2", "fill": "$color.text-muted", "content": "链接2", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14 }
              ]
            },
            {
              "type": "frame",
              "id": "footer-social-col",
              "layout": "vertical",
              "gap": 8,
              "width": "fill_container",
              "children": [
                { "type": "text", "id": "footer-social-title", "fill": "$color.text", "content": "关注我们", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14, "fontWeight": "600" },
                { "type": "text", "id": "footer-social-1", "fill": "$color.text-muted", "content": "社交1", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14 }
              ]
            }
          ]
        },
        {
          "type": "frame",
          "id": "footer-bottom",
          "width": "fill_container",
          "stroke": { "align": "inside", "thickness": 1, "fill": "$color.border" },
          "padding": [16, 0, 0, 0],
          "justifyContent": "center",
          "children": [
            { "type": "text", "id": "footer-copyright", "fill": "$color.text-muted", "content": "© 2026 Company. All rights reserved.", "fontFamily": "Inter, system-ui, sans-serif", "fontSize": 14, "textAlign": "center" }
          ]
        }
      ]
    }
  ],
  "themes": { "mode": ["light", "dark"] },
  "variables": {
    "color.primary": { "type": "color", "value": "#8B5CF6" },
    "color.bg": { "type": "color", "value": "#0F172A" },
    "color.bg-card": { "type": "color", "value": "#1E293B" },
    "color.text": { "type": "color", "value": "#FFFFFF" },
    "color.text-muted": { "type": "color", "value": "#94A3B8" },
    "color.border": { "type": "color", "value": "#334155" },
    "spacing.sm": { "type": "number", "value": 8 },
    "spacing.md": { "type": "number", "value": 16 },
    "spacing.lg": { "type": "number", "value": 24 },
    "spacing.xl": { "type": "number", "value": 32 },
    "spacing.2xl": { "type": "number", "value": 48 },
    "radius.md": { "type": "number", "value": 8 },
    "radius.lg": { "type": "number", "value": 12 },
    "radius.xl": { "type": "number", "value": 16 },
    "font.primary": { "type": "string", "value": "Inter, system-ui, sans-serif" }
  }
}
```

**模板要点：**
- 库文件内部变量引用**不加前缀**: `$color.primary`
- reusable 组件错开 y 值，不能堆叠
- reusable 组件宽高用固定数值
- 每个 reusable 组件必须包含子节点

---

## 页面文件模板（pages/xxx.pen）

```json
{
  "version": "2.9",
  "imports": { "sys": "../system.lib.pen" },
  "children": [
    {
      "type": "frame",
      "id": "page-root",
      "x": 0,
      "y": 0,
      "width": 1440,
      "fill": "$sys:color.bg",
      "layout": "vertical",
      "children": [
        {
          "type": "ref",
          "id": "section-header",
          "ref": "sys:header",
          "descendants": {
            "sys:header-logo": { "content": "My App" }
          }
        }
      ]
    }
  ]
}
```

**页面要点：**
- import 路径: `"../system.lib.pen"`
- 变量引用用**冒号**: `$sys:color.primary`
- 组件引用用**冒号**: `"ref": "sys:btn-primary"`
- descendants key 也用**冒号**: `"sys:child-id": { ... }`
- fontFamily 直接写字体名
