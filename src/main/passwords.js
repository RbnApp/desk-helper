// Desk Helper tarayıcısının şifre yöneticisi. Chrome'dan bağımsızdır: şifreler Desk Helper'ın kendi veri
// klasöründe (passwords.json) durur. Her şifre Windows'un kullanıcıya bağlı şifrelemesiyle (DPAPI, Electron
// safeStorage) şifrelenir; dosya başka bir Windows kullanıcısında ya da başka bilgisayarda çözülemez.
// Şifreleri ekranda göstermek / kopyalamak için kullanıcının belirlediği ana parola istenir (scrypt ile saklanır).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage } = require('electron');

module.exports = function createPasswordStore(dir) {
  const file = path.join(dir, 'passwords.json');
  let db = null;
  let unlockedUntil = 0; // ana parola girildikten sonra 5 dakika tekrar sorulmaz

  const load = () => {
    if (db) return db;
    try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { db = null; }
    db = { v: 1, master: null, entries: [], never: [], ...(db || {}) };
    return db;
  };
  const write = () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 1));
    fs.renameSync(file + '.tmp', file);
  };
  const enc = (s) => (!s ? '' : safeStorage.isEncryptionAvailable() ? 'dp:' + safeStorage.encryptString(s).toString('base64') : 'b64:' + Buffer.from(s).toString('base64'));
  const dec = (s) => (!s ? '' : s.startsWith('dp:') ? safeStorage.decryptString(Buffer.from(s.slice(3), 'base64')) : Buffer.from(s.slice(4), 'base64').toString());
  const originOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch { return ''; } };
  const pub = (e) => ({ id: e.id, profile: e.profile, origin: e.origin, username: e.username, noPw: !e.pw, created: e.created, used: e.used });
  const find = (profile, origin, username) => load().entries.find((e) => e.profile === profile && e.origin === origin && e.username === username);
  const norm = (u) => (u || '').trim().toLowerCase();
  const hash = (pw, salt) => crypto.scryptSync(pw, Buffer.from(salt, 'base64'), 32).toString('base64');

  return {
    originOf,
    accounts(profile, url) {
      const origin = originOf(url);
      return load().entries.filter((e) => e.profile === profile && e.origin === origin).sort((a, b) => (b.used || 0) - (a.used || 0)).map(pub);
    },
    // Otomatik doldurma: yalnızca sekmenin o anki sitesine ait kayıt verilir.
    fill(profile, url, id) {
      const e = load().entries.find((x) => x.id === id && x.profile === profile && x.origin === originOf(url));
      if (!e) return null;
      e.used = Date.now(); write();
      return { username: e.username, password: dec(e.pw) };
    },
    // Form gönderildi: ne sorulmalı? 'save' | 'update' | 'none'
    //  - aynı site + aynı kullanıcı adı + aynı şifre → sorma
    //  - aynı kullanıcı adı, farklı şifre → "güncellensin mi?"
    //  - kayıtta kullanıcı adı boş ve şifre aynı → kullanıcı adını sormadan tamamla
    //  - kullanıcı adı gelmediyse (iki adımlı girişler) bu sitedeki kayıtlı şifrelerden biriyle eşleşiyorsa → sorma
    check(profile, url, username, password) {
      const origin = originOf(url);
      // Şifresiz hesaplar (ör. yerel phpMyAdmin'de yalnızca kullanıcı adı) de kaydedilir
      if (!origin || (!password && !(username || '').trim()) || load().never.some((n) => n.profile === profile && n.origin === origin)) return { action: 'none' };
      const all = db.entries.filter((e) => e.profile === profile && e.origin === origin);
      const user = (username || '').trim();
      const same = (e) => { try { return dec(e.pw) === password; } catch { return false; } };
      if (user) {
        const e = all.find((x) => norm(x.username) === norm(user));
        if (e) return same(e) ? { action: 'none' } : { action: 'update', origin, id: e.id, username: e.username };
        const blank = all.find((x) => !x.username);
        if (blank) {
          if (same(blank)) { blank.username = user; blank.changed = Date.now(); write(); return { action: 'none', completed: true }; }
          return { action: 'update', origin, id: blank.id, username: user };
        }
        return { action: 'save', origin };
      }
      if (all.some(same)) return { action: 'none' };
      if (all.length === 1) return { action: 'update', origin, id: all[0].id, username: all[0].username };
      return { action: 'save', origin };
    },
    // id: check()'in güncellenmesini önerdiği kayıt
    save(profile, url, username, password, id) {
      const origin = originOf(url);
      const user = (username || '').trim();
      if (!origin || (!password && !user)) return false;
      const all = load().entries.filter((e) => e.profile === profile && e.origin === origin);
      const e = (id && all.find((x) => x.id === id)) || all.find((x) => norm(x.username) === norm(user)) || (user ? all.find((x) => !x.username) : null);
      if (e) { if (user) e.username = user; e.pw = enc(password); e.changed = Date.now(); }
      else db.entries.push({ id: crypto.randomUUID(), profile, origin, username: user, pw: enc(password), created: Date.now() });
      write(); return true;
    },
    never(profile, url) {
      const origin = originOf(url);
      if (origin && !load().never.some((n) => n.profile === profile && n.origin === origin)) { db.never.push({ profile, origin }); write(); }
    },
    unNever(profile, origin) { load().never = db.never.filter((n) => !(n.profile === profile && n.origin === origin)); write(); },
    list(profile) {
      return { entries: load().entries.filter((e) => e.profile === profile).map(pub).sort((a, b) => a.origin.localeCompare(b.origin)),
        never: db.never.filter((n) => n.profile === profile).map((n) => n.origin), hasMaster: !!db.master };
    },
    remove(id) { load().entries = db.entries.filter((e) => e.id !== id); write(); },
    edit(id, username, password) {
      const e = load().entries.find((x) => x.id === id);
      if (!e) return false;
      if (username != null) e.username = username;
      if (password) e.pw = enc(password);
      e.changed = Date.now(); write(); return true;
    },
    dropProfile(profile) { load().entries = db.entries.filter((e) => e.profile !== profile); db.never = db.never.filter((n) => n.profile !== profile); write(); },
    // Ana parola: şifreyi göstermek / kopyalamak için
    hasMaster: () => !!load().master,
    setMaster(newPw, oldPw) {
      load();
      if (db.master && !this.unlock(oldPw)) return false;
      if (!newPw || newPw.length < 4) return false;
      const salt = crypto.randomBytes(16).toString('base64');
      db.master = { salt, hash: hash(newPw, salt) }; write();
      unlockedUntil = Date.now() + 5 * 60e3;
      return true;
    },
    unlock(pw) {
      const m = load().master;
      if (!m || !pw) return false;
      const ok = crypto.timingSafeEqual(Buffer.from(hash(pw, m.salt), 'base64'), Buffer.from(m.hash, 'base64'));
      if (ok) unlockedUntil = Date.now() + 5 * 60e3;
      return ok;
    },
    unlocked: () => Date.now() < unlockedUntil,
    lock() { unlockedUntil = 0; },
    reveal(id) {
      if (Date.now() >= unlockedUntil) return null;
      const e = load().entries.find((x) => x.id === id);
      return e ? dec(e.pw) : null;
    },
    // Chrome: Ayarlar > Şifre Yöneticisi > Ayarlar > Şifreleri dışa aktar (CSV: name,url,username,password,note)
    importCsv(profile, text) {
      const rows = parseCsv(text);
      if (!rows.length) return { added: 0, updated: 0 };
      const head = rows.shift().map((x) => x.trim().toLowerCase());
      const iu = head.indexOf('url'), in_ = head.indexOf('username'), ip = head.indexOf('password');
      if (iu < 0 || ip < 0) return { error: 'format' };
      let added = 0, updated = 0;
      for (const r of rows) {
        const origin = originOf(r[iu] || ''), username = in_ >= 0 ? r[in_] || '' : '', password = r[ip] || '';
        if (!origin || (!password && !username)) continue;
        const e = find(profile, origin, username);
        if (e) { e.pw = enc(password); updated++; } else { load().entries.push({ id: crypto.randomUUID(), profile, origin, username, pw: enc(password), created: Date.now() }); added++; }
      }
      write();
      return { added, updated };
    },
  };
};

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
