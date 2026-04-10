// ============================================================================
// 📁 文件：bootstrapMacro.ts
// 📌 定位：⚠️ 还原版兼容代码，非原始源码
//
// 在 Anthropic 原版中，MACRO（包含 VERSION、BUILD_TIME 等）是通过 Bun 的
// bun:bundle 宏机制在【编译时】注入到代码中的，类似于：
//   - webpack 的 DefinePlugin
//   - Vite 的 define 配置
//   - CRA 的 process.env.REACT_APP_XXX
//
// 还原版没有那套构建管线，所以这里用 globalThis（JS 全局对象的标准引用）
// 在【运行时】手动挂载一个 MACRO 对象，模拟编译时注入的效果。
//
// globalThis 是 ES2020 标准，在任何 JS 环境下都指向全局对象：
//   - 浏览器中等价于 window
//   - Node.js/Bun 中等价于 global
//
// 挂载后，项目任何地方都可以直接用 MACRO.VERSION，不需要 import。
// ============================================================================

import pkg from '../package.json'

type MacroConfig = {
  VERSION: string
  BUILD_TIME: string
  PACKAGE_URL: string
  NATIVE_PACKAGE_URL: string
  VERSION_CHANGELOG: string
  ISSUES_EXPLAINER: string
  FEEDBACK_CHANNEL: string
}

const defaultMacro: MacroConfig = {
  VERSION: pkg.version,
  BUILD_TIME: '',
  PACKAGE_URL: pkg.name,
  NATIVE_PACKAGE_URL: pkg.name,
  VERSION_CHANGELOG: '',
  ISSUES_EXPLAINER:
    'file an issue at https://github.com/anthropics/claude-code/issues',
  FEEDBACK_CHANNEL: 'github',
}

export function ensureBootstrapMacro(): void {
  if (!('MACRO' in globalThis)) {
    ;(globalThis as typeof globalThis & { MACRO: MacroConfig }).MACRO =
      defaultMacro
  }
}
