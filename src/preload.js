'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rpc', {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  save: (settings) => ipcRenderer.invoke('save', settings),
  pause: () => ipcRenderer.invoke('pause'),
  reconnect: () => ipcRenderer.invoke('reconnect'),
  onSnapshot: (callback) => ipcRenderer.on('snapshot', (_event, value) => callback(value)),
});
