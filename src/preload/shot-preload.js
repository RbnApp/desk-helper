// Ekran görüntüsü alan seçimi penceresi (shot.html) ile main.js/shots.js arası köprü.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('shot', {
  onImage: (fn) => ipcRenderer.on('shot:image', (_e, url, opts) => fn(url, opts)),
  shown: () => ipcRenderer.send('shot:shown'),
  select: (rect) => ipcRenderer.send('shot:select', rect),
  cancel: () => ipcRenderer.send('shot:cancel'),
});
