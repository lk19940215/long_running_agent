/**
 * 代码结构分析工具：code_symbols
 * 底层使用 web-tree-sitter (WASM) 解析 AST
 * wasm 来源：@repomix/tree-sitter-wasms
 */

import { Parser, Language } from 'web-tree-sitter';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { define } from './registry.mjs';

const LANG_MAP = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python',
};

const SYMBOL_TYPES = new Set([
  'function_declaration', 'class_declaration',
  'lexical_declaration', 'variable_declaration',
  'export_statement', 'expression_statement',
]);

let _ready = false;
let _parser = null;
const _langs = {};

async function ensureParser(ext) {
  const langName = LANG_MAP[ext];
  if (!langName) return null;

  if (!_ready) {
    await Parser.init();
    _parser = new Parser();
    _ready = true;
  }

  if (!_langs[langName]) {
    const wasmPath = join(
      process.cwd(), 'node_modules/@repomix/tree-sitter-wasms/out',
      `tree-sitter-${langName}.wasm`
    );
    _langs[langName] = await Language.load(wasmPath);
  }

  _parser.setLanguage(_langs[langName]);
  return _parser;
}

function extractName(node) {
  const { type } = node;

  if (type === 'function_declaration' || type === 'class_declaration') {
    return node.childForFieldName('name')?.text || '';
  }

  if (type === 'export_statement') {
    const decl = node.namedChild(0);
    if (!decl) return 'export';
    if (decl.type === 'function_declaration' || decl.type === 'class_declaration') {
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
  if (!parser) return { error: `不支持的文件类型: ${ext}（支持: .js, .mjs, .ts, .py）` };

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
  '分析代码结构。mode=list 列出文件所有符号（函数、类、变量）及行号。mode=definition 获取指定符号的完整代码。比 read 更精确，避免读取整个文件。',
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
