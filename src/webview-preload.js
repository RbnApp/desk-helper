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
