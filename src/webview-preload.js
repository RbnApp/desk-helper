// Web panelleri (WhatsApp, Telegram, tarayıcı…) için: sayfanın bildirimine tıklanınca Desk Helper'a haber ver,
// Desk Helper öne gelip o panele geçsin. Sayfanın kendi tıklama davranışı (ör. sohbeti açmak) aynen çalışır.
const { ipcRenderer, webFrame } = require('electron');

window.addEventListener('message', (e) => {
  if (e.source === window && e.data && e.data.__deskNotifClick) ipcRenderer.sendToHost('desk-notif-click');
});

// Rahatsız etme: açıkken sayfanın masaüstü bildirimleri gösterilmez (sayfa yine de bildirim oluşturduğunu sanır).
ipcRenderer.on('desk-dnd', (_e, on) => { webFrame.executeJavaScript(`window.__deskDnd = ${on ? 'true' : 'false'}`).catch(() => {}); });

webFrame.executeJavaScript(`(() => {
  const N = window.Notification;
  if (!N || N.__desk) return;
  class DeskNotification extends N {
    constructor(title, opts) {
      if (window.__deskDnd) { const silent = new EventTarget(); silent.close = () => {}; silent.title = title; return silent; }
      super(title, opts);
      this.addEventListener('click', () => window.postMessage({ __deskNotifClick: true }, '*'));
    }
  }
  DeskNotification.__desk = true;
  window.Notification = DeskNotification;
})();`).catch(() => {});

