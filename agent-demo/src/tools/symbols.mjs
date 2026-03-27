/**
 * symbols 工具 — 代码结构分析
 * 底层使用 web-tree-sitter (WASM) 解析 AST
 * wasm 来源：@repomix/tree-sitter-wasms
 */

import { Parser, Language } from 'web-tree-sitter';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { define } from './registry.mjs';

const WASM_DIR = join(process.cwd(), 'node_modules/@repomix/tree-sitter-wasms/out');

const EXT_TO_LANG = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'tsx',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'c_sharp',
  '.swift': 'swift',
  '.dart': 'dart',
  '.css': 'css',
  '.vue': 'vue',
  '.sol': 'solidity',
};

function getSupportedExts() {
  return Object.keys(EXT_TO_LANG).join(', ');
}

const SYMBOL_TYPES = new Set([
  // JS/TS
  'function_declaration', 'class_declaration',
  'lexical_declaration', 'variable_declaration',
  'export_statement', 'expression_statement',
  'interface_declaration', 'type_alias_declaration', 'enum_declaration',
  // Python
  'function_definition', 'class_definition', 'decorated_definition',
  // Rust
  'function_item', 'struct_item', 'enum_item', 'impl_item', 'trait_item', 'mod_item',
  // Go
  'function_declaration', 'method_declaration', 'type_declaration',
  // Java/C#
  'method_declaration', 'class_declaration', 'interface_declaration',
  // C/C++
  'function_definition', 'struct_specifier', 'class_specifier',
]);

let _ready = false;
let _parser = null;
const _langs = {};

async function ensureParser(ext) {
  const langName = EXT_TO_LANG[ext];
  if (!langName) return null;

  if (!_ready) {
    await Parser.init();
    _parser = new Parser();
    _ready = true;
  }

  if (!_langs[langName]) {
    const wasmPath = join(WASM_DIR, `tree-sitter-${langName}.wasm`);
    _langs[langName] = await Language.load(wasmPath);
  }

  _parser.setLanguage(_langs[langName]);
  return _parser;
}

function extractName(node) {
  const { type } = node;

  const NAME_FIELD_TYPES = new Set([
    'function_declaration', 'class_declaration', 'function_definition',
    'class_definition', 'function_item', 'struct_item', 'enum_item',
    'trait_item', 'mod_item', 'method_declaration',
    'interface_declaration', 'type_alias_declaration', 'enum_declaration',
    'struct_specifier', 'class_specifier',
  ]);

  if (NAME_FIELD_TYPES.has(type)) {
    return node.childForFieldName('name')?.text || '';
  }

  // Go: type Config struct {} → type_declaration > type_spec > name
  if (type === 'type_declaration') {
    const spec = node.namedChildren.find(c => c.type === 'type_spec');
    return spec?.childForFieldName('name')?.text || '';
  }

  // Rust: impl<T> Stack<T> {} → type field; impl Trait for Type → trait field
  if (type === 'impl_item') {
    const trait = node.childForFieldName('trait')?.text;
    const implType = node.childForFieldName('type')?.text;
    return trait ? `${trait} for ${implType}` : implType || '';
  }

  if (type === 'decorated_definition') {
    const def = node.namedChildren.find(c =>
      c.type === 'function_definition' || c.type === 'class_definition'
    );
    return def?.childForFieldName('name')?.text || '';
  }

  if (type === 'export_statement') {
    const decl = node.namedChild(0);
    if (!decl) return 'export';
    if (NAME_FIELD_TYPES.has(decl.type)) {
      return decl.childForFieldName('name')?.text || '';
    }
    if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
      return decl.namedChild(0)?.childForFieldName('name')?.text || '';
    }
    return decl.type;
  }

  if (type === 'lexical_declaration' || type === 'variable_declaration') {
    return node.namedChild(0)?.childForFieldName('name')?.text || '';
  }

  if (type === 'expression_statement') {
    const expr = node.namedChild(0);
    if (expr?.type === 'call_expression') {
      const fn = expr.childForFieldName('function')?.text || '';
      const args = expr.childForFieldName('arguments');
      const firstArg = args?.namedChild(0)?.text?.replace(/['"]/g, '') || '';
      return firstArg ? `${fn}(${firstArg})` : fn;
    }
    if (expr?.type === 'assignment_expression') {
      return expr.childForFieldName('left')?.text || '';
    }
  }

  return '';
}

async function parseFile(filePath) {
  const ext = extname(filePath);
  const parser = await ensureParser(ext);
  if (!parser) return { error: `不支持的文件类型: ${ext}（支持: ${getSupportedExts()}）` };

  const code = await readFile(filePath, 'utf-8');
  return { tree: parser.parse(code) };
}

async function listSymbols(filePath) {
  const { tree, error } = await parseFile(filePath);
  if (error) return error;

  const symbols = [];
  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const node = tree.rootNode.child(i);
    if (!SYMBOL_TYPES.has(node.type)) continue;

    const name = extractName(node);
    const start = node.startPosition.row + 1;
    const end = node.endPosition.row + 1;
    const type = node.type.replace(/_/g, ' ');
    symbols.push(`${String(start).padStart(4)}-${String(end).padStart(4)}  ${type.padEnd(22)} ${name}`);
  }

  return symbols.length > 0
    ? `${filePath} (${symbols.length} 个符号)\n${symbols.join('\n')}`
    : `${filePath}: 未找到顶层符号`;
}

async function getDefinition(filePath, name) {
  if (!name) return '错误: 需要 name 参数';

  const { tree, error } = await parseFile(filePath);
  if (error) return error;

  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const node = tree.rootNode.child(i);
    if (extractName(node) === name) {
      const start = node.startPosition.row + 1;
      const end = node.endPosition.row + 1;
      return `${filePath}:${start}-${end}\n${node.text}`;
    }
  }

  return `未找到符号: ${name}（在 ${filePath} 中）`;
}

define(
  'symbols',
  '分析代码结构（AST）。list 列出符号及行号，definition 获取指定符号代码。支持 JS/TS/Python/Rust/Go/Java/C/C++/Ruby/PHP/Swift/Dart 等 17 种语言。',
  {
    path: { type: 'string', description: '文件路径' },
    mode: { type: 'string', description: '"list" 列出符号，"definition" 获取指定符号代码' },
    name: { type: 'string', description: 'mode=definition 时必填：要获取的符号名' },
  },
  ['path', 'mode'],
  async ({ path, mode, name }) => {
    if (mode === 'list') return await listSymbols(path);
    if (mode === 'definition') return await getDefinition(path, name);
    return '错误: mode 必须是 "list" 或 "definition"';
  }
);
