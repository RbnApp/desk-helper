// Masaüstü bileşenlerinin (widget-*.html) köprüsü. main: widgets.js, sysinfo.js.
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('wd', {
  get: () => ipcRenderer.invoke('widget:get'),
  set: (patch) => ipcRenderer.invoke('widget:set', patch),
  close: () => ipcRenderer.send('widget:close'),
  onConfig: (fn) => ipcRenderer.on('widget:config', (_e, c) => fn(c)),
  sysStart: () => ipcRenderer.send('sys:start'),
  sysStop: () => ipcRenderer.send('sys:stop'),
  onTick: (fn) => ipcRenderer.on('sys:tick', (_e, d) => fn(d)),
  sysStatic: () => ipcRenderer.invoke('sys:static'),
  weather: (city, lang, geo) => ipcRenderer.invoke('sys:weather', city, lang, geo),
  geoSearch: (q, lang) => ipcRenderer.invoke('sys:geo', q, lang),
});
// Klasör kutusu (widget-box.html; main: boxes.js)
contextBridge.exposeInMainWorld('boxApi', {
  get: () => ipcRenderer.invoke('box:get'),
  set: (patch) => ipcRenderer.invoke('box:set', patch),
  items: () => ipcRenderer.invoke('box:items'),
  onItems: (fn) => ipcRenderer.on('box:items', (_e, r) => fn(r)),
  pickFolder: () => ipcRenderer.invoke('box:folder'),
  open: (file) => ipcRenderer.send('box:open', file),
  reveal: (file) => ipcRenderer.send('box:reveal', file),
  trash: (file) => ipcRenderer.invoke('box:trash', file),
  rename: (file, name) => ipcRenderer.invoke('box:rename', file, name),
  order: (list) => ipcRenderer.invoke('box:order', list),
  drop: (files) => ipcRenderer.invoke('box:drop', [...files].map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean)),
  remove: () => ipcRenderer.invoke('box:remove'),
  close: () => ipcRenderer.send('box:close'),
});
