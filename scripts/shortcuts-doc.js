'use strict';
// README'deki "Kısayollar" tablosunu TEK tablodan (src/shared/shortcuts.js) ve İngilizce karşılıklardan
// (src/shared/i18n.js → window.I18N_EN) üretir. Tablo elle yazılmaz; kısayol eklenince bu betik koşulur:
//   npm run shortcuts:doc
// İşaretlerin arasındaki bölüm baştan yazılır; işaretlerin dışına dokunulmaz.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const README = path.join(ROOT, 'README.md');
const BEGIN = '<!-- KISAYOLLAR:BASLANGIC -->';
const END = '<!-- KISAYOLLAR:BITIS -->';

const shortcuts = require(path.join(ROOT, 'src', 'shared', 'shortcuts.js'));
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'shared', 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
const EN = ctx.window.I18N_EN || {};

const SCOPE = { global: 'Her yerde', app: 'Uygulama penceresi', panel: 'İlgili panel' };
const SCOPE_EN = { global: 'Global', app: 'App window', panel: 'Focused panel' };

const fill = (txt, s) => String(txt).replace(/\{(\w+)\}/g, (m, k) => (s.vars && k in s.vars ? s.vars[k] : m));

function table() {
  const rows = shortcuts.LIST.filter((s) => s.enabled).map((s) => {
    const tr = fill(s.label, s);
    const en = fill(EN[s.label] || s.label, s);
    return `| \`${shortcuts.key(s.id)}\` | ${tr} | ${en} | ${SCOPE[s.scope]} · ${SCOPE_EN[s.scope]} |`;
  });
  return ['| Kısayol · Shortcut | Ne yapar | What it does | Nerede · Where |', '|---|---|---|---|', ...rows].join('\n');
}

function main() {
  const src = fs.readFileSync(README, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const i = src.indexOf(BEGIN);
  const j = src.indexOf(END);
  if (i === -1 || j === -1 || j < i) throw new Error('README.md içinde ' + BEGIN + ' / ' + END + ' işaretleri yok');
  const html = table().split('\n').join(eol);
  const out = src.slice(0, i + BEGIN.length) + eol + eol + html + eol + eol + src.slice(j);
  fs.writeFileSync(README, out);
  console.log(`README.md: ${shortcuts.LIST.filter((s) => s.enabled).length} kısayol yazıldı`);
}

main();
