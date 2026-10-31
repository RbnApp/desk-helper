// Web panellerindeki sitelerin service worker'ları için (main.js her oturuma kaydeder). WhatsApp Web gibi bazı siteler
// bildirimi sayfadan değil service worker'dan (registration.showNotification) gösteriyor; böyle bir bildirime tıklayınca
// Desk Helper'a haber gitmiyordu ("bildirime basınca hiçbir şey olmuyor"). Sayfa açıksa bildirim sayfaya iletilir ve
// sayfanın kendi bildirimi olarak gösterilir (webview-preload.js): tıklayınca Desk Helper öne gelir, o panele geçer.
// Açık sayfa yoksa (Desk Helper'da hiç olmaz ama) eskisi gibi service worker gösterir.
const { contextBridge } = require('electron');
try {
  contextBridge.executeInMainWorld({
    func: () => {
      const R = self.ServiceWorkerRegistration;
      if (!R || R.prototype.showNotification.__desk) return;
      const orig = R.prototype.showNotification;
      const KEYS = ['body', 'icon', 'tag', 'silent', 'data', 'badge', 'image', 'requireInteraction', 'lang', 'dir', 'renotify', 'timestamp'];
      const show = function (title, opts) {
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
          if (!cs.length) return orig.call(this, title, opts);
          const o = {};
          for (const k of KEYS) if (opts && opts[k] !== undefined) o[k] = opts[k];
          const target = cs.find((c) => c.focused) || cs.find((c) => c.visibilityState === 'visible') || cs[0];
          try { target.postMessage({ __deskSwNotif: { title: String(title), opts: o } }); } catch { return orig.call(this, title, opts); }
        });
      };
      show.__desk = true;
      R.prototype.showNotification = show;
    },
  });
} catch {}