// --- Şifre yöneticisi (yalnızca Desk Helper'ın tarayıcı panelinde; panel 'pw-enable' gönderince açılır) ---
// Giriş formunu bulur, kayıtlı hesap varsa doldurur (birden çoksa alanın altında seçtirir), form gönderilince
// kullanıcı adı ve şifreyi panele iletir; panel "kaydedilsin mi / güncellensin mi" diye sorar.
// Bu kod sayfanın kendi betiklerinden ayrı (izole) çalışır; sayfa ona ulaşamaz.
let pwOn = false, pwAccounts = [], pwAsked = false;
const visible = (el) => el && el.isConnected && !el.disabled && el.type !== 'hidden' && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const passFields = () => [...document.querySelectorAll('input[type=password]')].filter(visible);
function userFieldFor(pass) {
  const scope = pass.form || document;
  const inputs = [...scope.querySelectorAll('input')].filter((i) => visible(i) && /^(text|email|tel|)$/i.test(i.getAttribute('type') || ''));
  const named = inputs.find((i) => /username|email/i.test(i.autocomplete || ''));
  if (named) return named;
  const before = inputs.filter((i) => i.compareDocumentPosition(pass) & Node.DOCUMENT_POSITION_FOLLOWING);
  return before.at(-1) || null;
}
function setVal(el, v) {
  if (!el) return;
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
ipcRenderer.on('pw-fill', (_e, cred) => {
  const pass = passFields()[0];
  if (!pass || !cred) return;
  setVal(userFieldFor(pass), cred.username);
  lastUser = cred.username || '';
  if (cred.password) setVal(pass, cred.password); // şifresiz hesapta şifre alanına dokunma
  pass.blur();
  closeMenu();
});

// Birden çok hesap: alanın altında küçük seçim listesi
let menu = null;
function closeMenu() { menu?.remove(); menu = null; }
function showMenu(field) {
  closeMenu();
  if (pwAccounts.length < 2) return;
  const r = field.getBoundingClientRect();
  menu = document.createElement('div');
  const root = menu.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .m{position:fixed;z-index:2147483647;background:#fff;color:#202124;border:1px solid #dadce0;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.2);font:13px "Segoe UI",system-ui,sans-serif;min-width:220px;padding:4px 0}
    .h{padding:4px 12px;color:#5f6368;font-size:11px}.i{padding:7px 12px;cursor:pointer;display:flex;gap:8px;align-items:center}.i:hover{background:#e8f0fe}
  </style><div class="m"><div class="h">🔑 Desk Helper · kayıtlı hesaplar</div></div>`;
  const box = root.querySelector('.m');
  Object.assign(box.style, { left: Math.max(4, r.left) + 'px', top: (r.bottom + 4) + 'px' });
  for (const a of pwAccounts) {
    const it = document.createElement('div');
    it.className = 'i'; it.textContent = '👤 ' + (a.username || '(kullanıcı adı yok)');
    it.addEventListener('mousedown', (e) => { e.preventDefault(); ipcRenderer.sendToHost('pw-request', a.id); });
    box.append(it);
  }
  document.documentElement.append(menu);
}
document.addEventListener('click', (e) => {
  if (!pwOn || pwAccounts.length < 2 || menu) return;
  const pass = passFields()[0];
  if (pass && (e.target === pass || e.target === userFieldFor(pass))) showMenu(e.target);
}, true);
document.addEventListener('focusin', (e) => {
  if (!pwOn || !pwAccounts.length) return;
  const pass = passFields()[0];
  if (pass && (e.target === pass || e.target === userFieldFor(pass))) showMenu(e.target);
}, true);
document.addEventListener('mousedown', (e) => { if (menu && !e.composedPath().includes(menu)) closeMenu(); }, true);
window.addEventListener('scroll', closeMenu, true);

function scan() {
  if (!pwOn || pwAsked || !passFields().length) return;
  pwAsked = true;
  ipcRenderer.sendToHost('pw-form');
}
ipcRenderer.on('pw-accounts', (_e, list) => {
  pwAccounts = list || [];
  const pass = passFields()[0];
  // Tek hesap ve alanlar boşsa Chrome gibi kendiliğinden doldur
  if (pwAccounts.length === 1 && pass && !pass.value) ipcRenderer.sendToHost('pw-request', pwAccounts[0].id);
  else if (pwAccounts.length > 1 && pass && (document.activeElement === pass || document.activeElement === userFieldFor(pass))) showMenu(document.activeElement);
});

// Gönderim: form submit, şifre alanında Enter, ya da giriş düğmesine tıklama.
// Kullanıcı adı yazılırken hatırlanır: cPanel gibi siteler girişten sonra formu gizler/siler, o anda alan bulunamasa da
// kullanıcı adı kaybolmaz. Aynı şifre ikinci kez (ör. sayfa kapanırken) kullanıcı adı boş gelirse yok sayılır.
let lastPass = null, lastUser = '', sentPass = '', sentUser = '';
// explicit: kullanıcı formu gönderdi (submit / Enter / düğme). Şifre boşsa yalnızca o zaman, kullanıcı adı doluysa
// "şifresiz hesap" olarak bildirilir (ör. yerel phpMyAdmin'de şifresiz root).
function capture(explicit) {
  if (!pwOn) return;
  let pass = passFields().find((p) => p.value) || (lastPass?.value ? lastPass : null);
  if (!pass && explicit === true) pass = passFields()[0];
  if (!pass) return;
  const pwd = pass.value || '';
  const user = userFieldFor(pass)?.value?.trim() || lastUser;
  if (!pwd && !user) return;
  if (pwd === sentPass && (user === sentUser || !user)) return;
  sentPass = pwd; sentUser = user;
  ipcRenderer.sendToHost('pw-submit', { url: location.href, username: user, password: pwd });
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el?.type === 'password') { lastPass = el; return; }
  if (el?.tagName === 'INPUT' && /^(text|email|tel|)$/i.test(el.getAttribute('type') || '')) {
    const pass = passFields()[0];
    if (pass && userFieldFor(pass) === el) lastUser = el.value.trim();
  }
}, true);
const loginForm = () => { const p = passFields()[0]; return p && (p.value || userFieldFor(p)?.value); };
document.addEventListener('submit', (e) => { if (!e.target?.querySelector || e.target.querySelector('input[type=password]')) capture(true); }, true);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const p = passFields()[0];
  if (p && (e.target === p || e.target === userFieldFor(p))) capture(true);
}, true);
document.addEventListener('click', (e) => {
  const b = e.target?.closest?.('button, input[type=submit], input[type=button], [role=button]');
  if (b && loginForm()) capture(true);
}, true);
window.addEventListener('pagehide', () => capture(false));

ipcRenderer.on('pw-enable', () => {
  pwOn = true; pwAsked = false;
  const obs = new MutationObserver(() => { clearTimeout(obs.t); obs.t = setTimeout(scan, 300); });
  const go = () => { scan(); obs.observe(document.documentElement, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
});

// Tek sitelik paneller (X, WhatsApp, Telegram, Instagram): Ctrl+tık ya da orta tık ile link, Desk Helper'da yeni
// sekmede tek başına (tam boy) tarayıcı olarak açılır. Panel bu özelliği 'newtab-enable' ile açar.
let newTabOn = false;
ipcRenderer.on('newtab-enable', () => { newTabOn = true; });
const linkOf = (e) => { const a = e.target?.closest?.('a[href]'); return a && /^https?:/.test(a.href) ? a.href : ''; };
document.addEventListener('click', (e) => {
  if (!newTabOn || !(e.ctrlKey || e.metaKey) || e.button !== 0) return;
  const url = linkOf(e); if (!url) return;
  e.preventDefault(); e.stopImmediatePropagation();
  ipcRenderer.sendToHost('desk-newtab', url);
}, true);
document.addEventListener('mousedown', (e) => { if (newTabOn && e.button === 1 && linkOf(e)) e.preventDefault(); }, true);
document.addEventListener('auxclick', (e) => {
  if (!newTabOn || e.button !== 1) return;
  const url = linkOf(e); if (!url) return;
  e.preventDefault(); e.stopImmediatePropagation();
  ipcRenderer.sendToHost('desk-newtab', url);
}, true);
