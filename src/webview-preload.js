// Web panelleri (WhatsApp, Telegram, tarayıcı…) için: sayfanın bildirimine tıklanınca Desk Helper'a haber ver,
// Desk Helper öne gelip o panele geçsin. Sayfanın kendi tıklama davranışı (ör. sohbeti açmak) aynen çalışır.
const { ipcRenderer, webFrame } = require('electron');

window.addEventListener('message', (e) => {
  if (e.source === window && e.data && e.data.__deskNotifClick) ipcRenderer.sendToHost('desk-notif-click');
});

webFrame.executeJavaScript(`(() => {
  const N = window.Notification;
  if (!N || N.__desk) return;
  class DeskNotification extends N {
    constructor(title, opts) {
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
let pwOn = false, pwAccounts = [], pwAsked = false, pwLastSent = '';
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
  setVal(pass, cred.password);
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

// Gönderim: form submit, şifre alanında Enter, ya da giriş düğmesine tıklama
let lastPass = null;
function capture() {
  if (!pwOn) return;
  const pass = passFields().find((p) => p.value) || (lastPass?.value ? lastPass : null);
  if (!pass) return;
  const user = userFieldFor(pass)?.value?.trim() || '';
  const key = user + '\n' + pass.value;
  if (key === pwLastSent) return;
  pwLastSent = key;
  ipcRenderer.sendToHost('pw-submit', { url: location.href, username: user, password: pass.value });
}
document.addEventListener('input', (e) => { if (e.target?.type === 'password') lastPass = e.target; }, true);
document.addEventListener('submit', capture, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target?.type === 'password') capture(); }, true);
document.addEventListener('click', (e) => {
  const b = e.target?.closest?.('button, input[type=submit], input[type=button], [role=button]');
  if (b && passFields().some((p) => p.value)) capture();
}, true);
window.addEventListener('pagehide', capture);

ipcRenderer.on('pw-enable', () => {
  pwOn = true; pwAsked = false; pwLastSent = '';
  const obs = new MutationObserver(() => { clearTimeout(obs.t); obs.t = setTimeout(scan, 300); });
  const go = () => { scan(); obs.observe(document.documentElement, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
});
