// Masaüstü bileşenlerinin (widget-*.html) köprüsü. main: widgets.js, sysinfo.js.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wd', {
  get: () => ipcRenderer.invoke('widget:get'),
  set: (patch) => ipcRenderer.invoke('widget:set', patch),
  close: () => ipcRenderer.send('widget:close'),
  onConfig: (fn) => ipcRenderer.on('widget:config', (_e, c) => fn(c)),
  sysStart: () => ipcRenderer.send('sys:start'),
  sysStop: () => ipcRenderer.send('sys:stop'),
  onTick: (fn) => ipcRenderer.on('sys:tick', (_e, d) => fn(d)),
  sysStatic: () => ipcRenderer.invoke('sys:static'),
  weather: (city, lang) => ipcRenderer.invoke('sys:weather', city, lang),
});
