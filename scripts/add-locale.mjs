#!/usr/bin/env node
/**
 * add-locale.mjs — Emma 一键加语言。
 *
 * 用法:
 *   node scripts/add-locale.mjs <locale> [displayName]
 *   例: node scripts/add-locale.mjs it "Italiano"
 *       node scripts/add-locale.mjs pt-BR "Português (Brasil)"
 *
 * 做什么(全部幂等,重复运行安全):
 *   1. 创建 apps/desktop/src/renderer/i18n/locales/<locale>/
 *      并以 en 的同名 JSON 为模板复制(common.json / aiRename.json)。
 *   2. 在 renderer/i18n/index.ts 补 import 与 resources 条目。
 *   3. 在 shared/locale.ts 的 SUPPORTED_LOCALES 元组里登记新 locale,
 *      设置页语言选择器随之出现该语言。
 *
 * 之后你只需翻译 locales/<locale>/*.json(缺 key 自动回退英文),
 * 无需再改任何代码。详见 EXTENDING.md「添加一种语言」。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(
  repoRoot,
  'apps/desktop/src/renderer/i18n/locales',
);
const i18nIndex = path.join(repoRoot, 'apps/desktop/src/renderer/i18n/index.ts');
const localeShared = path.join(repoRoot, 'apps/desktop/src/shared/locale.ts');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const [rawLocale, displayName] = process.argv.slice(2);
if (!rawLocale) {
  console.log('用法: node scripts/add-locale.mjs <locale> [displayName]');
  console.log('例:   node scripts/add-locale.mjs it "Italiano"');
  process.exit(1);
}

const locale = rawLocale.trim();
// BCP-47 风格:语言码 + 可选 -区域/-变体,如 it / pt-BR / zh-Hant-x-lzh
if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) {
  fail(`locale 格式不对: "${rawLocale}"(期望形如 it、pt-BR、zh-TW)`);
}

// import 标识符: pt-BR -> ptBR, zh-Hant-x-lzh -> zhHantXLzh
const ident = locale
  .split('-')
  .map((part, i) =>
    i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
  )
  .join('');

// ---- 1. 模板目录 -----------------------------------------------------------
const targetDir = path.join(localesDir, locale);
if (fs.existsSync(targetDir)) {
  console.log(`• locales/${locale}/ 已存在,跳过复制`);
} else {
  const enDir = path.join(localesDir, 'en');
  if (!fs.existsSync(enDir)) fail(`找不到模板目录 locales/en/`);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of fs.readdirSync(enDir)) {
    if (!file.endsWith('.json')) continue;
    fs.copyFileSync(path.join(enDir, file), path.join(targetDir, file));
    console.log(`• 复制模板 locales/en/${file} → locales/${locale}/${file}`);
  }
}

// ---- 2. i18n/index.ts: imports + resources ---------------------------------
let indexSrc = fs.readFileSync(i18nIndex, 'utf8');
const changed = [];

const importAnchor = "import i18n from 'i18next';";
if (!indexSrc.includes(importAnchor)) fail(`i18n/index.ts 找不到锚点: ${importAnchor}`);
const newImports = [
  `import ${ident}Common from './locales/${locale}/common.json';`,
  `import ${ident}AiRename from './locales/${locale}/aiRename.json';`,
]
  .filter((line) => !indexSrc.includes(line))
  .join('\n');
if (newImports) {
  indexSrc = indexSrc.replace(importAnchor, `${newImports}\n${importAnchor}`);
  changed.push('imports');
}

const resourcesTail = '} as const;';
if (!indexSrc.includes(resourcesTail)) fail(`i18n/index.ts 找不到锚点: ${resourcesTail}`);
const entryLine = `  '${locale}': { common: ${ident}Common, aiRename: ${ident}AiRename },`;
if (!indexSrc.includes(entryLine)) {
  // 插到 resources 对象末尾(最后一个 locale 条目之后)
  const lastIdx = indexSrc.lastIndexOf(resourcesTail);
  indexSrc = indexSrc.slice(0, lastIdx) + entryLine + '\n' + indexSrc.slice(lastIdx);
  changed.push('resources 条目');
}

if (changed.length) {
  fs.writeFileSync(i18nIndex, indexSrc);
  console.log(`• i18n/index.ts: 已补 ${changed.join(' + ')}`);
} else {
  console.log('• i18n/index.ts: 无需改动');
}

// ---- 3. shared/locale.ts: SUPPORTED_LOCALES --------------------------------
let localeSrc = fs.readFileSync(localeShared, 'utf8');
const tupleRe = /export const SUPPORTED_LOCALES = \[(.*?)\] as const;/s;
const m = localeSrc.match(tupleRe);
if (!m) fail('shared/locale.ts 找不到 SUPPORTED_LOCALES 元组');
if (m[1].includes(`'${locale}'`)) {
  console.log(`• shared/locale.ts: '${locale}' 已在 SUPPORTED_LOCALES`);
} else {
  localeSrc = localeSrc.replace(
    tupleRe,
    `export const SUPPORTED_LOCALES = [${m[1]}, '${locale}'] as const;`,
  );
  fs.writeFileSync(localeShared, localeSrc);
  console.log(`• shared/locale.ts: SUPPORTED_LOCALES += '${locale}'`);
}

console.log('');
console.log(`✓ 完成。语言 "${displayName ?? locale}" (${locale}) 已注册。`);
console.log('  下一步: 翻译 apps/desktop/src/renderer/i18n/locales/' + locale + '/*.json');
console.log('  (未翻译的 key 会自动回退英文,可以分批翻译)');
