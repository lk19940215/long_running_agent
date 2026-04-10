// ============================================================================
// 📁 文件：bootstrap-entry.ts
// 📌 定位：整个应用的最小启动入口（bun run dev 执行的就是这个文件）
//
// 🔗 完整启动链：
//   bun run dev
//     → 本文件 bootstrap-entry.ts
//       → Step 1: ensureBootstrapMacro() — 挂载全局 MACRO 常量
//       → Step 2: await import('cli.tsx') — 动态加载 CLI 入口
//         → cli.tsx 内部路由分发
//           → 默认路径: await import('main.tsx') → cliMain() → REPL
//
// 💡 为什么用 await import() 而不是静态 import？
//    确保 MACRO 先挂载完毕，再加载 cli.tsx（cli.tsx 内部会直接使用 MACRO.VERSION）
//    这是 ESM 的「顶层 await」特性，需要 package.json 中 "type": "module"
// ============================================================================

import { ensureBootstrapMacro } from './bootstrapMacro'

ensureBootstrapMacro()

await import('./entrypoints/cli.tsx')
